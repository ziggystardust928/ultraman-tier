import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dataset } from '../data/store';
import { PhotoMosaic, SeriesCover } from '../components/art';
import { IconChevron, TierBadge } from '../components/ui';

const ENTRIES = [
  { to: '/series', cn: '剧集库', en: 'Series', note: '按剧查看全部分集' },
  { to: '/ranking', cn: '分级榜', en: 'Ranking', note: '神回到烂回逐级排' },
  { to: '/people', cn: '编剧导演', en: 'Credits', note: '查一位主创的所有单集' },
  { to: '/methodology', cn: '评级口径', en: 'Method', note: '分数怎么算出来的' },
];

export default function Home() {
  const [idx, setIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  const totalKamikai = dataset.stats.tierCounts.kamikai;
  const totalEpisodes = dataset.stats.totalEpisodes;

  const topKamikai = dataset.series
    .flatMap((s) => s.episodes.map((e) => ({ e, s })))
    .filter(({ e }) => e.kamikaiGrade?.id === 'kamikai-top')
    .sort((a, b) => b.e.score - a.e.score)
    .slice(0, 6);

  return (
    <div className="screen">
      {/* ---------- Hero：左封面 / 右照片墙，下方信息条即入口 ---------- */}
      <div className="hero-strip" ref={stripRef} onScroll={onScroll}>
        {dataset.series.map((s) => {
          const kamikai = s.episodes.filter((e) => e.tier === 'kamikai').length;
          return (
            <div className="hero-slide" key={s.id}>
              <Link className="hero" to={`/series/${s.id}`} aria-label={s.titleZh}>
                <div className="hero-cover">
                  <SeriesCover series={s} size="lg" />
                </div>
                <PhotoMosaic series={s} />
              </Link>
              <Link className="hero-bar" to={`/series/${s.id}`}>
                <span className="hero-bar-stats">
                  <span>全 {s.episodeCount} 话</span>
                  <span className="dim">·</span>
                  <span className="nowrap">IMDb {s.ratings.imdb?.toFixed(2)}</span>
                  <span className="dim">·</span>
                  <span className="nowrap" style={{ color: 'var(--tier-kamikai)' }}>
                    神回 {kamikai}
                  </span>
                </span>
                <span className="hero-bar-cta">
                  查看剧集
                  <IconChevron />
                </span>
              </Link>
            </div>
          );
        })}
      </div>

      <div className="hero-dots">
        {dataset.series.map((s, i) => (
          <span key={s.id} className="hero-dot" data-active={i === idx} />
        ))}
      </div>

      {/* ---------- 入口 ---------- */}
      <div className="entries" style={{ marginTop: 16 }}>
        {ENTRIES.map((e) => (
          <Link className="entry" key={e.to} to={e.to}>
            <span className="entry-cn">{e.cn}</span>
            <span className="entry-en">{e.en}</span>
            <span className="entry-count">{e.note}</span>
          </Link>
        ))}
      </div>

      {/* ---------- 概览 ---------- */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">总览</h2>
          <span className="section-note">
            {dataset.series.length} 部剧 · {totalEpisodes} 集
          </span>
        </div>
        <div className="scorecard">
          <div className="scorecard-cell">
            <div className="scorecard-label">已收录</div>
            <div className="scorecard-value">{totalEpisodes}</div>
            <div className="scorecard-note">集</div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">神回</div>
            <div className="scorecard-value" style={{ color: 'var(--tier-kamikai)' }}>
              {totalKamikai}
            </div>
            <div className="scorecard-note">顶 {dataset.stats.gradeCounts['kamikai-top'] ?? 0}</div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">主创</div>
            <div className="scorecard-value">{dataset.stats.totalPeople}</div>
            <div className="scorecard-note">位编剧导演</div>
          </div>
        </div>
      </div>

      {/* ---------- 殿堂级 ---------- */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">神回顶 · 殿堂级</h2>
          <Link className="section-note" to="/ranking">
            全部排行 →
          </Link>
        </div>
      </div>
      <div>
        {topKamikai.map(({ e, s }) => (
          <Link className="ep-row" key={e.id} to={`/ep/${e.id}`}>
            <span className="ep-no">{e.rankInEra}</span>
            <TierBadge ep={e} />
            <span className="ep-main">
              <span className="ep-title">{e.titleZh}</span>
              <span className="ep-sub">
                {s.titleZh} 第 {e.no} 话 · IMDb {e.imdb.rating}
              </span>
            </span>
            <span className="ep-score">{e.score.toFixed(1)}</span>
          </Link>
        ))}
      </div>

      <div className="section">
        <div className="section-note" style={{ lineHeight: 1.7 }}>
          数据来源：IMDb 官方数据集（评分 / 票数 / 编剧 / 导演）与哔哩哔哩番剧（中文分集标题 / 时长）。
          贴吧社区评分尚未接入，当前为 IMDb 单一来源预评。
        </div>
      </div>
    </div>
  );
}
