import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { searchKey } from '../../shared/text';
import { BottomNav, Icon, LoadError, Spinner } from '../components/ui';
import { POETS, sourceLine, type Poem } from '../data/library';
import { faNum } from '../lib/format';
import { allPoems, libraryMarks, useQuery } from '../lib/store';

const FILTERS = [{ id: 'all', label: 'همه' }, ...POETS.map((p) => ({ id: p.id, label: p.name })), { id: 'mine', label: 'شعرهای من' }];

function matches(p: Poem, key: string) {
  if (!key) return true;
  const hay = [p.title ?? '', p.poetName ?? '', p.source?.fullTitle ?? '', ...p.verses.flatMap((v) => v.misras)].map(searchKey);
  return hay.some((h) => h.includes(key));
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const filter = params.get('f') ?? 'all';
  const poems = useQuery(allPoems, []);
  const marks = useQuery(libraryMarks, []);
  const key = searchKey(q);

  const update = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const list = useMemo(() => {
    if (poems.status !== 'ready') return [];
    return poems.value.filter((p) => (filter === 'all' ? true : filter === 'mine' ? p.origin === 'user' : p.poetId === filter) && matches(p, key));
  }, [poems, key, filter]);

  return (
    <div className="min-h-dvh pb-28">
      <header className="px-6 pt-6 pb-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-green">کتابخانه</h1>
            <Link to="/import" className="text-sm font-medium text-green hover:underline underline-offset-4 py-2">واردکردن شعر</Link>
          </div>
          <div className="relative mb-6">
            <label htmlFor="lib-search" className="sr-only">جست‌وجو در شاعر، عنوان و متن شعر</label>
            <input
              id="lib-search"
              type="search"
              value={q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="جست‌وجو در شاعر، عنوان و متن شعر"
              className="w-full bg-card border border-line rounded-xl py-3 pr-11 pl-4 text-sm focus:outline-none focus:border-green focus:ring-1 focus:ring-green/20 transition-all"
            />
            <Icon name="magnifying-glass" className="absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2" role="group" aria-label="صافی شاعر">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => update({ f: f.id === 'all' ? '' : f.id })}
                className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap transition-all ${filter === f.id ? 'bg-green text-on-green border-green' : 'bg-card border-line'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="px-6 max-w-3xl mx-auto">
        {poems.status === 'loading' && <Spinner label="در حال بارگذاری…" />}
        {poems.status === 'error' && <LoadError />}
        {poems.status === 'ready' && list.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-base font-bold text-green mb-2">{filter === 'mine' && !q ? 'هنوز شعری وارد نکرده‌اید' : 'نتیجه‌ای پیدا نشد'}</p>
            <p className="text-sm text-muted leading-relaxed">
              {filter === 'mine' && !q ? 'با «واردکردن شعر» متن دلخواهتان را اضافه کنید.' : 'جست‌وجو فقط در شعرهای همین مجموعه انجام می‌شود. واژهٔ دیگری را امتحان کنید.'}
            </p>
          </div>
        )}
        <ul>
          {list.map((p) => {
            // Show the verse the search found, not always the first one.
            const hit = key ? p.verses.find((v) => v.misras.some((m) => searchKey(m).includes(key))) : undefined;
            const shown = hit ?? p.verses[0];
            const reached = marks.status === 'ready' ? marks.value.progress.get(p.id) : undefined;
            const saved = marks.status === 'ready' && marks.value.saved.has(p.id);
            return (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <Link to={`/poem/${p.id}`} className="block py-6">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-xs text-muted font-medium">{p.poetName ?? 'شاعر نامشخص'}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {reached !== undefined && reached > 1 && <span>بیت {faNum(reached)} از {faNum(p.verses.length)}</span>}
                      {saved && <span title="ذخیره‌شده"><Icon name="bookmark" className="text-green" /><span className="sr-only">ذخیره‌شده</span></span>}
                      <Icon name="chevron-left" className="text-line" />
                    </span>
                  </div>
                  <h2 className="text-lg font-bold mb-2 text-green">{p.title ?? 'بی‌عنوان'}</h2>
                  <p className="text-sm leading-relaxed mb-2">
                    {hit && hit.n > 1 && <span className="text-xs text-muted ml-1">بیت {faNum(hit.n)}:</span>}
                    {shown.misras.join(' / ')}
                  </p>
                  <p className="text-xs text-muted leading-relaxed">{sourceLine(p)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <BottomNav />
    </div>
  );
}
