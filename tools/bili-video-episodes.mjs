#!/usr/bin/env node
/**
 * 从 B 站「视频区」的多 P 合集抓分集标题。
 *
 * 用途：有些奥特曼剧集没有引进番剧库（PGC），比如奈欧斯、赛文X。
 * 但 B 站视频区有 UP 主上传的完整合集，且是「分 P 视频」——
 * 每个 P 的标题就是分集标题，比如：
 *     P1 1.奈欧斯诞生
 *     P2 2.神秘的黑暗物质
 *
 * 注意有的合集会把一集拆成上下篇（赛文X：2.不明指令 上 / 2.不明指令 下），
 * 所以要按「集号前缀」去重合并。
 *
 * 产物格式与 tools/bili-fetch.mjs 一致，后续管线无感。
 *
 * 用法：node tools/bili-video-episodes.mjs --id neos --query "【全集】奈欧斯奥特曼" --expect 12
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const ID = arg('--id');
const QUERY = arg('--query');
const EXPECT = Number(arg('--expect', 0));
const TITLE = arg('--title', '');

if (!ID || !QUERY) {
  console.error('用法: node tools/bili-video-episodes.mjs --id neos --query "..." --expect 12 [--title 奈欧斯奥特曼]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => (s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"');

// ------------------------------------------------------------------ cookies
const jar = new Map();
const ck = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(r) {
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}
async function boot() {
  const r = await fetch('https://www.bilibili.com/', { headers: { 'User-Agent': UA } });
  absorb(r);
  await r.arrayBuffer();
}
async function api(url, referer = 'https://www.bilibili.com/') {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer, Cookie: ck() } });
  absorb(r);
  const j = await r.json();
  if (j.code !== 0) throw new Error(`${url} -> code ${j.code} ${j.message}`);
  return j.data;
}

/** 从 P 标题里解析集号和标题：  "2.不明指令 上" → {no:2, part:'不明指令 上', base:'不明指令'} */
function parsePart(part) {
  const s = strip(part).trim();
  // 1.xxx / 第1话 xxx / 01 - xxx / 1、xxx
  let m = s.match(/^(?:第)?\s*(\d{1,3})\s*[.、．,，:：\-\s]\s*(.+)$/);
  if (!m) m = s.match(/^(?:第)?\s*(\d{1,3})\s*[集话話]\s*(.+)$/);
  if (!m) return null;
  const no = Number(m[1]);
  let rest = m[2].trim();
  // 去掉「上下篇」拆分标记
  const noHalf = rest.replace(/\s*(上|下|前篇|后篇|前編|後編|（上）|（下）|\(上\)|\(下\))\s*$/g, '').trim();
  // 去掉「日/台/国」配音版本标记（双配音合集会同一集出现两次）
  const cleaned = noHalf.replace(/\s*(日|台|国|日配|台配|国语|日语|中配|日版|台版)\s*$/g, '').trim();
  return {
    no,
    part: rest,
    base: cleaned || noHalf || rest,
    isHalf: noHalf !== rest,
  };
}

await boot();

// ------------------------------------------------------------------ 找候选
console.log(`搜索「${QUERY}」…`);
const search = await api(
  `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(QUERY)}`,
  'https://search.bilibili.com/',
);
const videos = (search?.result ?? []).map((v) => ({
  bvid: v.bvid,
  title: strip(v.title),
  play: v.play ?? 0,
  pic: (v.pic ?? '').startsWith('//') ? `https:${v.pic}` : v.pic,
  duration: v.duration ?? '',
}));
if (!videos.length) throw new Error('搜不到视频');
console.log(`  ${videos.length} 条候选，逐个查分 P：`);

// 逐个查 pagelist，找分 P 数最合适的
let best = null;
for (const v of videos.slice(0, 8)) {
  await sleep(700);
  try {
    const pages = await api(`https://api.bilibili.com/x/player/pagelist?bvid=${v.bvid}`);
    const n = (pages ?? []).length;
    // 集号解析成功的数量
    const parsed = (pages ?? []).map((p) => parsePart(p.part)).filter(Boolean);
    const nos = new Set(parsed.map((p) => p.no));
    const coverOk = EXPECT ? nos.size >= EXPECT : nos.size > 0;
    console.log(
      `   ${String(n).padStart(3)}P  集号覆盖 ${String(nos.size).padStart(3)}` +
        (EXPECT ? `/${EXPECT}` : '') +
        `  ${v.bvid}  ${v.title.slice(0, 34)}`,
    );
    if (coverOk && (!best || nos.size > best.nos.size || (nos.size === best.nos.size && n > best.pages.length))) {
      best = { video: v, pages, parsed, nos };
    }
  } catch (e) {
    console.log(`   ${v.bvid} 查询失败：${e.message}`);
  }
}

if (!best) throw new Error('没有找到分 P 数合适的合集');
const { video, pages, parsed } = best;
console.log(`\n选定：${video.bvid}「${video.title}」 ${pages.length}P`);

// ------------------------------------------------------------------ 按集号合并
// 注意：视频区的分 P 时长不可信 —— 合集可能混入双配音（同集两个 P）、
// 上下篇拆分、或带 OP/ED 的完整版。这里一律不取时长，
// 留给 build-dataset 回退用 IMDb 的 runtimeMinutes。
const byNo = new Map();
for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  const info = parsed[i] ?? parsePart(p.part);
  if (!info) continue;
  const cur = byNo.get(info.no);
  if (!cur) {
    byNo.set(info.no, {
      no: info.no,
      long_title: info.base || info.part,
      parts: [info.part],
      cid: p.cid,
      duration_min: null,
      bvid: video.bvid,
    });
  } else {
    cur.parts.push(info.part);
    // 多 P 指同一集时，取最短的那个标题本体（最干净）
    if (info.base && (!cur.long_title || info.base.length < cur.long_title.length)) cur.long_title = info.base;
  }
}

const episodes = [...byNo.values()].sort((a, b) => a.no - b.no);
const missing = [];
for (let i = 1; i <= (EXPECT || episodes.length); i++) if (!byNo.has(i)) missing.push(i);

console.log(`解析出 ${episodes.length} 集${missing.length ? `，缺集号：${missing.join(',')}` : '，集号连续 ✓'}`);
console.log('前 5 集：');
for (const e of episodes.slice(0, 5)) console.log(`  第${e.no}话 ${e.long_title}  (${e.duration_min ?? '?'}分钟)`);

// ------------------------------------------------------------------ 输出
const out = {
  search_hit: { bvid: video.bvid, title: video.title, play: video.play },
  source: 'bilibili-video-multipart',
  source_note: '该剧未引进 B 站番剧库，分集标题取自视频区多P合集的每个 P 标题',
  season_id: null,
  media_id: null,
  title: TITLE || video.title,
  org_title: TITLE || video.title,
  evaluate: null,
  rating: null,
  publish: null,
  total: episodes.length,
  cover: video.pic,
  square_cover: video.pic,
  season_cover: null,
  episodes: episodes.map((e, i) => ({
    ep_id: null,
    title: String(e.no),
    long_title: e.long_title,
    show_title: `第${e.no}话 ${e.long_title}`,
    duration_ms: e.duration_min ? e.duration_min * 60000 : null,
    duration_min: e.duration_min,
    pub_time: null,
    pub_index: i + 1,
    bvid: e.bvid,
    cover: video.pic,
    cid: e.cid,
  })),
};

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `bili-${ID}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\n已写入 ${path.relative(ROOT, file)}`);
