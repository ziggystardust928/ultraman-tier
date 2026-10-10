import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dataset, seriesById } from '../data/store';
import { PhotoMosaic, SeriesCover } from '../components/art';
import { AppBar, EpisodeRow } from '../components/ui';

type Sort = 'no' | 'score';

export default function SeriesDetail() {
  const { seriesId = '' } = useParams();
  const series = seriesById.get(seriesId);
  const [sort, setSort] = useState<Sort>('no');

  const episodes = useMemo(() => {
    if (!series) return [];
    return [...series.episodes].sort((a, b) => (sort === 'no' ? a.no - b.no : b.score - a.score));
  }, [series, sort]);

  if (!series) {
    return (
      <div className="screen">
        <AppBar title="未找到" back />
        <div className="empty">这部剧还没有录入</div>
      </div>
    );
  }

  const counts: Record<string, number> = {};
  for (const e of series.episodes) counts[e.tier] = (counts[e.tier] ?? 0) + 1;
  const kamikai = counts.kamikai ?? 0;

  const personOf = (name: string) => dataset.people.find((p) => p.name === name);

  return (
    <div className="screen">
      <AppBar title={series.titleZh} back />

      {/* 头部：真实海报 + 剧照 */}
      <div className="detail-hero">
        <div className="detail-cover">
          <SeriesCover series={series} size="lg" />
        </div>
        <PhotoMosaic series={series} />
      </div>

      <div className="detail-body">
        <h2 className="detail-title">{series.titleZh}</h2>
        <div className="section-note" style={{ marginTop: 6 }}>
          {series.titleJa} · {series.titleEn} · {series.year}
        </div>

        <div className="scorecard">
          <div className="scorecard-cell">
            <div className="scorecard-label">IMDb</div>
            <div className="scorecard-value">{series.ratings.imdb?.toFixed(2)}</div>
            <div className="scorecard-note">
              区间 {series.ratingRange[0]}–{series.ratingRange[1]}
            </div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">B 站</div>
            <div className="scorecard-value">{series.ratings.bilibili?.toFixed(1)}</div>
            <div className="scorecard-note">{series.ratings.bilibiliVotes?.toLocaleString()} 人</div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">神回</div>
            <div className="scorecard-value" style={{ color: 'var(--tier-kamikai)' }}>
              {kamikai}
            </div>
            <div className="scorecard-note">共 {series.episodeCount} 话</div>
          </div>
        </div>

        {series.synopsis && <p className="detail-syn">{series.synopsis}</p>}
      </div>

      {/* 演职人员 */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">演职人员</h2>
        </div>
      </div>
      <div style={{ padding: '0 var(--pad)' }}>
        {[
          { k: '导演', v: series.staff.directors },
          { k: '编剧', v: series.staff.screenwriters },
          { k: '主演', v: series.staff.cast },
        ]
          .filter((r) => r.v.length)
          .map((r) => (
            <div className="kv" key={r.k}>
              <div className="kv-key">{r.k}</div>
              <div className="kv-val">
                {r.v.map((name, i) => {
                  const p = personOf(name);
                  return (
                    <span key={name + i}>
                      {i > 0 && <span className="dim">、</span>}
                      {p ? (
                        <Link to={`/person/${p.id}`} style={{ borderBottom: '1px solid var(--line)' }}>
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {/* 分集 */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">分集</h2>
          <div className="segmented" style={{ width: 148 }}>
            <button data-active={sort === 'no'} onClick={() => setSort('no')}>
              按集数
            </button>
            <button data-active={sort === 'score'} onClick={() => setSort('score')}>
              按评分
            </button>
          </div>
        </div>
      </div>
      <div>
        {episodes.map((e) => (
          <EpisodeRow key={e.id} ep={{ ...e, series }} />
        ))}
      </div>
    </div>
  );
}
