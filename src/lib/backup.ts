// Versioned JSON export / import of personal data. Import never deletes
// anything: new records are added, and for a record that exists on both sides
// the newer one (by its own timestamp) is kept. API keys never live in the
// browser, so they cannot end up in a backup.
import { z } from 'zod';
import { STORES, withDb, type DataStore, type DB } from './db';

export const BACKUP_APP = 'hamsokhan';
// 2: adds `reports`. Schema-1 files are still accepted (missing stores default to empty).
export const BACKUP_SCHEMA = 2;
const MAX_BYTES = 20 * 1024 * 1024;

const Verse = z.object({ n: z.number().int().min(1), misras: z.array(z.string().max(400)).min(1).max(2) });
const Rec = {
  userPoems: z.object({ id: z.string().startsWith('u-'), title: z.string().nullable(), poet: z.string().nullable(), verses: z.array(Verse).min(1).max(200), textVersion: z.string(), createdAt: z.number() }),
  savedPoems: z.object({ poemId: z.string(), savedAt: z.number() }),
  savedVerses: z.object({ key: z.string(), poemId: z.string(), n: z.number().int(), savedAt: z.number() }),
  analyses: z.object({ key: z.string(), poemId: z.string(), textVersion: z.string(), n: z.number().int(), section: z.enum(['simple', 'words', 'structure', 'grammar', 'devices', 'deeper']), data: z.unknown(), model: z.string(), promptVersion: z.string(), createdAt: z.number(), demo: z.boolean().optional() }),
  progress: z.object({ poemId: z.string(), n: z.number().int(), updatedAt: z.number() }),
  conversations: z.object({
    key: z.string(),
    poemId: z.string(),
    textVersion: z.string(),
    n: z.number().int(),
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string(), at: z.number(), demo: z.boolean().optional(), model: z.string().optional() })),
    updatedAt: z.number(),
  }),
  reflections: z.object({ id: z.string(), poemId: z.string(), n: z.number().int(), text: z.string(), feedback: z.unknown().nullable(), createdAt: z.number() }),
  reports: z.object({ id: z.string(), poemId: z.string(), textVersion: z.string(), n: z.number().int(), section: z.enum(['simple', 'words', 'structure', 'grammar', 'devices', 'deeper']), model: z.string().nullable(), message: z.string(), analysis: z.unknown(), createdAt: z.number() }),
} satisfies Record<DataStore, z.ZodType>;

const BackupSchema = z.object({
  app: z.literal(BACKUP_APP),
  schema: z.number().int(),
  exportedAt: z.string(),
  data: z.object(Object.fromEntries(STORES.map((s) => [s, z.array(Rec[s]).default([])])) as { [K in DataStore]: z.ZodDefault<z.ZodArray<(typeof Rec)[K]>> }),
});
export type Backup = z.infer<typeof BackupSchema>;

const KEY: Record<DataStore, string> = {
  userPoems: 'id', savedPoems: 'poemId', savedVerses: 'key', analyses: 'key', progress: 'poemId', conversations: 'key', reflections: 'id', reports: 'id',
};
const STAMP: Record<DataStore, string> = {
  userPoems: 'createdAt', savedPoems: 'savedAt', savedVerses: 'savedAt', analyses: 'createdAt', progress: 'updatedAt', conversations: 'updatedAt', reflections: 'createdAt', reports: 'createdAt',
};

export async function exportBackup(): Promise<Backup> {
  const data = {} as Record<DataStore, unknown[]>;
  await withDb(async (d) => {
    for (const s of STORES) data[s] = await d.getAll(s);
  }, 30_000);
  return { app: BACKUP_APP, schema: BACKUP_SCHEMA, exportedAt: new Date().toISOString(), data } as Backup;
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; reason: string };

export async function parseBackupFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_BYTES) return { ok: false, reason: 'حجم فایل بیش از حد مجاز (۲۰ مگابایت) است.' };
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return { ok: false, reason: 'فایل JSON معتبر نیست یا آسیب دیده است.' };
  }
  if (typeof json !== 'object' || json === null || (json as { app?: unknown }).app !== BACKUP_APP)
    return { ok: false, reason: 'این فایل پشتیبان هم‌سخن نیست.' };
  const schema = (json as { schema?: unknown }).schema;
  if (typeof schema !== 'number' || schema > BACKUP_SCHEMA)
    return { ok: false, reason: 'این پشتیبان با نسخهٔ تازه‌تری از برنامه ساخته شده است؛ ابتدا برنامه را به‌روز کنید.' };
  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'ساختار بخشی از فایل معتبر نیست؛ هیچ داده‌ای وارد نشد.' };
  return { ok: true, backup: parsed.data };
}

export interface MergePlan { added: number; updated: number; unchanged: number }

/** Computes and (if apply=true) performs the merge in one transaction. */
export async function mergeBackup(backup: Backup, apply: boolean): Promise<MergePlan> {
  // One transaction: either the whole merge is written or none of it.
  return withDb((d) => mergeInto(d, backup, apply), 60_000);
}

async function mergeInto(d: DB, backup: Backup, apply: boolean): Promise<MergePlan> {
  const tx = d.transaction([...STORES], apply ? 'readwrite' : 'readonly');
  const plan: MergePlan = { added: 0, updated: 0, unchanged: 0 };
  for (const s of STORES) {
    // Records are already schema-validated; the generic store type is loosened here.
    const store = tx.objectStore(s) as unknown as { get(k: string): Promise<unknown>; put(v: unknown): Promise<unknown> };
    for (const rec of backup.data[s] as Record<string, unknown>[]) {
      const existing = (await store.get(rec[KEY[s]] as string)) as Record<string, unknown> | undefined;
      if (!existing) {
        plan.added++;
        if (apply) await store.put(rec as never);
      } else if (s === 'conversations') {
        // Conversations are merged message by message so neither side loses turns.
        type M = { role: string; text: string; at: number };
        const seen = new Set((existing.messages as M[]).map((m) => `${m.at}|${m.role}|${m.text}`));
        const extra = (rec.messages as M[]).filter((m) => !seen.has(`${m.at}|${m.role}|${m.text}`));
        if (!extra.length) plan.unchanged++;
        else {
          plan.updated++;
          const messages = [...(existing.messages as M[]), ...extra].sort((a, b) => a.at - b.at);
          if (apply) await store.put({ ...existing, messages, updatedAt: Math.max(existing.updatedAt as number, rec.updatedAt as number) } as never);
        }
      } else if ((rec[STAMP[s]] as number) > (existing[STAMP[s]] as number)) {
        plan.updated++;
        if (apply) await store.put(rec as never);
      } else plan.unchanged++;
    }
  }
  await tx.done;
  return plan;
}
