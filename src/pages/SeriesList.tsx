import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ERAS, dataset } from '../data/store';
import { SeriesCover } from '../components/art';
import { AppBar, TierBar } from '../components/ui';

export default function SeriesList() {
  const [era, setEra] = useState<'heisei' | 'newgen'>('heisei');
  const list = dataset.series.filter((s) => s.era === era);

  return (
    <div className="screen">
      <AppBar title="剧集库" />

      <div style={{ padding: '14px var(--pad) 4px' }}>
        <div className="segmented">
          {ERAS.map((e) => (
            <button key={e.id} data-active={e.id === era} onClick={() => setEra(e.id)}>
              {e.label}
            </button>
          ))}
        </div>
        <div className="section-note" style={{ marginTop: 8 }}>
          {ERAS.find((e) => e.id === era)?.sub}
          {list.length ? ` · ${list.reduce((n, s) => n + s.episodeCount, 0)} 集` : ''}
        </div>
      </div>

      {list.length === 0 && (
        <div className="empty">
          新生代剧集尚未录入
          <div className="dim mt8" style={{ fontSize: 11 }}>
            银河 → 奥美迦 待补充
          </div>
        </div>
      )}

      {list.map((s) => {
        const counts: Record<string, number> = {};
        for (const e of s.episodes) counts[e.tier] = (counts[e.tier] ?? 0) + 1;
        const kamikai = counts.kamikai ?? 0;
        return (
          <Link className="series-card" key={s.id} to={`/series/${s.id}`}>
            <div className="series-card-top">
              <div className="series-poster">
                <SeriesCover series={s} size="sm" />
              </div>
              <div className="series-card-body">
                <div className="series-card-title">{s.titleZh}</div>
                <div className="series-card-meta">
                  <span>{s.year}</span>
                  <span className="dim">·</span>
                  <span>全 {s.episodeCount} 话</span>
                  <span className="dim">·</span>
                  <span>IMDb {s.ratings.imdb?.toFixed(2)}</span>
                  <span className="dim">·</span>
                  <span style={{ color: 'var(--tier-kamikai)' }}>神回 {kamikai}</span>
                </div>
                {s.synopsis && <div className="series-card-syn">{s.synopsis}</div>}
              </div>
            </div>
            <div className="series-card-bar">
              <TierBar counts={counts} total={s.episodeCount} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
