import { Link } from 'react-router-dom';
import type { Series } from '../types';

/* ============================================================
   剧集配色 & 封面母题（仅在缺图时作为兜底使用）
   ============================================================ */

type Motif = 'rings' | 'rays' | 'peak' | 'grid';

const FALLBACK_COLORS = ['#8b5cf6', '#3b82f6', '#ef4444', '#14b8a6', '#f59e0b', '#ec4899'];

export function seriesColor(id: string): string {
  const known: Record<string, string> = { tiga: '#8b5cf6', dyna: '#3b82f6', gaia: '#ef4444' };
  if (known[id]) return known[id];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

const MOTIFS: Record<string, Motif> = { tiga: 'rings', dyna: 'rays', gaia: 'peak' };
function seriesMotif(id: string): Motif {
  if (MOTIFS[id]) return MOTIFS[id];
  const order: Motif[] = ['rings', 'rays', 'peak', 'grid'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) % 997;
  return order[h % order.length];
}

/* ============================================================
   兜底封面艺术（没有真实海报时才用）
   ============================================================ */

function CoverArt({ motif, color }: { motif: Motif; color: string }) {
  return (
    <svg className="cover-art" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="140" fill="#0e0e12" />

      {motif === 'rings' && (
        <>
          <circle cx="74" cy="40" r="52" fill={color} />
          <circle cx="74" cy="40" r="30" fill="#0e0e12" opacity="0.55" />
          <circle cx="74" cy="40" r="13" fill={color} />
          <rect x="0" y="96" width="100" height="2" fill={color} opacity="0.8" />
        </>
      )}
      {motif === 'rays' && (
        <>
          <rect x="-30" y="-10" width="150" height="150" fill={color} transform="rotate(-24 50 70)" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x="-40"
              y={8 + i * 17}
              width="160"
              height={i % 2 ? 2.5 : 5}
              fill="#0e0e12"
              opacity="0.5"
              transform="rotate(-24 50 70)"
            />
          ))}
        </>
      )}
      {motif === 'peak' && (
        <>
          <polygon points="50,-6 118,150 -18,150" fill={color} />
          <polygon points="50,26 96,150 4,150" fill="#0e0e12" opacity="0.42" />
          <circle cx="50" cy="30" r="15" fill={color} />
        </>
      )}
      {motif === 'grid' && (
        <>
          <rect width="100" height="140" fill={color} opacity="0.22" />
          {Array.from({ length: 40 }).map((_, i) => (
            <circle key={i} cx={(i % 8) * 14 + 6} cy={Math.floor(i / 8) * 26 + 10} r="3.4" fill={color} />
          ))}
        </>
      )}
      <rect x="0" y="92" width="100" height="48" fill="#0e0e12" opacity="0.72" />
    </svg>
  );
}

/** 两行断行：迪迦奥特曼 -> 迪迦 / 奥特曼 */
function breakTitle(zh: string): string {
  if (zh.length > 4 && zh.endsWith('奥特曼')) return `${zh.slice(0, -3)}\n奥特曼`;
  if (zh.length > 5) return `${zh.slice(0, Math.ceil(zh.length / 2))}\n${zh.slice(Math.ceil(zh.length / 2))}`;
  return zh;
}

/* ============================================================
   剧集封面
   有真实海报时直接铺满，不叠文字（海报自带剧名）。
   没有海报时退回生成艺术 + 文字。
   ============================================================ */

