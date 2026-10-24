#!/usr/bin/env node
/**
 * Build the app dataset from the raw sources.
 *
 *   data/raw/imdb-heisei3.json   IMDb bulk datasets (ratings, crew, runtime)
 *   data/raw/bili-*.json         Bilibili PGC (Chinese titles, durations, staff)
 *   data/curated/name-map.json   romaji -> Chinese name mapping
 *   data/curated/tier-config.json tier thresholds + scoring weights
 *        |
 *        v
 *   data/dist/dataset.json       what the app imports
 *
 * Usage: node tools/build-dataset.mjs [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const QUIET = process.argv.includes('--quiet');

// 旧平成（迪迦 → 赛罗）
// expect = 官方 TV 集数，作为权威：IMDb 和 B 站的集数常有出入
//   - 奈欧斯：IMDb 有 ep0（序章），多一条
//   - 麦克斯：IMDb 有 40 条，多一条特别篇
//   - 大怪兽格斗：IMDb ep5 有两条重复条目
//   - 奈克瑟斯：B 站 38 集，比 TV 正片多一集
const SERIES = [
  { id: 'tiga', parent: 'tt0182647', era: 'heisei', year: 1996, expect: 52, titleJa: 'ウルトラマンティガ', titleEn: 'Ultraman Tiga' },
  { id: 'dyna', parent: 'tt0184167', era: 'heisei', year: 1997, expect: 51, titleJa: 'ウルトラマンダイナ', titleEn: 'Ultraman Dyna' },
  { id: 'gaia', parent: 'tt0184168', era: 'heisei', year: 1998, expect: 51, titleJa: 'ウルトラマンガイア', titleEn: 'Ultraman Gaia' },
  { id: 'neos', parent: 'tt1985904', era: 'heisei', year: 2000, expect: 12, titleJa: 'ウルトラマンネオス', titleEn: 'Ultraman Neos' },
  { id: 'cosmos', parent: 'tt1934108', era: 'heisei', year: 2001, expect: 65, titleJa: 'ウルトラマンコスモス', titleEn: 'Ultraman Cosmos' },
  { id: 'nexus', parent: 'tt0493100', era: 'heisei', year: 2004, expect: 37, titleJa: 'ウルトラマンネクサス', titleEn: 'Ultraman Nexus' },
  { id: 'max', parent: 'tt0493197', era: 'heisei', year: 2005, expect: 39, titleJa: 'ウルトラマンマックス', titleEn: 'Ultraman Max' },
  { id: 'mebius', parent: 'tt1205892', era: 'heisei', year: 2006, expect: 50, titleJa: 'ウルトラマンメビウス', titleEn: 'Ultraman Mebius' },
  { id: 'sevenx', parent: 'tt1081848', era: 'heisei', year: 2007, expect: 12, titleJa: 'ULTRASEVEN X', titleEn: 'Ultraseven X' },
  { id: 'ugmmb', parent: 'tt29712426', era: 'heisei', year: 2007, expect: 13, titleJa: 'ウルトラギャラクシー大怪獣バトル', titleEn: 'Ultra Galaxy Mega Monster Battle' },
  { id: 'ugmmb2', parent: 'tt2446152', era: 'heisei', year: 2008, expect: 13, titleJa: 'ウルトラギャラクシー大怪獣バトル NEVER ENDING ODYSSEY', titleEn: 'Ultra Galaxy: Never Ending Odyssey' },
];

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

// ---------------------------------------------------------------- 图片素材
// 由 tools/fetch-images.mjs 从 Bilibili 图床下载到 public/img/
const PUBLIC = path.join(ROOT, 'public');
const stillRel = (sid, no) => `img/${sid}/ep/${String(no).padStart(2, '0')}.webp`;
const imgExists = (rel) => fs.existsSync(path.join(PUBLIC, rel));
const imgOrNull = (rel) => (imgExists(rel) ? rel : null);

// ---------------------------------------------------------------- load
// 两个 IMDb 提取结果合并：heisei3 = 迪迦/戴拿/盖亚，heisei8 = 后面 8 部
const imdbFiles = ['data/raw/imdb-heisei3.json', 'data/raw/imdb-heisei8.json'].filter((p) =>
  fs.existsSync(path.join(ROOT, p)),
);
const imdb = { episodes: imdbFiles.flatMap((p) => read(p).episodes) };
const nameMap = read('data/curated/name-map.json').people;
const config = read('data/curated/tier-config.json');
const designs = read('data/curated/designs.json');

const stats = (nums) => {
  if (!nums.length) return { mean: 0, sd: 0, n: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length) || 1e-9;
  return { mean, sd, n: nums.length };
};

const person = (en) => {
  const m = nameMap[en];
  return {
    id: slug(en),
    name: m?.zh ?? en,
    nameJa: m?.ja ?? null,
    nameEn: en,
    confidence: m?.confidence ?? 'none',
    note: m?.note ?? null,
  };
};

// ---------------------------------------------------------------- series
const out = { generatedAt: new Date().toISOString(), config, series: [], people: [], warnings: [] };
const peopleIndex = new Map();

for (const s of SERIES) {
  const bili = read(`data/raw/bili-${s.id}.json`);
  // 首播日 / 登场怪兽 / 收视率（tools/build-episode-meta.mjs 产出）
  const epMetaPath = path.join(ROOT, 'data', 'raw', `episode-meta-${s.id}.json`);
  const epMeta = fs.existsSync(epMetaPath) ? JSON.parse(fs.readFileSync(epMetaPath, 'utf8')) : {};

  // IMDb 按集号去重（大怪兽格斗 ep5 有两条重复条目）
  const imdbByNo = new Map();
  for (const e of imdb.episodes.filter((x) => x.parentTconst === s.parent)) {
    if (!imdbByNo.has(e.episode)) imdbByNo.set(e.episode, e);
  }
  const biliByNo = new Map(bili.episodes.map((e, i) => [i + 1, e]));

  if (bili.episodes.length !== s.expect) {
    out.warnings.push(`${s.id}: B 站 ${bili.episodes.length} 集，官方 ${s.expect} 集，按官方集数截断/补齐`);
  }
  if (imdbByNo.size !== s.expect) {
    out.warnings.push(`${s.id}: IMDb ${imdbByNo.size} 集（含特别篇/重复），官方 ${s.expect} 集`);
  }

  const episodes = [];
  for (let no = 1; no <= s.expect; no++) {
    const e = imdbByNo.get(no);
    const b = biliByNo.get(no) ?? {};
    const m = epMeta[no] ?? {};
    const directors = (e?.directors ?? []).map(person);
    const writers = (e?.writers ?? []).map(person);

    for (const p of [...directors, ...writers]) {
      const cur = peopleIndex.get(p.id) ?? { ...p, credits: [] };
      if (!cur.credits.some((c) => c.seriesId === s.id && c.no === no)) {
        cur.credits.push({ seriesId: s.id, no });
      }
      peopleIndex.set(p.id, cur);
    }

    episodes.push({
      id: `${s.id}-${no}`,
      seriesId: s.id,
      no,
      titleZh: b.long_title ?? null,
      titleRomaji: e?.primaryTitle ?? null,
      durationMin: b.duration_min ?? e?.runtimeMinutes ?? null,
      durationSource: b.duration_min ? 'bilibili' : e?.runtimeMinutes ? 'imdb' : null,
      imdb: { rating: e?.averageRating ?? null, votes: e?.numVotes ?? null, tconst: e?.tconst ?? null },
      bili: { epId: b.ep_id ?? null, bvid: b.bvid ?? null, durationMs: b.duration_ms ?? null },
      still: imgOrNull(stillRel(s.id, no)),
      airDate: m.airDate ?? null,
      airDateSource: m.airDateSource ?? null,
      titleAlt: m.titleAlt ?? null,
      titleJa: m.titleJa ?? null,
      monsters: m.monsters ?? null,
      viewershipPct: m.viewershipPct ?? null,
      tieba: null,
      directors,
      writers,
    });
  }

  const staffText = bili.search_hit?.staff ?? null;
  const parseStaff = (label) => {
    if (!staffText) return [];
    const line = staffText.split('\n').find((l) => l.startsWith(label));
    if (!line) return [];
    return line
      .slice(label.length + 1)
      .split(/[、/]/)
      .map((x) => x.replace(/（.*?）/g, '').trim())
      .filter(Boolean);
  };

  out.series.push({
    id: s.id,
    titleZh: bili.title,
    // Bilibili 的 org_title 有的返回日文原名、有的返回中文，统一用配置里的日文原名
    titleJa: s.titleJa,
    titleEn: s.titleEn,
    year: s.year,
    era: s.era,
    episodeCount: episodes.length,
    synopsis: bili.evaluate ?? null,
    mediaId: bili.media_id,
    seasonId: bili.season_id,
    ratings: {
      imdb: null,
      bilibili: bili.rating?.score ?? null,
      bilibiliVotes: bili.rating?.count ?? null,
      tieba: null,
    },
    staff: {
      directors: parseStaff('导演'),
      screenwriters: parseStaff('编剧'),
      cast: (staffText?.split('\n').find((l) => l.startsWith('主演')) ?? '')
        .replace(/^主演[:：]\s*/, '')
        .split(/[\s、/]+/)
        .filter(Boolean),
      rawText: staffText,
    },
    images: {
      cover: imgOrNull(`img/${s.id}/cover.webp`),
      square: imgOrNull(`img/${s.id}/square.webp`),
      // 设计稿：人工策展（data/curated/designs.json），用于首页封面旁的 2×2
      designs: (designs[s.id] ?? [])
        .map((d) => ({
          src: imgOrNull(`img/${s.id}/design/${d.file}`),
          label: d.label,
          note: d.note ?? null,
          bvid: d.bvid ?? null,
        }))
        .filter((d) => d.src),
      // 分集剧照：均匀取 6 张（首话 → 最终话），设计稿缺失时用它填格子
      photos:
        episodes.length > 0
          ? Array.from({ length: 6 }, (_, i) => episodes[Math.round((i * (episodes.length - 1)) / 5)])
              .map((e) => ({ src: e.still, no: e.no, label: `第 ${e.no} 话`, title: e.titleZh }))
              .filter((p) => p.src)
          : [],
    },
    episodes,
  });
}

