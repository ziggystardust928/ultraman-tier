import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dataset } from '../data/store';

/** hex → "r, g, b" */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 主题色按 alpha 混出来的深色区块背景（保持深色底的可读性，同时能一眼看出是哪种颜色） */
function tint(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function Home() {
  const [active, setActive] = useState(0);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 滚动时点亮顶部对应的色块。
  // 一开始用 IntersectionObserver，但它的 rootMargin 边界判定在吸顶头下面不可靠
  // （在第 1 个区块时点亮了第 2 个色块），改成直接比对各区块的绝对位置。
  useEffect(() => {
    const onScroll = () => {
      const line = window.scrollY + 140; // 判定线：吸顶头下方一点
      let idx = 0;
      sectionRefs.current.forEach((el, i) => {
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= line) idx = i;
      });
      setActive(idx);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 色块点亮时把它滚进可视区
  useEffect(() => {
    swatchRefs.current[active]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  // 点顶部色块 → 跳到对应剧集的展示区块
  const jumpTo = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="library">
      {/* ---------- 吸顶：标题 + 主题色块选择器 ---------- */}
      <div className="lib-sticky">
        <header className="lib-header">
          <h1 className="lib-title">奥特曼公共资料馆</h1>
          <span className="lib-count">
            {dataset.series.length} 部 · {dataset.stats.totalEpisodes} 集
          </span>
        </header>

        <nav className="lib-swatches" aria-label="剧集选择">
          {dataset.series.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                swatchRefs.current[i] = el;
              }}
              className="lib-swatch"
              data-active={i === active}
              style={{ background: s.themeColor }}
              onClick={() => jumpTo(i)}
              title={`${s.titleZh} ${s.year}`}
              aria-label={`跳到 ${s.titleZh}`}
            />
          ))}
        </nav>
      </div>

      {/* ---------- 每部剧一块：背景就是它的主题色 ---------- */}
      {dataset.series.map((s, i) => {
        // 右侧 2×2 固定四类素材：设计稿 / 头部细节 / 皮套展示 / 计时器细节
        // 缺哪格就用一张剧照顶上，保证版面永远填满
        const fallback = s.images.heroStills;
        const cells: (string | null)[] = [
          s.images.webDesign,
          s.images.headDetail,
          s.images.webSuit,
          s.images.chestDetail,
        ];
        const tiles = cells.map((src, k) => src ?? fallback[k] ?? fallback[0] ?? null);

        return (
          <section
            key={s.id}
            className="lib-section"
            data-index={i}
            ref={(el) => {
              sectionRefs.current[i] = el;
            }}
            style={{ background: tint(s.themeColor, 0.16) }}
          >
            <div className="lib-collage">
              <div className="lib-left">
                <Link className="lib-cover" to={`/series/${s.id}`} title={s.titleZh}>
                  {s.images.cover ? (
                    <img src={s.images.cover} alt={s.titleZh} loading="lazy" decoding="async" />
                  ) : (
                    <span style={{ background: s.themeColor, display: 'block', width: '100%', height: '100%' }} />
                  )}
                </Link>
                {/* 只保留封面下的年份 */}
                <span className="lib-year">{s.year}</span>
              </div>

              <div className="lib-grid">
                {tiles.map((src, k) =>
                  src ? (
                    <Link className="lib-tile" key={k} to={`/series/${s.id}`} title={s.titleZh}>
                      <img src={src} alt="" loading="lazy" decoding="async" />
                    </Link>
                  ) : (
                    <span className="lib-tile" key={k} style={{ background: tint(s.themeColor, 0.3) }} />
                  ),
                )}
              </div>
            </div>
          </section>
        );
      })}

      {/* ---------- 底部：入口 + 版权 ---------- */}
      <footer className="lib-footer">
        <div className="entries">
          <Link className="entry" to="/series">
            <span className="entry-cn">剧集库</span>
            <span className="entry-en">Series</span>
          </Link>
          <Link className="entry" to="/ranking">
            <span className="entry-cn">分级榜</span>
            <span className="entry-en">Ranking</span>
          </Link>
          <Link className="entry" to="/people">
            <span className="entry-cn">编剧导演</span>
            <span className="entry-en">Credits</span>
          </Link>
          <Link className="entry" to="/methodology">
            <span className="entry-cn">评级口径</span>
            <span className="entry-en">Method</span>
          </Link>
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
