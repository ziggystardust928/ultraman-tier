#!/usr/bin/env node
/**
 * 从本机 Edge 的 cookie 库提取 baidu.com 域的 cookie，供贴吧抓取使用。
 *
 * 原理：Edge 把 cookie 存在 SQLite（Network\Cookies），encrypted_value 用
 * AES-256-GCM 加密，密钥本身再用 Windows DPAPI（当前用户）保护。
 * 密钥由 tools/edge-dpapi-key.ps1 解出后写到 .cache/.dpapi-key。
 *
 * 安全约定：
 *   - 只提取 host_key 含 baidu.com 的 cookie
 *   - cookie 值只写入 .cache/tieba-cookies.txt（已 gitignore）
 *   - 终端只打印 cookie 名字和长度，绝不打印值
 *
 * 用法：node tools/edge-cookies.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
fs.mkdirSync(CACHE, { recursive: true });

const USER_DATA = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');

// ---------------------------------------------------------------- 找 cookie 库
function findCookieDb() {
  const candidates = [];
  for (const profile of ['Default', 'Profile 1', 'Profile 2', 'Profile 3']) {
    candidates.push(path.join(USER_DATA, profile, 'Network', 'Cookies'));
  }
  const found = candidates.filter((p) => fs.existsSync(p));
  if (!found.length) {
    // 有些版本没有 Network 子目录
    for (const profile of ['Default', 'Profile 1']) {
      const p = path.join(USER_DATA, profile, 'Cookies');
      if (fs.existsSync(p)) found.push(p);
    }
  }
  if (!found.length) throw new Error(`在 ${USER_DATA} 下找不到 Cookies 数据库`);
  // 挑最大的那个（主配置文件）
  return found.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

// ---------------------------------------------------------------- 解密
function loadKey() {
  const keyFile = path.join(CACHE, '.dpapi-key');
  if (!fs.existsSync(keyFile)) {
    throw new Error('缺少 .cache/.dpapi-key —— 请先运行 tools/edge-dpapi-key.ps1');
  }
  const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64');
  if (key.length !== 32) throw new Error(`密钥长度不对：${key.length}（应为 32）`);
  return key;
}

function decryptValue(enc, key) {
  if (!enc || enc.length < 15) return { ok: false, reason: 'empty' };
  const prefix = enc.subarray(0, 3).toString('latin1');

  if (prefix === 'v10' || prefix === 'v11') {
    try {
      const iv = enc.subarray(3, 15);
      const tag = enc.subarray(enc.length - 16);
      const data = enc.subarray(15, enc.length - 16);
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      const out = Buffer.concat([d.update(data), d.final()]);
      // 新版会带一个 32 字节的域绑定前缀，去掉
      const s = out.toString('utf8');
      return { ok: true, value: s.replace(/^[\x00-\x20]+/, '') };
    } catch (e) {
      return { ok: false, reason: `aes-gcm 失败: ${e.message}` };
    }
  }
  if (prefix === 'v20') {
    return { ok: false, reason: 'v20 应用绑定加密（Chrome 127+），DPAPI 单独解不开' };
  }
  return { ok: false, reason: `未知前缀 ${JSON.stringify(prefix)}` };
}

// ---------------------------------------------------------------- 主流程
const dbPath = findCookieDb();
console.log(`cookie 库: ${dbPath}`);

const tmp = path.join(CACHE, 'edge-cookies.db');
fs.copyFileSync(dbPath, tmp);

const db = new DatabaseSync(tmp, { readOnly: true });

const rows = db
  .prepare(
    // expires_utc 是 1601 纪元的微秒数，超出 JS 安全整数范围，必须按字符串取
    `SELECT host_key, name, encrypted_value, path,
            CAST(expires_utc AS TEXT) AS expires_text,
            is_secure, is_httponly
     FROM cookies
     WHERE host_key LIKE '%baidu.com'
     ORDER BY host_key, name`,
  )
  .all();

db.close();
fs.rmSync(tmp, { force: true });

if (!rows.length) {
  console.log('✗ cookie 库里没有 baidu.com 的记录 —— 可能选错了配置文件，或 Edge 从未访问过百度');
  process.exit(1);
}

const key = loadKey();
const prefixes = {};
const decrypted = [];
const failures = [];

for (const r of rows) {
  const enc = Buffer.isBuffer(r.encrypted_value) ? r.encrypted_value : Buffer.from(r.encrypted_value);
  const p = enc.subarray(0, 3).toString('latin1');
  prefixes[p] = (prefixes[p] ?? 0) + 1;
  const res = decryptValue(enc, key);
  if (res.ok) decrypted.push({ ...r, value: res.value });
  else failures.push({ name: r.name, host: r.host_key, reason: res.reason });
}

console.log(`加密版本分布: ${JSON.stringify(prefixes)}`);
console.log(`成功解密 ${decrypted.length} / ${rows.length}`);

if (failures.length) {
  console.log('失败样本（前 5 条）:');
  for (const f of failures.slice(0, 5)) console.log(`  ${f.host} ${f.name}: ${f.reason}`);
}

// 关注的 cookie：BDUSS 是百度登录态核心
const NAMES = ['BDUSS', 'BDUSS_BFESS', 'STOKEN', 'PTOKEN', 'BAIDUID', 'BAIDUID_BFESS', 'H_PS_PSSID', 'BIDUPSID', 'ab_sr'];
const picked = decrypted.filter((c) => NAMES.includes(c.name));

console.log('\n解密出的关键 cookie（只显示名字和长度）:');
for (const c of picked) console.log(`  ${c.name.padEnd(14)} len=${String(c.value.length).padStart(4)}  host=${c.host_key}`);

const hasLogin = picked.some((c) => c.name.startsWith('BDUSS'));
console.log(hasLogin ? '\n✓ 拿到 BDUSS，登录态可用' : '\n✗ 没有 BDUSS —— Edge 里可能没登录百度');

// 写 Netscape 格式 cookie 文件，供 curl 使用
if (picked.length) {
  const lines = [
    '# Netscape HTTP Cookie File',
    '# 由 tools/edge-cookies.mjs 从本机 Edge 提取，仅用于贴吧抓取',
  ];
  for (const c of picked) {
    const domain = c.host_key.startsWith('.') ? c.host_key : `.${c.host_key.replace(/^\./, '')}`;
    const includeSub = 'TRUE';
    const secure = c.is_secure ? 'TRUE' : 'FALSE';
    const expires = c.expires_text ? Math.floor(Number(BigInt(c.expires_text) / 1000000n) - 11644473600) : 0;
    lines.push([domain, includeSub, c.path || '/', secure, expires, c.name, c.value].join('\t'));
  }
  const out = path.join(CACHE, 'tieba-cookies.txt');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`\n已写入 ${out}（${picked.length} 条，已 gitignore）`);
}
