import { dataset } from '../data/store';
import { AppBar } from '../components/ui';

export default function Methodology() {
  const { config, stats } = dataset;

  return (
    <div className="screen">
      <AppBar title="评级口径" back />

      <div className="doc">
        <h3>一句话</h3>
        <p>
          <strong>IMDb 的真实评分决定谁排在前面，「多少集算神回」由比例决定。</strong>
          这样既用上了真实打分数据，又不会被 IMDb 各部投票人群的差异带偏。
        </p>

        <h3>为什么不能直接按 IMDb 分数划线</h3>
        <p>实测三部剧的 IMDb 均分差了 1.2 分：</p>
        <div className="tier-legend">
          {dataset.series.map((s) => (
            <div className="tier-legend-row" key={s.id}>
              <span style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.titleZh}</div>
                <div className="tier-legend-desc">
                  区间 {s.ratingRange[0]} – {s.ratingRange[1]}
                </div>
              </span>
              <span className="stat">
                <span className="stat-num">{s.ratings.imdb?.toFixed(2)}</span>
                <span className="stat-unit">均分</span>
              </span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 10 }}>
          如果直接按绝对分划线，神回几乎会全被判给戴拿，而迪迦第 52 话这种公认神回反而落榜。
          所以模型里加入了「本剧内相对位次」，并且给它更高的权重。
        </p>

        <h3>计算步骤</h3>
        <ol>
          {config.model._explain.map((line, i) => (
            <li key={i}>{line.replace(/^\d+\.\s*/, '')}</li>
          ))}
        </ol>

        <h3>分档线</h3>
        <p>
          当前口径：<code>{config.tierMode}</code> + <code>{config.tierScope}</code>
          （每部剧各自取百分位）。
        </p>
        <div className="tier-legend">
          {config.tiers.map((t) => {
            const prev = config.tiers[config.tiers.indexOf(t) - 1];
            const from = prev ? prev.cumShare * 100 : 0;
            const to = t.cumShare * 100;
            return (
              <div className="tier-legend-row" key={t.id}>
                <span
                  className="tier-chip"
                  data-tier={t.id}
                  style={{ minWidth: 42, justifyContent: 'center' }}
                >
                  {t.label}
                </span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {from === 0 ? `前 ${to}%` : `${from}% – ${to}%`}
                  </div>
                  <div className="tier-legend-desc">{t.desc}</div>
                </span>
                <span className="stat">
                  <span className="stat-num">{stats.tierCounts[t.id] ?? 0}</span>
                  <span className="stat-unit">集</span>
                </span>
              </div>
            );
          })}
        </div>

        <h3>神回的三个档位</h3>
        <div className="tier-legend">
          {config.kamikaiGrades.map((g) => (
            <div className="tier-legend-row" key={g.id}>
              <span className="tier-chip" data-tier="kamikai" style={{ minWidth: 48, justifyContent: 'center' }}>
                {g.label}
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>前 {g.cumShare * 100}%</div>
                <div className="tier-legend-desc">{g.desc}</div>
              </span>
              <span className="stat">
                <span className="stat-num">{stats.gradeCounts[g.id] ?? 0}</span>
                <span className="stat-unit">集</span>
              </span>
            </div>
          ))}
        </div>

        <h3>数据来源</h3>
        <ul>
          <li>
            <strong>IMDb 官方数据集</strong>（datasets.imdbws.com）：逐集评分、票数、编剧、导演、时长。
            这是目前唯一可靠且可批量获取的评分数据源。
          </li>
          <li>
            <strong>哔哩哔哩番剧</strong>：官方中文分集标题、正片时长、中文演职员名单、剧集简介。
          </li>
          <li>
            <strong>奥特曼吧讨论贴</strong>（占最终分 30% 权重）：<span style={{ color: 'var(--tier-rankai)' }}>尚未接入</span>。
            接入后社区分会与 IMDb 分按 7 : 3 合成，此前的分档仅代表 IMDb 单一来源。
          </li>
        </ul>

        <h3>已知限制</h3>
        <ul>
          <li>
            戴拿有相当一部分集数在 IMDb 只有 7–10 票，评分噪声大。模型用贝叶斯收缩（先验 {config.model.bayesPriorCount}{' '}
            票，向剧均分靠拢）缓解，但票数少仍然是硬伤，社区分到位后会明显改善。
          </li>
          <li>
            IMDb 的时长是 30 分钟（含广告时段），B 站是 24 分钟（正片）。App 采用 B 站的数值。
          </li>
          <li>
            共 {stats.totalEpisodes} 集中，{stats.totalEpisodes - stats.withWriter} 集缺编剧、
            {stats.totalEpisodes - stats.withDirector} 集缺导演——IMDb 本身没有收录。
          </li>
          <li>
            少数主创的职能归属可疑（IMDb 把编剧记成导演等），在影人页标了 <span className="dim">?</span>。
          </li>
        </ul>

        <h3>改口径</h3>
        <p>
          全站分档都读 <code>data/curated/tier-config.json</code>。改 <code>cumShare</code> 里的比例，然后跑{' '}
          <code>npm run data</code>，App 立刻按新口径重算。
        </p>

        <p style={{ marginTop: 24, fontSize: 11.5, color: 'var(--fg-4)' }}>
          数据集生成于 {new Date(dataset.generatedAt).toLocaleString('zh-CN')} · 口径版本 {config.version}
        </p>
      </div>
    </div>
  );
}
