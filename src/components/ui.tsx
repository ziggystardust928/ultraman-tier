import { Link, useNavigate } from 'react-router-dom';
import type { FlatEpisode } from '../data/store';
import { dataset } from '../data/store';
import type { Person } from '../types';

/* ============================================================
   图标（1.6px 描边，扁平）
   ============================================================ */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconHome = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M3 10.2 12 3l9 7.2" />
    <path d="M5.5 9.5V21h13V9.5" />
  </svg>
);
export const IconFilm = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M8 4v16M16 4v16M3 12h18M3 8h5M3 16h5M16 8h5M16 16h5" />
  </svg>
);
export const IconTrophy = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5H4.5v2A3.5 3.5 0 0 0 8 10.5M17 5h2.5v2A3.5 3.5 0 0 1 16 10.5" />
    <path d="M12 14v3M8.5 20h7l-1-3h-5l-1 3Z" />
  </svg>
);
export const IconUsers = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
    <path d="M16 5.4a3 3 0 0 1 0 5.6M17.6 20a5.8 5.8 0 0 0-1.6-4" />
  </svg>
);
export const IconSearch = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);
export const IconBack = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...S}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconChevron = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...S}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

/* ============================================================
   分档标签 / 分布条
   ============================================================ */
export function TierChip({ tier, label, large }: { tier: string; label: string; large?: boolean }) {
  return (
    <span className={large ? 'tier-chip tier-chip-lg' : 'tier-chip'} data-tier={tier}>
      {label}
    </span>
  );
}

export function KamikaiGradeChip({ grade }: { grade: { id: string; label: string } | null }) {
  if (!grade) return null;
  return (
    <span
      className="tier-chip"
      data-tier="kamikai"
      style={{ opacity: grade.id === 'kamikai-guard' ? 0.72 : 1 }}
      title={grade.label}
    >
      {grade.label}
    </span>
  );
}

/** 一集的分档徽标：神回额外显示 顶/佳/守 */
export function TierBadge({ ep, large }: { ep: Pick<FlatEpisode, 'tier' | 'tierLabel' | 'kamikaiGrade'>; large?: boolean }) {
  if (ep.tier === 'kamikai' && ep.kamikaiGrade) {
    return (
      <span className={large ? 'tier-chip tier-chip-lg' : 'tier-chip'} data-tier="kamikai">
        {ep.kamikaiGrade.label}
      </span>
    );
  }
  return <TierChip tier={ep.tier} label={ep.tierLabel} large={large} />;
}

export function TierBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  return (
    <div className="tierbar">
      {dataset.config.tiers.map((t) => {
        const n = counts[t.id] ?? 0;
        if (!n) return null;
        return (
          <span
            key={t.id}
            style={{ width: `${(n / total) * 100}%`, background: `var(--tier-${t.id})` }}
            title={`${t.label} ${n} 集`}
          />
        );
      })}
    </div>
  );
}

/* ============================================================
   单集行
   ============================================================ */
export function EpisodeRow({ ep, showSeries }: { ep: FlatEpisode; showSeries?: boolean }) {
  const parts: string[] = [];
  if (showSeries) parts.push(ep.series.titleZh);
  parts.push(`第 ${ep.no} 话`);
  if (ep.durationMin) parts.push(`${ep.durationMin} 分钟`);
  if (ep.directors[0]) parts.push(`导 ${ep.directors[0].name}`);
  if (ep.writers[0]) parts.push(`编 ${ep.writers[0].name}`);

  return (
    <Link className="ep-row" to={`/ep/${ep.id}`}>
      <span className="ep-no">{ep.no}</span>
      <TierBadge ep={ep} />
      <span className="ep-main">
        <span className="ep-title">{ep.titleZh ?? ep.titleRomaji ?? `第${ep.no}话`}</span>
        <span className="ep-sub">{parts.join(' · ')}</span>
      </span>
      <span className="ep-score">{ep.score.toFixed(1)}</span>
    </Link>
  );
}

/* ============================================================
   顶部栏 / 底部标签栏
   ============================================================ */
export function AppBar({ title, back }: { title: string; back?: boolean }) {
  const nav = useNavigate();
  return (
    <header className="appbar">
      {back && (
        <button className="appbar-back" onClick={() => nav(-1)} aria-label="返回">
          <IconBack />
        </button>
      )}
      <h1 className="appbar-title">{title}</h1>
    </header>
  );
}

const TABS = [
  { to: '/', label: '首页', icon: <IconHome /> },
  { to: '/series', label: '剧集', icon: <IconFilm /> },
  { to: '/ranking', label: '排行', icon: <IconTrophy /> },
  { to: '/people', label: '影人', icon: <IconUsers /> },
  { to: '/search', label: '搜索', icon: <IconSearch /> },
];

export function TabBar({ active }: { active: string }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.to} className="tabbar-item" data-active={t.to === active} to={t.to}>
          {t.icon}
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/* ============================================================
   影人行
   ============================================================ */
export function PersonRow({ person, count, roleLabel }: { person: Person; count: number; roleLabel: string }) {
  return (
    <Link className="person-row" to={`/person/${person.id}`}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div className="person-name">{person.name}</div>
        <div className="person-en">{person.nameEn}</div>
      </span>
      <span style={{ textAlign: 'right', flex: 'none' }}>
        <div className="person-count">{count}</div>
        <div className="person-count-label">{roleLabel}</div>
      </span>
      <IconChevron />
    </Link>
  );
}
