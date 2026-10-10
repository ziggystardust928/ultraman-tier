import { Link, useParams } from 'react-router-dom';
import { dataset, personCredits, tierOf } from '../data/store';
import type { FlatEpisode } from '../data/store';
import { AppBar, TierBadge } from '../components/ui';

export default function PersonDetail() {
  const { personId = '' } = useParams();
  const person = dataset.people.find((p) => p.id === personId);

  if (!person) {
    return (
      <div className="screen">
        <AppBar title="未找到" back />
        <div className="empty">没有这位主创</div>
      </div>
    );
  }

  const asDirector = personCredits(person, 'director');
  const asWriter = personCredits(person, 'writer');

  const avg = (list: FlatEpisode[]) =>
    list.length ? list.reduce((n, e) => n + e.score, 0) / list.length : null;

  const kamikaiCount = [...asDirector, ...asWriter].filter((e) => e.tier === 'kamikai').length;

  /** 按剧分组，标注该剧内的身份 */
  const groups = new Map<string, { ep: FlatEpisode; role: string }[]>();
  for (const ep of [...asDirector, ...asWriter]) {
    const roleParts: string[] = [];
    if (asDirector.some((x) => x.id === ep.id)) roleParts.push('导演');
    if (asWriter.some((x) => x.id === ep.id)) roleParts.push('编剧');
    if (!groups.has(ep.seriesId)) groups.set(ep.seriesId, []);
    const arr = groups.get(ep.seriesId)!;
    if (!arr.some((x) => x.ep.id === ep.id)) arr.push({ ep, role: roleParts.join(' / ') });
  }

  return (
    <div className="screen">
      <AppBar title={person.name} back />

      <div className="detail-body">
        <h2 className="detail-title">{person.name}</h2>
        <div className="section-note" style={{ marginTop: 6 }}>
          {person.nameEn}
          {person.nameJa && person.nameJa !== person.name && ` · ${person.nameJa}`}
        </div>

        {person.note && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11.5,
              lineHeight: 1.65,
              color: 'var(--fg-3)',
            }}
          >
            数据备注：{person.note}
          </div>
        )}

        <div className="scorecard">
          <div className="scorecard-cell">
            <div className="scorecard-label">导演</div>
            <div className="scorecard-value">{asDirector.length}</div>
            <div className="scorecard-note">
              {avg(asDirector) ? `均分 ${avg(asDirector)!.toFixed(1)}` : '—'}
            </div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">编剧</div>
            <div className="scorecard-value">{asWriter.length}</div>
            <div className="scorecard-note">
              {avg(asWriter) ? `均分 ${avg(asWriter)!.toFixed(1)}` : '—'}
            </div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">神回</div>
            <div className="scorecard-value" style={{ color: 'var(--tier-kamikai)' }}>
              {kamikaiCount}
            </div>
            <div className="scorecard-note">参与过的</div>
          </div>
        </div>
      </div>

      {[...groups.entries()].map(([seriesId, list]) => {
        const s = dataset.series.find((x) => x.id === seriesId)!;
        const sorted = [...list].sort((a, b) => a.ep.no - b.ep.no);
        const best = sorted.reduce((m, x) => Math.max(m, x.ep.score), 0);
        return (
          <div key={seriesId}>
            <div className="section">
              <div className="section-head">
                <h2 className="section-title">
                  <Link to={`/series/${s.id}`}>{s.titleZh}</Link>
                </h2>
                <span className="section-note">
                  {sorted.length} 集 · 最高 {best.toFixed(1)}
                </span>
              </div>
            </div>
            {sorted.map(({ ep, role }) => (
              <Link className="ep-row" key={ep.id + role} to={`/ep/${ep.id}`}>
                <span className="ep-no">{ep.no}</span>
                <TierBadge ep={ep} />
                <span className="ep-main">
                  <span className="ep-title">{ep.titleZh}</span>
                  <span className="ep-sub">
                    {role} · {ep.durationMin} 分钟
                  </span>
                </span>
                <span className="ep-score">{ep.score.toFixed(1)}</span>
              </Link>
            ))}
          </div>
        );
      })}

      <div className="section">
        <div className="section-note" style={{ lineHeight: 1.7 }}>
          共参与 {groups.size} 部剧。
          {tierOf('kamikai').label} = 站内评分前 27%。
        </div>
      </div>
    </div>
  );
}
