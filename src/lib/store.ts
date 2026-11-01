// Reads and writes over the local database, plus a tiny change signal so
// screens re-read after a write (also across tabs).
import { useEffect, useState } from 'react';
import { LIBRARY, libraryPoem, type Poem, type Verse } from '../data/library';
import { versesFingerprint } from '../../shared/text';
import { closeDb, deleteRelaxed, putRelaxed, userPoemToPoem, verseKey, withDb, type ProgressRecord } from './db';

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

/** Deletes a pasted poem and everything attached to it (after the user confirmed). */
export async function deleteUserPoem(id: string) {
  await withDb(async (d) => {
    const tx = d.transaction(['userPoems', 'savedPoems', 'savedVerses', 'analyses', 'progress', 'conversations', 'reflections', 'reports'], 'readwrite');
    await tx.objectStore('userPoems').delete(id);
    await tx.objectStore('savedPoems').delete(id);
    await tx.objectStore('progress').delete(id);
    for (const s of ['savedVerses', 'analyses', 'conversations', 'reflections', 'reports'] as const) {
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
