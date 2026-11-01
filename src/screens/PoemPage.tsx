import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Interpretation } from '../components/Interpretation';
import { copyText, Icon, IconButton, Sheet, Spinner, useGoBack, useOverlay, useToast } from '../components/ui';
import type { Poem } from '../data/library';
import { faNum, faOrdinal } from '../lib/format';
import { deleteUserPoem, getPoem, getProgress, isPoemSaved, isVerseSaved, setPoemSaved, setProgress, setVerseSaved, useQuery } from '../lib/store';
import NotFound from './NotFound';

const WIDE = '(min-width: 840px)';
const wideQuery = window.matchMedia(WIDE);
const useWide = () => useSyncExternalStore((cb) => (wideQuery.addEventListener('change', cb), () => wideQuery.removeEventListener('change', cb)), () => wideQuery.matches);

/**
 * Reader (design 02) and verse explanation (design 03).
 * - /poem/:id?v=n          → reader with verse n selected
 * - /poem/:id/v/:n         → explanation of verse n (full screen on phones,
 *                            side panel next to the poem on wide screens)
 * The selection lives in the URL, so resizing/folding never loses it.
 */
export default function PoemPage() {
  const { poemId = '', n: nParam } = useParams();
  const poem = useQuery(() => getPoem(poemId), [poemId]);
  if (poem.status === 'loading') return <div className="p-6"><Spinner label="در حال بارگذاری شعر…" /></div>;
  if (poem.status === 'error' || !poem.value) return <NotFound text="این شعر پیدا نشد." />;
  return <PoemView poem={poem.value} explainN={nParam ? Number(nParam) : null} />;
}

function PoemView({ poem, explainN }: { poem: Poem; explainN: number | null }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wide = useWide();
  const validN = (x: number | null) => (x && Number.isInteger(x) && x >= 1 && x <= poem.verses.length ? x : null);
  const selected = validN(explainN) ?? validN(Number(params.get('v')));
  const autoRequest = !!(location.state as { request?: boolean } | null)?.request;

  // Record where the reader is; open at the last verse when no verse is given.
  useEffect(() => {
    if (selected) void setProgress(poem.id, selected);
    else
      void getProgress(poem.id).then((p) => {
        if (!p) void setProgress(poem.id, 1);
      });
  }, [poem.id, selected]);

  const select = (n: number) => {
    if (wide) navigate(`/poem/${poem.id}/v/${n}`, { replace: true });
    else navigate({ search: `?v=${n}` }, { replace: true });
  };
  const explain = (n: number) => navigate(`/poem/${poem.id}/v/${n}`, { state: { request: true } });

  if (explainN !== null && !validN(explainN)) return <NotFound text="این بیت در شعر نیست." />;

  if (!wide && explainN) return <ExplainScreen poem={poem} n={explainN} autoRequest={autoRequest} />;

  return (
    <div className={wide ? 'h-dvh flex flex-col' : 'min-h-dvh'}>
      <ReaderHeader poem={poem} />
      <div className={wide ? 'flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-w-6xl w-full mx-auto' : ''}>
        <div className={wide ? 'overflow-y-auto' : ''}>
          <Reader poem={poem} selected={selected} onSelect={select} onExplain={explain} wide={wide} />
        </div>
        {wide && (
          <aside aria-label="توضیح بیت" className="overflow-y-auto border-r border-line/50 px-6 py-8">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-green">توضیح بیت {faOrdinal(selected)}</h2>
                  <div className="flex items-center gap-1">
                    <SaveVerseButton poem={poem} n={selected} />
                    <IconButton icon="xmark" label="بستن توضیح" onClick={() => navigate(`/poem/${poem.id}?v=${selected}`, { replace: true })} />
                  </div>
                </div>
                <Interpretation poem={poem} n={selected} autoRequest={autoRequest} />
                <AskButton poem={poem} n={selected} className="mt-6" />
              </>
            ) : (
              <p className="text-sm text-muted text-center mt-24">برای دیدن معنی، یک بیت را انتخاب کن.</p>
            )}
          </aside>
        )}
      </div>
      {!wide && <ReaderFooter poem={poem} />}
      {wide && <ReaderFooter poem={poem} inline />}
    </div>
  );
}

