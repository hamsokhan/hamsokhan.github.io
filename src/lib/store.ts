// Reads and writes over the local database, plus a tiny change signal so
// screens re-read after a write (also across tabs).
import { useEffect, useState } from 'react';
import { ExplainedSchema } from '../../shared/anchor';
import { PROMPT_VERSION, type Section } from '../../shared/contract';
import { LIBRARY, libraryPoem, type Poem, type Verse } from '../data/library';
import { searchKey, versesFingerprint } from '../../shared/text';
import { closeDb, deleteRelaxed, putRelaxed, userPoemToPoem, verseKey, withDb, type AnalysisRecord, type ConversationRecord, type ProgressRecord, type ReflectionRecord } from './db';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hamsokhan-data') : null;
const listeners = new Set<() => void>();
export function notifyChange() {
  listeners.forEach((l) => l());
  channel?.postMessage('change');
}
/** Re-runs every open query in this tab (e.g. the «try again» button). */
export const retryQueries = () => listeners.forEach((l) => l());
channel?.addEventListener('message', retryQueries);

// Android freezes an app soon after it goes to the background. A frozen copy
// holding the database open can stall the visible copy, so the connection is
// closed when hidden and the screen re-reads with a fresh one when shown again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') closeDb();
  else retryQueries();
});
window.addEventListener('pagehide', closeDb);
document.addEventListener('freeze', closeDb);

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: unknown };

/** Runs `fn` now and again after every local data change. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const run = () =>
      fn().then(
        (value) => alive && setState({ status: 'ready', value }),
        // A failed re-read keeps what is already on screen; only a first load shows the error.
        (error) => alive && setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', error })),
      );
    run();
    listeners.add(run);
    return () => {
      alive = false;
      listeners.delete(run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export async function getPoem(id: string): Promise<Poem | null> {
  if (id.startsWith('u-')) {
    const r = await withDb((d) => d.get('userPoems', id));
    return r ? userPoemToPoem(r) : null;
  }
  return libraryPoem(id);
}

export async function allPoems(): Promise<Poem[]> {
  const user = await withDb((d) => d.getAll('userPoems'));
  return [...LIBRARY, ...user.sort((a, b) => b.createdAt - a.createdAt).map(userPoemToPoem)];
}

export async function addUserPoem(input: { title: string | null; poet: string | null; verses: Verse[] }): Promise<string> {
  const id = `u-${crypto.randomUUID()}`;
  await withDb((d) => d.put('userPoems', { id, ...input, textVersion: versesFingerprint(input.verses), createdAt: Date.now() }));
  notifyChange();
  return id;
}

/**
 * Edits a pasted poem. Records tied to the old text stay on the device but are no
 * longer shown, because they are matched by textVersion. `createdAt` moves forward
 * because backup merging keeps whichever copy of a poem has the later value.
 */
export async function updateUserPoem(id: string, input: { title: string | null; poet: string | null; verses: Verse[] }) {
  await withDb(async (d) => {
    const tx = d.transaction('userPoems', 'readwrite');
    const prev = await tx.store.get(id);
    if (!prev) throw new Error('poem not found');
    await tx.store.put({ ...prev, ...input, textVersion: versesFingerprint(input.verses), createdAt: Date.now() });
    await tx.done;
  });
  notifyChange();
}

/** Deletes a pasted poem and everything attached to it (after the user confirmed). */
export async function deleteUserPoem(id: string) {
  await withDb(async (d) => {
    const tx = d.transaction(['userPoems', 'savedPoems', 'savedVerses', 'analyses', 'progress', 'conversations', 'reflections', 'reports', 'memorized'], 'readwrite');
    await tx.objectStore('userPoems').delete(id);
    await tx.objectStore('savedPoems').delete(id);
    await tx.objectStore('progress').delete(id);
    for (const s of ['savedVerses', 'analyses', 'conversations', 'reflections', 'reports', 'memorized'] as const) {
      let cur = await tx.objectStore(s).openCursor();
      while (cur) {
        if (cur.value.poemId === id) await cur.delete();
        cur = await cur.continue();
      }
    }
    await tx.done;
  }, 15_000);
  notifyChange();
}

// ---- Saved poems / verses ----

