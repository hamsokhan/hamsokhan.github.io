// Reads and writes over the local database, plus a tiny change signal so
// screens re-read after a write (also across tabs).
import { useEffect, useState } from 'react';
import { LIBRARY, libraryPoem, type Poem, type Verse } from '../data/library';
import { versesFingerprint } from '../../shared/text';
import { db, userPoemToPoem, verseKey, type ProgressRecord } from './db';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hamsokhan-data') : null;
const listeners = new Set<() => void>();
export function notifyChange() {
  listeners.forEach((l) => l());
  channel?.postMessage('change');
}
channel?.addEventListener('message', () => listeners.forEach((l) => l()));

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: unknown };

/** Runs `fn` now and again after every local data change. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const run = () =>
      fn().then(
        (value) => alive && setState({ status: 'ready', value }),
        (error) => alive && setState({ status: 'error', error }),
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
    const r = await (await db()).get('userPoems', id);
    return r ? userPoemToPoem(r) : null;
  }
  return libraryPoem(id);
}

export async function allPoems(): Promise<Poem[]> {
  const user = await (await db()).getAll('userPoems');
  return [...LIBRARY, ...user.sort((a, b) => b.createdAt - a.createdAt).map(userPoemToPoem)];
}

export async function addUserPoem(input: { title: string | null; poet: string | null; verses: Verse[] }): Promise<string> {
  const id = `u-${crypto.randomUUID()}`;
  await (await db()).put('userPoems', { id, ...input, textVersion: versesFingerprint(input.verses), createdAt: Date.now() });
  notifyChange();
  return id;
}

/** Deletes a pasted poem and everything attached to it (after the user confirmed). */
export async function deleteUserPoem(id: string) {
  const d = await db();
  const tx = d.transaction(['userPoems', 'savedPoems', 'savedVerses', 'analyses', 'progress', 'conversations', 'reflections'], 'readwrite');
  await tx.objectStore('userPoems').delete(id);
  await tx.objectStore('savedPoems').delete(id);
  await tx.objectStore('progress').delete(id);
  for (const s of ['savedVerses', 'analyses', 'conversations', 'reflections'] as const) {
    let cur = await tx.objectStore(s).openCursor();
    while (cur) {
      if (cur.value.poemId === id) await cur.delete();
      cur = await cur.continue();
    }
  }
  await tx.done;
  notifyChange();
}

// ---- Saved poems / verses ----

export async function isPoemSaved(id: string) {
  return !!(await (await db()).get('savedPoems', id));
}
export async function setPoemSaved(id: string, saved: boolean, savedAt = Date.now()) {
  const d = await db();
  if (saved) await d.put('savedPoems', { poemId: id, savedAt });
  else await d.delete('savedPoems', id);
  notifyChange();
}
export async function isVerseSaved(poemId: string, n: number) {
  return !!(await (await db()).get('savedVerses', verseKey(poemId, n)));
}
export async function setVerseSaved(poemId: string, n: number, saved: boolean, savedAt = Date.now()) {
  const d = await db();
  if (saved) await d.put('savedVerses', { key: verseKey(poemId, n), poemId, n, savedAt });
  else await d.delete('savedVerses', verseKey(poemId, n));
  notifyChange();
}

export interface SavedVerseView { poem: Poem; n: number; savedAt: number; hasAnalysis: boolean }
export interface SavedPoemView { poem: Poem; savedAt: number }

export async function savedLists(): Promise<{ verses: SavedVerseView[]; poems: SavedPoemView[] }> {
  const d = await db();
  const [sv, sp] = await Promise.all([d.getAll('savedVerses'), d.getAll('savedPoems')]);
  const verses: SavedVerseView[] = [];
  for (const s of sv) {
    const poem = await getPoem(s.poemId);
    if (!poem || !poem.verses[s.n - 1]) continue;
    const analyses = await d.getAllFromIndex('analyses', 'byVerse', [s.poemId, s.n]);
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
  await (await db()).put('progress', { poemId, n, updatedAt: Date.now() });
  notifyChange();
}
export async function getProgress(poemId: string): Promise<ProgressRecord | undefined> {
  return (await db()).get('progress', poemId);
}
export async function lastRead(): Promise<{ poem: Poem; n: number } | null> {
  const all = await (await db()).getAll('progress');
  for (const p of all.sort((a, b) => b.updatedAt - a.updatedAt)) {
    const poem = await getPoem(p.poemId);
    if (poem) return { poem, n: Math.min(p.n, poem.verses.length) };
  }
  return null;
}
