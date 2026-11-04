import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon, IconButton, LoadError, PageHeader, Spinner, useGoBack, useToast } from '../components/ui';
import type { Poem } from '../data/library';
import { faNum } from '../lib/format';
import { coveredAt, firstToPractise, LAST_STAGE, nextToPractise, tokenId } from '../lib/memorize';
import { getPoem, memorizedVerses, setVerseMemorized, useQuery } from '../lib/store';
import { tokenize } from '../../shared/text';
import NotFound from './NotFound';

const STAGES = [
  { name: 'خواندن', hint: 'بیت را چند بار بخوان، بهتر است بلند.' },
  { name: 'یک‌سوم پنهان', hint: 'بیت را با واژه‌های پنهان بگو. اگر واژه‌ای نیامد، روی جای خالی‌اش بزن.' },
  { name: 'دوسوم پنهان', hint: 'حالا فقط چند نشانه مانده. اگر واژه‌ای نیامد، روی جای خالی‌اش بزن.' },
  { name: 'از حفظ', hint: 'همهٔ بیت را از حفظ بگو، بعد واژه‌ها را نشان بده و با گفتهٔ خودت بسنج.' },
];

export default function MemorizeScreen() {
  const { poemId = '' } = useParams();
  const poem = useQuery(() => getPoem(poemId), [poemId]);
  if (poem.status === 'loading') return <div className="p-6"><Spinner label="در حال بارگذاری شعر…" /></div>;
  if (poem.status === 'error') return <LoadError />;
  if (!poem.value) return <NotFound text="این شعر پیدا نشد." />;
  return <Memorize poem={poem.value} />;
}

function Memorize({ poem }: { poem: Poem }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBack();
  const toast = useToast();
  const known = useQuery(() => memorizedVerses(poem), [poem.id, poem.textVersion]);
  const [finished, setFinished] = useState(false);
  const busy = useRef(false);

  const header = (
    <PageHeader
      start={<IconButton icon="arrow-right" label="برگشت" onClick={() => goBack(`/poem/${poem.id}`)} />}
      title="از بر کردن"
      subtitle={<p className="text-xs text-muted truncate">{poem.title ?? 'شعر بی‌عنوان'} · {poem.poetName ?? 'شاعر نامشخص'}</p>}
    />
  );
  if (known.status === 'loading') return <>{header}<div className="p-6"><Spinner label="در حال بارگذاری…" /></div></>;
  if (known.status === 'error') return <>{header}<LoadError /></>;

  const total = poem.verses.length;
  const v = Number(params.get('v'));
  const n = Number.isInteger(v) && v >= 1 && v <= total ? v : firstToPractise(total, known.value);
  const go = (to: number) => navigate({ search: `?v=${to}` }, { replace: true });

  /** The reader says they recalled the verse; there is no automatic check. */
  const recalled = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await setVerseMemorized(poem, n, true);
      const next = nextToPractise(total, new Set(known.value).add(n), n);
      if (next) go(next);
      else setFinished(true);
    } catch {
      toast({ text: 'ذخیره انجام نشد. دوباره امتحان کنید.' });
    } finally {
      busy.current = false;
    }
  };
  const forget = async () => {
    try {
      await setVerseMemorized(poem, n, false);
    } catch {
      toast({ text: 'برداشتن نشان انجام نشد. دوباره امتحان کنید.' });
    }
  };

  if (finished) {
    return (
      <div className="min-h-dvh">
        {header}
        <main className="px-6 py-16 max-w-md mx-auto text-center animate-slide-up">
          <div className="w-16 h-16 bg-green/10 rounded-full flex items-center justify-center text-green mx-auto mb-6">
            <Icon name="brain" className="text-2xl" />
          </div>
          <h2 className="text-lg font-bold text-green mb-2">همهٔ بیت‌ها را از بر کردی</h2>
          <p className="text-sm text-muted leading-relaxed mb-8">حافظه با مرور می‌ماند. چند روز دیگر برگرد و شعر را یک بار از حفظ بگو.</p>
          <div className="flex flex-col gap-3">
            <button type="button" className="min-h-11 bg-green text-on-green rounded-xl px-4 py-3 font-medium" onClick={() => { setFinished(false); go(1); }}>مرور دوباره از بیت اول</button>
            <Link to={`/poem/${poem.id}`} replace state={{ noResume: true }} className="min-h-11 border border-line rounded-xl px-4 py-3 font-medium">برگشت به شعر</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {header}
      <Practice key={n} poem={poem} n={n} isKnown={known.value.has(n)} knownCount={known.value.size} onRecalled={() => void recalled()} onForget={() => void forget()} onGo={go} />
    </div>
  );
}

