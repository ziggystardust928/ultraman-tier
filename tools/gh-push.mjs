#!/usr/bin/env node
/**
 * 用 Personal Access Token 把仓库推到 GitHub 并开 Pages。
 *
 * 安全约定：
 *   - token 只从命令行参数读，不写进任何文件
 *   - push 时把 token 拼在 URL 里临时用，推完把 origin 重置成干净地址
 *     （否则 token 会留在 .git/config 里）
 *   - 需要 token 具备 repo + workflow 权限
 *
 * 用法：
 *   node tools/gh-push.mjs --token ghp_xxx [--repo ultraman-tier] [--private]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};

const TOKEN = arg('--token');
const REPO = arg('--repo', 'ultraman-tier');
const PRIVATE = argv.includes('--private');

if (!TOKEN) {
  console.error('用法: node tools/gh-push.mjs --token ghp_xxx [--repo 名字] [--private]');
  process.exit(1);
}

const API = 'https://api.github.com';
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'ultraman-tier-deploy',
  'Content-Type': 'application/json',
};

async function api(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, ok: res.ok, json };
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`git ${args.join(' ')} 失败:\n${r.stderr || r.stdout}`);
    process.exit(1);
  }
  return r;
}

// ------------------------------------------------------------------ 1. 验证 token
console.log('[1/6] 验证 token…');
const me = await api('GET', '/user');
if (!me.ok) {
  console.error(`  ✗ token 无效（HTTP ${me.status}）: ${me.json?.message ?? ''}`);
  process.exit(1);
}
const login = me.json.login;
console.log(`  ✓ 已认证为 ${login}（${me.json.name ?? ''}）`);

const scopes = (await api('GET', '/')).json;
console.log(`  作用域：${scopes?.['x-oauth-scopes'] ?? '(细粒度 token 不返回此头)'}`);

// ------------------------------------------------------------------ 2. 建仓库
console.log(`[2/6] 确保仓库 ${login}/${REPO} 存在…`);
let repoRes = await api('GET', `/repos/${login}/${REPO}`);
if (repoRes.ok) {
  console.log('  仓库已存在，直接推送');
} else {
  const created = await api('POST', '/user/repos', {
    name: REPO,
    description: '奥特曼单集评级 App —— 平成三杰逐集分级、编剧导演索引、PWA 离线可用',
    private: PRIVATE,
    has_issues: true,
    has_wiki: false,
    auto_init: false,
  });
  if (!created.ok) {
    console.error(`  ✗ 创建失败（HTTP ${created.status}）: ${created.json?.message ?? ''}`);
    if (created.status === 403) console.error('    通常是 token 缺少 repo 权限');
    if (created.status === 422) console.error('    通常是仓库名已被占用');
    process.exit(1);
  }
  console.log(`  ✓ 已创建 ${created.json.html_url}`);
  repoRes = created;
}

const htmlUrl = repoRes.json.html_url;
const pagesUrl = `https://${login.toLowerCase()}.github.io/${REPO}/`;

// ------------------------------------------------------------------ 3. 提交本地改动
console.log('[3/6] 提交本地改动…');
git(['add', '-A']);
const dirty = git(['status', '--porcelain']).stdout.trim();
if (dirty) {
  git(['-c', 'user.name=ultraman-tier', '-c', 'user.email=dev@ultraman-tier.local', 'commit', '-m', 'chore: 部署前快照']);
  console.log('  ✓ 已提交');
} else {
  console.log('  工作区干净，无需提交');
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
console.log(`  当前分支：${branch}`);

// ------------------------------------------------------------------ 4. 推送
console.log('[4/6] 推送到 GitHub…');
const pushUrl = `https://x-access-token:${TOKEN}@github.com/${login}/${REPO}.git`;
const push = spawnSync('git', ['push', pushUrl, `${branch}:main`, '--force'], {
  cwd: ROOT,
  encoding: 'utf8',
  // 别让 token 出现在错误信息里
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
if (push.status !== 0) {
  const msg = (push.stderr || push.stdout || '').replaceAll(TOKEN, '***');
  console.error(`  ✗ 推送失败:\n${msg}`);
  process.exit(1);
}
console.log('  ✓ 已推送到 main（token 未写入 .git/config）');

// 设一个干净的 origin，方便以后手动推
git(['remote', 'remove', 'origin'], { allowFail: true });
git(['remote', 'add', 'origin', `https://github.com/${login}/${REPO}.git`]);
console.log(`  ✓ origin 已设为 ${htmlUrl}（不含 token）`);

// ------------------------------------------------------------------ 5. 开 Pages
// 坑：首次开启必须用 POST，PUT 会返回 404。
// PUT 只能改「已存在站点」的配置。踩过：一直用 PUT，一直 404，
// 误以为是 token 权限问题，查了半天。
console.log('[5/6] 开启 GitHub Pages…');
let pagesState = await api('GET', `/repos/${login}/${REPO}/pages`);

if (pagesState.status === 404) {
  const created = await api('POST', `/repos/${login}/${REPO}/pages`, {
    source: { branch: 'main', path: '/' },
  });
  if (created.ok) {
    console.log('  ✓ 已创建 Pages 站点');
    pagesState = await api('GET', `/repos/${login}/${REPO}/pages`);
  } else {
    console.log(`  ⚠ 创建 Pages 失败 HTTP ${created.status}: ${created.json?.message ?? ''}`);
  }
}

if (pagesState.ok && pagesState.json?.build_type !== 'workflow') {
  const put = await api('PUT', `/repos/${login}/${REPO}/pages`, { build_type: 'workflow' });
  if (put.ok) console.log('  ✓ 构建方式已切为 GitHub Actions');
  else console.log(`  ⚠ 切换失败 HTTP ${put.status}，可到 ${htmlUrl}/settings/pages 手动选 GitHub Actions`);
} else if (pagesState.ok) {
  console.log('  ✓ 已是 GitHub Actions 构建方式');
}

// ------------------------------------------------------------------ 6. 等构建
// 只等 push 触发的那次。之前这里额外调了一次 workflow_dispatch，
// 结果两次运行在 concurrency 组里互相取消，轮询还刚好取到了被取消的那次，
// 误报成构建失败。
console.log('[6/6] 等待构建（push 已触发，约 1-2 分钟）…');

let run = null;
for (let i = 0; i < 20 && !run; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const runs = await api('GET', `/repos/${login}/${REPO}/actions/runs?per_page=10`);
  const list = (runs.json?.workflow_runs ?? [])
    .filter((r) => r.event === 'push' && r.conclusion !== 'cancelled')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  run = list[0] ?? null;
}

if (run) {
  for (let i = 0; i < 40; i++) {
    const cur = await api('GET', `/repos/${login}/${REPO}/actions/runs/${run.id}`);
    const status = cur.json?.status;
    const concl = cur.json?.conclusion;
    process.stdout.write(`\r  构建 ${status}${concl ? ` / ${concl}` : ''}   `);
    if (status === 'completed') {
      console.log('');
      if (concl === 'success') console.log('✓ 构建并部署成功');
      else console.log(`✗ 构建未通过，日志：${run.html_url}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
}

console.log('\n' + '─'.repeat(56));
console.log(`仓库：${htmlUrl}`);
console.log(`构建日志：${htmlUrl}/actions`);
console.log(`\n访问地址（首次部署生效需 1-2 分钟）：\n  ${pagesUrl}`);
console.log('─'.repeat(56));

fs.writeFileSync(
  path.join(ROOT, '.cache', 'deploy-result.json'),
  JSON.stringify({ login, repo: REPO, htmlUrl, pagesUrl }, null, 1),
);
