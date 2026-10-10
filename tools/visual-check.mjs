#!/usr/bin/env node
/**
 * 移动端页面体检：横向溢出检测 + 截图。
 *
 * 用系统已安装的 Chrome（不下载 Chromium）。对每条路由：
 *   1. 设成手机视口
 *   2. 量 documentElement.clientWidth / scrollWidth
 *   3. 列出所有超出视口左右的元素（定位布局 Bug 的元凶）
 *   4. 截图存到 .cache/shots/
 *
 * 用法：
 *   node tools/visual-check.mjs                 # 默认 390x844
 *   node tools/visual-check.mjs --w 430 --h 932
 *   node tools/visual-check.mjs --base http://127.0.0.1:5181
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};

const BASE = arg('--base', 'http://127.0.0.1:5181');
const W = Number(arg('--w', 390));
const H = Number(arg('--h', 844));
const SHOTS = path.join(ROOT, '.cache', 'shots');

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const ROUTES = [
  ['home', '/#/'],
  ['series-list', '/#/series'],
  ['series-tiga', '/#/series/tiga'],
  ['series-dyna', '/#/series/dyna'],
  ['ep-tiga-52', '/#/ep/tiga-52'],
  ['ep-dyna-11', '/#/ep/dyna-11'],
  ['ranking', '/#/ranking'],
  ['search', '/#/search'],
  ['people', '/#/people'],
  ['person', '/#/person/hirochika-muraishi'],
  ['methodology', '/#/methodology'],
];

const exe = CANDIDATES.find((p) => fs.existsSync(p));
if (!exe) {
  console.error('找不到 Chrome / Edge，请手动指定');
  process.exit(1);
}

fs.mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2'],
});

const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const problems = [];

for (const [name, route] of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle0', timeout: 30000 });
  // 等入场动画结束
  await new Promise((r) => setTimeout(r, 450));

  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;

    /** 祖先里有横向可滚动 / 裁切的容器 → 溢出是设计意图 */
    const clippedByAncestor = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
      }
      return false;
    };

    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      // SVG 内部图形（封面用 preserveAspectRatio=slice，故意溢出后被 SVG 裁剪）不算布局问题
      if (el.ownerSVGElement) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (clippedByAncestor(el)) continue;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        const cls =
          typeof el.className === 'string' && el.className
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : '';
        bad.push({
          sel: el.tagName.toLowerCase() + cls,
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
        });
      }
    }
    return {
      vw,
      scrollW: de.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      bad: bad.slice(0, 12),
    };
  });

  // 真正的溢出 = 文档比视口宽
  const overflows = info.scrollW > info.vw;
  const tag = overflows ? 'OVERFLOW' : 'ok';
  if (overflows || info.bad.length) problems.push({ name, ...info });

  console.log(
    `[${tag.padEnd(8)}] ${name.padEnd(13)} viewport=${info.vw} scrollWidth=${info.scrollW}` +
      (overflows ? `  (+${info.scrollW - info.vw}px)` : ''),
  );
  for (const b of info.bad) {
    console.log(`             └ ${b.sel}  left=${b.left} right=${b.right} w=${b.w}`);
  }

  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

await browser.close();

console.log('');
if (problems.length) {
  console.log(`✗ ${problems.length} 个页面存在横向溢出：${problems.map((p) => p.name).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部 ${ROUTES.length} 个页面无横向溢出（视口 ${W}×${H}）`);
}
