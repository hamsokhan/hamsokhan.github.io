// The only place the app asks the model for anything. Every call here is
// started by an explicit user action; nothing runs on page open or verse select.
// The API key is the user's own, kept on this device only (never in backups).
import { anchorSection, ExplainedSchema, type Explained } from '../../shared/anchor';
import { LIMITS, ModelOutput, PROMPT_VERSION, type ErrorCode, type ModelOutputs, type Section } from '../../shared/contract';
import { CHAT_TASK, poemBlock, REFLECT_TASK, SECTION_TASK, type PoemContext } from '../../shared/prompts';
import type { Poem } from '../data/library';
import { getMeta, putRelaxed, setMeta, withDb, type AnalysisRecord } from '../lib/db';
import { notifyChange } from '../lib/store';

export const MOCK = import.meta.env.DEV && import.meta.env.VITE_HOOSHVARE_MOCK === '1';

export const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'پیشنهادی؛ کیفیت بهتر برای تحلیل' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'بسیار ارزان‌تر؛ کیفیتش برای فارسی سنجیده نشده' },
] as const;
export const DAILY_CAPS = [30, 60, 120, 250] as const;

export interface AiSettings { apiKey: string | null; model: string; dailyCap: number }
const DEFAULT_AI: AiSettings = { apiKey: null, model: MODELS[0].id, dailyCap: 60 };

export async function getAiSettings(): Promise<AiSettings> {
  return { ...DEFAULT_AI, ...(await getMeta<Partial<AiSettings>>('ai')) };
}
export async function setAiSettings(patch: Partial<AiSettings>) {
  await setMeta('ai', { ...(await getAiSettings()), ...patch });
  notifyChange();
}