function ReaderHeader({ poem }: { poem: Poem }) {
  const goBack = useGoBack();
  const menu = useOverlay('menu');
  const source = useOverlay('source');
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const text = poem.verses.map((v) => v.misras.join('\n')).join('\n\n');

  return (
    <>
      <header className="flex items-center px-6 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 border-b border-line/30 shrink-0">
        <IconButton icon="arrow-right" label="برگشت" onClick={() => goBack('/library')} />
        <div className="flex-1 text-center min-w-0 px-2">
          <h1 className="text-base font-bold text-green truncate">{poem.title ?? 'شعر بی‌عنوان'}</h1>
          <p className="text-xs text-muted">{poem.poetName ?? 'شاعر نامشخص'}</p>
        </div>
        <IconButton icon="ellipsis-vertical" label="گزینه‌های شعر" onClick={menu.show} />
      </header>

      <Sheet open={menu.open} onClose={menu.hide} title="گزینه‌ها">
        <div className="flex flex-col">
          <button type="button" className="py-3 text-right flex items-center gap-3" onClick={() => navigate({ search: '?o=source' }, { replace: true, state: { overlay: true } })}>
            <Icon name="circle-info" className="text-muted w-5" />مشاهده منبع متن
          </button>
          <button type="button" className="py-3 text-right flex items-center gap-3" onClick={async () => { toast({ text: (await copyText(text)) ? 'متن شعر کپی شد' : 'کپی ممکن نشد' }); menu.hide(); }}>
            <Icon name="copy" style="regular" className="text-muted w-5" />کپی متن شعر
          </button>
          {poem.origin === 'user' && (
            <button type="button" className="py-3 text-right flex items-center gap-3 text-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" className="w-5" />حذف این شعر
            </button>
          )}
          {confirmDelete && (
            <div className="mt-2 rounded-xl border border-danger/40 p-4 text-sm">
              <p className="leading-relaxed mb-3">این شعر، توضیح‌ها، گفت‌وگوها و ذخیره‌های مربوط به آن برای همیشه از این دستگاه حذف می‌شوند. اگر پشتیبان دارید، از آن قابل بازیابی است.</p>
              <div className="flex gap-3">
                <button type="button" className="flex-1 bg-danger text-card py-2 rounded-xl" onClick={async () => { await deleteUserPoem(poem.id); toast({ text: 'شعر حذف شد' }); navigate('/library', { replace: true }); }}>حذف قطعی</button>
                <button type="button" className="flex-1 border border-line py-2 rounded-xl" onClick={() => setConfirmDelete(false)}>لغو</button>
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={source.open} onClose={source.hide} title="منبع متن">
        <SourceDetails poem={poem} />
      </Sheet>
    </>
  );
}

export function SourceDetails({ poem }: { poem: Poem }) {
  if (poem.origin === 'user' || !poem.source)
    return (
      <p className="text-sm leading-relaxed">
        این متن را خودتان وارد کرده‌اید. منبع، درستی متن و انتساب آن {poem.poetName ? `به «${poem.poetName}»` : ''} بررسی نشده است.
      </p>
    );
  const s = poem.source;
  return (
    <dl className="text-sm space-y-3 leading-relaxed">
      <div><dt className="text-xs text-muted">منبع</dt><dd>{s.name} — {s.fullTitle}</dd></div>
      <div><dt className="text-xs text-muted">نشانی صفحه</dt><dd><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-green underline underline-offset-4 break-all" dir="ltr">{s.url}</a></dd></div>
      <div><dt className="text-xs text-muted">شناسهٔ اثر در گنجور</dt><dd>{faNum(s.ganjoorId)}</dd></div>
      <div><dt className="text-xs text-muted">تاریخ دریافت متن</dt><dd dir="ltr" className="text-right">{s.fetchedAt}</dd></div>
      {poem.note && <div><dt className="text-xs text-muted">یادداشت</dt><dd>{poem.note}</dd></div>}
      <p className="text-xs text-muted pt-2">این منبع فقط برای متن شعر است. توضیح‌های هوشواره از این منبع گرفته نشده‌اند.</p>
    </dl>
  );
}

function Reader({ poem, selected, onSelect, onExplain, wide }: { poem: Poem; selected: number | null; onSelect: (n: number) => void; onExplain: (n: number) => void; wide: boolean }) {
  const source = useOverlay('source');
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  // Bring the selected verse into view when arriving (e.g. "continue reading").
  useEffect(() => {
    if (selected) refs.current[selected - 1]?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poem.id]);

  const onKey = (e: React.KeyboardEvent, n: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selected === n && !wide) onExplain(n);
      else onSelect(n);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(poem.verses.length, Math.max(1, n + (e.key === 'ArrowDown' ? 1 : -1)));
      refs.current[next - 1]?.focus();
      onSelect(next);
    }
  };

  return (
    <main className={`px-6 py-8 ${wide ? 'pb-12' : 'pb-48'} max-w-2xl mx-auto`}>
      {!selected && (
        <div className="bg-card border border-line p-4 rounded-xl mb-8 flex items-center gap-3">
          <Icon name="circle-info" className="text-green" />
          <p className="text-sm font-medium">برای دیدن معنی، یک بیت را انتخاب کن.</p>
        </div>
      )}
      {poem.origin === 'user' && (
        <p className="text-xs text-muted border border-line rounded-xl p-3 mb-6">متن واردشده توسط شما — منبع و انتساب بررسی نشده است.</p>
      )}
      {poem.note && <p className="text-xs text-muted mb-6 leading-relaxed">{poem.note}</p>}

      <div role="listbox" aria-label="بیت‌های شعر" className="space-y-6">
        {poem.verses.map((v) => {
          const isSel = selected === v.n;
          return (
            <div
              key={v.n}
              ref={(el) => { refs.current[v.n - 1] = el; }}
              role="option"
              aria-selected={isSel}
              tabIndex={isSel || (!selected && v.n === 1) ? 0 : -1}
              onClick={() => onSelect(v.n)}
              onKeyDown={(e) => onKey(e, v.n)}
              className={`flex flex-col gap-2 p-4 rounded-xl transition-all cursor-pointer outline-offset-2 ${isSel ? 'bg-selected border-r-[3px] border-green' : 'hover:bg-green/[0.03]'}`}
            >
              <span className="text-xs text-muted mb-1 block">
                <span className="sr-only">بیت </span>{faNum(v.n)}
              </span>
              <div className="flex flex-col gap-2 text-xl leading-relaxed">
                {v.misras.map((m, i) => <span key={i} className="misra">{m}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <button type="button" onClick={source.show} className="text-xs text-muted underline underline-offset-4 decoration-line hover:text-green transition-colors py-2">
          مشاهده منبع متن
        </button>
      </div>

      {!wide && selected && (
        <div className="fixed bottom-24 inset-x-6 z-30 max-w-md mx-auto animate-slide-up">
          <button type="button" onClick={() => onExplain(selected)} className="w-full bg-green text-on-green py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 font-medium transition-transform active:scale-95">
            <Icon name="wand-magic-sparkles" />
            این بیت را توضیح بده
          </button>
        </div>
      )}
    </main>
  );
}

function ReaderFooter({ poem, inline }: { poem: Poem; inline?: boolean }) {
  const saved = useQuery(() => isPoemSaved(poem.id), [poem.id]);
  const toast = useToast();
  const isSaved = saved.status === 'ready' && saved.value;
  const share = async () => {
    const lines = poem.verses.slice(0, 2).map((v) => v.misras.join('\n')).join('\n\n');
    const text = `${lines}\n\n— ${poem.poetName ?? 'شاعر نامشخص'}${poem.source ? `\n${poem.source.url}` : ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: poem.title ?? 'شعر', text });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    toast({ text: (await copyText(text)) ? 'متن برای اشتراک‌گذاری کپی شد' : 'اشتراک‌گذاری ممکن نشد' });
  };
  return (
    <footer className={`${inline ? 'shrink-0' : 'fixed bottom-0 left-0 right-0'} bg-card border-t border-line py-3 px-6 z-10 safe-bottom`}>
      {/* Each action is centred in its own half, with the divider in the middle. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center max-w-2xl mx-auto">
        <button type="button" aria-pressed={!!isSaved} onClick={async () => { await setPoemSaved(poem.id, !isSaved); toast({ text: isSaved ? 'از ذخیره‌ها برداشته شد' : 'شعر ذخیره شد' }); }} className={`justify-self-center flex items-center gap-2 py-2 px-4 transition-colors ${isSaved ? 'text-green' : 'text-muted hover:text-green'}`}>
          <Icon name="bookmark" style={isSaved ? 'solid' : 'regular'} className="text-xl" />
          <span className="text-xs font-medium">{isSaved ? 'ذخیره شده' : 'ذخیره شعر'}</span>
        </button>
        <div className="w-px h-6 bg-line" />
        <button type="button" onClick={share} className="justify-self-center flex items-center gap-2 py-2 px-4 text-muted hover:text-green transition-colors">
          <Icon name="share-nodes" className="text-xl" />
          <span className="text-xs font-medium">اشتراک‌گذاری</span>
        </button>
      </div>
    </footer>
  );
}

export function SaveVerseButton({ poem, n }: { poem: Poem; n: number }) {
  const saved = useQuery(() => isVerseSaved(poem.id, n), [poem.id, n]);
  const toast = useToast();
  const isSaved = saved.status === 'ready' && saved.value;
  return (
    <IconButton
      icon="bookmark"
      style={isSaved ? 'solid' : 'regular'}
      pressed={!!isSaved}
      label={isSaved ? 'برداشتن بیت از ذخیره‌ها' : 'ذخیرهٔ این بیت'}
      className={isSaved ? 'text-green' : ''}
      onClick={async () => { await setVerseSaved(poem.id, n, !isSaved); toast({ text: isSaved ? 'بیت از ذخیره‌ها برداشته شد' : 'بیت ذخیره شد' }); }}
    />
  );
}

function AskButton({ poem, n, className = '' }: { poem: Poem; n: number; className?: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/poem/${poem.id}/v/${n}/chat`)} className={`w-full bg-card border border-green text-green py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 font-medium hover:bg-green hover:text-on-green transition-all ${className}`}>
      <Icon name="comments" style="regular" />
      دربارهٔ این بیت بپرس…
    </button>
  );
}

/** Phone layout of design 03: the explanation fills the screen; the X closes it. */
function ExplainScreen({ poem, n, autoRequest }: { poem: Poem; n: number; autoRequest: boolean }) {
  const goBack = useGoBack();
  const next = poem.verses[n];
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center px-6 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 border-b border-line/30">
        <IconButton icon="xmark" label="بستن توضیح" onClick={() => goBack(`/poem/${poem.id}?v=${n}`)} />
        <div className="flex-1 text-center">
          <h1 className="text-base font-bold text-green">توضیح بیت {faOrdinal(n)}</h1>
          <p className="text-[10px] text-muted mt-0.5">{poem.title ?? 'شعر بی‌عنوان'} · {poem.poetName ?? 'شاعر نامشخص'}</p>
        </div>
        <SaveVerseButton poem={poem} n={n} />
      </header>
      <main className="px-6 py-8 pb-36 max-w-2xl mx-auto">
        <Interpretation poem={poem} n={n} autoRequest={autoRequest} />
        {next && (
          <button type="button" onClick={() => navigate(`/poem/${poem.id}/v/${n + 1}`, { replace: true })} className="block w-full text-right p-4 mt-4 rounded-xl opacity-40 hover:opacity-70 transition-opacity" aria-label={`رفتن به بیت ${faOrdinal(n + 1)}`}>
            <span className="flex flex-col gap-2 text-xl leading-relaxed">{next.misras.map((m, i) => <span key={i} className="misra">{m}</span>)}</span>
          </button>
        )}
      </main>
      <div className="fixed bottom-8 inset-x-6 max-w-2xl mx-auto z-20">
        <AskButton poem={poem} n={n} />
      </div>
    </div>
  );
}
