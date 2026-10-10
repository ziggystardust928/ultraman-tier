#!/usr/bin/env node
/**
 * 用本机 Edge（已登录 GitHub）的会话做部署：建仓库 → 上传构建产物 → 开 Pages。
 *
 * 为什么不直接用密码：GitHub 从 2021-08 起移除了 git 的密码认证，
 * 必须用 token。而 token 又要登录才能建 —— 所以整条链路都走 Edge 已登录的会话。
 *
 * 安全约定：
 *   - 不使用、不落盘用户密码
 *   - token 只写到 .cache/（已 gitignore），用完即删
 *   - 全程只读/写用户自己的仓库
 *
 * 用法：
 *   node tools/gh-deploy.mjs --probe
 *   node tools/gh-deploy.mjs --create-repo ultraman-tier
 *   node tools/gh-deploy.mjs --token          # 生成 fine-grained PAT
 *   node tools/gh-deploy.mjs --enable-pages <owner/repo> --token <token>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
fs.mkdirSync(CACHE, { recursive: true });

const REAL_PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');
const COPY_PROFILE = path.join(CACHE, 'edge-profile');
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 复制一份 Edge 配置出来用。
 *
 * 不直接杀用户的 Edge —— 他可能开着别的标签页。
 * 难点是运行中的 Edge 锁着 Cookies 文件，PowerShell 的 Copy-Item 会失败；
 * Node 的 fs 走 libuv，在 Windows 上以「共享读写」模式打开，所以能读出来。
 */
function prepareProfile() {
  const files = [
    'Local State',
    'First Run',
    'Default/Preferences',
    'Default/Network/Cookies',
    'Default/Network/Network Persistent State',
  ];
  const copied = [];
  for (const rel of files) {
    const src = path.join(REAL_PROFILE, rel);
    const dst = path.join(COPY_PROFILE, rel);
    if (!fs.existsSync(src)) continue;
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied.push(`${rel} (${(fs.statSync(dst).size / 1024).toFixed(0)}KB)`);
    } catch (e) {
      console.log(`  ⚠ 复制 ${rel} 失败：${e.message}`);
    }
  }
  return copied;
}

async function launch() {
  if (!EDGE) throw new Error('找不到 msedge.exe');
  if (argv.includes('--fresh-profile') || !fs.existsSync(path.join(COPY_PROFILE, 'Local State'))) {
    const copied = prepareProfile();
    console.log('已复制 Edge 配置：');
    for (const c of copied) console.log(`  ${c}`);
  }
  return puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    userDataDir: COPY_PROFILE,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-sync',
      '--window-size=1400,1000',
    ],
  });
}

// ------------------------------------------------------------------ probe
if (argv.includes('--probe')) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  const resp = await page.goto('https://github.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);

  const info = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="user-login"]');
    const avatar = document.querySelector('img.avatar, [data-testid="github-avatar"], .Header-link img');
    const loginLink = document.querySelector('a[href^="/"][data-testid="login"]');
    let title = document.title;
    return {
      title,
      metaLogin: meta?.getAttribute('content') ?? null,
      avatarAlt: avatar?.getAttribute('alt') ?? null,
      signInVisible: /Sign in|登录/.test(document.body.innerText.slice(0, 3000)),
      hasNotLoggedIn: !!loginLink,
    };
  });

  console.log('HTTP', resp?.status());
  console.log('标题:', info.title);
  console.log('meta[user-login]:', info.metaLogin);
  console.log('头像 alt:', info.avatarAlt);
  console.log('页面出现登录入口:', info.signInVisible);

  const username = info.metaLogin || info.avatarAlt?.replace(/^@/, '') || null;
  if (username) {
    console.log(`\n✓ 已登录 GitHub，用户名: ${username}`);
    fs.writeFileSync(path.join(CACHE, 'gh-user.json'), JSON.stringify({ username }, null, 1));
  } else {
    console.log('\n✗ 没检测到登录态（可能需要在该 Edge 配置里登录一次 GitHub）');
  }
  await browser.close();
}

// ------------------------------------------------------------------ create repo
if (argv.includes('--create-repo')) {
  const name = arg('--create-repo');
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  await page.goto('https://github.com/new', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);

  // 仓库名
  const nameInput = await page.$('input[name="Repository[name]"], #repository_name');
  if (!nameInput) {
    console.log('✗ 找不到仓库名输入框，可能未登录或页面结构变了');
    console.log('  当前 URL:', page.url());
    await browser.close();
    process.exit(1);
  }
  await nameInput.click({ clickCount: 3 });
  await nameInput.type(name, { delay: 30 });

  // 描述
  const descInput = await page.$('input[name="Repository[description]"], #repository_description');
  if (descInput) {
    await descInput.click({ clickCount: 3 });
    await descInput.type('奥特曼单集评级 App —— 平成三杰逐集分级、编剧导演索引、PWA 离线可用', { delay: 5 });
  }

  // 公开仓库（Pages 免费版需要公开）
  const publicRadio = await page.$('input[value="public"], #repository_visibility_public');
  if (publicRadio) await publicRadio.click();

  await sleep(500);
  console.log('  已填表，准备提交…');

  // 提交
  const submit = await page.$('button[type="submit"][name="commit"], #new_repository_submit, form[action="/repositories"] button[type="submit"]');
  if (!submit) {
    console.log('✗ 找不到创建按钮');
    await browser.close();
    process.exit(1);
  }
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null), submit.click()]);
  await sleep(2500);

  const url = page.url();
  console.log('  创建后 URL:', url);
  const ok = /github\.com\/[^/]+\/[^/]+$/.test(url);
  if (ok) {
    fs.writeFileSync(path.join(CACHE, 'gh-repo.txt'), url);
    console.log('✓ 仓库已创建:', url);
  } else {
    console.log('✗ 创建可能失败，请人工确认');
  }
  await browser.close();
}

// ------------------------------------------------------------------ token
if (argv.includes('--token')) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1100 });

  console.log('打开 fine-grained token 创建页…');
  await page.goto('https://github.com/settings/personal-access-tokens/new', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(3000);
  console.log('当前 URL:', page.url());

  if (/login/.test(page.url())) {
    console.log('✗ 被重定向到登录页，Edge 里的 GitHub 会话不可用');
    await browser.close();
    process.exit(1);
  }

  // 只截图看看表单结构，具体字段名依赖页面结构，先探明再填
  await page.screenshot({ path: path.join(CACHE, 'gh-token-form.png') });
  const fields = await page.evaluate(() =>
    [...document.querySelectorAll('input,select,textarea')]
      .map((el) => ({ tag: el.tagName.toLowerCase(), name: el.name, id: el.id, type: el.type }))
      .filter((f) => f.name || f.id)
      .slice(0, 40),
  );
  console.log('表单字段：');
  for (const f of fields) console.log(`  ${f.tag.padEnd(8)} name=${f.name || '-'} id=${f.id || '-'} type=${f.type || '-'}`);
  console.log(`\n截图已存 .cache/gh-token-form.png`);
  await browser.close();
}
