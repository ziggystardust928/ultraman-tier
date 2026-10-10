#!/usr/bin/env node
/**
 * IMDb bulk-dataset extractor for the Ultraman Tier project.
 *
 * The `.cache/` folder holds the official IMDb datasets (https://datasets.imdbws.com/):
 *   title.basics.tsv.gz    titles, year, runtime
 *   title.episode.tsv.gz   episode -> parent series mapping
 *   title.ratings.tsv.gz   averageRating / numVotes
 *   title.crew.tsv.gz      directors / writers (nconst ids)
 *   name.basics.tsv.gz     nconst -> person name
 *
 * Usage:
 *   node tools/imdb-extract.mjs --find <regex>            # find tvSeries by title
 *   node tools/imdb-extract.mjs --series tt0182647 [...]  # extract episodes of series
 *   node tools/imdb-extract.mjs --series tt0182647 --out data/raw/imdb-tiga.json
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const cacheFile = (f) => path.join(CACHE, f);

/** Async-iterate the tab-separated lines of a gzipped IMDb dataset. */
function lines(file) {
  return readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
}

const NUL = '\\N';
const clean = (v) => (v === undefined || v === NUL || v === '' ? null : v);
const has = (f) => fs.existsSync(cacheFile(f));

async function findSeries(re) {
  if (!has('title.basics.tsv.gz')) throw new Error('title.basics.tsv.gz missing from .cache/');
  const hits = [];
  for await (const line of lines(cacheFile('title.basics.tsv.gz'))) {
    const c = line.split('\t');
    if (c[0] === 'tconst' || c.length < 9) continue;
    if (c[1] !== 'tvSeries' && c[1] !== 'tvMiniSeries') continue;
    if (re.test(c[2]) || re.test(c[3])) {
      hits.push({
        tconst: c[0],
        type: c[1],
        primaryTitle: c[2],
        originalTitle: c[3],
        startYear: clean(c[5]),
        endYear: clean(c[6]),
        runtimeMinutes: clean(c[7]),
        genres: clean(c[8]),
      });
    }
  }
  return hits;
}

async function extractSeries(parentIds) {
  const parents = new Set(parentIds);

  // 1. episode membership
  const epById = new Map();
  for await (const line of lines(cacheFile('title.episode.tsv.gz'))) {
    const c = line.split('\t');
    if (c[0] === 'tconst') continue;
    if (parents.has(c[1])) {
      epById.set(c[0], {
        tconst: c[0],
        parentTconst: c[1],
        season: clean(c[2]),
        episode: clean(c[3]) === null ? null : Number(c[3]),
      });
    }
  }
  const ids = new Set(epById.keys());

  // 2. ratings
  for await (const line of lines(cacheFile('title.ratings.tsv.gz'))) {
    const c = line.split('\t');
    if (c[0] === 'tconst') continue;
    const ep = epById.get(c[0]);
    if (ep) {
      ep.averageRating = Number(c[1]);
      ep.numVotes = Number(c[2]);
    }
  }

  // 3. crew (directors / writers)
  const neededPeople = new Set();
  if (has('title.crew.tsv.gz')) {
    for await (const line of lines(cacheFile('title.crew.tsv.gz'))) {
      const c = line.split('\t');
      if (c[0] === 'tconst') continue;
      const ep = epById.get(c[0]);
      if (!ep) continue;
      ep.directorIds = clean(c[1]) ? c[1].split(',') : [];
      ep.writerIds = clean(c[2]) ? c[2].split(',') : [];
      for (const p of [...ep.directorIds, ...ep.writerIds]) neededPeople.add(p);
    }
  }

  // 4. titles / runtime
  if (has('title.basics.tsv.gz')) {
    for await (const line of lines(cacheFile('title.basics.tsv.gz'))) {
      const c = line.split('\t');
      if (c[0] === 'tconst' || c.length < 9) continue;
      const ep = epById.get(c[0]);
      if (!ep) continue;
      ep.primaryTitle = c[2];
      ep.originalTitle = c[3];
      ep.isAdult = c[4] === '1';
      ep.startYear = clean(c[5]);
      ep.runtimeMinutes = clean(c[7]) === null ? null : Number(c[7]);
      ep.genres = clean(c[8]) ? c[8].split(',') : [];
    }
  }

  // 4b. alternative titles (original Japanese kanji, Chinese, etc.)
  const AKAS_LANGS = new Set(['ja', 'zh', 'zh-CN', 'zh-TW', 'zh-HK', 'cmn']);
  if (has('title.akas.tsv.gz')) {
    const akas = new Map();
    for await (const line of lines(cacheFile('title.akas.tsv.gz'))) {
      const c = line.split('\t');
      if (c[0] === 'titleId') continue;
      if (!ids.has(c[0])) continue;
      const lang = clean(c[4]);
      const region = clean(c[5]);
      if (!AKAS_LANGS.has(lang) && !['JP', 'CN', 'TW', 'HK'].includes(region)) continue;
      if (!akas.has(c[0])) akas.set(c[0], []);
      akas.get(c[0]).push({ title: c[2], region, language: lang, isOriginal: c[7] === '1' });
    }
    for (const [tid, list] of akas) {
      const ep = epById.get(tid);
      ep.altTitles = list;
      ep.titleJa = list.find((a) => a.language === 'ja')?.title ?? null;
      ep.titleZh =
        list.find((a) => a.language === 'zh-CN')?.title ??
        list.find((a) => a.language === 'zh')?.title ??
        list.find((a) => ['CN', 'TW', 'HK'].includes(a.region))?.title ??
        null;
    }
  }

  // 5. resolve person names
  const people = new Map();
  if (has('name.basics.tsv.gz') && neededPeople.size) {
    for await (const line of lines(cacheFile('name.basics.tsv.gz'))) {
      const c = line.split('\t');
      if (c[0] === 'nconst') continue;
      if (neededPeople.has(c[0])) {
        people.set(c[0], { nconst: c[0], name: c[1], birthYear: clean(c[2]), deathYear: clean(c[3]) });
      }
    }
  }
  for (const ep of epById.values()) {
    ep.directors = (ep.directorIds || []).map((id) => people.get(id)?.name ?? id);
    ep.writers = (ep.writerIds || []).map((id) => people.get(id)?.name ?? id);
  }

  const episodes = [...epById.values()].sort(
    (a, b) => (Number(a.season) || 0) - (Number(b.season) || 0) || (a.episode ?? 9999) - (b.episode ?? 9999),
  );
  return { episodeCount: episodes.length, resolvedPeople: people.size, episodes };
}

// ---------------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

if (argv.includes('--find')) {
  const re = new RegExp(arg('--find'), 'i');
  const hits = await findSeries(re);
  console.log(JSON.stringify(hits, null, 2));
  console.log(`\n${hits.length} series matched /${arg('--find')}/i`);
} else if (argv.includes('--series')) {
  const i = argv.indexOf('--series');
  const ids = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) ids.push(argv[j]);
  const data = await extractSeries(ids);
  const out = arg('--out');
  if (out) {
    const p = path.resolve(ROOT, out);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    const withRating = data.episodes.filter((e) => e.averageRating != null).length;
    const withWriter = data.episodes.filter((e) => e.writers?.length).length;
    const withDirector = data.episodes.filter((e) => e.directors?.length).length;
    console.log(`wrote ${p}`);
    console.log(`  episodes=${data.episodeCount} rated=${withRating} withWriter=${withWriter} withDirector=${withDirector}`);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
} else {
  console.log('usage: --find <regex> | --series <ttId...> [--out path]');
}