export function SeriesCover({ series, size = 'md' }: { series: Series; size?: 'sm' | 'md' | 'lg' }) {
  const cls = ['cover', size === 'sm' && 'cover-sm', size === 'lg' && 'cover-lg'].filter(Boolean).join(' ');
  const src = size === 'sm' ? (series.images?.square ?? series.images?.cover) : (series.images?.cover ?? series.images?.square);

  if (src) {
    return (
      <div className={cls}>
        <img className="cover-img" src={src} alt={series.titleZh} loading="lazy" decoding="async" />
        {size !== 'lg' && (
          <span className="cover-badge">
            {series.year}
            <span className="cover-badge-sep">·</span>
            {series.episodeCount} 话
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cls}>
      <CoverArt motif={seriesMotif(series.id)} color={seriesColor(series.id)} />
      <div className="cover-type">
        <span className="cover-en">{series.titleEn ?? series.titleJa}</span>
        <span className="cover-zh" style={{ whiteSpace: 'pre-line' }}>
          {breakTitle(series.titleZh)}
        </span>
        <div className="cover-foot">
          <span className="cover-year">{series.year}</span>
          <span className="cover-tag">{series.era === 'heisei' ? '旧平成' : '新生代'}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   剧照瓦片
   ============================================================ */

const TILE_LABELS = ['剧照', '舞台剧', '周边', '海报'];

export interface TileItem {
  src: string | null;
  label: string;
  title?: string | null;
  /** 有 to 时可点进对应单集；设计稿没有对应单集，所以为 null */
  to?: string | null;
}

/** 一格瓦片。有图用真图，没图退回扁平占位图形。 */
export function PhotoTile({ series, item, index }: { series: Series; item?: TileItem; index: number }) {
  if (item?.src) {
    const body = (
      <>
        <img src={item.src} alt={item.title ?? item.label} loading="lazy" decoding="async" />
        <span className="tile-label">{item.label}</span>
      </>
    );
    return item.to ? (
      <Link className="photo-tile" to={item.to} title={item.title ?? item.label}>
        {body}
      </Link>
    ) : (
      <div className="photo-tile" title={item.title ?? item.label}>
        {body}
      </div>
    );
  }

  const color = seriesColor(series.id);
  const variant = index % 6;
  return (
    <div className="photo-tile">
      <svg viewBox="0 0 60 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="60" height="60" fill="#16161b" />
        {variant === 0 && <circle cx="46" cy="18" r="26" fill={color} />}
        {variant === 1 && <polygon points="0,60 60,0 60,60" fill={color} opacity="0.9" />}
        {variant === 2 &&
          [0, 1, 2, 3].map((i) => (
            <circle key={i} cx="8" cy="52" r={10 + i * 11} fill="none" stroke={color} strokeWidth="2.2" opacity={0.85 - i * 0.16} />
          ))}
        {variant === 3 &&
          Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={(i % 4) * 15 + 4} y={Math.floor(i / 4) * 20 + 5} width="8" height="8" fill={color} />
          ))}
        {variant === 4 && <polygon points="30,-4 68,64 -8,64" fill={color} />}
        {variant === 5 &&
          [0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x="0" y={i * 12 + 3} width={i % 2 ? 38 : 58} height={i % 2 ? 7 : 4} fill={color} opacity={0.9 - i * 0.13} />
          ))}
      </svg>
      <span className="tile-label">{TILE_LABELS[index % TILE_LABELS.length]}</span>
    </div>
  );
}

/**
 * 首页封面旁的 2×2 拼贴。
 * 优先用设计稿（data/curated/designs.json 策展）；该剧没配设计稿时，
 * 用均匀分布的分集剧照填满同样的 4 格。
 */
export function PhotoMosaic({ series, count = 4 }: { series: Series; count?: number }) {
  const designs = series.images?.designs ?? [];
  const photos = series.images?.photos ?? [];

  const items: TileItem[] =
    designs.length >= count
      ? designs.slice(0, count).map((d) => ({ src: d.src, label: d.label, title: d.note, to: null }))
      : photos.slice(0, count).map((p) => ({
          src: p.src,
          label: p.label,
          title: p.title,
          to: `/ep/${series.id}-${p.no}`,
        }));

  return (
    <div className="hero-mosaic">
      {Array.from({ length: count }).map((_, i) => (
        <PhotoTile key={i} series={series} item={items[i]} index={i} />
      ))}
    </div>
  );
}
