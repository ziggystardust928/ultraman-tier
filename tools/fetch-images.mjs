#!/usr/bin/env node
/**
 * 下载剧集图片素材到 public/img/。
 *
 * 图源：Bilibili 番剧（data/raw/bili-*.json 里的 cover 字段）。
 * 借助 B 站图床的 @ 后缀做尺寸转换 + webp 压缩：
 *   实测 分集剧照 原图 389KB → 320w webp 仅 8.8KB（缩小 44 倍）
 *
 * 产物：
 *   public/img/<series>/cover.webp      3:4 竖版海报（首页大封面）
 *   public/img/<series>/square.webp     正方形封面（列表缩略图）
 *   public/img/<series>/ep/<nn>.webp    分集剧照 16:9
 *
 * 用法：node tools/fetch-images.mjs [--only tiga]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public', 'img');
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const SERIES = [
  { id: 'tiga', file: 'bili-tiga.json' },
  { id: 'dyna', file: 'bili-dyna.json' },
  { id: 'gaia', file: 'bili-gaia.json' },
].filter((s) => !only || s.id === only);

/** B 站图床尺寸后缀 */
const SIZES = {
  cover: '@440w_586h_1c.webp',
  square: '@240w_240h_1c.webp',
  still: '@320w_180h_1c.webp',
};

const withSuffix = (url, suffix) => {
  if (!url) return null;
  // 已经是处理过的 URL 就不重复加后缀
  if (/@\d+w/.test(url)) return url;
  return url.replace(/^http:/, 'https:') + suffix;
};

async function download(url, dest, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return buf.length;
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return download(url, dest, attempt + 1);
    }
    return -1;
  }
}

/** 小并发池，避免一次性开 150 个连接 */
async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

let grandTotal = 0;
let grandFail = 0;

for (const s of SERIES) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', s.file), 'utf8'));
  const dir = path.join(PUB, s.id);
  let bytes = 0;
  let fail = 0;

  // 海报 + 方图
  for (const [kind, url, dest] of [
    ['cover', raw.cover, path.join(dir, 'cover.webp')],
    ['square', raw.square_cover, path.join(dir, 'square.webp')],
  ]) {
    if (!url) continue;
    const n = await download(withSuffix(url, SIZES[kind]), dest);
    if (n < 0) fail++;
    else bytes += n;
  }

  // 分集剧照
  const eps = raw.episodes.filter((e) => e.cover);
  const sizes = await pool(eps, 6, async (e, idx) => {
    const no = String(idx + 1).padStart(2, '0');
    return download(withSuffix(e.cover, SIZES.still), path.join(dir, 'ep', `${no}.webp`));
  });

  for (const n of sizes) {
    if (n < 0) fail++;
    else bytes += n;
  }

  grandTotal += bytes;
  grandFail += fail;
  console.log(
    `${s.id.padEnd(6)} 海报+方图+${eps.length} 张分集剧照  ${(bytes / 1024).toFixed(0)} KB` +
      (fail ? `  ⚠ ${fail} 张失败` : ''),
  );
}

console.log(`\n合计 ${(grandTotal / 1024 / 1024).toFixed(2)} MB${grandFail ? `，${grandFail} 张失败` : '，全部成功'}`);
