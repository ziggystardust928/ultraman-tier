#!/usr/bin/env node
/**
 * 构建后生成 Service Worker（离线能力）。
 *
 * 为什么要构建后生成：Vite 打包出来的 JS/CSS 带内容哈希，
 * 预缓存清单必须等构建完成才知道。所以扫一遍 dist/ 再写 sw.js。
 *
 * 缓存策略：
 *   - 应用外壳（html/js/css/图标/manifest/官方海报与设计稿）→ 安装时全部预缓存，离线可开
 *   - 分集剧照 img/<series>/ep/*（154 张，约 1.6MB）→ 运行时按需缓存
 *     首次安装就下 1.6MB 太重，而且大部分用户不会翻完所有剧集
 *
 * 用法：node tools/gen-sw.mjs   （由 npm run build 自动调用）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('dist/ 不存在，请先跑 vite build');
  process.exit(1);
}

/** 递归列出 dist 下所有文件（相对路径，正斜杠） */
function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const all = walk(DIST).filter((f) => f !== 'sw.js');

// 分集剧照走运行时缓存，其余全部预缓存
const isEpisodeStill = (f) => /^img\/[^/]+\/ep\//.test(f);
const precache = all.filter((f) => !isEpisodeStill(f));
const runtimePattern = 'img/*/ep/';

// 版本号取所有文件的路径 + 大小 + 修改时间的哈希：内容变了版本就变，旧缓存自动清掉
const h = crypto.createHash('sha256');
for (const f of all.sort()) {
  const st = fs.statSync(path.join(DIST, f));
  h.update(`${f}:${st.size}`);
}
const VERSION = h.digest('hex').slice(0, 12);

const sw = `/* 自动生成，请勿手改 —— 由 tools/gen-sw.mjs 产出 */
const VERSION = '${VERSION}';
const CACHE = 'ultraman-tier-' + VERSION;
const RUNTIME = 'ultraman-tier-runtime-' + VERSION;

const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 逐个 add，单个失败不影响整体安装
      await Promise.all(
        PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const rel = url.pathname.replace(/^\\//, '');

  // 页面导航：网络优先，离线时回退到缓存的应用外壳
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const c = await caches.open(CACHE);
          c.put('index.html', fresh.clone());
          return fresh;
        } catch {
          const c = await caches.open(CACHE);
          return (await c.match('index.html')) || (await c.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // 分集剧照：缓存优先，第一次取到就存下来
  if (rel.startsWith('${runtimePattern.split('*')[0]}')) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // 应用外壳：缓存优先（已预缓存），后台不再重复请求
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })()
  );
});
`;

fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
console.log(
  `sw.js 已生成  version=${VERSION}  预缓存 ${precache.length} 项  ` +
    `运行时缓存 img/*/ep/（${all.filter(isEpisodeStill).length} 张剧照）`,
);
