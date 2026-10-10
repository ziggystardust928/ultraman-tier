import { useMemo, useState } from 'react';
import { ERAS, dataset, episodesByEra, tierOf } from '../data/store';
import { AppBar, EpisodeRow } from '../components/ui';

export default function Ranking() {
  const [era, setEra] = useState<'heisei' | 'newgen'>('heisei');
  const [tier, setTier] = useState<string>('kamikai');
  const [grade, setGrade] = useState<string>('all');

  const eraEpisodes = useMemo(() => episodesByEra(era), [era]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of eraEpisodes) c[e.tier] = (c[e.tier] ?? 0) + 1;
    return c;
  }, [eraEpisodes]);

  const gradeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of eraEpisodes.filter((x) => x.tier === 'kamikai')) {
      if (e.kamikaiGrade) c[e.kamikaiGrade.id] = (c[e.kamikaiGrade.id] ?? 0) + 1;
    }
    return c;
  }, [eraEpisodes]);

  const list = useMemo(
    () =>
      eraEpisodes
        .filter((e) => e.tier === tier)
        .filter((e) => tier !== 'kamikai' || grade === 'all' || e.kamikaiGrade?.id === grade)
        .sort((a, b) => b.score - a.score),
    [eraEpisodes, tier, grade],
  );

  const tierDef = tierOf(tier);

  return (
    <div className="screen">
      <AppBar title="分级榜" />

      <div style={{ padding: '14px var(--pad) 10px' }}>
        <div className="segmented">
          {ERAS.map((e) => (
            <button
              key={e.id}
              data-active={e.id === era}
              onClick={() => {
                setEra(e.id);
                setGrade('all');
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* 五档 */}
      <div className="chips" style={{ paddingBottom: 10 }}>
        {dataset.config.tiers.map((t) => (
          <button
            key={t.id}
            className="chip"
            data-active={t.id === tier}
            onClick={() => {
              setTier(t.id);
              setGrade('all');
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                background: `var(--tier-${t.id})`,
                marginRight: 7,
                borderRadius: 2,
                verticalAlign: 'middle',
              }}
            />
            {t.label}
            <span className="dim" style={{ marginLeft: 5, fontSize: 11 }}>
              {counts[t.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* 神回三分档 */}
      {tier === 'kamikai' && (
        <div className="chips" style={{ paddingBottom: 12 }}>
          <button className="chip" data-active={grade === 'all'} onClick={() => setGrade('all')}>
            全部
            <span className="dim" style={{ marginLeft: 5, fontSize: 11 }}>
              {counts.kamikai ?? 0}
            </span>
          </button>
          {dataset.config.kamikaiGrades.map((g) => (
            <button key={g.id} className="chip" data-active={grade === g.id} onClick={() => setGrade(g.id)}>
              {g.label}
              <span className="dim" style={{ marginLeft: 5, fontSize: 11 }}>
                {gradeCounts[g.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '0 var(--pad) 12px' }}>
        <div className="section-note" style={{ lineHeight: 1.6 }}>
          {tierDef.desc}
          {tier === 'kamikai' && <span> · 神回按前 5% / 13% / 27% 分为顶·佳·守</span>}
        </div>
      </div>

      {list.length === 0 && (
        <div className="empty">
          该板块暂无{tierDef.label}
          <div className="dim mt8" style={{ fontSize: 11 }}>
            新生代剧集尚未录入
          </div>
        </div>
      )}

      <div>
        {list.map((e) => (
          <EpisodeRow key={e.id} ep={e} showSeries />
        ))}
      </div>
    </div>
  );
}
