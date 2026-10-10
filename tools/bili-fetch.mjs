#!/usr/bin/env node
/**
 * Bilibili PGC fetcher — Chinese episode titles, durations and staff lists.
 *
 * Bilibili's PGC endpoints need a `buvid3` cookie, which you get by visiting the
 * homepage first. This tool bootstraps that cookie, then searches / fetches.
 *
 * Usage:
 *   node tools/bili-fetch.mjs --search "迪迦奥特曼"
 *   node tools/bili-fetch.mjs --fetch tiga --query "迪迦奥特曼"
 *   node tools/bili-fetch.mjs --fetch tiga --season 38384
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

function absorb(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}

async function get(url, referer = 'https://www.bilibili.com/') {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...(jar.size ? { Cookie: cookieHeader() } : {}),
    },
  });
  absorb(res);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: -999, message: `non-JSON response (HTTP ${res.status})`, _head: text.slice(0, 200) };
  }
}

const stripTags = (s) => (s ?? '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

async function bootstrap() {
  const res = await fetch('https://www.bilibili.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  });
  absorb(res);
  await res.arrayBuffer();
  if (!jar.size) throw new Error('failed to obtain bilibili cookies');
  return [...jar.keys()];
}

async function search(keyword) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi&keyword=${encodeURIComponent(keyword)}`;
  const j = await get(url, 'https://search.bilibili.com/');
  if (j.code !== 0) throw new Error(`search failed: ${j.code} ${j.message}`);
  return (j.data?.result ?? []).map((r) => ({
    media_id: r.media_id,
    season_id: r.season_id ?? r.pgc_season_id,
    title: stripTags(r.title),
    org_title: r.org_title,
    index_show: r.index_show,
    score: r.media_score?.score ?? null,
    score_users: r.media_score?.user_count ?? null,
    staff: r.staff ?? null,
    cv: r.cv ?? null,
  }));
}

async function season(seasonId) {
  const url = `https://api.bilibili.com/pgc/view/web/season?season_id=${seasonId}`;
  const j = await get(url, 'https://www.bilibili.com/');
  if (j.code !== 0) throw new Error(`season failed: ${j.code} ${j.message}`);
  const r = j.result ?? {};
  const eps = (r.episodes ?? []).map((e) => ({
    ep_id: e.id,
    title: stripTags(e.title),
    long_title: stripTags(e.long_title),
    show_title: stripTags(e.show_title),
    duration_ms: e.duration ?? null,
    duration_min: e.duration ? Math.round(e.duration / 60000) : null,
    pub_time: e.pub_time ?? null,
    pub_index: e.pub_index ?? null,
    bvid: e.bvid ?? null,
    cover: e.cover ?? null,
  }));
  return {
    season_id: r.season_id,
    media_id: r.media_id,
    title: stripTags(r.title),
    org_title: r.original_title ?? r.title,
    evaluate: stripTags(r.evaluate).slice(0, 400) || null,
    rating: r.rating ?? null,
    publish: r.publish ?? null,
    total: r.total ?? eps.length,
    cover: r.cover ?? null,
    square_cover: r.square_cover ?? null,
    season_cover: r.season_cover ?? null,
    episodes: eps,
    section_titles: (r.section ?? []).flatMap((s) => [stripTags(s.title), ...(s.episodes ?? []).map((e) => stripTags(e.title))]),
  };
}

// ------------------------------------------------------------------ CLI
const argv = process.argv.slice(2);
const arg = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};

const cookies = await bootstrap();
console.error(`[bili] cookies: ${cookies.join(', ')}`);

if (argv.includes('--search')) {
  console.log(JSON.stringify(await search(arg('--search')), null, 2));
} else if (argv.includes('--fetch')) {
  const id = arg('--fetch');
  const explicit = arg('--season');
  let hit = null;
  if (!explicit) {
    const q = arg('--query') ?? id;
    const results = await search(q);
    if (!results.length) throw new Error(`no bangumi result for "${q}"`);
    hit = results.find((r) => r.index_show) ?? results[0];
    console.error(`[bili] matched: ${hit.title} / ${hit.org_title} (${hit.index_show}) season_id=${hit.season_id}`);
  }
  const sid = Number(explicit ?? hit.season_id);
  const data = await season(sid);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `bili-${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ search_hit: hit, ...data }, null, 2));
  console.log(`wrote ${file}`);
  console.log(`  ${data.title} / ${data.org_title} | season_id=${data.season_id} | episodes=${data.episodes.length} | bilibili_score=${data.rating?.score ?? 'n/a'}`);
  console.log(`  ep1: ${data.episodes[0]?.title} | ${data.episodes[0]?.duration_min}min`);
} else {
  console.log('usage: --search <kw> | --fetch <id> [--query <kw> | --season <id>]');
}
