import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Interpretation } from '../components/Interpretation';
import { ReadingControls } from '../components/ReadingControls';
import { copyText, Icon, IconButton, LoadError, Sheet, Spinner, useGoBack, useOverlay, useToast } from '../components/ui';
import type { Poem } from '../data/library';
import { faNum, faOrdinal } from '../lib/format';
import { updateSettings, useSettings } from '../lib/settings';
import { deleteUserPoem, getPoem, getProgress, isPoemSaved, isVerseSaved, poemMarks, setPoemSaved, setProgress, setVerseSaved, useQuery, type Loadable, type VerseMarks } from '../lib/store';
import NotFound from './NotFound';

const WIDE = '(min-width: 840px)';
const wideQuery = window.matchMedia(WIDE);
const useWide = () => useSyncExternalStore((cb) => (wideQuery.addEventListener('change', cb), () => wideQuery.removeEventListener('change', cb)), () => wideQuery.matches);

const verseText = (poem: Poem, n: number) => poem.verses[n - 1].misras.join('\n');

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
  if (poem.status === 'error') return <LoadError />;
  if (!poem.value) return <NotFound text="این شعر پیدا نشد." />;
  return <PoemView poem={poem.value} explainN={nParam ? Number(nParam) : null} />;
}

interface NavState { request?: boolean; resumed?: boolean; noResume?: boolean; moved?: boolean; overlay?: boolean }

