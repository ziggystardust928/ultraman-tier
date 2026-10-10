import { Link, useParams } from 'react-router-dom';
import { allEpisodes, dataset, tierOf } from '../data/store';
import { AppBar, TierChip } from '../components/ui';

const ERA_LABEL: Record<string, string> = { heisei: '旧平成', newgen: '新生代' };

function PersonLinks({ list, label }: { list: { id: string; name: string; nameEn: string; confidence: string }[]; label: string }) {
  return (
    <div className="kv">
      <div className="kv-key">{label}</div>
      <div className="kv-val">
        {list.length === 0 ? (
          <span className="dim">IMDb 未收录</span>
        ) : (
          list.map((p, i) => (
            <span key={p.id + i}>
              {i > 0 && <span className="dim">、</span>}
              <Link to={`/person/${p.id}`} style={{ borderBottom: '1px solid var(--line)' }}>
                {p.name}
              </Link>
              {p.confidence === 'low' && (
                <span className="dim" title="该条职能归属存疑" style={{ fontSize: 10 }}>
                  {' '}
                  ?
                </span>
              )}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export default function EpisodeDetail() {
  const { episodeId = '' } = useParams();
  const ep = allEpisodes.find((e) => e.id === episodeId);

  if (!ep) {
    return (
      <div className="screen">
        <AppBar title="未找到" back />
        <div className="empty">没有这一集</div>
      </div>
    );
  }

  const s = ep.series;
  const tier = tierOf(ep.tier);
  const cfg = dataset.config;

  // 相邻集导航
  const inSeries = [...s.episodes].sort((a, b) => a.no - b.no);
  const pos = inSeries.findIndex((x) => x.id === ep.id);
  const prev = inSeries[pos - 1];
  const next = inSeries[pos + 1];

  return (
    <div className="screen">
      <AppBar title={`${s.titleZh} 第 ${ep.no} 话`} back />

      {/* 头图：本集剧照 + 标题 */}
      <div className="ep-hero">
        {ep.still && <img src={ep.still} alt={ep.titleZh ?? ''} />}
        <div className="ep-hero-grad" />
        <div className="ep-hero-body">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <TierChip tier={ep.tier} label={ep.tierLabel} large />
            {ep.kamikaiGrade && (
              <span className="tier-chip tier-chip-lg" data-tier="kamikai" style={{ opacity: 0.82 }}>
                {ep.kamikaiGrade.label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            {ep.titleZh ?? ep.titleRomaji}
          </div>
          <div className="section-note" style={{ marginTop: 5 }}>
            {ep.titleRomaji}
          </div>
        </div>
      </div>

      <div className="detail-body">
        <div className="kv">
          <div className="kv-key">剧集</div>
          <div className="kv-val">
            <Link to={`/series/${s.id}`} style={{ borderBottom: '1px solid var(--line)' }}>
              {s.titleZh}
            </Link>{' '}
            <span className="dim">
              · {ERA_LABEL[s.era]} · {s.year}
            </span>
          </div>
        </div>
        <div className="kv">
          <div className="kv-key">时长</div>
          <div className="kv-val">
            {ep.durationMin ? `${ep.durationMin} 分钟` : '—'}
            <span className="dim" style={{ fontSize: 11 }}>
              {' '}
              {ep.durationSource === 'bilibili' ? '（B 站正片）' : '（IMDb）'}
            </span>
          </div>
        </div>
        <PersonLinks list={ep.directors} label="导演" />
        <PersonLinks list={ep.writers} label="编剧" />

        {/* 评分 */}
        <div className="scorecard">
          <div className="scorecard-cell">
            <div className="scorecard-label">站内评分</div>
            <div className="scorecard-value">{ep.score.toFixed(1)}</div>
            <div className="scorecard-note">{tier.label}</div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">IMDb</div>
            <div className="scorecard-value">{ep.imdb.rating?.toFixed(1)}</div>
            <div className="scorecard-note">{ep.imdb.votes} 票</div>
          </div>
          <div className="scorecard-cell">
            <div className="scorecard-label">贴吧</div>
            <div className="scorecard-value dim">待补</div>
            <div className="scorecard-note">占 30% 权重</div>
          </div>
        </div>

        {/* 排名 */}
        <div className="section" style={{ padding: '18px 0 0' }}>
          <div className="section-head">
            <h2 className="section-title">排位</h2>
          </div>
        </div>
        <div className="kv">
          <div className="kv-key">{ERA_LABEL[s.era]}</div>
          <div className="kv-val">
            第 <strong style={{ color: 'var(--fg)' }}>{ep.rankInEra}</strong> / {ep.eraTotal} 名
          </div>
        </div>
        <div className="kv">
          <div className="kv-key">剧内</div>
          <div className="kv-val">
            第 <strong style={{ color: 'var(--fg)' }}>{ep.rankInSeries}</strong> / {s.episodeCount} 名
          </div>
        </div>
        <div className="kv">
          <div className="kv-key">分档依据</div>
          <div className="kv-val">
            剧内百分位 {(ep.tierPercentile * 100).toFixed(1)}% → 需 &lt; {tier.cumShare * 100}% 才是{tier.label}
          </div>
        </div>
      </div>

      {/* 计算明细 */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">分数怎么来的</h2>
          <Link className="section-note" to="/methodology">
            完整口径 →
          </Link>
        </div>
        <div className="kv">
          <div className="kv-key">票数收缩</div>
          <div className="kv-val">
            {(ep.imdb.rating ?? 0).toFixed(1)} × {ep.imdb.votes} 票，向剧均分收缩后 = {ep.breakdown.shrunk.toFixed(2)}
          </div>
        </div>
        <div className="kv">
          <div className="kv-key">z 绝对</div>
          <div className="kv-val">{ep.breakdown.zAbs.toFixed(2)}（对比整个{ERA_LABEL[s.era]}）</div>
        </div>
        <div className="kv">
          <div className="kv-key">z 相对</div>
          <div className="kv-val">{ep.breakdown.zRel.toFixed(2)}（只对比本剧）</div>
        </div>
        <div className="kv">
          <div className="kv-key">合成</div>
          <div className="kv-val">
            {cfg.model.weights.imdbAbsShare} × {ep.breakdown.zAbs.toFixed(2)} + {cfg.model.weights.imdbRelShare} ×{' '}
            {ep.breakdown.zRel.toFixed(2)} = {ep.breakdown.z.toFixed(2)}
          </div>
        </div>
        <div className="kv">
          <div className="kv-key">折算</div>
          <div className="kv-val">
            {cfg.model.centerScore} + {cfg.model.scorePerSigma} × {ep.breakdown.z.toFixed(2)} = {ep.score.toFixed(1)}
          </div>
        </div>
      </div>

      {/* 上下集 */}
      <div style={{ display: 'flex', gap: 1, background: 'var(--line-soft)', marginTop: 22 }}>
        {prev ? (
          <Link className="entry" to={`/ep/${prev.id}`} style={{ flex: 1, minHeight: 62 }}>
            <span className="entry-en">上一话</span>
            <span className="entry-cn" style={{ fontSize: 13.5 }}>
              {prev.titleZh}
            </span>
          </Link>
        ) : (
          <div className="entry" style={{ flex: 1, minHeight: 62, opacity: 0.35 }}>
            <span className="entry-en">上一话</span>
            <span className="entry-cn" style={{ fontSize: 13.5 }}>
              已是第一话
            </span>
          </div>
        )}
        {next ? (
          <Link className="entry" to={`/ep/${next.id}`} style={{ flex: 1, minHeight: 62, textAlign: 'right' }}>
            <span className="entry-en">下一话</span>
            <span className="entry-cn" style={{ fontSize: 13.5 }}>
              {next.titleZh}
            </span>
          </Link>
        ) : (
          <div className="entry" style={{ flex: 1, minHeight: 62, opacity: 0.35, textAlign: 'right' }}>
            <span className="entry-en">下一话</span>
            <span className="entry-cn" style={{ fontSize: 13.5 }}>
              已是最终话
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
