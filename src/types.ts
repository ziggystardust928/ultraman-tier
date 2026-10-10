/** Shapes of the generated dataset (data/dist/dataset.json). */

export type TierId = 'kamikai' | 'kakai' | 'ryokai' | 'heikai' | 'rankai';
export type EraId = 'heisei' | 'newgen';
export type RoleId = 'director' | 'writer';

export interface PersonRef {
  id: string;
  name: string;
  nameJa: string | null;
  nameEn: string;
  confidence: string;
  note: string | null;
}

export interface Episode {
  id: string;
  seriesId: string;
  no: number;
  titleZh: string | null;
  titleRomaji: string | null;
  durationMin: number | null;
  durationSource: string | null;
  imdb: { rating: number | null; votes: number | null; tconst: string };
  bili: { epId: number | null; bvid: string | null; durationMs: number | null };
  still: string | null;
  tieba: { score: number | null; votes: number | null; url: string | null } | null;
  directors: PersonRef[];
  writers: PersonRef[];
  score: number;
  breakdown: { zAbs: number; zRel: number; z: number; shrunk: number };
  tier: TierId;
  tierLabel: string;
  kamikaiGrade: { id: string; label: string } | null;
  rankInEra: number;
  eraTotal: number;
  rankInSeries: number;
  rankInScope: number;
  tierScopeTotal: number;
  tierPercentile: number;
  tierScopeKey: string;
}

export interface Series {
  id: string;
  titleZh: string;
  titleJa: string;
  titleEn: string | null;
  year: number;
  era: EraId;
  episodeCount: number;
  synopsis: string | null;
  mediaId: number;
  seasonId: number;
  ratings: {
    imdb: number | null;
    bilibili: number | null;
    bilibiliVotes: number | null;
    tieba: number | null;
  };
  staff: {
    directors: string[];
    screenwriters: string[];
    cast: string[];
    rawText: string | null;
  };
  images: {
    cover: string | null;
    square: string | null;
    /** 设计稿（首页封面旁 2×2）。为空时回退用 photos。 */
    designs: { src: string | null; label: string; note: string | null; bvid: string | null }[];
    photos: { src: string | null; no: number; label: string; title: string | null }[];
  };
  episodes: Episode[];
  ratingRange: [number, number];
}

export interface Person extends PersonRef {
  credits: { seriesId: string; no: number }[];
}

export interface TierDef {
  id: TierId;
  label: string;
  cumShare: number;
  color: string;
  desc: string;
}

export interface KamikaiGradeDef {
  id: string;
  label: string;
  cumShare: number;
  desc: string;
}

export interface DatasetConfig {
  version: string;
  tierMode: 'percentile' | 'score';
  tierScope: 'series' | 'era';
  tiers: TierDef[];
  kamikaiGrades: KamikaiGradeDef[];
  model: {
    name: string;
    weights: Record<string, number>;
    bayesPriorCount: number;
    centerScore: number;
    scorePerSigma: number;
    _explain: string[];
  };
}

export interface Dataset {
  generatedAt: string;
  config: DatasetConfig;
  series: Series[];
  people: Person[];
  warnings: string[];
  stats: {
    totalEpisodes: number;
    totalPeople: number;
    tierCounts: Record<TierId, number>;
    gradeCounts: Record<string, number>;
    scoreRange: [number, number];
    withWriter: number;
    withDirector: number;
    missingWriter: string[];
    missingDirector: string[];
  };
}