function PoemView({ poem, explainN }: { poem: Poem; explainN: number | null }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wide = useWide();
  const state = (location.state ?? {}) as NavState;
  const validN = (x: number | null) => (x && Number.isInteger(x) && x >= 1 && x <= poem.verses.length ? x : null);
  const selected = validN(explainN) ?? validN(Number(params.get('v')));
  const marks = useQuery(() => poemMarks(poem), [poem.id, poem.textVersion]);
  const verseMarks = marks.status === 'ready' ? marks.value : {};
  const resumeChecked = useRef(false);

  // Record where the reader is; reopen a poem at the verse they had reached.
  useEffect(() => {
    const mayResume = !resumeChecked.current && !state.noResume && !location.search;
    resumeChecked.current = true;
    // Progress is a convenience: a failed write must never disturb reading.
    if (selected) setProgress(poem.id, selected).catch(() => {});
    else
      getProgress(poem.id)
        .then((p) => {
          if (!p) return setProgress(poem.id, 1);
          if (mayResume && p.n > 1 && p.n <= poem.verses.length) navigate({ search: `?v=${p.n}` }, { replace: true, state: { resumed: true } });
        })
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poem.id, selected]);

  const clearSelection = () => navigate(`/poem/${poem.id}`, { replace: true, state: { noResume: true } });
  const select = (n: number) => {
    updateSettings({ hintSeen: true });
    if (n === selected) clearSelection();
    else if (wide) navigate(`/poem/${poem.id}/v/${n}`, { replace: true });
    else navigate({ search: `?v=${n}` }, { replace: true });
  };
  const explain = (n: number) => navigate(`/poem/${poem.id}/v/${n}`, { state: { request: true } });
  // The request is made once; a reload or a return to this page must not repeat it.
  const requestUsed = () => navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: { ...state, request: undefined } });

  if (explainN !== null && !validN(explainN)) return <NotFound text="این بیت در شعر نیست." />;

  if (!wide && explainN) return <ExplainScreen poem={poem} n={explainN} autoRequest={!!state.request} onRequestUsed={requestUsed} moved={!!state.moved} />;

  return (
    <div className={wide ? 'h-dvh flex flex-col' : 'min-h-dvh'}>
      <ReaderHeader poem={poem} />
      <div className={wide ? 'flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[1200px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] max-w-7xl w-full mx-auto' : ''}>
        <div className={wide ? 'overflow-y-auto' : ''}>
          <Reader poem={poem} selected={selected} marks={verseMarks} resumed={!!state.resumed} onSelect={select} onExplain={explain} wide={wide} />
        </div>
        {wide && (
          <aside aria-label="توضیح بیت" className="overflow-y-auto border-r border-line/50 px-4 py-8">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-green">توضیح بیت {faOrdinal(selected)}</h2>
                  <div className="flex items-center gap-1">
                    <IconButton icon="chevron-right" label="بیت قبلی" disabled={selected <= 1} onClick={() => navigate(`/poem/${poem.id}/v/${selected - 1}`, { replace: true })} />
                    <IconButton icon="chevron-left" label="بیت بعدی" disabled={selected >= poem.verses.length} onClick={() => navigate(`/poem/${poem.id}/v/${selected + 1}`, { replace: true })} />
                    <SaveVerseButton poem={poem} n={selected} />
                    <CopyVerseButton poem={poem} n={selected} />
                    <IconButton icon="xmark" label="بستن توضیح" onClick={clearSelection} />
                  </div>
                </div>
                <Interpretation poem={poem} n={selected} autoRequest={!!state.request} onRequestUsed={requestUsed} />
                <AskButton poem={poem} n={selected} className="mt-6" />
              </>
            ) : (
              <p className="text-sm text-muted text-center mt-24">برای دیدن معنی، یک بیت را انتخاب کن.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function ReaderHeader({ poem }: { poem: Poem }) {
  const goBack = useGoBack();
  const menu = useOverlay('menu');
  const source = useOverlay('source');
  const display = useOverlay('display');
  const navigate = useNavigate();
  const location = useLocation();
  const { n: explainedVerse } = useParams();
  const [params] = useSearchParams();
  const verseParam = explainedVerse ?? params.get('v');
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const text = poem.verses.map((v) => v.misras.join('\n')).join('\n\n');
  const [isSaved, toggleSaved] = useSavedToggle(
    useQuery(() => isPoemSaved(poem.id), [poem.id]),
    (v) => setPoemSaved(poem.id, v),
    { on: 'شعر ذخیره شد', off: 'از ذخیره‌ها برداشته شد' },
  );

  // Swaps the menu for another sheet, keeping the selected verse in the address.
  const openFromMenu = (name: string) => {
    const p = new URLSearchParams(location.search);
    p.set('o', name);
    navigate({ search: p.toString() }, { replace: true, state: { ...(location.state as object), overlay: true } });
  };
  const share = async () => {
    menu.hide();
    const lines = poem.verses.slice(0, 2).map((v) => v.misras.join('\n')).join('\n\n');
    const shared = `${lines}\n\n— ${poem.poetName ?? 'شاعر نامشخص'}${poem.source ? `\n${poem.source.url}` : ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: poem.title ?? 'شعر', text: shared });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    toast({ text: (await copyText(shared)) ? 'متن برای اشتراک‌گذاری کپی شد' : 'اشتراک‌گذاری ممکن نشد' });
  };
  const remove = async () => {
    try {
      await deleteUserPoem(poem.id);
    } catch {
      toast({ text: 'حذف انجام نشد. دوباره امتحان کنید.' });
      return;
    }
    toast({ text: 'شعر حذف شد' });
    navigate('/library', { replace: true });
  };

  return (
    <>
      <header className="flex items-center px-4 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 border-b border-line/30 shrink-0">
        <IconButton icon="arrow-right" label="برگشت" onClick={() => goBack('/library')} />
        <div className="flex-1 text-center min-w-0 px-2">
          <h1 className="text-base font-bold text-green leading-snug">{poem.title ?? 'شعر بی‌عنوان'}</h1>
          <p className="text-xs text-muted">{poem.poetName ?? 'شاعر نامشخص'}</p>
        </div>
        <IconButton icon="bookmark" style={isSaved ? 'solid' : 'regular'} pressed={isSaved} label={isSaved ? 'برداشتن شعر از ذخیره‌ها' : 'ذخیرهٔ این شعر'} className={isSaved ? 'text-green' : ''} onClick={toggleSaved} />
        <IconButton icon="ellipsis-vertical" label="گزینه‌های شعر" onClick={menu.show} />
      </header>

      <Sheet open={menu.open} onClose={menu.hide} title="گزینه‌ها">
        <div className="flex flex-col">
          <button type="button" className="py-3 text-right flex items-center gap-3" onClick={() => openFromMenu('display')}>
            <Icon name="text-height" className="text-muted w-5" />اندازه و فاصلهٔ متن
          </button>
          <Link to={`/poem/${poem.id}/memorize${verseParam ? `?v=${verseParam}` : ''}`} replace className="py-3 text-right flex items-center gap-3">
            <Icon name="brain" className="text-muted w-5" />از بر کردن{verseParam ? ' از همین بیت' : ''}
          </Link>
          <button type="button" className="py-3 text-right flex items-center gap-3" onClick={() => openFromMenu('source')}>
            <Icon name="circle-info" className="text-muted w-5" />مشاهده منبع متن
          </button>
          <button type="button" className="py-3 text-right flex items-center gap-3" onClick={async () => { toast({ text: (await copyText(text)) ? 'متن شعر کپی شد' : 'کپی ممکن نشد' }); menu.hide(); }}>
            <Icon name="copy" style="regular" className="text-muted w-5" />کپی متن شعر
          </button>
          <button type="button" className="py-3 text-right flex items-center gap-3" onClick={() => void share()}>
            <Icon name="share-nodes" className="text-muted w-5" />اشتراک‌گذاری
          </button>
          {poem.origin === 'user' && (
            <>
              <Link to={`/poem/${poem.id}/edit`} replace className="py-3 text-right flex items-center gap-3">
                <Icon name="pen" className="text-muted w-5" />ویرایش این شعر
              </Link>
              <button type="button" className="py-3 text-right flex items-center gap-3 text-danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" className="w-5" />حذف این شعر
              </button>
            </>
          )}
          {confirmDelete && (
            <div className="mt-2 rounded-xl border border-danger/40 p-4 text-sm">
              <p className="leading-relaxed mb-3">این شعر، توضیح‌ها، گفت‌وگوها و ذخیره‌های مربوط به آن برای همیشه از این دستگاه حذف می‌شوند. اگر پشتیبان دارید، از آن قابل بازیابی است.</p>
              <div className="flex gap-3">
                <button type="button" className="flex-1 bg-danger text-card py-2 rounded-xl" onClick={() => void remove()}>حذف قطعی</button>
                <button type="button" className="flex-1 border border-line py-2 rounded-xl" onClick={() => setConfirmDelete(false)}>لغو</button>
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={source.open} onClose={source.hide} title="منبع متن">
        <SourceDetails poem={poem} />
      </Sheet>

      <Sheet open={display.open} onClose={display.hide} title="اندازه و فاصلهٔ متن">
        <ReadingControls />
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

/** Icon plus hidden text, so a mark is not carried by colour or shape alone. */
function VerseMarkIcons({ marks }: { marks?: VerseMarks }) {
  if (!marks) return null;
  return (
    <>
      {marks.explained && <span title="دارای توضیح"><Icon name="wand-magic-sparkles" className="text-green" /><span className="sr-only">دارای توضیح</span></span>}
      {marks.saved && <span title="ذخیره‌شده"><Icon name="bookmark" className="text-green" /><span className="sr-only">ذخیره‌شده</span></span>}
      {marks.memorized && <span title="از بر شده"><Icon name="brain" className="text-green" /><span className="sr-only">از بر شده</span></span>}
      {marks.chat && <span title="دارای گفت‌وگو"><Icon name="comments" style="regular" className="text-green" /><span className="sr-only">دارای گفت‌وگو</span></span>}
    </>
  );
}

function Reader({ poem, selected, marks, resumed, onSelect, onExplain, wide }: { poem: Poem; selected: number | null; marks: Record<number, VerseMarks>; resumed: boolean; onSelect: (n: number) => void; onExplain: (n: number) => void; wide: boolean }) {
  const source = useOverlay('source');
  const { hintSeen } = useSettings();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const knownCount = Object.values(marks).filter((m) => m.memorized).length;

  // Bring the selected verse into view when arriving (e.g. "continue reading").
  useEffect(() => {
    if (selected) refs.current[selected - 1]?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poem.id, resumed]);

  const onKey = (e: React.KeyboardEvent, n: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selected === n && !wide) onExplain(n);
      else onSelect(n);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(poem.verses.length, Math.max(1, n + (e.key === 'ArrowDown' ? 1 : -1)));
      refs.current[next - 1]?.focus();
      if (next !== selected) onSelect(next);
    }
  };

  return (
    <main className={`px-6 py-8 ${wide ? 'pb-12' : 'pb-32'} max-w-3xl mx-auto`}>
      {!selected && !hintSeen && (
        <div className="bg-card border border-line p-4 rounded-xl mb-8 flex items-center gap-3">
          <Icon name="circle-info" className="text-green" />
          <p className="text-sm font-medium">برای دیدن معنی، یک بیت را انتخاب کن.</p>
        </div>
      )}
      {poem.origin === 'user' && (
        <p className="text-xs text-muted border border-line rounded-xl p-3 mb-6">متن واردشده توسط شما — منبع و انتساب بررسی نشده است.</p>
      )}
      {poem.note && <p className="text-xs text-muted mb-6 leading-relaxed">{poem.note}</p>}

      <div role="listbox" aria-label="بیت‌های شعر" className="space-y-6 @container">
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
              <span className="text-xs text-muted mb-1 flex items-center gap-2">
                <span><span className="sr-only">بیت </span>{faNum(v.n)}</span>
                <VerseMarkIcons marks={marks[v.n]} />
              </span>
              <div className={`flex flex-col gap-2 text-xl @[44rem]:grid @[44rem]:grid-cols-2 @[44rem]:gap-8 ${v.misras.length === 2 ? '@[44rem]:[&>*:last-child]:text-end' : ''}`}>
                {v.misras.map((m, i) => <span key={i} className="misra">{m}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <Link to={`/poem/${poem.id}/memorize`} className="inline-flex min-h-11 items-center justify-center gap-2 border border-green text-green rounded-2xl px-4 py-2 mb-4 text-sm font-medium leading-tight hover:bg-green hover:text-on-green transition-all">
          <Icon name="brain" />
          از بر کردن این شعر
          {knownCount > 0 && <span className="text-xs">({faNum(knownCount)} از {faNum(poem.verses.length)})</span>}
        </Link>
        <br />
        <button type="button" onClick={source.show} className="text-xs text-muted underline underline-offset-4 decoration-line hover:text-green transition-colors py-2">
          مشاهده منبع متن
        </button>
      </div>

      {!wide && selected && (
        <div role="toolbar" aria-label={`کارهای بیت ${faOrdinal(selected)}`} className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] inset-x-4 z-30 max-w-md mx-auto bg-card border border-line rounded-2xl shadow-xl p-2 flex flex-wrap items-center justify-center gap-1 animate-slide-up">
          <button type="button" onClick={() => onExplain(selected)} className="flex-[1_1_9rem] min-h-11 bg-green text-on-green px-3 py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-medium leading-tight transition-transform active:scale-95">
            <Icon name="wand-magic-sparkles" />
            {marks[selected]?.simple ? 'دیدن توضیح' : 'این بیت را توضیح بده'}
          </button>
          <span className="flex shrink-0 items-center gap-1">
            <SaveVerseButton poem={poem} n={selected} />
            <CopyVerseButton poem={poem} n={selected} />
            <AskIconButton poem={poem} n={selected} />
          </span>
        </div>
      )}
    </main>
  );
}

/**
 * Save toggle that changes on screen at once, saves in the background, ignores
 * taps while a save is running, and reverts with a message if the save fails.
 */
function useSavedToggle(query: Loadable<boolean>, write: (v: boolean) => Promise<void>, msg: { on: string; off: string }): [boolean, () => void] {
  const toast = useToast();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const busy = useRef(false);
  const actual = query.status === 'ready' && query.value;
  useEffect(() => {
    if (optimistic !== null && actual === optimistic) setOptimistic(null);
  }, [actual, optimistic]);
  const value = optimistic ?? actual;
  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !value;
    setOptimistic(next);
    try {
      await write(next);
      toast({ text: next ? msg.on : msg.off });
    } catch {
      setOptimistic(null);
      toast({ text: 'ذخیره انجام نشد. دوباره امتحان کنید.' });
    } finally {
      busy.current = false;
    }
  };
  return [value, () => void toggle()];
}

export function SaveVerseButton({ poem, n }: { poem: Poem; n: number }) {
  const [isSaved, toggle] = useSavedToggle(
    useQuery(() => isVerseSaved(poem.id, n), [poem.id, n]),
    (v) => setVerseSaved(poem.id, n, v),
    { on: 'بیت ذخیره شد', off: 'بیت از ذخیره‌ها برداشته شد' },
  );
  return (
    <IconButton
      icon="bookmark"
      style={isSaved ? 'solid' : 'regular'}
      pressed={!!isSaved}
      label={isSaved ? 'برداشتن بیت از ذخیره‌ها' : 'ذخیرهٔ این بیت'}
      className={isSaved ? 'text-green' : ''}
      onClick={toggle}
    />
  );
}

function CopyVerseButton({ poem, n }: { poem: Poem; n: number }) {
  const toast = useToast();
  return <IconButton icon="copy" style="regular" label="کپی این بیت" onClick={() => void copyText(verseText(poem, n)).then((ok) => toast({ text: ok ? 'بیت کپی شد' : 'کپی ممکن نشد' }))} />;
}

function AskIconButton({ poem, n }: { poem: Poem; n: number }) {
  const navigate = useNavigate();
  return <IconButton icon="comments" style="regular" label="دربارهٔ این بیت بپرس" onClick={() => navigate(`/poem/${poem.id}/v/${n}/chat`)} />;
}

function AskButton({ poem, n, className = '' }: { poem: Poem; n: number; className?: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/poem/${poem.id}/v/${n}/chat`)} className={`w-full min-h-11 bg-card border border-green text-green px-3 py-3 rounded-2xl flex items-center justify-center gap-3 font-medium leading-tight hover:bg-green hover:text-on-green transition-all ${className}`}>
      <Icon name="comments" style="regular" />
      دربارهٔ این بیت بپرس…
    </button>
  );
}

/** Phone layout of design 03: the explanation fills the screen; the X closes it. */
function ExplainScreen({ poem, n, autoRequest, onRequestUsed, moved }: { poem: Poem; n: number; autoRequest: boolean; onRequestUsed: () => void; moved: boolean }) {
  const goBack = useGoBack();
  const navigate = useNavigate();
  const go = (to: number) => navigate(`/poem/${poem.id}/v/${to}`, { replace: true, state: { moved: true } });
  // After moving between verses, the entry below this one still points at the earlier verse.
  const close = () => (moved ? navigate(`/poem/${poem.id}?v=${n}`, { replace: true }) : goBack(`/poem/${poem.id}?v=${n}`));
  const stepClass = 'min-w-11 min-h-11 px-1 shrink-0 flex flex-col items-center justify-center gap-1 text-xs text-green disabled:text-line';
  return (
    <div className="min-h-dvh">
      <header className="flex items-center px-4 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 border-b border-line/30">
        <IconButton icon="xmark" label="بستن توضیح" onClick={close} />
        <div className="flex-1 text-center min-w-0 px-1">
          <h1 className="text-base font-bold text-green">توضیح بیت {faOrdinal(n)}</h1>
          <p className="text-xs text-muted mt-0.5 truncate">{poem.title ?? 'شعر بی‌عنوان'} · {poem.poetName ?? 'شاعر نامشخص'}</p>
        </div>
        <SaveVerseButton poem={poem} n={n} />
      </header>
      <main className="px-4 pt-6 pb-32 max-w-2xl mx-auto">
        <Interpretation poem={poem} n={n} autoRequest={autoRequest} onRequestUsed={onRequestUsed} verseAction={<CopyVerseButton poem={poem} n={n} />} />
      </main>
      <nav aria-label="رفتن بین بیت‌ها" className="fixed bottom-0 inset-x-0 z-20 bg-card border-t border-line px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {/* With large text the two step buttons lose their words so the row still fits; the name stays for screen readers. */}
        <div className="@container">
        <div className="flex items-center gap-1 max-w-2xl mx-auto">
          <button type="button" aria-label="بیت قبلی" disabled={n <= 1} onClick={() => go(n - 1)} className={stepClass}>
            <Icon name="arrow-right" />
            <span className="hidden @xs:inline" aria-hidden="true">بیت قبلی</span>
          </button>
          <AskButton poem={poem} n={n} className="flex-1 min-w-0" />
          <button type="button" aria-label="بیت بعدی" disabled={n >= poem.verses.length} onClick={() => go(n + 1)} className={stepClass}>
            <Icon name="arrow-left" />
            <span className="hidden @xs:inline" aria-hidden="true">بیت بعدی</span>
          </button>
        </div>
        </div>
      </nav>
    </div>
  );
}
