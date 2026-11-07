import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dataset } from '../data/store';
import { seriesColor } from '../components/art';

/** 把剧集主色混成深色底上的淡色块（对应 Radiohead Library 每个专辑的专属背景色） */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const ENTRIES = [
  { to: '/series', cn: '剧集库', en: 'Series' },
  { to: '/ranking', cn: '分级榜', en: 'Ranking' },
  { to: '/people', cn: '编剧导演', en: 'Credits' },
  { to: '/methodology', cn: '评级口径', en: 'Method' },
];

export default function Home() {
  const [active, setActive] = useState(0);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const avatarRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 滚动监听：哪个剧集区块在视口里，就把对应头像点亮
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    for (const el of sectionRefs.current) if (el) obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 头像点亮时把它滚进可视区
  useEffect(() => {
    avatarRefs.current[active]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  const jumpTo = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const totalEpisodes = dataset.stats.totalEpisodes;

  return (
    <div className="library">
      {/* ---------- 吸顶：标题 + 头像条 ---------- */}
      <div className="lib-sticky">
        <header className="lib-header">
          <h1 className="lib-title">奥特曼公共资料馆</h1>
          <span className="lib-count">
            {dataset.series.length} 部 · {totalEpisodes} 集
          </span>
        </header>

        <nav className="lib-avatars" aria-label="剧集选择">
          {dataset.series.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                avatarRefs.current[i] = el;
              }}
              className="lib-avatar"
              data-active={i === active}
              onClick={() => jumpTo(i)}
              title={`${s.titleZh} ${s.year}`}
              aria-label={s.titleZh}
            >
              {s.images.square ? (
                <img src={s.images.square} alt="" loading={i < 4 ? 'eager' : 'lazy'} decoding="async" />
              ) : (
                <span style={{ background: seriesColor(s.id) }} />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ---------- 每部剧一个拼贴区块 ---------- */}
      {dataset.series.map((s, i) => {
        const color = seriesColor(s.id);
        const kamikai = s.episodes.filter((e) => e.tier === 'kamikai').length;
        const still = s.images.photos[Math.floor(s.images.photos.length / 2)];
        const design = s.images.designs[0];

        // 右栏 2×2：剧照 / 头部细节 / 计时器细节 / 设计稿（没有设计稿就再用一张剧照）
        const tiles = [
          still && { src: still.src, label: still.label, to: `/ep/${s.id}-${still.no}` },
          s.images.headDetail && { src: s.images.headDetail, label: '头部细节', to: `/series/${s.id}` },
          s.images.chestDetail && { src: s.images.chestDetail, label: '计时器', to: `/series/${s.id}` },
          design
            ? { src: design.src, label: design.label, to: `/series/${s.id}` }
            : s.images.photos[1] && {
                src: s.images.photos[1].src,
                label: s.images.photos[1].label,
                to: `/ep/${s.id}-${s.images.photos[1].no}`,
              },
        ].filter(Boolean) as { src: string; label: string; to: string }[];

        return (
          <section
            key={s.id}
            className="lib-section"
            data-index={i}
            ref={(el) => {
              sectionRefs.current[i] = el;
            }}
            style={{ background: tint(color, 0.1) }}
          >
            <div className="lib-collage">
              <Link className="lib-cover" to={`/series/${s.id}`} title={s.titleZh}>
                {s.images.cover ? (
                  <img src={s.images.cover} alt={s.titleZh} loading="lazy" decoding="async" />
                ) : (
                  <span style={{ background: color, display: 'block', width: '100%', height: '100%' }} />
                )}
                <span className="lib-cover-year">{s.year}</span>
              </Link>

              <div className="lib-grid">
                {tiles.map((t, k) => (
                  <Link className="lib-tile" key={k} to={t.to} title={t.label}>
                    <img src={t.src} alt={t.label} loading="lazy" decoding="async" />
                    <span className="lib-tile-label">{t.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="lib-meta">
              <div className="lib-meta-main">
                <h2 className="lib-name">{s.titleZh}</h2>
                <div className="lib-line">
                  <span>{s.year}</span>
                  <span className="dim">·</span>
                  <span>全 {s.episodeCount} 话</span>
                  {s.ratings.imdb !== null && (
                    <>
                      <span className="dim">·</span>
                      <span>IMDb {s.ratings.imdb.toFixed(2)}</span>
                    </>
                  )}
                  {s.ratingsIncomplete ? (
                    <>
                      <span className="dim">·</span>
                      <span className="dim">不参与分档</span>
                    </>
                  ) : (
                    <>
                      <span className="dim">·</span>
                      <span style={{ color: 'var(--tier-kamikai)' }}>神回 {kamikai}</span>
                    </>
                  )}
                </div>
                {s.synopsis && <p className="lib-syn">{s.synopsis}</p>}
              </div>
              <Link className="lib-go" to={`/series/${s.id}`}>
                查看分集 →
              </Link>
            </div>
          </section>
        );
      })}

      {/* ---------- 底部入口 ---------- */}
      <footer className="lib-footer">
        <div className="entries">
          {ENTRIES.map((e) => (
            <Link className="entry" key={e.to} to={e.to}>
              <span className="entry-cn">{e.cn}</span>
              <span className="entry-en">{e.en}</span>
            </Link>
          ))}
        </div>
        <p className="lib-disclaimer">
          非商业粉丝作品。《奥特曼》系列著作权归圆谷制作株式会社所有，站内图片均为版权方作品的影像资料，
          仅作介绍与资料索引之用。详见{' '}
          <Link to="/methodology" style={{ borderBottom: '1px solid var(--line)' }}>
            评级口径
          </Link>
          。
        </p>
      </footer>
    </div>
  );
}