// ---------------------------------------------------------------- scoring
// 重要：IMDb 对部分剧集的评分覆盖率极低 —— 高斯 8/65、大怪兽格斗几乎全无。
// 覆盖率不足的剧集**整剧不参与评分和分档**，否则「65 集里只有 8 集有分，
// 从中挑 2 集当神回」会严重误导。这些剧集仍然保留完整的分集/主创/怪兽数据。
const W = config.model.weights;
const C = config.model.bayesPriorCount;
const MIN_COVERAGE = config.model.minRatingCoverage ?? 0.5;

const allEpisodes = out.series.flatMap((s) => s.episodes);

// 0. 标记哪些集有可用评分
for (const e of allEpisodes) {
  e._rated = typeof e.imdb.rating === 'number' && e.imdb.rating > 0 && (e.imdb.votes ?? 0) > 0;
}

// 1. 每剧评分覆盖率；不足的整剧退出评分
for (const s of out.series) {
  const rated = s.episodes.filter((e) => e._rated);
  s.ratingCoverage = s.episodes.length ? Math.round((rated.length / s.episodes.length) * 1000) / 1000 : 0;
  s.ratingsIncomplete = s.ratingCoverage < MIN_COVERAGE;
  if (s.ratingsIncomplete) {
    // 整剧不参与分档
    for (const e of s.episodes) e._rated = false;
    out.warnings.push(
      `${s.id}: IMDb 评分仅覆盖 ${rated.length}/${s.episodes.length}（${Math.round(
        s.ratingCoverage * 100,
      )}%），低于 ${MIN_COVERAGE * 100}% 阈值，整剧不参与分档`,
    );
  }
  const stillRated = s.episodes.filter((e) => e._rated);
  s._mean = stillRated.length ? stats(stillRated.map((e) => e.imdb.rating)).mean : 0;
}

