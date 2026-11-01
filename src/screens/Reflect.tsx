import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LIMITS, type ModelOutputs } from '../../shared/contract';
import { errorMessage, HooshvareError, sendReflection } from '../ai/client';
import { useAiGate } from '../ai/useAi';
import { AiBadge, ErrorBox, Icon, IconButton, useGoBack } from '../components/ui';
import type { Poem } from '../data/library';
import { db, verseKey } from '../lib/db';
import { getPoem, notifyChange, useQuery } from '../lib/store';
import NotFound from './NotFound';

export default function ReflectScreen() {
  const { poemId = '', n = '' } = useParams();
  const poem = useQuery(() => getPoem(poemId), [poemId]);
  if (poem.status === 'loading') return null;
  const num = Number(n);
  if (poem.status === 'error' || !poem.value || !poem.value.verses[num - 1]) return <NotFound />;
  return <Reflect key={`${poemId}#${num}`} poem={poem.value} n={num} />;
}

function feedbackText(f: ModelOutputs['reflect']) {
  return [f.whatIsRight, ...f.corrections.map((c) => `• ${c}`), f.note].filter(Boolean).join('\n');
}

/** Design 09: an optional exercise. Nothing here blocks reading; there are no scores. */
function Reflect({ poem, n }: { poem: Poem; n: number }) {
  const goBack = useGoBack();
  const navigate = useNavigate();
  const gate = useAiGate();
  const verse = poem.verses[n - 1];
  const [text, setText] = useState('');
  const [state, setState] = useState<{ s: 'idle' } | { s: 'sending'; ctrl: AbortController } | { s: 'done'; fb: ModelOutputs['reflect']; demo?: boolean } | { s: 'error'; msg: string }>({ s: 'idle' });
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const submit = async () => {
    if (text.trim().length < 3 || state.s === 'sending') return;
    if (!(await gate())) return;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ s: 'sending', ctrl });
    const id = crypto.randomUUID();
    // The user's own writing is saved first, whatever happens to the request.
    await (await db()).put('reflections', { id, poemId: poem.id, n, text: text.trim(), feedback: null, createdAt: Date.now() });
    try {
      const { data, meta } = await sendReflection(poem, n, text.trim(), ctrl.signal);
      const d = await db();
      const rec = await d.get('reflections', id);
      if (rec) await d.put('reflections', { ...rec, feedback: data });
      notifyChange();
      setState({ s: 'done', fb: data, demo: meta.demo });
    } catch (e) {
      if (e instanceof HooshvareError && e.code === 'aborted') setState({ s: 'idle' });
      else setState({ s: 'error', msg: errorMessage(e) });
    }
  };

  const continueInChat = async () => {
    if (state.s !== 'done') return;
    const d = await db();
    const key = verseKey(poem.id, n);
    const existing = await d.get('conversations', key);
    const base = existing && existing.textVersion === poem.textVersion ? existing.messages : [];
    const now = Date.now();
    await d.put('conversations', {
      key, poemId: poem.id, textVersion: poem.textVersion, n, updatedAt: now,
      messages: [...base, { role: 'user', text: `برداشت من از این بیت:\n${text.trim()}`, at: now }, { role: 'assistant', text: feedbackText(state.fb), at: now + 1, demo: state.demo }],
    });
    notifyChange();
    navigate(`/poem/${poem.id}/v/${n}/chat`, { replace: true });
  };

  return (
    <div className="min-h-dvh pb-12">
      <header className="px-6 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 flex items-center justify-between">
        <IconButton icon="xmark" label="بستن" onClick={() => goBack(`/poem/${poem.id}?v=${n}`)} />
        <h1 className="text-sm font-bold text-green">برداشت من</h1>
        <div className="w-11" />
      </header>

      <main className="px-6 pt-6 max-w-2xl mx-auto">
        <div className="bg-card border border-line rounded-3xl p-8 text-center shadow-[0_4px_20px_rgba(33,77,59,0.03)] mb-10">
          <div className="opacity-30 mb-4" aria-hidden="true"><Icon name="quote-right" className="text-2xl text-green" /></div>
          <p className="text-xl leading-relaxed text-green font-medium">
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
            {state.s === 'error' && <ErrorBox text={state.msg} onRetry={submit} />}
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
              <p>{state.fb.whatIsRight}</p>
              {state.fb.defensible && <p className="text-green font-medium">برداشت شما قابل دفاع است، حتی اگر با توضیح هوشواره یکی نباشد.</p>}
              {state.fb.corrections.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted mb-1">نکته‌هایی برای دقت بیشتر</p>
                  <ul className="list-disc pr-4 space-y-1">{state.fb.corrections.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}
              {state.fb.note && <p className="text-muted">{state.fb.note}</p>}
              <div className="pt-2 border-t border-line/40"><AiBadge demo={state.demo} /></div>
            </div>
            <button type="button" onClick={continueInChat} className="w-full bg-green text-on-green py-4 rounded-2xl flex items-center justify-center gap-3 font-medium">
              <Icon name="comments" style="regular" />
              ادامه در گفت‌وگو
            </button>
          </div>
        )}

        <div className="mt-8 text-center">
          <button type="button" onClick={() => goBack(`/poem/${poem.id}?v=${n}`)} className="text-xs text-muted hover:text-green transition-colors py-2">
            {state.s === 'done' ? 'بازگشت به شعر' : 'فعلاً نه، بازگشت به شعر'}
          </button>
        </div>
      </main>
    </div>
  );
}
