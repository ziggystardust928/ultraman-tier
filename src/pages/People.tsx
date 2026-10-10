import { useMemo, useState } from 'react';
import { dataset, personCredits } from '../data/store';
import { AppBar, PersonRow } from '../components/ui';

type Filter = 'all' | 'director' | 'writer';

export default function People() {
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const rows = dataset.people.map((p) => {
      const asDirector = personCredits(p, 'director');
      const asWriter = personCredits(p, 'writer');
      return {
        person: p,
        asDirector,
        asWriter,
        count: filter === 'writer' ? asWriter.length : filter === 'director' ? asDirector.length : asDirector.length + asWriter.length,
        label: filter === 'writer' ? '集编剧' : filter === 'director' ? '集导演' : '集参与',
      };
    });
    return rows
      .filter((r) => (filter === 'all' ? true : r.count > 0))
      .sort((a, b) => b.count - a.count || a.person.name.localeCompare(b.person.name, 'zh'));
  }, [filter]);

  const totalCredits = rows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="screen">
      <AppBar title="编剧 / 导演" />

      <div style={{ padding: '14px var(--pad) 12px' }}>
        <div className="segmented">
          <button data-active={filter === 'all'} onClick={() => setFilter('all')}>
            全部
          </button>
          <button data-active={filter === 'director'} onClick={() => setFilter('director')}>
            导演
          </button>
          <button data-active={filter === 'writer'} onClick={() => setFilter('writer')}>
            编剧
          </button>
        </div>
        <div className="section-note" style={{ marginTop: 9 }}>
          {rows.length} 位 · 共 {totalCredits} 条署名 · 按参与集数排序
        </div>
      </div>

      <div>
        {rows.map((r) => (
          <PersonRow key={r.person.id} person={r.person} count={r.count} roleLabel={r.label} />
        ))}
      </div>

      <div className="section">
        <div className="section-note" style={{ lineHeight: 1.7 }}>
          人名以哔哩哔哩番剧官方中文演职员名单为准，与 IMDb 罗马字表记互校。
          带 <span className="dim">?</span> 的条目表示 IMDb 的职能归属存疑（例如把编剧记成导演）。
        </div>
      </div>
    </div>
  );
}
