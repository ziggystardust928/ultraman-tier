#!/usr/bin/env node
/**
 * 采集真实分集剧照。
 *
 * 背景：Bilibili PGC 给整季复用了同一张宣传图（实测迪迦 52 集 MD5 完全相同），
 * 不能当分集剧照用。但每个视频都有「视频快照」（videoshot）——真实视频帧拼成的
 * 雪碧图（10 列 × 480×270）。裁一帧出来就是真实剧照。
 *
 * 产物：
 *   data/raw/videoshot-<series>.json   清单（含 cid、雪碧图 URL、帧尺寸）
 *   .cache/videoshot/<series>/<nn>.jpg 原始雪碧图（裁完可删）
 *
 * 用法：node tools/fetch-videoshot.mjs [--only tiga] [--skip-download]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'videoshot');
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const skipDownload = argv.includes('--skip-download');

const H = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' };

const SERIES = [
  { id: 'tiga', file: 'bili-tiga.json' },
  { id: 'dyna', file: 'bili-dyna.json' },
  { id: 'gaia', file: 'bili-gaia.json' },
].filter((s) => !only || s.id === only);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jget(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: H });
    const j = await res.json();
    if (j.code !== 0) throw new Error(`code ${j.code} ${j.message}`);
    return j.data;
  } catch (e) {
    if (attempt < 2) {
      await sleep(500 * (attempt + 1));
      return jget(url, attempt + 1);
    }
    return null;
  }
}

/** 小并发池 */
async function pool(items, limit, worker) {
  let i = 0;
  const out = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return out;
}

for (const s of SERIES) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', s.file), 'utf8'));
  const eps = raw.episodes.filter((e) => e.bvid);
  console.log(`\n${s.id}: ${eps.length} 集，开始取快照清单…`);

  // 1. 逐集取 cid + videoshot
  const manifest = [];
  let failed = 0;
  await pool(eps, 3, async (e, idx) => {
    const no = idx + 1;
    const view = await jget(`https://api.bilibili.com/x/web-interface/view?bvid=${e.bvid}`);
    const cid = view?.cid;
    if (!cid) {
      failed++;
      return;
    }
    const shot = await jget(
      `https://api.bilibili.com/x/player/videoshot?bvid=${e.bvid}&cid=${cid}&index=1`,
    );
    const sheet = shot?.image?.[0];
    if (!sheet) {
      failed++;
      return;
    }
    manifest.push({
      sid: s.id,
      no,
      title: e.long_title,
      bvid: e.bvid,
      cid,
      sheet: sheet.startsWith('//') ? `https:${sheet}` : sheet,
      cols: shot.img_x_len || 10,
      frameW: shot.img_x_size || 480,
      frameH: shot.img_y_size || 270,
    });
    await sleep(60);
  });

  manifest.sort((a, b) => a.no - b.no);
  fs.writeFileSync(
    path.join(ROOT, 'data', 'raw', `videoshot-${s.id}.json`),
    JSON.stringify(manifest, null, 1),
  );
  console.log(`  清单：${manifest.length} 集${failed ? `，${failed} 集无快照` : ''}`);

  if (skipDownload) continue;

  // 2. 下载雪碧图
  const dir = path.join(CACHE, s.id);
  fs.mkdirSync(dir, { recursive: true });
  let bytes = 0;
  let dfail = 0;

  await pool(manifest, 4, async (m) => {
    const dest = path.join(dir, `${String(m.no).padStart(2, '0')}.jpg`);
    m.sheetFile = dest;
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      bytes += fs.statSync(dest).size;
      return;
    }
    try {
      const res = await fetch(m.sheet, { headers: H });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      bytes += buf.length;
    } catch {
      if (++dfail <= 3) console.log(`  下载失败 第${m.no}话`);
    }
  });

  fs.writeFileSync(
    path.join(ROOT, 'data', 'raw', `videoshot-${s.id}.json`),
    JSON.stringify(manifest, null, 1),
  );
  console.log(`  雪碧图：${(bytes / 1024 / 1024).toFixed(1)} MB${dfail ? `，${dfail} 张失败` : ''}`);
}

console.log('\n下一步：用 tools/crop-stills.py 裁出分集剧照');