export async function isPoemSaved(id: string) {
  return !!(await withDb((d) => d.get('savedPoems', id)));
}
export async function setPoemSaved(id: string, saved: boolean, savedAt = Date.now()) {
  if (saved) await putRelaxed('savedPoems', { poemId: id, savedAt });
  else await deleteRelaxed('savedPoems', id);
  notifyChange();
}
export async function isVerseSaved(poemId: string, n: number) {
  return !!(await withDb((d) => d.get('savedVerses', verseKey(poemId, n))));
}
export async function setVerseSaved(poemId: string, n: number, saved: boolean, savedAt = Date.now()) {
  if (saved) await putRelaxed('savedVerses', { key: verseKey(poemId, n), poemId, n, savedAt });
  else await deleteRelaxed('savedVerses', verseKey(poemId, n));
  notifyChange();
}

export interface SavedVerseView { poem: Poem; n: number; savedAt: number; hasAnalysis: boolean }
export interface SavedPoemView { poem: Poem; savedAt: number }

export async function savedLists(): Promise<{ verses: SavedVerseView[]; poems: SavedPoemView[] }> {
  const [sv, sp] = await withDb((d) => Promise.all([d.getAll('savedVerses'), d.getAll('savedPoems')]));
  const verses: SavedVerseView[] = [];
  for (const s of sv) {
    const poem = await getPoem(s.poemId);
    if (!poem || !poem.verses[s.n - 1]) continue;
    const analyses = await withDb((d) => d.getAllFromIndex('analyses', 'byVerse', [s.poemId, s.n]));
    verses.push({ poem, n: s.n, savedAt: s.savedAt, hasAnalysis: analyses.some((a) => a.textVersion === poem.textVersion) });
  }
  const poems: SavedPoemView[] = [];
  for (const s of sp) {
    const poem = await getPoem(s.poemId);
    if (poem) poems.push({ poem, savedAt: s.savedAt });
  }
  return { verses: verses.sort((a, b) => b.savedAt - a.savedAt), poems: poems.sort((a, b) => b.savedAt - a.savedAt) };
}

// ---- Reading progress ----

export async function setProgress(poemId: string, n: number) {
  await putRelaxed('progress', { poemId, n, updatedAt: Date.now() });
  notifyChange();
}
export async function getProgress(poemId: string): Promise<ProgressRecord | undefined> {
  return withDb((d) => d.get('progress', poemId));
}
export async function lastRead(): Promise<{ poem: Poem; n: number } | null> {
  const all = await withDb((d) => d.getAll('progress'));
  for (const p of all.sort((a, b) => b.updatedAt - a.updatedAt)) {
    const poem = await getPoem(p.poemId);
    if (poem) return { poem, n: Math.min(p.n, poem.verses.length) };
  }
  return null;
}

// ---- Verses known by heart ----

/** Verse numbers marked as memorised for the poem's current text. */
export async function memorizedVerses(poem: Poem): Promise<Set<number>> {
  const all = await withDb((d) => d.getAll('memorized'));
  return new Set(all.filter((m) => m.poemId === poem.id && m.textVersion === poem.textVersion && poem.verses[m.n - 1]).map((m) => m.n));
}
export async function setVerseMemorized(poem: Poem, n: number, known: boolean) {
  const key = verseKey(poem.id, n);
  if (known) await putRelaxed('memorized', { key, poemId: poem.id, textVersion: poem.textVersion, n, memorizedAt: Date.now() });
  else await deleteRelaxed('memorized', key);
  notifyChange();
}

// ---- What the reader has done with a poem, for the marks next to verses and poems ----

const isCurrent = (a: AnalysisRecord, p: Poem) => a.textVersion === p.textVersion && a.promptVersion === PROMPT_VERSION;

export interface VerseMarks { saved: boolean; explained: boolean; simple: boolean; chat: boolean; memorized: boolean }

export async function poemMarks(poem: Poem): Promise<Record<number, VerseMarks>> {
  const [saved, analyses, convos, known] = await withDb((d) => Promise.all([d.getAllFromIndex('savedVerses', 'byPoem', poem.id), d.getAll('analyses'), d.getAll('conversations'), memorizedVerses(poem)]));
  const marks: Record<number, VerseMarks> = {};
  const of = (n: number) => (marks[n] ??= { saved: false, explained: false, simple: false, chat: false, memorized: false });
  for (const s of saved) of(s.n).saved = true;
  for (const n of known) of(n).memorized = true;
  for (const a of analyses) {
    if (a.poemId !== poem.id || !isCurrent(a, poem)) continue;
    of(a.n).explained = true;
    if (a.section === 'simple') of(a.n).simple = true;
  }
  for (const c of convos) {
    if (c.poemId === poem.id && c.textVersion === poem.textVersion && c.messages.length > 0) of(c.n).chat = true;
  }
  return marks;
}

