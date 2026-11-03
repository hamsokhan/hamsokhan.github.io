import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BottomNav, Icon, IconButton, LoadError, Spinner, useToast } from '../components/ui';
import type { Section } from '../../shared/contract';
import { searchKey } from '../../shared/text';
import { faAgo, faNum } from '../lib/format';
import { conversationList, deleteAnalyses, deleteConversation, deleteReflection, explainedList, glossary, putConversation, putReflection, reflectionList, restoreAnalyses, savedLists, setPoemSaved, setVerseSaved, useQuery, type GlossaryEntry } from '../lib/store';

const TABS = [
  { id: 'verses', label: 'بیت‌ها' },
  { id: 'poems', label: 'شعرها' },
  { id: 'explained', label: 'توضیح‌ها' },
  { id: 'glossary', label: 'واژه‌نامه' },
  { id: 'chats', label: 'گفت‌وگوها' },
  { id: 'reflections', label: 'برداشت‌ها' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const EMPTY: Record<Tab, { title: string; text: string }> = {
  verses: { title: 'هنوز بیتی ذخیره نکرده‌اید', text: 'در شعرخوان یک بیت را انتخاب کنید و نشان ذخیره را بزنید.' },
  poems: { title: 'هنوز شعری ذخیره نکرده‌اید', text: 'نشان بالای هر شعر آن را اینجا نگه می‌دارد.' },
  explained: { title: 'هنوز توضیحی نگرفته‌اید', text: 'هر توضیحی که بگیرید اینجا می‌ماند و بدون اینترنت هم باز می‌شود.' },
  glossary: { title: 'واژه‌نامهٔ شما هنوز خالی است', text: 'در توضیح هر بیت، بخش «واژه‌ها» را باز کنید. واژه‌ها با معنی‌شان در همان بیت اینجا جمع می‌شوند.' },
  chats: { title: 'هنوز گفت‌وگویی ندارید', text: 'گفت‌وگوهای شما دربارهٔ هر بیت اینجا جمع می‌شوند.' },
  reflections: { title: 'هنوز برداشتی ننوشته‌اید', text: 'برداشت‌هایی که دربارهٔ بیت‌ها می‌نویسید اینجا می‌مانند.' },
};

const SECTION_LABEL: Record<Section, string> = { simple: 'معنی ساده', words: 'واژه‌ها', structure: 'ساختار جمله', grammar: 'دستور زبان', devices: 'آرایه‌ها', deeper: 'برداشت عمیق‌تر' };

/** One row of any list here: label and remove button on top, the openable content below. */
function Card({ label, removeLabel, onRemove, onOpen, children }: { label: string; removeLabel: string; onRemove: () => void; onOpen: () => void; children: ReactNode }) {
  return (
    <li className="bg-card border border-line rounded-[1.25rem] p-5 mb-4">
      <div className="flex justify-between items-center gap-2 mb-2">
        <span className="text-xs text-muted">{label}</span>
        <IconButton icon="xmark" label={removeLabel} className="text-muted -m-2" onClick={onRemove} />
      </div>
      <button type="button" className="text-right w-full" onClick={onOpen}>{children}</button>
    </li>
  );
}

function Stamp({ at, badge }: { at: number; badge?: string | null }) {
  return (
    <span className="flex items-center justify-between gap-2">
      {badge ? <span className="text-xs text-green bg-green/5 px-2 py-0.5 rounded">{badge}</span> : <span />}
      <span className="text-xs text-muted">{faAgo(at)}</span>
    </span>
  );
}

function Empty({ tab }: { tab: Tab }) {
  return (
    <div className="py-16 text-center">
      <div className="w-16 h-16 bg-green/5 rounded-full flex items-center justify-center text-line mx-auto mb-6">
        <Icon name="bookmark" style="regular" className="text-3xl" />
      </div>
      <h3 className="text-base font-bold text-green mb-2">{EMPTY[tab].title}</h3>
      <p className="text-xs text-muted max-w-[240px] mx-auto leading-relaxed mb-5">{EMPTY[tab].text}</p>
      <Link to="/library" className="inline-block bg-green text-on-green px-6 py-3 rounded-xl text-sm font-medium">رفتن به کتابخانه</Link>
      <p className="text-xs text-muted leading-relaxed mt-8">این داده‌ها فقط روی همین دستگاه نگهداری می‌شوند و بدون اینترنت هم در دسترس‌اند؛ همگام‌سازی بین دستگاه‌ها وجود ندارد.</p>
    </div>
  );
}

function Glossary({ entries }: { entries: GlossaryEntry[] }) {
  const [q, setQ] = useState('');
  const key = searchKey(q);
  const shown = key ? entries.filter((e) => searchKey(e.word).includes(key) || e.uses.some((u) => searchKey(u.meaning).includes(key))) : entries;
  return (
    <>
      <p className="text-sm text-muted leading-relaxed mb-4">{faNum(entries.length)} واژه و ترکیب از توضیح‌هایی که گرفته‌اید. هر معنی مخصوص همان بیت است و واژه ممکن است جای دیگر معنای دیگری داشته باشد.</p>
      <label htmlFor="glossary-search" className="sr-only">جست‌وجو در واژه‌نامه</label>
      <input id="glossary-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در واژه یا معنی" className="w-full bg-card border border-line rounded-xl py-3 px-4 text-sm mb-4 focus:outline-none focus:border-green" />
      {shown.length === 0 && <p className="text-sm text-muted text-center py-8">این واژه هنوز در واژه‌نامهٔ شما نیست.</p>}
      <ul>
        {shown.map((e) => (
          <li key={e.word} className="bg-card border border-line rounded-[1.25rem] p-5 mb-4">
            <h3 className="text-lg font-bold text-green mb-2">{e.word}</h3>
            <ul className="space-y-3">
              {e.uses.map((u, i) => (
                <li key={i} className="text-sm leading-relaxed">
                  <p>{u.meaning}</p>
                  {u.note && <p className="text-xs text-muted mt-1">{u.note}</p>}
                  <Link to={`/poem/${u.poem.id}/v/${u.n}`} className="inline-block text-xs text-green underline underline-offset-4 py-2">{u.poem.poetName ?? 'شاعر نامشخص'} · {u.poem.title ?? 'بی‌عنوان'} · بیت {faNum(u.n)}</Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted text-center leading-relaxed">معنی‌ها را هوشواره ساخته و بازبینی انسانی نشده‌اند.</p>
    </>
  );
}

export default function Saved() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'verses';
  const lists = useQuery(savedLists, []);
  const explained = useQuery(explainedList, []);
  const words = useQuery(glossary, []);
  const chats = useQuery(conversationList, []);
  const reflections = useQuery(reflectionList, []);
  const navigate = useNavigate();
  const toast = useToast();

  /** Removes something and offers to put it back; every list here behaves the same way. */
  const removeWithUndo = async (done: string, remove: () => Promise<void>, restore: () => Promise<void>) => {
    try {
      await remove();
    } catch {
      return toast({ text: 'برداشتن انجام نشد. دوباره امتحان کنید.' });
    }
    toast({ text: done, action: { label: 'واگرد', run: () => void restore().catch(() => toast({ text: 'واگرد انجام نشد.' })) } });
  };

  const current = { verses: lists, poems: lists, explained, glossary: words, chats, reflections }[tab];

  return (
    <div className="min-h-dvh pb-28">
      <header className="px-6 pt-6 pb-2 sticky top-0 bg-paper/95 backdrop-blur-sm z-20">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-green mb-4">ذخیره‌ها</h1>
          <div className="flex border-b border-line overflow-x-auto no-scrollbar" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setParams(t.id === 'verses' ? {} : { tab: t.id }, { replace: true })}
                className={`flex-1 shrink-0 whitespace-nowrap px-2 py-3 text-center text-[13px] font-bold border-b-2 transition-all ${tab === t.id ? 'text-green border-green' : 'text-muted border-transparent'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="px-6 pt-6 max-w-3xl mx-auto" role="tabpanel">
        {current.status === 'loading' && <Spinner label="در حال بارگذاری…" />}
        {current.status === 'error' && <LoadError />}

        {tab === 'verses' && lists.status === 'ready' && (lists.value.verses.length === 0 ? <Empty tab={tab} /> : (
          <ul>
            {lists.value.verses.map((s) => (
              <Card
                key={`${s.poem.id}#${s.n}`}
                label={`${s.poem.poetName ?? 'شاعر نامشخص'} · ${s.poem.title ?? 'بی‌عنوان'}`}
                removeLabel="برداشتن از ذخیره‌ها"
                onRemove={() => void removeWithUndo('بیت از ذخیره‌ها برداشته شد', () => setVerseSaved(s.poem.id, s.n, false), () => setVerseSaved(s.poem.id, s.n, true, s.savedAt))}
                onOpen={() => navigate(`/poem/${s.poem.id}/v/${s.n}`)}
              >
                <p className="text-sm leading-relaxed mb-4 font-medium">{s.poem.verses[s.n - 1].misras.join(' / ')}</p>
                <Stamp at={s.savedAt} badge={s.hasAnalysis ? 'دارای توضیح' : null} />
              </Card>
            ))}
          </ul>
        ))}

        {tab === 'poems' && lists.status === 'ready' && (lists.value.poems.length === 0 ? <Empty tab={tab} /> : (
          <ul>
            {lists.value.poems.map((s) => (
              <Card
                key={s.poem.id}
                label={s.poem.poetName ?? 'شاعر نامشخص'}
                removeLabel="برداشتن از ذخیره‌ها"
                onRemove={() => void removeWithUndo('شعر از ذخیره‌ها برداشته شد', () => setPoemSaved(s.poem.id, false), () => setPoemSaved(s.poem.id, true, s.savedAt))}
                onOpen={() => navigate(`/poem/${s.poem.id}`)}
              >
                <p className="text-base font-bold text-green mb-1">{s.poem.title ?? 'بی‌عنوان'}</p>
                <p className="text-sm leading-relaxed mb-4">{s.poem.verses[0].misras.join(' / ')}</p>
                <Stamp at={s.savedAt} />
              </Card>
            ))}
          </ul>
        ))}

        {tab === 'explained' && explained.status === 'ready' && (explained.value.length === 0 ? <Empty tab={tab} /> : (
          <ul>
            {explained.value.map((e) => (
              <Card
                key={`${e.poem.id}#${e.n}`}
                label={`${e.poem.poetName ?? 'شاعر نامشخص'} · ${e.poem.title ?? 'بی‌عنوان'} · بیت ${faNum(e.n)}`}
                removeLabel="حذف توضیح‌های این بیت"
                onRemove={() => void removeWithUndo('توضیح‌های این بیت حذف شد', () => deleteAnalyses(e.records), () => restoreAnalyses(e.records))}
                onOpen={() => navigate(`/poem/${e.poem.id}/v/${e.n}`)}
              >
                <p className="text-sm leading-relaxed mb-3 font-medium">{e.poem.verses[e.n - 1].misras.join(' / ')}</p>
                <p className="flex flex-wrap gap-1 mb-3">
                  {e.sections.map((s) => <span key={s} className="text-xs text-green bg-green/5 px-2 py-0.5 rounded">{SECTION_LABEL[s]}</span>)}
                </p>
                <Stamp at={e.updatedAt} />
              </Card>
            ))}
          </ul>
        ))}

        {tab === 'glossary' && words.status === 'ready' && (words.value.length === 0 ? <Empty tab={tab} /> : <Glossary entries={words.value} />)}

        {tab === 'chats' && chats.status === 'ready' && (chats.value.length === 0 ? <Empty tab={tab} /> : (
          <ul>
            {chats.value.map(({ poem, record }) => (
              <Card
                key={record.key}
                label={`${poem.poetName ?? 'شاعر نامشخص'} · ${poem.title ?? 'بی‌عنوان'} · بیت ${faNum(record.n)}`}
                removeLabel="پاک‌کردن این گفت‌وگو"
                onRemove={() => void removeWithUndo('این گفت‌وگو پاک شد', () => deleteConversation(record.key), () => putConversation(record))}
                onOpen={() => navigate(`/poem/${poem.id}/v/${record.n}/chat`)}
              >
                <p className="text-sm leading-relaxed mb-2 font-medium">{poem.verses[record.n - 1].misras.join(' / ')}</p>
                <p className="text-sm text-muted leading-relaxed mb-3 line-clamp-2">{record.messages[record.messages.length - 1].text}</p>
                <Stamp at={record.updatedAt} badge={`${faNum(record.messages.length)} پیام`} />
              </Card>
            ))}
          </ul>
        ))}

        {tab === 'reflections' && reflections.status === 'ready' && (reflections.value.length === 0 ? <Empty tab={tab} /> : (
          <ul>
            {reflections.value.map(({ poem, record }) => (
              <Card
                key={record.id}
                label={`${poem.poetName ?? 'شاعر نامشخص'} · ${poem.title ?? 'بی‌عنوان'} · بیت ${faNum(record.n)}`}
                removeLabel="حذف این برداشت"
                onRemove={() => void removeWithUndo('برداشت حذف شد', () => deleteReflection(record.id), () => putReflection(record))}
                onOpen={() => navigate(`/poem/${poem.id}/v/${record.n}/reflect`)}
              >
                <p className="text-sm leading-relaxed mb-3 whitespace-pre-line">{record.text}</p>
                <Stamp at={record.createdAt} badge={record.feedback ? 'دارای نظر هوشواره' : null} />
              </Card>
            ))}
          </ul>
        ))}
      </main>
      <BottomNav />
    </div>
  );
}
