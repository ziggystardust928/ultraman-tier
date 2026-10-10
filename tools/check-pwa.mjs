#!/usr/bin/env node
/**
 * PWA 体检：在真实浏览器里验证 Service Worker 与离线能力。
 *
 * 光看构建产物存在是不够的 —— SW 注册失败、预缓存 404、离线回退没写对，
 * 这些都只有跑起来才知道。
 *
 * 用法：node tools/check-pwa.mjs [--base http://127.0.0.1:5181]
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

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const exe = CANDIDATES.find((p) => fs.existsSync(p));
if (!exe) {
  console.error('找不到 Chrome / Edge');
  process.exit(1);
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  console.log('\n[1] manifest 与图标');
  const res = await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0', timeout: 40000 });

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return { found: false };
    const r = await fetch(link.href);
    return { found: true, status: r.status, json: await r.json() };
  });
  check('manifest 可访问', manifest.found && manifest.status === 200, `HTTP ${manifest.status}`);
  check('manifest name 正确', manifest.json?.name === '奥特曼单集评级', manifest.json?.name ?? '');
  check('manifest display=standalone', manifest.json?.display === 'standalone', manifest.json?.display ?? '');

  const iconOk = await page.evaluate(async (icons) => {
    const out = [];
    for (const i of icons) {
      const r = await fetch(new URL(i.src, location.href).href, { method: 'HEAD' });
      out.push({ src: i.src, ok: r.ok, status: r.status });
    }
    return out;
  }, manifest.json.icons);
  check('全部图标可访问', iconOk.every((i) => i.ok), iconOk.map((i) => i.src.split('/').pop()).join(', '));

  console.log('\n[2] Service Worker');
  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { supported: true, registered: false };
    await navigator.serviceWorker.ready;
    return {
      supported: true,
      registered: true,
      scope: reg.scope,
      active: !!reg.active,
      scriptURL: reg.active?.scriptURL ?? null,
    };
  });
  check('SW 已注册', swState.registered === true, swState.scope ?? '');
  check('SW 已激活', swState.active === true, swState.scriptURL ?? '');

  // 等预缓存装完
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const out = {};
    for (const n of names) {
      const c = await caches.open(n);
      out[n] = (await c.keys()).length;
    }
    return out;
  });
  const totalCached = Object.values(cached).reduce((a, b) => a + b, 0);
  check('预缓存写入完成', totalCached >= 20, `${totalCached} 项 ${JSON.stringify(cached)}`);

  console.log('\n[3] 离线能力（关键）');
  // 先在联网状态多逛几页，触发运行时缓存
  for (const r of ['/#/ranking', '/#/series/tiga', '/#/ep/tiga-52', '/#/people']) {
    await page.goto(BASE + r, { waitUntil: 'networkidle0', timeout: 30000 });
  }

  await page.setOfflineMode(true);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 800));

  const offline = await page.evaluate(() => {
    const app = document.querySelector('.app');
    const tabbar = document.querySelectorAll('.tabbar-item').length;
    const covers = document.querySelectorAll('.cover-img').length;
    return {
      hasApp: !!app,
      tabbarItems: tabbar,
      covers,
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
    };
  });
  check('离线时应用外壳仍能渲染', offline.hasApp && offline.tabbarItems === 5, `tabbar ${offline.tabbarItems} 项`);
  check('离线时封面图仍可见', offline.covers > 0, `${offline.covers} 张`);

  // 离线状态下的深链接
  await page.goto(`${BASE}/#/ep/tiga-52`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 800));
  const deep = await page.evaluate(() => ({
    title: document.querySelector('.ep-hero-body')?.innerText?.replace(/\s+/g, ' ').slice(0, 40) ?? null,
  }));
  check('离线时深链接可打开', !!deep.title, deep.title ?? '');

  await page.setOfflineMode(false);
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log('');
if (failed.length) {
  console.log(`✗ ${failed.length}/${checks.length} 项未通过：${failed.map((f) => f.name).join('、')}`);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部 ${checks.length} 项通过，PWA 离线可用`);
}
