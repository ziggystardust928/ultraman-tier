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

const SERIES = [
  { id: 'tiga', parent: 'tt0182647', era: 'heisei', year: 1996, titleJa: 'ウルトラマンティガ', titleEn: 'Ultraman Tiga' },
  { id: 'dyna', parent: 'tt0184167', era: 'heisei', year: 1997, titleJa: 'ウルトラマンダイナ', titleEn: 'Ultraman Dyna' },
  { id: 'gaia', parent: 'tt0184168', era: 'heisei', year: 1998, titleJa: 'ウルトラマンガイア', titleEn: 'Ultraman Gaia' },
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
const imdb = read('data/raw/imdb-heisei3.json');
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
  const eps = imdb.episodes
    .filter((e) => e.parentTconst === s.parent)
    .sort((a, b) => a.episode - b.episode);

  const byNo = new Map(bili.episodes.map((e, i) => [i + 1, e]));
  if (bili.episodes.length !== eps.length) {
    out.warnings.push(
      `${s.id}: bilibili 有 ${bili.episodes.length} 集，IMDb 有 ${eps.length} 集，已按集号对齐，多余/缺失需人工核对`,
    );
  }

  const episodes = eps.map((e) => {
    const b = byNo.get(e.episode) ?? {};
    const directors = (e.directors ?? []).map(person);
    const writers = (e.writers ?? []).map(person);
    for (const p of [...directors, ...writers]) {
      const cur = peopleIndex.get(p.id) ?? { ...p, credits: [] };
      if (!cur.credits.some((c) => c.seriesId === s.id && c.no === e.episode)) {
        cur.credits.push({ seriesId: s.id, no: e.episode });
      }
      peopleIndex.set(p.id, cur);
    }
    return {
      id: `${s.id}-${e.episode}`,
      seriesId: s.id,
      no: e.episode,
      titleZh: b.long_title ?? null,
      titleRomaji: e.primaryTitle ?? null,
      durationMin: b.duration_min ?? e.runtimeMinutes ?? null,
      durationSource: b.duration_min ? 'bilibili' : e.runtimeMinutes ? 'imdb' : null,
      imdb: { rating: e.averageRating ?? null, votes: e.numVotes ?? null, tconst: e.tconst },
      bili: { epId: b.ep_id ?? null, bvid: b.bvid ?? null, durationMs: b.duration_ms ?? null },
      still: imgOrNull(stillRel(s.id, e.episode)),
      tieba: null,
      directors,
      writers,
    };
  });

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
const W = config.model.weights;
const C = config.model.bayesPriorCount;

const allEpisodes = out.series.flatMap((s) => s.episodes);

// 1. per-series mean of raw ratings, for Bayesian shrinkage
for (const s of out.series) {
  s.episodes.forEach((e) => (e._raw = e.imdb.rating));
  s._mean = stats(s.episodes.map((e) => e._raw)).mean;
}
for (const e of allEpisodes) {
  const s = out.series.find((x) => x.id === e.seriesId);
  e._shrunk = (e.imdb.votes * e.imdb.rating + C * s._mean) / (e.imdb.votes + C);
}

// 2. series-relative and era-absolute z-scores
const eraStats = {};
for (const s of out.series) {
  const st = stats(s.episodes.map((e) => e._shrunk));
  s._shrinkStats = st;
  (eraStats[s.era] ??= []).push(...s.episodes.map((e) => e._shrunk));
}
for (const k of Object.keys(eraStats)) eraStats[k] = stats(eraStats[k]);

for (const e of allEpisodes) {
  const s = out.series.find((x) => x.id === e.seriesId);
  const zRel = (e._shrunk - s._shrinkStats.mean) / s._shrinkStats.sd;
  const zAbs = (e._shrunk - eraStats[s.era].mean) / eraStats[s.era].sd;
  const z = W.imdbAbsShare * zAbs + W.imdbRelShare * zRel;
  let score = config.model.centerScore + config.model.scorePerSigma * z;
  score = Math.max(0, Math.min(100, score));
  e.score = Math.round(score * 10) / 10;
  e.breakdown = { zAbs: +zAbs.toFixed(3), zRel: +zRel.toFixed(3), z: +z.toFixed(3), shrunk: +e._shrunk.toFixed(3) };
}

// 3. tiers + kamikai grades
const PERCENTILE = (config.tierMode ?? 'score') === 'percentile';

// 3a. era-wide score ranking — always computed, used by the leaderboards
for (const era of Object.keys(eraStats)) {
  const list = allEpisodes
    .filter((e) => out.series.find((s) => s.id === e.seriesId).era === era)
    .sort((a, b) => b.score - a.score);
  list.forEach((e, i) => {
    e.rankInEra = i + 1;
    e.eraTotal = list.length;
  });
}

// 3b. tier buckets
if (PERCENTILE) {
  // IMDb data drives the ORDER inside each group; the configured shares decide
  // HOW MANY land in each tier. Scope decides what the group is (剧内 / 时代板块).
  const scope = config.tierScope ?? 'era';
  const groups = new Map();
  for (const e of allEpisodes) {
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
      e.tier = t.id;
      e.tierLabel = t.label;
      const g = t.id === 'kamikai' ? (config.kamikaiGrades.find((x) => p < x.cumShare) ?? null) : null;
      e.kamikaiGrade = g ? { id: g.id, label: g.label } : null;
    });
  }
} else {
  const thr = config.scoreThresholds;
  for (const e of allEpisodes) {
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

// 4. per-series ranks
for (const s of out.series) {
  const sorted = [...s.episodes].sort((a, b) => b.score - a.score);
  sorted.forEach((e, i) => (e.rankInSeries = i + 1));
  const rated = s.episodes.map((e) => e.imdb.rating);
  s.ratings.imdb = Math.round(stats(rated).mean * 100) / 100;
  s.ratingRange = [Math.min(...rated), Math.max(...rated)];
}
const eraSorted = {};
for (const era of Object.keys(eraStats)) {
  eraSorted[era] = [...allEpisodes.filter((e) => out.series.find((s) => s.id === e.seriesId).era === era)].sort(
    (a, b) => b.score - a.score,
  );
}

// 5. cleanup + people index
for (const e of allEpisodes) {
  delete e._raw;
  delete e._shrunk;
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
for (const t of config.tiers) tierCounts[t.id] = allEpisodes.filter((e) => e.tier === t.id).length;
const gradeCounts = {};
for (const g of config.kamikaiGrades) gradeCounts[g.id] = allEpisodes.filter((e) => e.kamikaiGrade?.id === g.id).length;
out.stats = {
  totalEpisodes: allEpisodes.length,
  totalPeople: out.people.length,
  tierCounts,
  gradeCounts,
  scoreRange: [
    Math.min(...allEpisodes.map((e) => e.score)),
    Math.max(...allEpisodes.map((e) => e.score)),
  ],
  withWriter: allEpisodes.filter((e) => e.writers.length).length,
  withDirector: allEpisodes.filter((e) => e.directors.length).length,
  missingWriter: allEpisodes.filter((e) => !e.writers.length).map((e) => e.id),
  missingDirector: allEpisodes.filter((e) => !e.directors.length).map((e) => e.id),
};

fs.mkdirSync(path.join(ROOT, 'data', 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'dist', 'dataset.json'), JSON.stringify(out, null, 1));

if (!QUIET) {
  console.log(`wrote data/dist/dataset.json  (${(fs.statSync(path.join(ROOT, 'data', 'dist', 'dataset.json')).size / 1024).toFixed(0)} KB)`);
  console.log(`episodes=${out.stats.totalEpisodes} people=${out.stats.totalPeople} scoreRange=${out.stats.scoreRange.join('~')}`);
  console.log('tier dist:', JSON.stringify(tierCounts));
  console.log('神回 grades:', JSON.stringify(gradeCounts));
  console.log('\n每部剧分档:');
  for (const s of out.series) {
    const c = {};
    for (const t of config.tiers) c[t.label] = s.episodes.filter((e) => e.tier === t.id).length;
    console.log(
      `  ${s.titleZh}  IMDb均分 ${s.ratings.imdb}  区间 ${s.ratingRange.join('~')}  ` + JSON.stringify(c),
    );
  }
  console.log('\n神回一览:');
  for (const e of eraSorted.heisei.filter((x) => x.tier === 'kamikai')) {
    const s = out.series.find((x) => x.id === e.seriesId);
    console.log(
      `  [${e.kamikaiGrade?.label}] ${s.titleZh} 第${e.no}话 ${e.titleZh}  score=${e.score} imdb=${e.imdb.rating}(${e.imdb.votes})`,
    );
  }
  if (out.warnings.length) console.log('\n⚠️ ' + out.warnings.join('\n⚠️ '));
}
