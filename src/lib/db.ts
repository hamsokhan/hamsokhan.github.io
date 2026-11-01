// Local persistence (IndexedDB). Everything here stays on this device; there is
// no sync. Database and store names are stable identifiers — do not rename them
// together with the product name.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Poem, Verse } from '../data/library';
import type { Section } from '../../shared/contract';

export interface UserPoemRecord {
  id: string;
  title: string | null;
  poet: string | null;
  verses: Verse[];
  textVersion: string;
  createdAt: number;
}
export interface SavedPoemRecord { poemId: string; savedAt: number }
export interface SavedVerseRecord { key: string; poemId: string; n: number; savedAt: number }
export interface AnalysisRecord {
  key: string;
  poemId: string;
  textVersion: string;
  n: number;
  section: Section;
  data: unknown;
  model: string;
  promptVersion: string;
  createdAt: number;
  demo?: boolean;
}
export interface ProgressRecord { poemId: string; n: number; updatedAt: number }
export interface ChatMessage { role: 'user' | 'assistant'; text: string; at: number; demo?: boolean; model?: string }
export interface ConversationRecord { key: string; poemId: string; textVersion: string; n: number; messages: ChatMessage[]; updatedAt: number }
export interface ReflectionRecord {
  id: string;
  poemId: string;
  n: number;
  text: string;
  feedback: unknown | null;
  createdAt: number;
}
export interface ReportRecord {
  id: string;
  poemId: string;
  textVersion: string;
  n: number;
  section: Section;
  model: string | null;
  message: string;
  analysis: unknown;
  createdAt: number;
}
export interface MetaRecord { key: string; value: unknown }

interface HamSokhanDB extends DBSchema {
  userPoems: { key: string; value: UserPoemRecord };
  savedPoems: { key: string; value: SavedPoemRecord };
  savedVerses: { key: string; value: SavedVerseRecord; indexes: { byPoem: string } };
  analyses: { key: string; value: AnalysisRecord; indexes: { byVerse: [string, number] } };
  progress: { key: string; value: ProgressRecord };
  conversations: { key: string; value: ConversationRecord };
  reflections: { key: string; value: ReflectionRecord };
  reports: { key: string; value: ReportRecord };
  meta: { key: string; value: MetaRecord };
}

/** Stores included in backups. `meta` (API key, consent, usage) is deliberately not one of them. */
export const STORES = ['userPoems', 'savedPoems', 'savedVerses', 'analyses', 'progress', 'conversations', 'reflections', 'reports'] as const;
export type DataStore = (typeof STORES)[number];

let dbPromise: Promise<IDBPDatabase<HamSokhanDB>> | null = null;
export type DB = IDBPDatabase<HamSokhanDB>;

/** The database did not answer in time (frozen copy of the app holding a lock, blocked upgrade, …). */
export class DbStuckError extends Error {
  constructor() {
    super('database did not respond');
    this.name = 'DbStuckError';
  }
}

const OPEN_TIMEOUT_MS = 5_000;

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, reject) => (t = setTimeout(() => reject(new DbStuckError()), ms)))]).finally(() => clearTimeout(t));
}

function open(): Promise<DB> {
  // Versioned, additive migrations: never drop a store that older data may live in.
  const opening = openDB<HamSokhanDB>('hamsokhan', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('userPoems', { keyPath: 'id' });
        d.createObjectStore('savedPoems', { keyPath: 'poemId' });
        d.createObjectStore('savedVerses', { keyPath: 'key' }).createIndex('byPoem', 'poemId');
        d.createObjectStore('analyses', { keyPath: 'key' }).createIndex('byVerse', ['poemId', 'n']);
        d.createObjectStore('progress', { keyPath: 'poemId' });
        d.createObjectStore('conversations', { keyPath: 'key' });
        d.createObjectStore('reflections', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) d.createObjectStore('reports', { keyPath: 'id' });
    },
    blocked() {
      // Another copy holds an older version open; the open timeout below turns this into a clear error.
    },
    blocking() {
      // A newer version was opened elsewhere: let it upgrade, reopen lazily.
      closeDb();
    },
    terminated() {
      dbPromise = null;
    },
  });
  // If the open never finishes, close whatever it eventually returns.
  return timeout(opening, OPEN_TIMEOUT_MS).catch((e) => {
    void opening.then((d) => d.close()).catch(() => {});
    throw e;
  });
}

export function db(): Promise<DB> {
  dbPromise ??= open().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/**
 * Closes the connection; the next call reopens it. Called when the app goes to
 * the background: Android freezes hidden apps, and a frozen copy that holds an
 * open transaction would block every read and write of the visible copy.
 */
export function closeDb() {
  const p = dbPromise;
  dbPromise = null;
  void p?.then((d) => d.close()).catch(() => {});
}

const RECOVERABLE = new Set(['InvalidStateError', 'UnknownError', 'DbStuckError', 'TransactionInactiveError']);

/**
 * Every read and write goes through here: it never waits more than `ms`. On a
 * stuck or closed connection it resets the connection; a closed connection (for
 * example closed while the app was in the background) is retried once.
 */
export async function withDb<T>(fn: (d: DB) => Promise<T>, ms = 8_000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await timeout(db().then(fn), ms);
    } catch (e) {
      const name = (e as Error | undefined)?.name ?? '';
      if (!RECOVERABLE.has(name)) throw e;
      closeDb();
      if (name === 'DbStuckError' || attempt >= 1) throw new DbStuckError();
    }
  }
}

/** Small writes (saves, progress, cached explanations) don't need to wait for disk flush. */
export async function putRelaxed<S extends 'savedPoems' | 'savedVerses' | 'progress' | 'analyses' | 'conversations' | 'meta' | 'reports'>(store: S, value: HamSokhanDB[S]['value']) {
  await withDb(async (d) => {
    const tx = d.transaction(store, 'readwrite', { durability: 'relaxed' });
    await tx.store.put(value as never);
    await tx.done;
  });
}
export async function deleteRelaxed(store: 'savedPoems' | 'savedVerses' | 'reports', key: string) {
  await withDb(async (d) => {
    const tx = d.transaction(store, 'readwrite', { durability: 'relaxed' });
    await tx.store.delete(key);
    await tx.done;
  });
}

export const verseKey = (poemId: string, n: number) => `${poemId}#${n}`;

export function userPoemToPoem(r: UserPoemRecord): Poem {
  return {
    id: r.id,
    origin: 'user',
    poetId: null,
    poetName: r.poet,
    title: r.title,
    form: null,
    note: null,
    textVersion: r.textVersion,
    source: null,
    verses: r.verses,
    createdAt: r.createdAt,
  };
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await withDb((d) => d.get('meta', key)))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await putRelaxed('meta', { key, value });
}