export async function libraryMarks(): Promise<{ saved: Set<string>; progress: Map<string, number> }> {
  const [saved, progress] = await withDb((d) => Promise.all([d.getAll('savedPoems'), d.getAll('progress')]));
  return { saved: new Set(saved.map((s) => s.poemId)), progress: new Map(progress.map((p) => [p.poemId, p.n])) };
}

// ---- Explanations, conversations and reflections, for reviewing them in one place ----

export interface ExplainedView { poem: Poem; n: number; sections: Section[]; records: AnalysisRecord[]; updatedAt: number }
export interface ConversationView { poem: Poem; record: ConversationRecord }
export interface ReflectionView { poem: Poem; record: ReflectionRecord }

export async function explainedList(): Promise<ExplainedView[]> {
  const all = await withDb((d) => d.getAll('analyses'));
  const groups = new Map<string, ExplainedView>();
  for (const a of all) {
    const poem = await getPoem(a.poemId);
    if (!poem || !poem.verses[a.n - 1] || !isCurrent(a, poem)) continue;
    const key = verseKey(a.poemId, a.n);
    const g = groups.get(key) ?? { poem, n: a.n, sections: [], records: [], updatedAt: 0 };
    g.sections.push(a.section);
    g.records.push(a);
    g.updatedAt = Math.max(g.updatedAt, a.createdAt);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface GlossaryUse { poem: Poem; n: number; meaning: string; note: string | null }
export interface GlossaryEntry { word: string; uses: GlossaryUse[] }

/**
 * Every word the reader has had explained, built only from stored explanations.
 * The same word in two verses stays one entry with both meanings, because the
 * meaning in each verse is the point: it is not a dictionary definition.
 */
export async function glossary(): Promise<GlossaryEntry[]> {
  const all = await withDb((d) => d.getAll('analyses'));
  const entries = new Map<string, GlossaryEntry>();
  for (const a of all) {
    if (a.section !== 'words') continue;
    const poem = await getPoem(a.poemId);
    if (!poem || !poem.verses[a.n - 1] || !isCurrent(a, poem)) continue;
    const parsed = ExplainedSchema.words.safeParse(a.data);
    if (!parsed.success) continue;
    for (const item of parsed.data.items) {
      const key = searchKey(item.ref.quote);
      if (!key) continue;
      const entry = entries.get(key) ?? { word: item.ref.quote, uses: [] };
      entry.uses.push({ poem, n: a.n, meaning: item.meaningHere, note: item.note });
      entries.set(key, entry);
    }
  }
  return [...entries.values()].sort((x, y) => x.word.localeCompare(y.word, 'fa'));
}

export async function deleteAnalyses(records: AnalysisRecord[]) {
  await withDb(async (d) => {
    const tx = d.transaction('analyses', 'readwrite');
    await Promise.all(records.map((r) => tx.store.delete(r.key)));
    await tx.done;
  });
  notifyChange();
}
export async function restoreAnalyses(records: AnalysisRecord[]) {
  await withDb(async (d) => {
    const tx = d.transaction('analyses', 'readwrite');
    await Promise.all(records.map((r) => tx.store.put(r)));
    await tx.done;
  });
  notifyChange();
}

export async function conversationList(): Promise<ConversationView[]> {
  const all = await withDb((d) => d.getAll('conversations'));
  const out: ConversationView[] = [];
  for (const record of all) {
    const poem = await getPoem(record.poemId);
    if (poem && poem.verses[record.n - 1] && record.textVersion === poem.textVersion && record.messages.length > 0) out.push({ poem, record });
  }
  return out.sort((a, b) => b.record.updatedAt - a.record.updatedAt);
}
export async function deleteConversation(key: string) {
  await deleteRelaxed('conversations', key);
  notifyChange();
}
export async function putConversation(record: ConversationRecord) {
  await putRelaxed('conversations', record);
  notifyChange();
}

export async function reflectionList(): Promise<ReflectionView[]> {
  const all = await withDb((d) => d.getAll('reflections'));
  const out: ReflectionView[] = [];
  for (const record of all) {
    const poem = await getPoem(record.poemId);
    if (poem && poem.verses[record.n - 1]) out.push({ poem, record });
  }
  return out.sort((a, b) => b.record.createdAt - a.record.createdAt);
}
export async function verseReflections(poemId: string, n: number): Promise<ReflectionRecord[]> {
  const all = await withDb((d) => d.getAll('reflections'));
  return all.filter((r) => r.poemId === poemId && r.n === n).sort((a, b) => b.createdAt - a.createdAt);
}
export async function putReflection(record: ReflectionRecord) {
  await putRelaxed('reflections', record);
  notifyChange();
}
export async function deleteReflection(id: string) {
  await deleteRelaxed('reflections', id);
  notifyChange();
}
