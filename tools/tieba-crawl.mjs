#!/usr/bin/env node
/**
 * 用系统 Edge + 用户真实配置（含贴吧登录态）抓取贴吧页面。
 *
 * 为什么这么做：Edge 127+ 的 cookie 是 v20 应用绑定加密（ABE），密钥由浏览器的
 * 提权服务托管并校验调用进程路径，外部无法用 DPAPI 解开。所以不让外部解，
 * 直接让 Edge 自己去解密 —— 用 CDP 复用它已登录的会话。
 *
 * 用法：
 *   node tools/tieba-crawl.mjs --probe
 *   node tools/tieba-crawl.mjs --search "迪迦奥特曼单集评价" --out data/raw/tieba-search.json
 *   node tools/tieba-crawl.mjs --thread <tid|url> [--pages N] --out data/raw/tieba-thread-<tid>.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const USER_DATA = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};

export async function launchEdge() {
  if (!EDGE) throw new Error('找不到 msedge.exe');
  return puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    userDataDir: USER_DATA,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-sync',
      '--disable-features=msEdgeSidebar,msEdgeIdentityBubble',
      '--window-size=1280,900',
    ],
  });
}

export async function newPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  );
  return page;
}

// ------------------------------------------------------------------ probe
if (argv.includes('--probe')) {
  const browser = await launchEdge();
  const page = await newPage(browser);

  const resp = await page.goto('https://tieba.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  const status = resp?.status();

  const cookies = await page.cookies('https://tieba.baidu.com/');
  const names = cookies.map((c) => c.name);
  const hasBduss = names.some((n) => n.startsWith('BDUSS'));

  const title = await page.title();
  const loggedIn = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      // 未登录时页面会出现「登录」按钮
      hasLoginBtn: /登录|立即登录/.test(t),
      hasUserArea: !!document.querySelector('.u_menu_username, .userinfo_wrap, .u_username, [class*="userName"]'),
      snippet: t.replace(/\s+/g, ' ').slice(0, 160),
    };
  });

  console.log('贴吧首页 HTTP:', status);
  console.log('页面标题:', title);
  console.log('BDUSS cookie:', hasBduss ? '有' : '无');
  console.log('cookie 总数:', cookies.length, '| 关键:', names.filter((n) => /BDUSS|STOKEN|BAIDUID/.test(n)).join(', '));
  console.log('页面片段:', loggedIn.snippet);

  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE, 'tieba-probe.json'),
    JSON.stringify({ status, title, hasBduss, cookieNames: names, loggedIn }, null, 2),
  );

  await browser.close();
  console.log(status === 200 ? '\n✓ 抓取通道可用' : '\n✗ 仍被拦截');
}
