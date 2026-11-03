import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LIMITS, ModelOutput, type ModelOutputs } from '../../shared/contract';
import { errorMessage, HooshvareError, sendReflection } from '../ai/client';
import { useAiGate } from '../ai/useAi';
import { AiBadge, ErrorBox, Icon, IconButton, LoadError, Spinner, useGoBack, useToast } from '../components/ui';
import type { Poem } from '../data/library';
import { verseKey, withDb, type ReflectionRecord } from '../lib/db';
import { faAgo } from '../lib/format';
import { deleteReflection, getPoem, notifyChange, putReflection, useQuery, verseReflections } from '../lib/store';
import NotFound from './NotFound';

export default function ReflectScreen() {
  const { poemId = '', n = '' } = useParams();
  const poem = useQuery(() => getPoem(poemId), [poemId]);
  if (poem.status === 'loading') return <div className="p-6"><Spinner label="در حال بارگذاری…" /></div>;
  if (poem.status === 'error') return <LoadError />;
  const num = Number(n);
  if (!poem.value || !poem.value.verses[num - 1]) return <NotFound />;
  return <Reflect key={`${poemId}#${num}`} poem={poem.value} n={num} />;
}

function feedbackText(f: ModelOutputs['reflect']) {
  return [f.whatIsRight, ...f.corrections.map((c) => `• ${c}`), f.note].filter(Boolean).join('\n');
}