// 2. 贝叶斯收缩（只对有评分的集）
for (const e of allEpisodes) {
  if (!e._rated) continue;
  const s = out.series.find((x) => x.id === e.seriesId);
  e._shrunk = (e.imdb.votes * e.imdb.rating + C * s._mean) / (e.imdb.votes + C);
}

// 3. z 分数（均值和标准差只用有评分的集算）
const eraStats = {};
for (const s of out.series) {
  const pool = s.episodes.filter((e) => e._rated).map((e) => e._shrunk);
  s._shrinkStats = pool.length ? stats(pool) : { mean: 0, sd: 1e-9, n: 0 };
  (eraStats[s.era] ??= []).push(...pool);
}
for (const k of Object.keys(eraStats)) eraStats[k] = stats(eraStats[k]);

for (const e of allEpisodes) {
  if (!e._rated) {
    e.score = null;
    e.breakdown = null;
    e.tier = null;
    e.tierLabel = null;
    e.kamikaiGrade = null;
    e.rankInEra = null;
    e.rankInSeries = null;
    e.rankInScope = null;
    e.tierPercentile = null;
    continue;
  }
  const s = out.series.find((x) => x.id === e.seriesId);
  const zRel = (e._shrunk - s._shrinkStats.mean) / s._shrinkStats.sd;
  const zAbs = (e._shrunk - eraStats[s.era].mean) / eraStats[s.era].sd;
  const z = W.imdbAbsShare * zAbs + W.imdbRelShare * zRel;
  let score = config.model.centerScore + config.model.scorePerSigma * z;
  score = Math.max(0, Math.min(100, score));
  e.score = Math.round(score * 10) / 10;
  e.breakdown = { zAbs: +zAbs.toFixed(3), zRel: +zRel.toFixed(3), z: +z.toFixed(3), shrunk: +e._shrunk.toFixed(3) };
}

