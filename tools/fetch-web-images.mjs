#!/usr/bin/env node
/**
 * 走本地代理搜图 + 下载。
 *
 * 为什么要这个：首页右侧需要「很帅气很有氛围感」的奥特曼图片。
 * 从剧集视频里抽帧试了几轮启发式评分，分别挑出过昏暗对话戏、演职员字幕、
 * 时钟特写 —— 机器判断不了「帅不帅」。所以改成直接搜官方皮套写真 / 宣传图 / 设计稿。
 *
 * 用法：
 *   node tools/fetch-web-images.mjs --query "ウルトラマンティガ スーツ" --out tiga-suit --n 8
 *   node tools/fetch-web-images.mjs --batch        # 跑内置的一批查询
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 走代理：Node 24 内置 fetch 默认不走系统代理，
// 需要环境变量 NODE_USE_ENV_PROXY=1 + HTTPS_PROXY（由调用方设置）。
if (!process.env.NODE_USE_ENV_PROXY && !process.env.HTTPS_PROXY) {
  console.error('提示：需要先设置 $env:NODE_USE_ENV_PROXY=1 和 $env:HTTPS_PROXY=http://127.0.0.1:7897');
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const get = (k, d = null) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const OUT_ROOT = path.join(ROOT, '.cache', 'webimg');

async function searchImageUrls(query, want = 12) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&qft=+filterui:imagesize-large`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'ja,zh-CN,zh;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`搜索失败 HTTP ${res.status}`);
  const html = await res.text();
  const urls = [];
  const seen = new Set();
  // Bing 把 JSON 做了 HTML 转义，实际长这样：
  //   murl&quot;:&quot;https://...&quot;
  // 所以两种形态都要匹配（真实引号 / &quot;）。
  for (const m of html.matchAll(/murl(?:&quot;|")\s*:\s*(?:&quot;|")(https?:\/\/.+?)(?:&quot;|")/g)) {
    let u = m[1].replace(/\\u002f/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (seen.has(u)) continue;
    seen.add(u);
    if (/\.(svg|gif)(\?|$)/i.test(u)) continue;
    urls.push(u);
    if (urls.length >= want * 3) break;
  }
  return urls;
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.bing.com/', Accept: 'image/*' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/^image\//.test(type)) throw new Error(`不是图片: ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 12000) throw new Error(`太小 ${buf.length}B`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function runQuery(query, outName, want) {
  const dir = path.join(OUT_ROOT, outName);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n[${outName}] 搜索: ${query}`);
  const urls = await searchImageUrls(query, want);
  console.log(`  发现 ${urls.length} 条候选直链`);

  let ok = 0;
  const manifest = [];
  for (const u of urls) {
    if (ok >= want) break;
    const ext = (u.match(/\.(jpe?g|png|webp)/i) || [, 'jpg'])[1].toLowerCase();
    const name = `${String(ok + 1).padStart(2, '0')}.${ext}`;
    try {
      const size = await download(u, path.join(dir, name));
      manifest.push({ file: name, src: u, bytes: size });
      ok++;
      console.log(`  ✓ ${name}  ${(size / 1024).toFixed(0)}KB`);
    } catch (e) {
      // 大部分图床会挡防盗链，失败是常态，继续试下一张
    }
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`  成功 ${ok}/${want}`);
  return ok;
}

const SERIES_ZH = {
  tiga: '迪迦奥特曼',
  dyna: '戴拿奥特曼',
  gaia: '盖亚奥特曼',
  neos: '奈欧斯奥特曼',
  cosmos: '高斯奥特曼',
  nexus: '奈克赛斯奥特曼',
  max: '麦克斯奥特曼',
  mebius: '梦比优斯奥特曼',
  sevenx: '赛文X',
  ugmmb: '奥特银河 大怪兽之战',
  ugmmb2: '奥特银河 大怪兽之战',
};
const SERIES_JA = {
  tiga: 'ウルトラマンティガ',
  dyna: 'ウルトラマンダイナ',
  gaia: 'ウルトラマンガイア',
  neos: 'ウルトラマンネオス',
  cosmos: 'ウルトラマンコスモス',
  nexus: 'ウルトラマンネクサス',
  max: 'ウルトラマンマックス',
  mebius: 'ウルトラマンメビウス',
  sevenx: 'ウルトラマンセブンX',
  ugmmb: 'ウルトラギャラクシー大怪獣バトル',
  ugmmb2: 'ウルトラギャラクシー大怪獣バトル',
};

if (args.includes('--batch')) {
  const only = get('only');
  for (const [sid, ja] of Object.entries(SERIES_JA)) {
    if (only && sid !== only) continue;
    // 三类素材：皮套全身照 / 帅气壁纸 / 设定画（设计稿）
    await runQuery(`${ja} スーツ 全身`, `${sid}-suit`, 6);
    await runQuery(`${ja} かっこいい`, `${sid}-cool`, 6);
    await runQuery(`${ja} 設定画`, `${sid}-design`, 4);
  }
} else {
  const q = get('query');
  const out = get('out', 'misc');
  const n = Number(get('n', 8));
  if (!q) {
    console.error('需要 --query 或 --batch');
    process.exit(1);
  }
  await runQuery(q, out, n);
}
