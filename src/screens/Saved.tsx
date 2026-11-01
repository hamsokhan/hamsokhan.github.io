import { useNavigate, useSearchParams } from 'react-router';
import { BottomNav, Icon, Spinner, useToast } from '../components/ui';
import { faAgo } from '../lib/format';
import { savedLists, setPoemSaved, setVerseSaved, useQuery } from '../lib/store';

export default function Saved() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'poems' ? 'poems' : 'verses';
  const lists = useQuery(savedLists, []);
  const navigate = useNavigate();
  const toast = useToast();

  const tabBtn = (id: 'verses' | 'poems', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setParams(id === 'poems' ? { tab: 'poems' } : {}, { replace: true })}
      className={`flex-1 p-3 text-center text-sm font-bold border-b-2 transition-all ${tab === id ? 'text-green border-green' : 'text-muted border-transparent'}`}
    >
      {label}
    </button>
  );

  const empty = (
    <div className="py-20 text-center">
      <div className="w-16 h-16 bg-green/5 rounded-full flex items-center justify-center text-line mx-auto mb-6">
        <Icon name="bookmark" style="regular" className="text-3xl" />
      </div>
      <h3 className="text-base font-bold text-green mb-2">هنوز چیزی ذخیره نکرده‌اید</h3>
      <p className="text-xs text-muted max-w-[220px] mx-auto leading-relaxed">بیت‌ها و شعرهایی که دوست دارید را برای دسترسی بعدی ذخیره کنید.</p>
    </div>
  );

  return (
    <div className="min-h-dvh pb-28">
      <header className="px-6 pt-6 pb-2 sticky top-0 bg-paper/95 backdrop-blur-sm z-20">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-green mb-2">ذخیره‌ها</h1>
          <p className="text-[11px] text-muted mb-4">فقط روی همین دستگاه نگهداری می‌شوند و بدون اینترنت هم در دسترس‌اند؛ همگام‌سازی بین دستگاه‌ها وجود ندارد.</p>
          <div className="flex border-b border-line" role="tablist">
            {tabBtn('verses', 'بیت‌ها')}
            {tabBtn('poems', 'شعرها')}
          </div>
        </div>
      </header>

      <main className="px-6 pt-6 max-w-3xl mx-auto" role="tabpanel">
        {lists.status === 'loading' && <Spinner label="در حال بارگذاری…" />}
        {lists.status === 'error' && <p className="text-sm text-danger">خواندن ذخیره‌ها ممکن نشد.</p>}
        {lists.status === 'ready' && tab === 'verses' && (lists.value.verses.length === 0 ? empty : (
          <ul>
            {lists.value.verses.map((s) => (
              <li key={`${s.poem.id}#${s.n}`} className="bg-card border border-line rounded-[1.25rem] p-5 mb-4">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[10px] text-muted">{s.poem.poetName ?? 'شاعر نامشخص'} · {s.poem.title ?? 'بی‌عنوان'}</span>
                  <button type="button" aria-label="برداشتن از ذخیره‌ها" className="text-muted -m-2 p-2" onClick={async () => {
                    await setVerseSaved(s.poem.id, s.n, false);
                    toast({ text: 'بیت از ذخیره‌ها برداشته شد', action: { label: 'واگرد', run: () => void setVerseSaved(s.poem.id, s.n, true, s.savedAt) } });
                  }}>
                    <Icon name="xmark" className="text-xs" />
                  </button>
                </div>
                <button type="button" className="text-right w-full" onClick={() => navigate(`/poem/${s.poem.id}/v/${s.n}`)}>
                  <p className="text-sm leading-relaxed mb-4 font-medium">{s.poem.verses[s.n - 1].misras.join(' / ')}</p>
                  <span className="flex items-center justify-between">
                    {s.hasAnalysis ? <span className="text-[10px] text-green bg-green/5 px-2 py-0.5 rounded">دارای توضیح</span> : <span />}
                    <span className="text-[10px] text-muted">{faAgo(s.savedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
        {lists.status === 'ready' && tab === 'poems' && (lists.value.poems.length === 0 ? empty : (
          <ul>
            {lists.value.poems.map((s) => (
              <li key={s.poem.id} className="bg-card border border-line rounded-[1.25rem] p-5 mb-4">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[10px] text-muted">{s.poem.poetName ?? 'شاعر نامشخص'}</span>
                  <button type="button" aria-label="برداشتن از ذخیره‌ها" className="text-muted -m-2 p-2" onClick={async () => {
                    await setPoemSaved(s.poem.id, false);
                    toast({ text: 'شعر از ذخیره‌ها برداشته شد', action: { label: 'واگرد', run: () => void setPoemSaved(s.poem.id, true, s.savedAt) } });
                  }}>
                    <Icon name="xmark" className="text-xs" />
                  </button>
                </div>
                <button type="button" className="text-right w-full" onClick={() => navigate(`/poem/${s.poem.id}`)}>
                  <p className="text-base font-bold text-green mb-1">{s.poem.title ?? 'بی‌عنوان'}</p>
                  <p className="text-sm leading-relaxed mb-4 line-clamp-1">{s.poem.verses[0].misras.join(' / ')}</p>
                  <span className="block text-left text-[10px] text-muted">{faAgo(s.savedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </main>
      <BottomNav />
    </div>
  );
}