export class HooshvareError extends Error {
  code: ErrorCode | 'offline' | 'network' | 'aborted' | 'no_key' | 'stale';
  constructor(code: HooshvareError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const MESSAGES: Record<HooshvareError['code'], string> = {
  no_key: 'هوشواره هنوز کلید API ندارد. کلید Claude را در «تنظیمات» وارد کنید.',
  not_configured: 'هوشواره هنوز کلید API ندارد. کلید Claude را در «تنظیمات» وارد کنید.',
  invalid_request: 'درخواست پذیرفته نشد. اگر متن خیلی طولانی است، کوتاه‌ترش کنید؛ اگر مدل را عوض کرده‌اید، مدل دیگری را امتحان کنید.',
  rate_limited: 'سرویس Claude فعلاً درخواست‌های بیشتری نمی‌پذیرد. کمی بعد دوباره امتحان کنید.',
  quota_exceeded: 'سقف روزانه‌ای که در تنظیمات گذاشته‌اید پر شده است. فردا دوباره در دسترس است، یا سقف را در تنظیمات بالا ببرید.',
  upstream_auth: 'کلید API پذیرفته نشد. کلید را در «تنظیمات» بررسی کنید.',
  upstream_unavailable: 'سرویس Claude فعلاً پاسخ نمی‌دهد. کمی بعد دوباره امتحان کنید.',
  invalid_output: 'پاسخ دریافتی ساختار درستی نداشت و نمایش داده نشد. می‌توانید دوباره امتحان کنید.',
  refused: 'مدل به این درخواست پاسخ نداد.',
  timeout: 'پاسخ بیش از حد طول کشید. دوباره امتحان کنید.',
  forbidden_origin: 'دسترسی پذیرفته نشد.',
  offline: 'اتصال اینترنت برقرار نیست. متن‌ها و توضیح‌های ذخیره‌شده در دسترس‌اند؛ برای توضیح تازه به اینترنت نیاز است.',
  network: 'ارتباط با سرویس برقرار نشد. اتصال را بررسی کنید و دوباره امتحان کنید.',
  aborted: 'درخواست لغو شد.',
  stale: 'نسخهٔ تازهٔ اپ رسیده است. صفحه را یک بار تازه کنید (یا اپ را ببندید و باز کنید).',
};
export const errorMessage = (e: unknown) => (e instanceof HooshvareError ? e.message : MESSAGES.network);
const fail = (code: HooshvareError['code']) => new HooshvareError(code, MESSAGES[code]);

// ---- Usage and the daily cap (counted on this device) ----

export interface UsageTotals { requests: number; inputTokens: number; outputTokens: number; since: number; day?: string; dayRequests?: number }
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Asia/Baghdad day

async function reserveCall(cap: number) {
  const u = (await getMeta<UsageTotals>('usage')) ?? { requests: 0, inputTokens: 0, outputTokens: 0, since: Date.now() };
  if (u.day !== today()) Object.assign(u, { day: today(), dayRequests: 0 });
  if ((u.dayRequests ?? 0) >= cap) throw fail('quota_exceeded');
  u.dayRequests = (u.dayRequests ?? 0) + 1;
  u.requests++;
  await setMeta('usage', u);
}
async function recordTokens(usage: { inputTokens: number; outputTokens: number } | undefined) {
  if (!usage) return;
  const u = await getMeta<UsageTotals>('usage');
  if (!u) return;
  u.inputTokens += usage.inputTokens;
  u.outputTokens += usage.outputTokens;
  await setMeta('usage', u);
}

// ---- The single path every model call takes ----

function context(p: Poem): PoemContext {
  return {
    title: p.title,
    poet: p.poetName,
    origin: p.origin,
    sourceTitle: p.source?.fullTitle ?? null,
    verses: p.verses.slice(0, LIMITS.maxVerses).map((v) => v.misras),
  };
}

async function call<K extends keyof typeof ModelOutput>(kind: K, user: string, opts: { maxTokens: number; effort: 'low' | 'medium'; signal?: AbortSignal; mock: () => Promise<unknown> }) {
  const ai = await getAiSettings();
  if (!MOCK && !ai.apiKey) throw fail('no_key');
  if (!MOCK && !navigator.onLine) throw fail('offline');
  await reserveCall(ai.dailyCap);
  let engine: typeof import('./engine');
  try {
    engine = await import('./engine');
  } catch {
    // After an update the old page may ask for a file the new release replaced.
    throw fail('stale');
  }
  try {
    if (MOCK) return { data: ModelOutput[kind].parse(await opts.mock()) as ModelOutputs[K], model: 'mock', demo: true };
    const out = await engine.runModel(ai.apiKey!, ai.model, ModelOutput[kind], user, opts);
    await recordTokens(out.usage);
    return { data: out.data as ModelOutputs[K], model: out.model, demo: false };
  } catch (e) {
    if (e instanceof engine.EngineError) {
      await recordTokens((e as { usage?: { inputTokens: number; outputTokens: number } }).usage);
      throw fail(e.code === 'upstream_unavailable' && !navigator.onLine ? 'offline' : e.code);
    }
    throw fail('network');
  }
}

// ---- Explanations (cached locally, deduplicated while in flight) ----

export const analysisKey = (p: Poem, n: number, section: Section) => `${p.id}|${p.textVersion}|${n}|${section}|${PROMPT_VERSION}`;

export async function cachedAnalysis(p: Poem, n: number, section: Section): Promise<AnalysisRecord | undefined> {
  // Short limit: if the database is stuck, show the request button rather than wait.
  const rec = await withDb((d) => d.get('analyses', analysisKey(p, n, section)), 3_000);
  if (!rec) return undefined;
  // Re-validate stored data; a record from an incompatible version is ignored, not shown.
  return ExplainedSchema[section].safeParse(rec.data).success ? rec : undefined;
}

const inflight = new Map<string, Promise<AnalysisRecord>>();

export function requestAnalysis(p: Poem, n: number, section: Section): Promise<AnalysisRecord> {
  const key = analysisKey(p, n, section);
  const existing = inflight.get(key);
  if (existing) return existing;
  const run = (async () => {
    const misras = p.verses[n - 1].misras;
    const user = `${poemBlock(context(p), n)}\n\n<task>\n${SECTION_TASK[section]}\n</task>`;
    const out = await call(section, user, {
      maxTokens: section === 'simple' ? 2000 : 6000,
      effort: section === 'simple' ? 'low' : 'medium',
      mock: async () => (await import('./mock')).mockSection(section, misras),
    });
    const data = anchorSection(section, out.data as never, misras);
    if (!ExplainedSchema[section].safeParse(data).success) throw fail('invalid_output');
    const rec: AnalysisRecord = { key, poemId: p.id, textVersion: p.textVersion, n, section, data, model: out.model, promptVersion: PROMPT_VERSION, createdAt: Date.now(), demo: out.demo || undefined };
    await putRelaxed('analyses', rec);
    notifyChange();
    return rec;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export type SectionData<S extends Section> = Explained[S];

// ---- Chat and reflection (never cached) ----

export async function sendChat(p: Poem, n: number, history: { role: 'user' | 'assistant'; text: string }[], message: string, signal: AbortSignal) {
  const tag = (r: string) => (r === 'user' ? 'reader' : 'hooshvare');
  const convo = history.slice(-LIMITS.maxHistory).map((m) => `<${tag(m.role)}>${m.text}</${tag(m.role)}>`).join('\n');
  const user = `${poemBlock(context(p), n)}\n\n<conversation_so_far>\n${convo || '(none)'}\n</conversation_so_far>\n\n<reader_message>\n${message.slice(0, LIMITS.maxMessageChars)}\n</reader_message>\n\n<task>\n${CHAT_TASK}\n</task>`;
  const out = await call('chat', user, { maxTokens: 2000, effort: 'low', signal, mock: async () => (await import('./mock')).mockChat(message, signal) });
  return { ...out.data, model: out.model, demo: out.demo };
}

export async function sendReflection(p: Poem, n: number, reflection: string, signal: AbortSignal) {
  const user = `${poemBlock(context(p), n)}\n\n<reflection>\n${reflection.slice(0, LIMITS.maxReflectionChars)}\n</reflection>\n\n<task>\n${REFLECT_TASK}\n</task>`;
  const out = await call('reflect', user, { maxTokens: 2000, effort: 'low', signal, mock: async () => (await import('./mock')).mockReflect(signal) });
  return { data: out.data, model: out.model, demo: out.demo };
}

// ---- Issue reports: kept on this device, exportable with the backup ----

export async function saveReport(p: Poem, n: number, section: Section, model: string | null, analysis: unknown, message: string) {
  await putRelaxed('reports', {
    id: crypto.randomUUID(), poemId: p.id, textVersion: p.textVersion, n, section, model, message: message.slice(0, LIMITS.maxReportChars), analysis, createdAt: Date.now(),
  });
  notifyChange();
}

// ---- One-time notice before the first request ----

export const hasConsent = async () => (await getMeta<boolean>('aiConsent')) === true;
export const giveConsent = () => setMeta('aiConsent', true);
