#!/usr/bin/env node
/**
 * 搜罗「设计稿 / 设定稿 / 皮套设计」类图片，用作首页剧照墙素材。
 *
 * 思路：B 站上介绍设定集、设计稿的视频，封面图往往就是设计稿本身。
 * 用视频搜索接口拿到这些封面（pic），比从视频里抽帧直接得多。
 *
 * 产物：
 *   .cache/design-candidates/<series>/NN.webp   候选图
 *   .cache/design-candidates/<series>/manifest.json
 *
 * 用法：node tools/fetch-design.mjs --series tiga
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.cache', 'design-candidates');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const sid = arg('--series', 'tiga');
const EXTRA = argv.includes('--queries') ? argv.slice(argv.indexOf('--queries') + 1) : [];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const QUERIES = {
  tiga: [
    '迪迦奥特曼 设计稿',
    '迪迦 设定稿',
    '迪迦 皮套设计',
    '迪迦奥特曼 设定集',
    '迪迦 丸山浩 设计',
    '迪迦奥特曼 原画',
    '迪迦 怪獣 デザイン',
  ],
  dyna: ['戴拿奥特曼 设计稿', '戴拿 设定稿', '戴拿 皮套设计', '戴拿奥特曼 设定集', '戴拿 丸山浩'],
  gaia: ['盖亚奥特曼 设计稿', '盖亚 设定稿', '盖亚 皮套设计', '盖亚奥特曼 设定集', '盖亚 丸山浩'],
};

// ------------------------------------------------------------------ cookies（PGC/搜索接口需要 buvid3）
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}
async function boot() {
  const res = await fetch('https://www.bilibili.com/', { headers: { 'User-Agent': UA } });
  absorb(res);
  await res.arrayBuffer();
}

async function searchVideos(keyword) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://search.bilibili.com/', Cookie: cookieHeader() },
  });
  absorb(res);
  const j = await res.json();
  if (j.code !== 0) return [];
  return (j.data?.result ?? []).map((r) => ({
    bvid: r.bvid,
    title: (r.title ?? '').replace(/<[^>]*>/g, ''),
    author: r.author,
    play: r.play,
    pic: (r.pic ?? '').startsWith('//') ? `https:${r.pic}` : r.pic,
  }));
}

const strip = (url) => url.replace(/^http:/, 'https:') + '@480w_480h_1c.webp';

await boot();

const queries = EXTRA.length ? EXTRA : QUERIES[sid];
const seen = new Set();
const candidates = [];

for (const q of queries) {
  const hits = await searchVideos(q);
  console.log(`「${q}」→ ${hits.length} 条`);
  for (const h of hits) {
    if (!h.pic || seen.has(h.bvid)) continue;
    seen.add(h.bvid);
    candidates.push({ ...h, query: q });
  }
  await new Promise((r) => setTimeout(r, 250));
}

// 按播放量取前 40 个候选
candidates.sort((a, b) => (b.play ?? 0) - (a.play ?? 0));
const picked = candidates.slice(0, 40);

const dir = path.join(OUT, sid);
fs.mkdirSync(dir, { recursive: true });
// 注意：文件名用 bvid，不用序号。
// 用序号的话，下次重跑（搜索结果是按播放量排序、会浮动）就再也对不上是哪张图了。

let i = 0;
const manifest = [];
for (const c of picked) {
  i++;
  try {
    const res = await fetch(strip(c.pic), { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' } });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) continue;
    const name = c.bvid.replace(/^BV/, '');
    fs.writeFileSync(path.join(dir, `${name}.webp`), buf);
    manifest.push({ file: `${name}.webp`, seq: i, bvid: c.bvid, title: c.title, author: c.author, play: c.play, query: c.query });
  } catch {
    /* 单张失败不影响整体 */
  }
  await new Promise((r) => setTimeout(r, 80));
}

fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\n候选 ${candidates.length} 个，下载成功 ${manifest.length} 张 → ${dir}`);
console.log('下一步：python tools/contact-sheet.py --design tiga 看总览图再挑');
