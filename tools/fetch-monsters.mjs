#!/usr/bin/env node
/**
 * 采集每集「登场怪兽」中文名单。
 *
 * 图源思路：B 站专栏有系列的《XX奥特曼 怪兽/宇宙人大全》，格式统一为
 *     3、恶魔的预言
 *     出场怪兽:炎魔战士基里艾洛德人
 * 怪兽名是空格分开的，比百度百科那种「超古代怪兽哥尔赞超古代龙美尔巴」
 * 连在一起的写法好解析得多。
 *
 * 产物：data/raw/monsters-<series>.json
 *   { "<集号>": { "title": "...", "monsters": ["...", "..."] } }
 *
 * 用法：node tools/fetch-monsters.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
const SRC = path.join(ROOT, 'data', '_src');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 迪迦的专栏文本子代理已经抓在本地了，直接用；另外两部现抓
const PLAN = [
  { id: 'tiga', series: '迪迦', local: path.join(SRC, 'bili_mon_toc.txt'), expect: 52 },
  { id: 'dyna', series: '戴拿', query: '戴拿奥特曼 怪兽 宇宙人 大全', expect: 51 },
  { id: 'gaia', series: '盖亚', query: '盖亚奥特曼 怪兽 宇宙人 大全', expect: 51 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 专栏标题打分。
 * 之前只按阅读量排序，结果选中了「戴拿奥特曼 图片合集」这种不相关的。
 */
function scoreTitle(title, series) {
  let s = 0;
  if (title.includes(series)) s += 10;
  if (/怪兽/.test(title)) s += 10;
  if (/宇宙人/.test(title)) s += 10;
  if (/大全/.test(title)) s += 15;
  if (/《.*》/.test(title)) s += 5;
  if (/图鉴/.test(title)) s += 3;
  if (/图片|合集|壁纸|头像/.test(title)) s -= 20;
  return s;
}

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

// ------------------------------------------------------------------ HTML → 文本
const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENT[m.toLowerCase()] ?? ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n');
}

/** 中文数字 → 阿拉伯数字（一 / 十 / 三十五 / 五十一 / 35） */
function cnNum(s) {
  if (/^\d+$/.test(s)) return Number(s);
  const D = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let n = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch === '十') {
      cur = (cur || 1) * 10;
      n += cur;
      cur = 0;
    } else if (D[ch] !== undefined) cur = D[ch];
  }
  return n + cur;
}

const EP_LINE = /^(?:登场[:：]\s*)?第\s*([一二三四五六七八九十百\d]{1,4})\s*[集话]\s*[《「（(]/;
const STAT_LINE = /^(身高|体重|身長|出身|合成方法|別名|別称|分類)/;

/**
 * 解析「按怪兽组织」的专栏（戴拿 / 盖亚那一版）：
 *
 *   宇宙球体 斯菲亚（スフィア）
 *   身高体重均不明 来自宇宙
 *   登场：第一集《全新的光（上）》
 *   第二集《全新的光（下）》
 *   第35集《灭亡的微笑（上）》
 *   <描述…>
 *
 * 这类是「怪兽 → 登场集数」，需要反演成「集数 → 怪兽」。
 */
function parseByMonster(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const byEp = {};

  const add = (no, name, title) => {
    if (!byEp[no]) byEp[no] = { title: title || null, monsters: [] };
    if (title && !byEp[no].title) byEp[no].title = title;
    if (name && !byEp[no].monsters.includes(name)) byEp[no].monsters.push(name);
  };

  for (let i = 0; i < lines.length; i++) {
    if (!/^登场[:：]/.test(lines[i])) continue;

    // 怪兽名：往上找最近一行「不是空行、不是身高体重等属性行」
    let name = null;
    for (let j = i - 1; j >= 0 && j > i - 6; j--) {
      const l = lines[j];
      if (!l || STAT_LINE.test(l)) continue;
      name = l;
      break;
    }
    if (!name) continue;
    // 去掉日文原名括注
    name = name.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
    if (name.length > 40) continue; // 太长说明抓到描述文字了

    // 收集该怪兽的登场集数（允许中间夹空行）
    for (let k = i; k < lines.length; k++) {
      const l = lines[k];
      if (!l) continue; // 跳过空行继续找
      const m = l.match(EP_LINE);
      if (!m) break;
      // 标题优先按《》配对取，避免「《全新的光（上）》」被内层括号截成「全新的光（上」
      const t = l.match(/[《「]([^》」]+)[》」]/) ?? l.match(/[（(]([^）)]+)[）)]/);
      add(cnNum(m[1]), name, t ? t[1] : null);
    }
  }
  return byEp;
}

