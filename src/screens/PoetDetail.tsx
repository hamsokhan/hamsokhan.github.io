import { Link, useParams } from 'react-router';
import { Icon, IconButton, Sheet, useGoBack, useOverlay } from '../components/ui';
import { LIBRARY, libraryPoem, poetById, sourceLine } from '../data/library';
import NotFound from './NotFound';

export default function PoetDetail() {
  const { poetId } = useParams();
  const poet = poetById(poetId ?? null);
  const goBack = useGoBack();
  const sources = useOverlay('sources');
  if (!poet) return <NotFound />;
  const poems = LIBRARY.filter((p) => p.poetId === poet.id);
  const starter = libraryPoem(poet.starterPoemId);

  return (
    <div className="min-h-dvh pb-12">
      <header className="px-6 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 flex items-center justify-between">
        <IconButton icon="arrow-right" label="برگشت" onClick={() => goBack('/')} />
        <div className="w-11" />
      </header>

      <div className="max-w-3xl mx-auto">
        <section className="px-6 pt-4 pb-10 text-center border-b border-line/50">
          <div className="flex justify-center mb-6 opacity-30" aria-hidden="true">
            <Icon name="seedling" className="text-3xl text-green" />
          </div>
          <h1 className="text-3xl font-bold text-green mb-4">{poet.fullName}</h1>
          <p className="text-base leading-relaxed text-muted max-w-xs mx-auto">{poet.intro}</p>
        </section>

        {starter && (
          <section className="px-6 py-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-px bg-line" />
              <h2 className="text-sm font-bold text-green tracking-wider">برای آغاز</h2>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div className="bg-card p-6 rounded-2xl border border-line/50 editorial-shadow">
              <h3 className="text-lg font-bold mb-3 text-green">{starter.title}</h3>
              <p className="text-sm text-muted leading-relaxed mb-6">{poet.starterWhy}</p>
              <Link to={`/poem/${starter.id}`} className="text-green text-sm font-bold inline-flex items-center gap-2 py-1">
                خواندن این شعر
                <Icon name="arrow-left" className="text-xs" />
              </Link>
            </div>
          </section>
        )}

        <section className="px-6">
          <h2 className="text-sm font-bold text-muted mb-6 px-1">اشعار موجود</h2>
          <ul className="space-y-2">
            {poems.map((p) => (
              <li key={p.id}>
                <Link to={`/poem/${p.id}`} className="bg-card p-5 rounded-2xl border border-line/30 flex items-center justify-between gap-3 hover:border-green/30 transition-colors group">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-green mb-1">{p.title}</h3>
                    <p className="text-xs text-muted line-clamp-1">{p.verses[0].misras[1]}…</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-paper flex items-center justify-center text-line group-hover:bg-green group-hover:text-on-green transition-all shrink-0">
                    <Icon name="chevron-left" className="text-[10px]" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="px-6 mt-12 text-center">
          <button type="button" onClick={sources.show} className="text-xs text-muted inline-flex items-center justify-center gap-2 hover:text-green transition-colors py-2">
            <Icon name="circle-info" />
            اطلاعات منبع متون
          </button>
        </div>
      </div>

      <Sheet open={sources.open} onClose={sources.hide} title="منبع متون">
        <p className="text-sm leading-relaxed text-muted mb-4">
          متن همهٔ شعرهای این مجموعه از گنجور دریافت شده و نشانی صفحهٔ هر شعر ثبت شده است. معرفی کوتاه شاعر را هم‌سخن نوشته است و از منبع نقل نشده.
        </p>
        <ul className="space-y-3 text-sm">
          {poems.map((p) => (
            <li key={p.id}>
              <a href={p.source!.url} target="_blank" rel="noopener noreferrer" className="text-green underline underline-offset-4">{p.title}</a>
              <span className="block text-xs text-muted">{sourceLine(p)}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