function Practice({ poem, n, isKnown, knownCount, onRecalled, onForget, onGo }: { poem: Poem; n: number; isKnown: boolean; knownCount: number; onRecalled: () => void; onForget: () => void; onGo: (n: number) => void }) {
  const misras = poem.verses[n - 1].misras;
  // A verse already marked opens as a test of memory, not as a fresh lesson.
  const [stage, setStageRaw] = useState(isKnown ? LAST_STAGE : 0);
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const covered = useMemo(() => coveredAt(misras, stage), [misras, stage]);
  const allShown = [...covered].every((id) => shown.has(id));

  const setStage = (s: number) => {
    setStageRaw(s);
    setShown(new Set());
  };
  const toggleWord = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const stepClass = 'min-w-11 min-h-11 px-1 shrink-0 flex flex-col items-center justify-center gap-1 text-xs text-green disabled:text-line';

  return (
    <>
      <main className="px-4 pt-6 pb-36 max-w-2xl mx-auto">
        <p className="flex items-center justify-between gap-3 text-xs text-muted mb-4 px-1">
          <span>بیت {faNum(n)} از {faNum(poem.verses.length)}</span>
          <span>{faNum(knownCount)} بیت از بر شده</span>
        </p>

        <section aria-label="بیت" className="bg-card border border-line rounded-2xl p-5 sm:p-8 editorial-shadow">
          <div className="flex gap-1 mb-3" aria-hidden="true">
            {STAGES.map((s, i) => <span key={s.name} className={`h-1 flex-1 rounded-full transition-colors ${i <= stage ? 'bg-green' : 'bg-line'}`} />)}
          </div>
          <p role="status" className="text-xs font-bold text-green mb-6">
            <span className="sr-only">مرحلهٔ {faNum(stage + 1)} از {faNum(STAGES.length)}: </span>
            {STAGES[stage].name}
          </p>

          <div className="@container">
            <div className={`flex flex-col gap-3 text-xl @[36rem]:grid @[36rem]:grid-cols-2 @[36rem]:gap-8 ${misras.length === 2 ? '@[36rem]:[&>*:last-child]:text-end' : ''}`}>
              {misras.map((m, mi) => {
                let end = 0;
                return (
                  <span key={mi} className="misra">
                    {tokenize(m).map((t) => {
                      const gap = m.slice(end, t.start);
                      end = t.end;
                      const id = tokenId(mi, t.i);
                      const isCovered = covered.has(id);
                      const isHidden = isCovered && !shown.has(id);
                      return (
                        <span key={t.i}>
                          {gap}
                          {isCovered ? (
                            <button type="button" aria-pressed={!isHidden} aria-label={isHidden ? 'واژهٔ پنهان؛ نشان بده' : `${t.text}؛ دوباره پنهان کن`} onClick={() => toggleWord(id)} className={`recall-word ${isHidden ? 'recall-word-hidden' : ''}`}>
                              {t.text}
                            </button>
                          ) : t.text}
                        </span>
                      );
                    })}
                  </span>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-muted leading-relaxed mt-6">{STAGES[stage].hint}</p>

          <div className="flex flex-wrap gap-x-5 mt-2 text-sm font-medium">
            {stage > 0 && <button type="button" className="min-h-11 text-green underline underline-offset-4" onClick={() => setStage(stage - 1)}>آسان‌تر کن</button>}
            {stage === LAST_STAGE && (
              <button type="button" className="min-h-11 text-green underline underline-offset-4" onClick={() => setShown(allShown ? new Set() : new Set(covered))}>
                {allShown ? 'دوباره پنهان کن' : 'نشان‌دادن همه'}
              </button>
            )}
            {isKnown && <button type="button" className="min-h-11 text-muted underline underline-offset-4 inline-flex items-center gap-2" onClick={onForget}><Icon name="brain" className="text-green" />برداشتن نشان از بر</button>}
          </div>
        </section>

        <p className="text-xs text-muted leading-relaxed mt-4 px-1">نشان «از بر شده» فقط به گفتهٔ خودت است و اپ گفتارت را نمی‌شنود. این تمرین هیچ درخواستی به هوشواره نمی‌فرستد.</p>
      </main>

      <nav aria-label="مرحله‌ها و بیت‌ها" className="fixed bottom-0 inset-x-0 z-20 bg-card border-t border-line px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="@container">
          <div className="flex items-center gap-1 max-w-2xl mx-auto">
            <button type="button" aria-label="بیت قبلی" disabled={n <= 1} onClick={() => onGo(n - 1)} className={stepClass}>
              <Icon name="arrow-right" />
              <span className="hidden @xs:inline" aria-hidden="true">بیت قبلی</span>
            </button>
            {stage < LAST_STAGE ? (
              <button type="button" className="flex-1 min-w-0 min-h-11 bg-green text-on-green rounded-2xl px-3 py-3 font-medium leading-tight flex items-center justify-center gap-2 transition-transform active:scale-95" onClick={() => setStage(stage + 1)}>
                <Icon name="eye-slash" style="regular" />
                پنهان‌کردن بیشتر
              </button>
            ) : (
              <button type="button" className="flex-1 min-w-0 min-h-11 bg-green text-on-green rounded-2xl px-3 py-3 font-medium leading-tight flex items-center justify-center gap-2 transition-transform active:scale-95" onClick={onRecalled}>
                <Icon name="check" />
                {isKnown ? 'هنوز یادم هست' : 'به یادم آمد'}
              </button>
            )}
            <button type="button" aria-label="بیت بعدی" disabled={n >= poem.verses.length} onClick={() => onGo(n + 1)} className={stepClass}>
              <Icon name="arrow-left" />
              <span className="hidden @xs:inline" aria-hidden="true">بیت بعدی</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