/** 解析「按集数组织」的专栏（迪迦那一版）：3、恶魔的预言 / 出场怪兽:xxx yyy */
function parseToc(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const out = {};
  let cur = null;

  for (const line of lines) {
    if (!line) continue;

    // 集号行：3、恶魔的预言   /   3. 恶魔的预言   /  24、前进怪兽探险队
    const head = line.match(/^(\d{1,2})\s*[、.．,，]\s*(.{1,40})$/);
    if (head) {
      const no = Number(head[1]);
      const title = head[2].trim();
      // 排除「参考资料9」这类
      if (no >= 1 && no <= 60 && !/^参考/.test(title)) {
        cur = no;
        out[no] = out[no] ?? { title, monsters: [] };
        if (!out[no].title) out[no].title = title;
        continue;
      }
    }

    // 怪兽行
    const mon = line.match(/^(?:出场|登场)?怪兽\s*[:：]\s*(.*)$/);
    if (mon && cur) {
      const names = mon[1]
        .split(/[\s　]+/)
        .map((s) => s.trim())
        .filter((s) => s && s.length > 1 && !/^[:：]$/.test(s));
      if (names.length) out[cur].monsters = names;
      continue;
    }

    // 有些专栏写成「出场怪兽：xxx yyy」没换行，或被拆成多行
    if (cur && out[cur].monsters.length === 0 && /怪兽/.test(line) && line.length < 80) {
      const after = line.split(/[:：]/).slice(1).join(':').trim();
      if (after) {
        const names = after.split(/[\s　]+/).filter((s) => s && s.length > 1);
        if (names.length) out[cur].monsters = names;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ 抓取
async function searchArticle(query) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=article&keyword=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://search.bilibili.com/', Cookie: ck() } });
  absorb(r);
  const j = await r.json();
  if (j.code !== 0) throw new Error(`搜索失败 ${j.code} ${j.message}`);
  return (j.data?.result ?? []).map((x) => ({
    id: x.id,
    title: (x.title ?? '').replace(/<[^>]*>/g, ''),
    view: x.view ?? 0,
  }));
}

async function articleText(id, attempt = 0) {
  // 0) 缓存优先。B 站专栏接口会限流（-509）和风控（-352），
  //    而且无头浏览器也会被挡成验证页 —— 抓到的正文必须落盘复用。
  const cacheDir = path.join(ROOT, '.cache', 'monster-raw');
  const cacheFile = path.join(cacheDir, `${id}.txt`);
  if (fs.existsSync(cacheFile)) {
    const cached = fs.readFileSync(cacheFile, 'utf8');
    if (cached.length > 1000) {
      console.log(`   命中缓存 cv${id}（${cached.length} 字）`);
      return cached;
    }
  }

  const save = (text) => {
    if (text && text.length > 1000) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, text);
    }
    return text;
  };

  // 1) 先试 API
  try {
    const r = await fetch(`https://api.bilibili.com/x/article/view?id=${id}`, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: ck() },
    });
    absorb(r);
    const j = await r.json();
    if (j.code === -509 && attempt < 4) {
      const wait = 3000 * (attempt + 1);
      console.log(`  限流，${wait / 1000}s 后重试…`);
      await sleep(wait);
      return articleText(id, attempt + 1);
    }
    if (j.code === 0 && j.data?.content) return save(htmlToText(j.data.content));
    console.log(`  API 不可用（${j.code} ${j.message}），改用无头浏览器渲染`);
  } catch (e) {
    console.log(`  API 异常（${e.message}），改用无头浏览器渲染`);
  }
  // 2) 回退：专栏页是客户端渲染的，用 puppeteer 渲染后取 innerText
  return save(await articleTextViaBrowser(id));
}

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

