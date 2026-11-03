import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { LIMITS } from '../../shared/contract';
import { errorMessage, HooshvareError, sendChat } from '../ai/client';
import { useAiGate } from '../ai/useAi';
import { copyText, ErrorBox, Icon, IconButton, LoadError, Spinner, useGoBack, useToast } from '../components/ui';
import type { Poem } from '../data/library';
import { putRelaxed, verseKey, withDb, type ChatMessage } from '../lib/db';
import { faNum } from '../lib/format';
import { getPoem, notifyChange, useQuery } from '../lib/store';
import NotFound from './NotFound';

/** `send` goes at once. `fill` needs a word from the reader, so it opens in the box with the cursor at `caret`. */
const SUGGESTED: ({ label: string; send: string } | { label: string; fill: string; caret: number })[] = [
  { label: 'ساده‌تر بگو', send: 'ساده‌تر بگو' },
  { label: 'این واژه اینجا چه معنایی دارد؟', fill: '«» اینجا چه معنایی دارد؟', caret: 1 },
  { label: 'چرا این آرایه است؟', fill: 'چرا «» آرایه است؟', caret: 5 },
  { label: 'برداشت دیگری هم دارد؟', send: 'برداشت دیگری هم دارد؟' },
];

export default function ChatScreen() {
  const { poemId = '', n = '' } = useParams();
  const poem = useQuery(() => getPoem(poemId), [poemId]);
  if (poem.status === 'loading') return <div className="p-6"><Spinner label="در حال بارگذاری…" /></div>;
  if (poem.status === 'error') return <LoadError />;
  const num = Number(n);
  if (!poem.value || !poem.value.verses[num - 1]) return <NotFound />;
  return <Chat key={`${poemId}#${num}`} poem={poem.value} n={num} />;
}

async function loadConversation(p: Poem, n: number): Promise<ChatMessage[]> {
  const rec = await withDb((d) => d.get('conversations', verseKey(p.id, n)));
  // A conversation about an older version of the text is not mixed into this one.
  return rec && rec.textVersion === p.textVersion ? rec.messages : [];
}

async function saveConversation(p: Poem, n: number, messages: ChatMessage[]) {
  await putRelaxed('conversations', { key: verseKey(p.id, n), poemId: p.id, textVersion: p.textVersion, n, messages, updatedAt: Date.now() });
  notifyChange();
}

