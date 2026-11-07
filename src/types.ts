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
  imdb: { rating: number | null; votes: number | null; tconst: string | null };
  bili: { epId: number | null; bvid: string | null; durationMs: number | null };
  still: string | null;
  /** 首播日期（ISO）。盖亚暂无可靠来源，为 null */
  airDate: string | null;
  airDateSource: string | null;
  /** 备选中文标题（百度百科的译名与 B 站官方译名常不同） */
  titleAlt: string | null;
  titleJa: string | null;
  /** 本集登场怪兽 / 宇宙人 */
  monsters: string[] | null;
  /** 首播收视率（%），仅迪迦有 */
  viewershipPct: number | null;
  tieba: { score: number | null; votes: number | null; url: string | null } | null;
  directors: PersonRef[];
  writers: PersonRef[];
  // ---- 以下字段在「无 IMDb 评分」或「整剧评分覆盖率不足」时为 null ----
  score: number | null;
  breakdown: { zAbs: number; zRel: number; z: number; shrunk: number } | null;
  tier: TierId | null;
  tierLabel: string | null;
  kamikaiGrade: { id: string; label: string } | null;
  /** 被「神回绝对下限」拦下时记录原因 */
  kamikaiGated: { reason: string; zAbs: number } | null;
  rankInEra: number | null;
  eraTotal: number | null;
  rankInSeries: number | null;
  rankInScope: number | null;
  tierScopeTotal: number | null;
  tierPercentile: number | null;
  tierScopeKey: string | null;
}

export interface Series {
  id: string;
  titleZh: string;
  titleJa: string;
  titleEn: string | null;
  year: number;
  era: EraId;
  /** 主题色：首页色块选择器 + 区块背景 */
  themeColor: string;
  themeName: string | null;
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
    /** 从官方海报裁出的头部特写 */
    headDetail: string | null;
    /** 从官方海报裁出的胸口彩色计时器特写 */
    chestDetail: string | null;
    /** 首页拼贴墙用的 4 张氛围感帧 */
    heroStills: string[];
    /** 网络搜来的设计稿（设定画） */
    webDesign: string | null;
    /** 网络搜来的皮套展示照 */
    webSuit: string | null;
  };
  episodes: Episode[];
  ratingRange: [number, number] | null;
  /** IMDb 评分覆盖率 0~1 */
  ratingCoverage: number;
  /** 覆盖率不足，整剧不参与分档（仍保留分集/主创/怪兽数据） */
  ratingsIncomplete: boolean;
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
    /** 有 IMDb 评分、参与分档的集数 */
    scoredEpisodes: number;
    unscoredEpisodes: number;
    tierCounts: Record<TierId, number>;
    gradeCounts: Record<string, number>;
    scoreRange: [number, number] | [null, null];
    /** 评分覆盖率不足、整剧不参与分档的剧集 */
    ratingsIncompleteSeries: { id: string; titleZh: string; coverage: number }[];
    withWriter: number;
    withDirector: number;
    withAirDate: number;
    withMonsters: number;
    withViewership: number;
    missingWriter: string[];
    missingDirector: string[];
    missingMonsters: string[];
  };
}