async function articleTextViaBrowser(id) {
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(`https://www.bilibili.com/read/cv${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
    // 专栏页是客户端渲染的，固定 sleep 经常抓到「还没加载完」的空壳，
    // 所以等正文里真的出现「登场：」再取。
    try {
      await page.waitForFunction(() => /登场[:：]|出场怪兽/.test(document.body.innerText), { timeout: 30000 });
    } catch {
      console.log('  等正文超时，直接取当前内容');
    }
    await sleep(1200);
    const text = await page.evaluate(() => document.body.innerText);
    if (text.length < 500) console.log(`  ⚠ 渲染结果只有 ${text.length} 字，可能没加载出来`);
    return text;
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------------ 主流程
await boot();

/** 合并两个解析结果（同一集取并集） */
function mergeParsed(a, b) {
  const out = { ...a };
  for (const [no, v] of Object.entries(b)) {
    const k = Number(no);
    if (!out[k]) {
      out[k] = { title: v.title, monsters: [...v.monsters] };
      continue;
    }
    if (!out[k].title && v.title) out[k].title = v.title;
    for (const m of v.monsters) if (!out[k].monsters.includes(m)) out[k].monsters.push(m);
  }
  return out;
}

/** 单篇专栏的解析：两种格式自动识别 */
function parseAny(text) {
  let parsed = parseToc(text);
  let mode = 'by-episode';
  let n = Object.values(parsed).filter((x) => x.monsters.length).length;
  if (n === 0) {
    const alt = parseByMonster(text);
    const altN = Object.values(alt).filter((x) => x.monsters.length).length;
    if (altN > n) {
      parsed = alt;
      mode = 'by-monster';
      n = altN;
    }
  }
  return { parsed, mode, count: n };
}

for (const p of PLAN) {
  let parsed = {};
  let source = '';
  let mode = '';

  if (p.local) {
    if (!fs.existsSync(p.local)) {
      console.log(`${p.id}: 本地文件缺失 ${p.local}`);
      continue;
    }
    const text = fs.readFileSync(p.local, 'utf8');
    const r = parseAny(text);
    parsed = r.parsed;
    mode = r.mode;
    source = path.relative(ROOT, p.local);
  } else {
    const hits = await searchArticle(p.query);
    if (!hits.length) {
      console.log(`${p.id}: 搜不到「${p.query}」`);
      continue;
    }
    // 取标题匹配分最高的前 3 篇合并：单篇专栏常有遗漏集
    //（盖亚那篇就完全没提第 18、25 集）
    const ranked = hits
      .map((h) => ({ ...h, score: scoreTitle(h.title, p.series) }))
      .filter((h) => h.score >= 30)
      .sort((a, b) => b.score - a.score || b.view - a.view)
      .slice(0, 3);

    if (!ranked.length) {
      console.log(`${p.id}: 没有标题匹配达标的专栏`);
      continue;
    }
    console.log(`${p.id}: 合并 ${ranked.length} 篇专栏`);

    for (const art of ranked) {
      await sleep(1500);
      try {
        const text = await articleText(art.id);
        const r = parseAny(text);
        const before = Object.values(parsed).filter((x) => x.monsters.length).length;
        parsed = mergeParsed(parsed, r.parsed);
        const after = Object.values(parsed).filter((x) => x.monsters.length).length;
        if (!mode) mode = r.mode;
        console.log(`   「${art.title}」(${r.mode}) 覆盖 ${r.count} 集，累计 ${before} → ${after}`);
        source += (source ? ' | ' : '') + `cv${art.id} ${art.title}`;
      } catch (e) {
        console.log(`   「${art.title}」失败：${e.message}`);
      }
    }
  }

  const withMon = Object.values(parsed).filter((x) => x.monsters.length).length;

  fs.writeFileSync(
    path.join(OUT, `monsters-${p.id}.json`),
    JSON.stringify({ source, expect: p.expect, parsed }, null, 1),
  );

  const missing = [];
  for (let i = 1; i <= p.expect; i++) if (!parsed[i]?.monsters.length) missing.push(i);
  console.log(
    `  → 格式=${mode}，共 ${withMon}/${p.expect} 集有怪兽名单` +
      (missing.length ? `；仍缺：${missing.join(',')}` : '；全覆盖 ✓'),
  );
}

console.log('\n产物：data/raw/monsters-<series>.json');
