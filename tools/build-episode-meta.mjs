#!/usr/bin/env node
/**
 * 汇总每集的「首播日期 / 登场怪兽 / 收视率 / 备选中文标题」。
 *
 * 数据来源分散在不同格式的原始文件里，统一在这里解析成一份规整的 JSON：
 *   data/_src/baidu_ep_rows.txt    迪迦：首播日 + 标题 + 怪兽 + 收视率
 *   data/raw/_brief.txt            戴拿：逐集研究稿，含首播日
 *   data/raw/monsters-*.json       三部：登场怪兽（tools/fetch-monsters.mjs 产出）
 *
 * 产物：data/raw/episode-meta-<series>.json
 *
 * 原则：拿不到就留 null，不推算、不编造。
 *（盖亚的首播日无法从现有源取得，就留空；曾有把「首播日 + 7 天 × 集数」推出来的
 * 想法，但盖亚播出期间有一次停播，推出来会差一周，宁可空着。）
 *
 * 用法：node tools/build-episode-meta.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// ---------------------------------------------------------------- 迪迦：百度百科分集表
function fromBaidu() {
  const text = read('data/_src/baidu_ep_rows.txt');
  const out = {};
  let cur = null;

  for (const line of text.split('\n')) {
    const cells = line.split('~').map((s) => s.trim());
    if (cells.length < 4 || !/^\d{2}$/.test(cells[1] ?? '')) continue;

    const no = Number(cells[1]);
    const dateRaw = cells[0];
    const title = cells[2];

    // 表格有合并单元格：编剧/导演可能缺失。
    // 收视率永远在最后一列，所以必须从尾部识别，不能按固定下标取
    // ——否则「缺编剧导演」的行会把收视率错当成编剧（踩过）。
    let rest = cells.slice(3);
    let rating = null;
    if (rest.length && /%\s*$/.test(rest[rest.length - 1])) {
      rating = Number(rest.pop().replace('%', '').trim());
    }
    const [monstersRaw, writer, director] = rest;

    const dm = dateRaw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    cur = {
      no,
      airDate: dm ? iso(+dm[1], +dm[2], +dm[3]) : null,
      titleAlt: title || null,
      monstersRaw: monstersRaw || null,
      viewership: Number.isFinite(rating) ? rating : null,
      writerBaidu: writer || null,
      directorBaidu: director || null,
    };
    // 编剧/导演列是合并单元格，缺的沿用上一集
    if (!cur.writerBaidu || !cur.directorBaidu) {
      const prev = out[no - 1];
      if (prev) {
        cur.writerBaidu = cur.writerBaidu ?? prev.writerBaidu;
        cur.directorBaidu = cur.directorBaidu ?? prev.directorBaidu;
      }
    }
    out[no] = cur;
  }
  return out;
}

// ---------------------------------------------------------------- 戴拿：研究稿里的首播日
function fromBrief() {
  const text = read('data/raw/_brief.txt');
  const out = {};
  let year = null;

  for (const m of text.matchAll(/^### EP(\d{2})\s+(.+?)\s*\|\s*zh=(.+?)\s*\|\s*W=(.+?)\s+D=(.+?)\s*\|\s*(.+)$/gm)) {
    const no = Number(m[1]);
    const dateRaw = m[6].trim();

    let month = null;
    let day = null;
    const full = dateRaw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    const part = dateRaw.match(/^(\d{1,2})月(\d{1,2})日/);
    if (full) {
      year = +full[1];
      month = +full[2];
      day = +full[3];
    } else if (part) {
      month = +part[1];
      day = +part[2];
      // 跨年：月份变小说明进入下一年
      if (year !== null && out[no - 1]?.month > month) year += 1;
    }

    out[no] = {
      no,
      airDate: year && month && day ? iso(year, month, day) : null,
      month,
      titleJa: m[2].trim(),
      titleAlt: m[3].trim(),
      writerJa: m[4].trim(),
      directorJa: m[5].trim(),
    };
  }
  return out;
}

// ---------------------------------------------------------------- 主流程
const monsters = {};
for (const sid of ['tiga', 'dyna', 'gaia']) {
  const f = path.join(OUT, `monsters-${sid}.json`);
  monsters[sid] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).parsed : {};
}

const baidu = fromBaidu();
const brief = fromBrief();

const report = [];

for (const sid of ['tiga', 'dyna', 'gaia']) {
  const src = sid === 'tiga' ? baidu : sid === 'dyna' ? brief : {};
  const mon = monsters[sid];

  // 集号范围
  const maxNo = sid === 'tiga' ? 52 : 51;
  const out = {};

  for (let no = 1; no <= maxNo; no++) {
    const s = src[no] ?? {};
    const m = mon[no] ?? {};
    out[no] = {
      no,
      airDate: s.airDate ?? null,
      airDateSource: s.airDate ? (sid === 'tiga' ? 'baidu-baike' : 'jawiki-brief') : null,
      titleAlt: s.titleAlt ?? null,
      titleJa: s.titleJa ?? null,
      monsters: m.monsters?.length ? m.monsters : null,
      monstersSource: m.monsters?.length ? `bilibili-column(${sid})` : null,
      viewershipPct: s.viewership ?? null,
    };
  }

  const withDate = Object.values(out).filter((x) => x.airDate).length;
  const withMon = Object.values(out).filter((x) => x.monsters).length;
  const withRate = Object.values(out).filter((x) => x.viewershipPct !== null).length;

  fs.writeFileSync(path.join(OUT, `episode-meta-${sid}.json`), JSON.stringify(out, null, 1));
  report.push({ sid, total: maxNo, withDate, withMon, withRate });
}

console.log('写入 data/raw/episode-meta-<series>.json\n');
console.log('剧集      首播日    登场怪兽   收视率');
for (const r of report) {
  console.log(
    `${r.sid.padEnd(8)} ${String(r.withDate).padStart(2)}/${r.total}   ` +
      `${String(r.withMon).padStart(2)}/${r.total}    ` +
      `${String(r.withRate).padStart(2)}/${r.total}`,
  );
}
