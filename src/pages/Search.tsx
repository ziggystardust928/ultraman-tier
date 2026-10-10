import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { search } from '../data/store';
import { AppBar, IconSearch, TierBadge } from '../components/ui';

const HOT = ['迪迦', '哥尔赞', '小中千昭', '村石宏实', '神回', '加坦杰厄'];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const hits = useMemo(() => search(q), [q]);

  // 把关键词同步进 URL，这样单集页里的「登场怪兽」可以直接深链过来
  useEffect(() => {
    setParams(q ? { q } : {}, { replace: true });
  }, [q, setParams]);

  const grouped = useMemo(() => {
    return {
      episode: hits.filter((h) => h.kind === 'episode'),
      series: hits.filter((h) => h.kind === 'series'),
      person: hits.filter((h) => h.kind === 'person'),
    };
  }, [hits]);

  return (
    <div className="screen">
      <AppBar title="搜索" />

      <div className="searchbox">
        <span style={{ color: 'var(--fg-4)', width: 20, height: 20, display: 'block' }}>
          <IconSearch />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="单集名 / 剧名 / 编剧 / 导演"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {q && (
          <button className="dim" onClick={() => setQ('')} style={{ fontSize: 13 }}>
            清除
          </button>
        )}
      </div>

      {!q && (
        <>
          <div className="section">
            <div className="section-head">
              <h2 className="section-title">试试这些</h2>
            </div>
          </div>
          <div className="chips" style={{ flexWrap: 'wrap', gap: 8 }}>
            {HOT.map((h) => (
              <button key={h} className="chip" onClick={() => setQ(h)}>
                {h}
              </button>
            ))}
          </div>
          <div className="section">
            <div className="section-note" style={{ lineHeight: 1.7 }}>
              可以搜中文单集名、日文罗马字、剧名、年份，也可以直接搜编剧或导演的名字。
            </div>
          </div>
        </>
      )}

      {q && hits.length === 0 && <div className="empty">没有匹配「{q}」的结果</div>}

      {grouped.series.length > 0 && (
        <>
          <div className="section">
            <div className="section-head">
              <h2 className="section-title">剧集</h2>
              <span className="section-note">{grouped.series.length}</span>
            </div>
          </div>
          {grouped.series.map((h) => (
            <Link className="hit" key={h.key} to={`/series/${h.series!.id}`}>
              <div className="hit-top">
                <span className="hit-title">{h.title}</span>
              </div>
              <div className="hit-sub">{h.subtitle}</div>
            </Link>
          ))}
        </>
      )}

      {grouped.episode.length > 0 && (
        <>
          <div className="section">
            <div className="section-head">
              <h2 className="section-title">单集</h2>
              <span className="section-note">{grouped.episode.length}</span>
            </div>
          </div>
          {grouped.episode.map((h) => (
            <Link className="hit" key={h.key} to={`/ep/${h.episode!.id}`}>
              <div className="hit-top">
                <TierBadge ep={h.episode!} />
                <span className="hit-title">{h.title}</span>
                <span className="ep-score">{h.episode!.score.toFixed(1)}</span>
              </div>
              <div className="hit-sub">{h.subtitle}</div>
            </Link>
          ))}
        </>
      )}

      {grouped.person.length > 0 && (
        <>
          <div className="section">
            <div className="section-head">
              <h2 className="section-title">编剧 / 导演</h2>
              <span className="section-note">{grouped.person.length}</span>
            </div>
          </div>
          {grouped.person.map((h) => (
            <Link className="hit" key={h.key} to={`/person/${h.person!.id}`}>
              <div className="hit-top">
                <span className="hit-title">{h.title}</span>
                <span className="dim" style={{ fontSize: 11 }}>
                  {h.person!.nameEn}
                </span>
              </div>
              <div className="hit-sub">{h.subtitle}</div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