const scored = allEpisodes.filter((e) => e._rated);

// 3a. era-wide score ranking（只排有评分的）
for (const era of Object.keys(eraStats)) {
  const list = scored
    .filter((e) => out.series.find((s) => s.id === e.seriesId).era === era)
    .sort((a, b) => b.score - a.score);
  list.forEach((e, i) => {
    e.rankInEra = i + 1;
    e.eraTotal = list.length;
  });
}

// 3b. tier buckets
const PERCENTILE = (config.tierMode ?? 'score') === 'percentile';

if (PERCENTILE) {
  // IMDb data drives the ORDER inside each group; the configured shares decide
  // HOW MANY land in each tier. Scope decides what the group is (剧内 / 时代板块).
  // 只对「有评分」的集数分档：覆盖率不足的剧集已在上面整体退出。
  const scope = config.tierScope ?? 'era';
  const groups = new Map();
  for (const e of scored) {
    const key = scope === 'series' ? e.seriesId : out.series.find((s) => s.id === e.seriesId).era;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  for (const [key, list] of groups) {
    list.sort((a, b) => b.score - a.score);
    list.forEach((e, i) => {
      const p = (i + 0.5) / list.length;
      e.tierScopeKey = key;
      e.tierScopeTotal = list.length;
      e.tierPercentile = Math.round(p * 1000) / 1000;
      e.rankInScope = i + 1;
      const t = config.tiers.find((x) => p < x.cumShare) ?? config.tiers.at(-1);

      // 神回的绝对下限：整剧 IMDb 明显低于时代均值的特例（赛文X）就算剧内排前 27%
      // 也不评神回，否则会把它 6 分档的集数标成神回。
      const zFloor = config.model.kamikaiMinZAbs;
      let tierId = t.id;
      let gated = false;
      if (tierId === 'kamikai' && typeof zFloor === 'number' && e.breakdown.zAbs < zFloor) {
        tierId = 'kakai';
        gated = true;
      }
      const tt = config.tiers.find((x) => x.id === tierId) ?? t;
      e.tier = tt.id;
      e.tierLabel = tt.label;
      e.kamikaiGated = gated ? { reason: 'zAbsBelowFloor', zAbs: e.breakdown.zAbs } : null;
      const g = tt.id === 'kamikai' ? (config.kamikaiGrades.find((x) => p < x.cumShare) ?? null) : null;
      e.kamikaiGrade = g ? { id: g.id, label: g.label } : null;
    });
  }
} else {
  const thr = config.scoreThresholds;
  for (const e of scored) {
    const t = thr.tiers.find((x) => x.min !== null && e.score >= x.min) ?? { id: 'rankai' };
    const tt = config.tiers.find((c) => c.id === t.id) ?? config.tiers.at(-1);
    e.tier = tt.id;
    e.tierLabel = tt.label;
    const g = tt.id === 'kamikai' ? thr.kamikaiGrades.find((x) => e.score >= x.min) : null;
    e.kamikaiGrade = g
      ? { id: g.id, label: config.kamikaiGrades.find((c) => c.id === g.id)?.label ?? g.id }
      : null;
  }
}

// 4. per-series ranks（只排有评分的集）
for (const s of out.series) {
  const rated = s.episodes.filter((e) => e._rated);
  rated.sort((a, b) => b.score - a.score).forEach((e, i) => (e.rankInSeries = i + 1));

  if (rated.length) {
    const vals = rated.map((e) => e.imdb.rating);
    s.ratings.imdb = Math.round(stats(vals).mean * 100) / 100;
    s.ratingRange = [Math.min(...vals), Math.max(...vals)];
  } else {
    s.ratings.imdb = null;
    s.ratingRange = null;
  }
}
const eraSorted = {};
for (const era of Object.keys(eraStats)) {
  eraSorted[era] = scored
    .filter((e) => out.series.find((s) => s.id === e.seriesId).era === era)
    .sort((a, b) => b.score - a.score);
}

// 5. cleanup + people index
for (const e of allEpisodes) {
  delete e._raw;
  delete e._shrunk;
  delete e._rated;
}
for (const s of out.series) {
  for (const e of s.episodes) {
    e.rankInEra = e.rankInEra ?? null;
  }
  delete s._mean;
  delete s._shrinkStats;
}
out.people = [...peopleIndex.values()].sort((a, b) => b.credits.length - a.credits.length);

// 6. stats for the UI
const tierCounts = {};
for (const t of config.tiers) tierCounts[t.id] = scored.filter((e) => e.tier === t.id).length;
const gradeCounts = {};
for (const g of config.kamikaiGrades) gradeCounts[g.id] = scored.filter((e) => e.kamikaiGrade?.id === g.id).length;

const scores = scored.map((e) => e.score);
out.stats = {
  totalEpisodes: allEpisodes.length,
  totalPeople: out.people.length,
  // 有 IMDb 评分、参与分档的集数
  scoredEpisodes: scored.length,
  unscoredEpisodes: allEpisodes.length - scored.length,
  tierCounts,
  gradeCounts,
  scoreRange: scores.length ? [Math.min(...scores), Math.max(...scores)] : [null, null],
  // 评分覆盖率不足、整剧不参与分档的剧集
  ratingsIncompleteSeries: out.series.filter((s) => s.ratingsIncomplete).map((s) => ({
    id: s.id,
    titleZh: s.titleZh,
    coverage: s.ratingCoverage,
  })),
  withWriter: allEpisodes.filter((e) => e.writers.length).length,
  withDirector: allEpisodes.filter((e) => e.directors.length).length,
  withAirDate: allEpisodes.filter((e) => e.airDate).length,
  withMonsters: allEpisodes.filter((e) => e.monsters?.length).length,
  withViewership: allEpisodes.filter((e) => e.viewershipPct !== null).length,
  missingWriter: allEpisodes.filter((e) => !e.writers.length).map((e) => e.id),
  missingDirector: allEpisodes.filter((e) => !e.directors.length).map((e) => e.id),
  missingMonsters: allEpisodes.filter((e) => !e.monsters?.length).map((e) => e.id),
};

fs.mkdirSync(path.join(ROOT, 'data', 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'dist', 'dataset.json'), JSON.stringify(out, null, 1));

if (!QUIET) {
  console.log(`wrote data/dist/dataset.json  (${(fs.statSync(path.join(ROOT, 'data', 'dist', 'dataset.json')).size / 1024).toFixed(0)} KB)`);
  console.log(
    `episodes=${out.stats.totalEpisodes}（参与分档 ${scored.length}）people=${out.stats.totalPeople} scoreRange=${out.stats.scoreRange.join('~')}`,
  );
  console.log('tier dist:', JSON.stringify(tierCounts));
  console.log('神回 grades:', JSON.stringify(gradeCounts));
  if (out.stats.ratingsIncompleteSeries.length) {
    console.log('\n⚠️ 评分覆盖率不足、不参与分档：');
    for (const s of out.stats.ratingsIncompleteSeries) {
      console.log(`   ${s.titleZh}  覆盖 ${Math.round(s.coverage * 100)}%`);
    }
  }
  console.log('\n每部剧:');
  for (const s of out.series) {
    const c = {};
    for (const t of config.tiers) c[t.label] = s.episodes.filter((e) => e.tier === t.id).length;
    const dist = s.ratingsIncomplete
      ? '（不参与分档）'
      : s.ratings.imdb !== null
        ? `IMDb均分 ${s.ratings.imdb} 区间 ${s.ratingRange.join('~')}  ` + JSON.stringify(c)
        : '（无评分）';
    console.log(`  ${s.titleZh.padEnd(12)} ${String(s.episodeCount).padStart(3)}集  ${dist}`);
  }
  console.log('\n神回一览（前 30）:');
  for (const e of eraSorted.heisei.filter((x) => x.tier === 'kamikai').slice(0, 30)) {
    const s = out.series.find((x) => x.id === e.seriesId);
    console.log(
      `  [${e.kamikaiGrade?.label}] ${s.titleZh} 第${e.no}话 ${e.titleZh}  score=${e.score} imdb=${e.imdb.rating}(${e.imdb.votes})`,
    );
  }
  if (out.warnings.length) console.log('\n⚠️ ' + out.warnings.join('\n⚠️ '));
}