function Feedback({ fb }: { fb: ModelOutputs['reflect'] }) {
  return (
    <>
      <p>{fb.whatIsRight}</p>
      {fb.defensible && <p className="text-green font-medium">برداشت شما قابل دفاع است، حتی اگر با توضیح هوشواره یکی نباشد.</p>}
      {fb.corrections.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted mb-1">نکته‌هایی برای دقت بیشتر</p>
          <ul className="list-disc pr-4 space-y-1">{fb.corrections.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {fb.note && <p className="text-muted">{fb.note}</p>}
    </>
  );
}

function PastReflections({ items }: { items: ReflectionRecord[] }) {
  const toast = useToast();
  const remove = async (r: ReflectionRecord) => {
    try {
      await deleteReflection(r.id);
    } catch {
      return toast({ text: 'حذف انجام نشد. دوباره امتحان کنید.' });
    }
    toast({ text: 'برداشت حذف شد', action: { label: 'واگرد', run: () => void putReflection(r).catch(() => toast({ text: 'واگرد انجام نشد.' })) } });
  };
  return (
    <section className="mt-10" aria-labelledby="past-title">
      <h2 id="past-title" className="text-sm font-bold text-green mb-3">برداشت‌های قبلی این بیت</h2>
      <ul className="space-y-3">
        {items.map((r) => {
          const fb = ModelOutput.reflect.safeParse(r.feedback);
          return (
            <li key={r.id} className="bg-card border border-line rounded-2xl p-4 text-sm leading-relaxed">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs text-muted pt-3">{faAgo(r.createdAt)}</span>
                <IconButton icon="trash" label="حذف این برداشت" className="text-muted -m-1" onClick={() => void remove(r)} />
              </div>
              <p className="whitespace-pre-line">{r.text}</p>
              {fb.success ? (
                <details className="mt-3">
                  <summary className="text-xs font-bold text-green py-2 cursor-pointer">نظر هوشواره</summary>
                  <div className="space-y-3 mt-2"><Feedback fb={fb.data} /></div>
                </details>
              ) : (
                <p className="text-xs text-muted mt-3">بازخوردی برای این برداشت دریافت نشده است.</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Design 09: an optional exercise. Nothing here blocks reading; there are no scores. */
function Reflect({ poem, n }: { poem: Poem; n: number }) {
  const goBack = useGoBack();
  const navigate = useNavigate();
  const gate = useAiGate();
  const verse = poem.verses[n - 1];
  const past = useQuery(() => verseReflections(poem.id, n), [poem.id, n]);
  const [text, setText] = useState('');
  const [state, setState] = useState<{ s: 'idle' } | { s: 'sending'; ctrl: AbortController } | { s: 'done'; fb: ModelOutputs['reflect']; demo?: boolean } | { s: 'error'; msg: string; needsKey: boolean }>({ s: 'idle' });
  const ctrlRef = useRef<AbortController | null>(null);
  // Sending the same text again (after an error or a cancel) updates one record, not a new one each time.
  const current = useRef<ReflectionRecord | null>(null);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const submit = async () => {
    const written = text.trim();
    if (written.length < 3 || state.s === 'sending') return;
    if (!(await gate())) return;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ s: 'sending', ctrl });
    if (current.current?.text !== written) current.current = { id: crypto.randomUUID(), poemId: poem.id, n, text: written, feedback: null, createdAt: Date.now() };
    const record = current.current;
    // The user's own writing is saved first, whatever happens to the request.
    // The text also stays in the box, so a failed local save loses nothing.
    await putReflection(record).catch(() => {});
    try {
      const { data, demo } = await sendReflection(poem, n, written, ctrl.signal);
      await putReflection({ ...record, feedback: data }).catch(() => {});
      setState({ s: 'done', fb: data, demo });
    } catch (e) {
      if (e instanceof HooshvareError && e.code === 'aborted') setState({ s: 'idle' });
      else setState({ s: 'error', msg: errorMessage(e), needsKey: e instanceof HooshvareError && (e.code === 'no_key' || e.code === 'upstream_auth') });
    }
  };

  const startAnother = () => {
    current.current = null;
    setText('');
    setState({ s: 'idle' });
  };

  const continueInChat = async () => {
    if (state.s !== 'done') return;
    const key = verseKey(poem.id, n);
    const now = Date.now();
    const fb = state.fb;
    const demo = state.demo;
    try {
      await withDb(async (d) => {
        const existing = await d.get('conversations', key);
        const base = existing && existing.textVersion === poem.textVersion ? existing.messages : [];
        await d.put('conversations', {
          key, poemId: poem.id, textVersion: poem.textVersion, n, updatedAt: now,
          messages: [...base, { role: 'user', text: `برداشت من از این بیت:\n${text.trim()}`, at: now }, { role: 'assistant', text: feedbackText(fb), at: now + 1, demo }],
        });
      });
    } catch {
      setState({ s: 'error', msg: 'ذخیرهٔ برداشت در گفت‌وگو ممکن نشد. دوباره امتحان کنید.', needsKey: false });
      return;
    }
    notifyChange();
    navigate(`/poem/${poem.id}/v/${n}/chat`, { replace: true });
  };

  const earlier = past.status === 'ready' ? past.value.filter((r) => r.id !== current.current?.id) : [];

  return (
    <div className="min-h-dvh pb-12">
      <header className="px-4 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 flex items-center justify-between">
        <IconButton icon="xmark" label="بستن" onClick={() => goBack(`/poem/${poem.id}?v=${n}`)} />
        <h1 className="text-sm font-bold text-green">برداشت من</h1>
        <div className="w-11" />
      </header>

      <main className="px-6 pt-6 max-w-2xl mx-auto">
        <div className="bg-card border border-line rounded-3xl p-6 text-center shadow-[0_4px_20px_rgba(33,77,59,0.03)] mb-10">
          <div className="opacity-30 mb-4" aria-hidden="true"><Icon name="quote-right" className="text-2xl text-green" /></div>
          <p className="text-xl text-green font-medium">
            {verse.misras.map((m, i) => <span key={i} className="misra">{m}</span>)}
          </p>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-bold text-green mb-2">شما این بیت را چطور می‌فهمید؟</h2>
          <p className="text-sm text-muted leading-relaxed">
            برداشت خودتان را بنویسید. هوشواره بخش درست آن را نشان می‌دهد و فقط نکته‌های لازم را یادآوری می‌کند. نمره‌ای در کار نیست و این تمرین اختیاری است.
          </p>
        </div>

        {state.s !== 'done' ? (
          <div className="space-y-6">
            <label htmlFor="reflection" className="sr-only">برداشت شما</label>
            <textarea
              id="reflection"
              rows={6}
              value={text}
              maxLength={LIMITS.maxReflectionChars}
              onChange={(e) => setText(e.target.value)}
              placeholder="برداشت خود را اینجا بنویسید..."
              className="w-full bg-card border border-line rounded-2xl py-4 px-6 text-sm focus:outline-none focus:border-green resize-none leading-relaxed shadow-sm"
            />
            {state.s === 'error' && <ErrorBox text={state.msg} onRetry={submit} settingsLink={state.needsKey} />}
            {state.s === 'sending' ? (
              <div className="flex items-center justify-between text-sm text-muted" role="status">
                <span className="flex items-center gap-3"><span className="w-4 h-4 rounded-full border-2 border-line border-t-green animate-spin" aria-hidden="true" />هوشواره در حال خواندن برداشت شماست…</span>
                <button type="button" className="text-green underline underline-offset-4" onClick={() => state.ctrl.abort()}>لغو</button>
              </div>
            ) : (
              <button type="button" disabled={text.trim().length < 3} onClick={submit} className="w-full bg-green text-on-green py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 font-medium transition-transform active:scale-95 disabled:opacity-50">
                ثبت برداشتم و دیدن نظر هوشواره
                <Icon name="wand-magic-sparkles" className="text-sm" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-card border border-line rounded-2xl p-5 text-sm leading-relaxed">
              <p className="text-xs text-muted mb-1">برداشت شما</p>
              <p className="whitespace-pre-line">{text}</p>
            </div>
            <div className="bg-card border border-line rounded-2xl p-5 text-sm leading-relaxed space-y-3">
              <Feedback fb={state.fb} />
              <div className="pt-2 border-t border-line/40"><AiBadge demo={state.demo} /></div>
            </div>
            <button type="button" onClick={continueInChat} className="w-full bg-green text-on-green py-4 rounded-2xl flex items-center justify-center gap-3 font-medium">
              <Icon name="comments" style="regular" />
              ادامه در گفت‌وگو
            </button>
            <button type="button" onClick={startAnother} className="w-full border border-line py-3 rounded-2xl text-sm font-medium">نوشتن برداشت تازه</button>
          </div>
        )}

        <div className="mt-8 text-center">
          <button type="button" onClick={() => goBack(`/poem/${poem.id}?v=${n}`)} className="text-xs text-muted hover:text-green transition-colors py-2">
            {state.s === 'done' ? 'بازگشت به شعر' : 'فعلاً نه، بازگشت به شعر'}
          </button>
        </div>

        {earlier.length > 0 && <PastReflections items={earlier} />}
      </main>
    </div>
  );
}