function Chat({ poem, n }: { poem: Poem; n: number }) {
  const goBack = useGoBack();
  const gate = useAiGate();
  const toast = useToast();
  const verse = poem.verses[n - 1];
  const stored = useQuery(() => loadConversation(poem, n), [poem, n]);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<AbortController | null>(null);
  const [error, setError] = useState<{ text: string; retry: string; needsKey: boolean } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  // Only the first read fills the screen; after that this screen holds the latest messages.
  useEffect(() => {
    if (stored.status === 'ready' && messages === null) setMessages(stored.value);
  }, [stored, messages]);
  useEffect(() => () => pending?.abort(), [pending]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending, error]);
  // The box grows with its text, up to its max height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
    if (caret.current !== null) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [draft]);

  const send = async (text: string) => {
    const message = text.trim().slice(0, LIMITS.maxMessageChars);
    if (!message || pending || !messages) return;
    if (!(await gate())) return;
    setError(null);
    const history = messages.slice(-LIMITS.maxHistory).map((m) => ({ role: m.role, text: m.text }));
    const withUser: ChatMessage[] = [...messages, { role: 'user', text: message, at: Date.now() }];
    setMessages(withUser);
    setDraft('');
    const ctrl = new AbortController();
    setPending(ctrl);
    try {
      const res = await sendChat(poem, n, history, message, ctrl.signal);
      const next: ChatMessage[] = [...withUser, { role: 'assistant', text: res.reply, at: Date.now(), demo: res.demo || undefined, model: res.model }];
      setMessages(next);
      // The answer stays on screen even if storing it fails; the next successful save includes it.
      await saveConversation(poem, n, next).catch(() => toast({ text: 'این پاسخ روی دستگاه ذخیره نشد. پیش از بستن صفحه آن را کپی کنید.' }));
    } catch (e) {
      // The unanswered question is kept in the box so it can be sent again.
      setMessages(messages);
      setDraft(message);
      if (!(e instanceof HooshvareError && e.code === 'aborted')) setError({ text: errorMessage(e), retry: message, needsKey: e instanceof HooshvareError && (e.code === 'no_key' || e.code === 'upstream_auth') });
    } finally {
      setPending(null);
    }
  };

  const fill = (text: string, at: number) => {
    caret.current = at;
    setDraft(text);
    // Focus inside the tap itself, or Android does not open the keyboard.
    inputRef.current?.focus();
  };

  const clear = async () => {
    const before = messages ?? [];
    setMessages([]);
    setError(null);
    try {
      await saveConversation(poem, n, []);
    } catch {
      setMessages(before);
      toast({ text: 'پاک‌کردن انجام نشد. دوباره امتحان کنید.' });
      return;
    }
    toast({
      text: 'این گفت‌وگو پاک شد',
      action: {
        label: 'واگرد',
        run: () => {
          setMessages(before);
          saveConversation(poem, n, before).catch(() => toast({ text: 'واگرد روی دستگاه ذخیره نشد.' }));
        },
      },
    });
  };

  return (
    <div className="flex flex-col h-dvh">
      <header className="flex items-center px-4 py-4 bg-paper/95 backdrop-blur-sm border-b border-line/30 shrink-0">
        <IconButton icon="arrow-right" label="برگشت" onClick={() => goBack(`/poem/${poem.id}/v/${n}`)} />
        <div className="flex-1 text-center">
          <h1 className="text-sm font-bold text-green">گفت‌وگو دربارهٔ بیت</h1>
        </div>
        {messages && messages.length > 0 ? <IconButton icon="trash" label="پاک‌کردن این گفت‌وگو" onClick={() => void clear()} className="text-muted" /> : <div className="w-11" />}
      </header>

      <div className="px-6 py-4 bg-card border-b border-line/30 shrink-0">
        <div className="flex items-start gap-4 max-w-2xl mx-auto">
          <div className="w-1 h-12 bg-green rounded-full shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted mb-1">{poem.poetName ?? 'شاعر نامشخص'} • {poem.title ?? 'بی‌عنوان'} • بیت {faNum(n)}</p>
            <p className="text-sm leading-relaxed font-medium">{verse.misras.join(' / ')}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-6 bg-paper" aria-live="polite">
        <div className="space-y-6 max-w-2xl mx-auto flex flex-col">
          {stored.status === 'loading' && <Spinner label="در حال بارگذاری گفت‌وگو…" />}
          {stored.status === 'error' && messages === null && <LoadError />}
          {messages?.length === 0 && !pending && (
            <div className="text-center leading-relaxed">
              <p className="text-sm text-muted">پرسشی دربارهٔ این بیت بنویسید یا یکی از پیشنهادهای پایین را انتخاب کنید.</p>
              <p className="text-xs text-muted mt-2">این گفت‌وگو فقط دربارهٔ همین بیت است و روی همین دستگاه می‌ماند.</p>
            </div>
          )}
          {messages?.map((m, i) =>
            m.role === 'assistant' ? (
              <div key={i} className="flex flex-col items-start gap-1 max-w-[85%] self-start">
                <div className="bg-card border border-line rounded-[1.25rem_1.25rem_0_1.25rem] px-5 py-4 shadow-[0_2px_12px_rgba(33,77,59,0.03)]">
                  <p className="text-sm leading-relaxed whitespace-pre-line">{m.text}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 mr-2 text-xs text-muted">
                  <span>{m.demo ? 'پاسخ نمونه — هوشوارهٔ واقعی نیست' : 'توضیح هوشواره'}</span>
                  <button type="button" className="py-2 hover:text-green" onClick={() => void copyText(m.text).then((ok) => toast({ text: ok ? 'پاسخ کپی شد' : 'کپی ممکن نشد' }))}>
                    <Icon name="copy" style="regular" className="ml-1" />کپی
                  </button>
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-end gap-2 self-end max-w-[85%]">
                <div className="bg-green text-on-green rounded-[1.25rem_1.25rem_1.25rem_0] px-5 py-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">{m.text}</p>
                </div>
              </div>
            ),
          )}
          {pending && (
            <div className="self-start flex items-center gap-3 text-sm text-muted" role="status">
              <span className="w-4 h-4 rounded-full border-2 border-line border-t-green animate-spin" aria-hidden="true" />
              هوشواره در حال نوشتن پاسخ است…
              <button type="button" className="text-green underline underline-offset-4" onClick={() => pending.abort()}>لغو</button>
            </div>
          )}
          {error && <ErrorBox text={error.text} onRetry={() => void send(error.retry)} settingsLink={error.needsKey} />}
          <div ref={endRef} />
        </div>
      </main>

      <div className="px-6 py-3 bg-paper flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {SUGGESTED.map((s) => (
          <button key={s.label} type="button" disabled={!!pending} onClick={() => ('send' in s ? void send(s.send) : fill(s.fill, s.caret))} className="bg-card border border-line px-4 py-2 rounded-full text-xs text-green whitespace-nowrap hover:border-green hover:bg-paper transition-all disabled:opacity-50">
            {s.label}
          </button>
        ))}
      </div>

      <footer className="px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-card border-t border-line shrink-0">
        <form className="relative max-w-2xl mx-auto" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
          <label htmlFor="chat-input" className="sr-only">پرسش شما</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={LIMITS.maxMessageChars}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // On touch keyboards Enter makes a new line; the send button sends.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder="پرسشت را بنویس..."
            className="block w-full bg-paper border border-line rounded-2xl py-3 pr-4 pl-14 text-sm leading-relaxed focus:outline-none focus:border-green resize-none max-h-32"
          />
          <button type="submit" aria-label="فرستادن" disabled={!draft.trim() || !!pending} className="absolute left-1 bottom-1 w-11 h-11 flex items-center justify-center rounded-xl bg-green text-on-green disabled:opacity-40">
            <Icon name="arrow-up" className="text-xs" />
          </button>
        </form>
      </footer>
    </div>
  );
}
