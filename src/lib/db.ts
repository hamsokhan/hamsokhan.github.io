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

export function db(): Promise<IDBPDatabase<HamSokhanDB>> {
  // Versioned, additive migrations: never drop a store that older data may live in.
  dbPromise ??= openDB<HamSokhanDB>('hamsokhan', 2, {
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
      // Another tab holds an older version open; it will close on its versionchange.
    },
    blocking() {
      // A newer version was opened elsewhere: let it upgrade, reopen lazily.
      void dbPromise?.then((d) => d.close());
      dbPromise = null;
    },
    terminated() {
      dbPromise = null;
    },
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
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
  return (await (await db()).get('meta', key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await (await db()).put('meta', { key, value });
}
