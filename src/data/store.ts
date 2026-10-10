import raw from '../../data/dist/dataset.json';
import type { Dataset, Episode, Person, Series, TierDef } from '../types';

export const dataset = raw as unknown as Dataset;

export const ERAS = [
  { id: 'heisei' as const, label: '旧平成', sub: '迪迦 → 赛罗' },
  { id: 'newgen' as const, label: '新生代', sub: '赛罗 → 至今' },
];

export const seriesById = new Map(dataset.series.map((s) => [s.id, s]));

/** All episodes, each carrying a back-reference to its series. */
export interface FlatEpisode extends Episode {
  series: Series;
}

export const allEpisodes: FlatEpisode[] = dataset.series.flatMap((s) =>
  s.episodes.map((e) => ({ ...e, series: s }) as FlatEpisode),
);

export const tierOf = (id: string): TierDef =>
  dataset.config.tiers.find((t) => t.id === id) ?? dataset.config.tiers[dataset.config.tiers.length - 1];

export const seriesEpisodes = (seriesId: string): FlatEpisode[] =>
  allEpisodes.filter((e) => e.seriesId === seriesId);

export const episodesByEra = (era: string): FlatEpisode[] =>
  allEpisodes
    .filter((e) => e.series.era === era)
    .sort((a, b) => a.rankInEra - b.rankInEra);

export const episodesInTier = (tier: string, era?: string): FlatEpisode[] =>
  allEpisodes
    .filter((e) => e.tier === tier && (!era || e.series.era === era))
    .sort((a, b) => b.score - a.score);

export const formatDuration = (min: number | null): string => (min ? `${min} 分钟` : '—');

export const formatRating = (r: number | null | undefined, digits = 1): string =>
  r === null || r === undefined ? '—' : r.toFixed(digits);

/** Human label for a person's role in a given series. */
export const roleLabel = (role: 'director' | 'writer'): string => (role === 'director' ? '导演' : '编剧');

/** Every episode a person worked on, newest series first. */
export const personCredits = (person: Person, role: 'director' | 'writer'): FlatEpisode[] =>
  person.credits
    .map((c) => allEpisodes.find((e) => e.seriesId === c.seriesId && e.no === c.no))
    .filter((e): e is FlatEpisode => Boolean(e))
    .filter((e) =>
      role === 'director' ? e.directors.some((d) => d.id === person.id) : e.writers.some((w) => w.id === person.id),
    )
    .sort((a, b) => a.series.year - b.series.year || a.no - b.no);

/** Search across episodes, series and people. */
export interface SearchHit {
  kind: 'episode' | 'series' | 'person';
  key: string;
  title: string;
  subtitle: string;
  episode?: FlatEpisode;
  series?: Series;
  person?: Person;
  role?: 'director' | 'writer' | 'both';
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[・·、,，。.「」『』（）()]/g, '');

export function search(query: string): SearchHit[] {
  const q = norm(query);
  if (q.length < 1) return [];
  const hits: SearchHit[] = [];

  for (const e of allEpisodes) {
    const hay = norm(`${e.titleZh}${e.titleRomaji}${e.series.titleZh}第${e.no}话`);
    if (hay.includes(q)) {
      hits.push({
        kind: 'episode',
        key: e.id,
        title: e.titleZh ?? e.titleRomaji ?? `第${e.no}话`,
        subtitle: `${e.series.titleZh} 第${e.no}话 · ${e.tierLabel}`,
        episode: e,
      });
    }
  }

  for (const s of dataset.series) {
    if (norm(`${s.titleZh}${s.titleJa}${s.titleEn}${s.year}`).includes(q)) {
      hits.push({
        kind: 'series',
        key: s.id,
        title: s.titleZh,
        subtitle: `${s.year} · 全 ${s.episodeCount} 话`,
        series: s,
      });
    }
  }

  for (const p of dataset.people) {
    if (norm(`${p.name}${p.nameEn}${p.nameJa}`).includes(q)) {
      const asDir = personCredits(p, 'director').length;
      const asWri = personCredits(p, 'writer').length;
      hits.push({
        kind: 'person',
        key: p.id,
        title: p.name,
        subtitle: `${[asDir && `导演 ${asDir} 集`, asWri && `编剧 ${asWri} 集`].filter(Boolean).join(' · ')}`,
        person: p,
        role: asDir && asWri ? 'both' : asDir ? 'director' : 'writer',
      });
    }
  }

  // episodes first, then series, then people; each group by score/title
  const order = { series: 0, episode: 1, person: 2 };
  return hits.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      (b.episode?.score ?? 0) - (a.episode?.score ?? 0) ||
      a.title.localeCompare(b.title, 'zh'),
  );
}
