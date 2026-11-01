// The only place the app talks to the Hooshvare server. Every call here is
// started by an explicit user action; nothing runs on page open or verse select.
import { ExplainedSchema, type Explained } from '../../shared/anchor';
import { ModelOutput, PROMPT_VERSION, type ErrorCode, type HooshvareRequestT, type HooshvareResponse, type ModelOutputs, type PoemPayloadT, type ResponseMeta, type Section } from '../../shared/contract';
import type { Poem } from '../data/library';
import { db, getMeta, setMeta, type AnalysisRecord } from '../lib/db';

export const API_URL: string | undefined = import.meta.env.VITE_HOOSHVARE_URL || undefined;
const TIMEOUT_MS = 60_000;

export class HooshvareError extends Error {
  code: ErrorCode | 'offline' | 'network' | 'aborted';
  retryAfterSec?: number;
  constructor(code: HooshvareError['code'], message: string, retryAfterSec?: number) {
    super(message);
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

const MESSAGES: Record<HooshvareError['code'], string> = {
  invalid_request: 'درخواست معتبر نبود. اگر متن خیلی طولانی است، کوتاه‌ترش کنید.',
  rate_limited: 'درخواست‌ها زیاد شده است. کمی بعد دوباره امتحان کنید.',
  quota_exceeded: 'سقف مصرف روزانهٔ هوشواره پر شده است. فردا دوباره در دسترس خواهد بود.',
  not_configured: 'هوشواره هنوز به سرویس هوش مصنوعی وصل نشده است.',
  upstream_auth: 'اعتبارنامهٔ سرویس هوش مصنوعی معتبر نیست. تنظیمات سرور باید بررسی شود.',
  upstream_unavailable: 'سرویس هوش مصنوعی فعلاً پاسخ نمی‌دهد. کمی بعد دوباره امتحان کنید.',
  invalid_output: 'پاسخ دریافتی ساختار درستی نداشت و نمایش داده نشد. می‌توانید دوباره امتحان کنید.',
  refused: 'سرویس به این درخواست پاسخ نداد.',
  timeout: 'پاسخ بیش از حد طول کشید. دوباره امتحان کنید.',
  forbidden_origin: 'این نشانی اجازهٔ استفاده از هوشواره را ندارد.',
  offline: 'اتصال اینترنت برقرار نیست. متن‌ها و توضیح‌های ذخیره‌شده در دسترس‌اند؛ برای توضیح تازه به اینترنت نیاز است.',
  network: 'ارتباط با سرور برقرار نشد. اتصال را بررسی کنید و دوباره امتحان کنید.',
  aborted: 'درخواست لغو شد.',
};
export const errorMessage = (e: unknown) => (e instanceof HooshvareError ? e.message : MESSAGES.network);

export function poemPayload(p: Poem): PoemPayloadT {
  if (p.origin === 'library') return { kind: 'library', id: p.id, textVersion: p.textVersion };
  return { kind: 'user', textVersion: p.textVersion, title: p.title, poet: p.poetName, verses: p.verses.map((v) => v.misras) };
}

async function post(body: HooshvareRequestT, signal?: AbortSignal): Promise<{ data: unknown; meta: ResponseMeta }> {
  if (!API_URL) throw new HooshvareError('not_configured', MESSAGES.not_configured);
  if (!navigator.onLine) throw new HooshvareError('offline', MESSAGES.offline);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    if (signal?.aborted) throw new HooshvareError('aborted', MESSAGES.aborted);
    if (timeout.aborted) throw new HooshvareError('timeout', MESSAGES.timeout);
    throw new HooshvareError(navigator.onLine ? 'network' : 'offline', navigator.onLine ? MESSAGES.network : MESSAGES.offline);
  }
  let json: HooshvareResponse;
  try {
    json = await res.json();
  } catch {
    throw new HooshvareError('upstream_unavailable', MESSAGES.upstream_unavailable);
  }
  if (!json.ok) {
    const code = json.error?.code in MESSAGES ? json.error.code : 'upstream_unavailable';
    throw new HooshvareError(code, MESSAGES[code], json.error?.retryAfterSec);
  }
  await recordUsage(json.meta);
  return json;
}

export interface UsageTotals { requests: number; cached: number; inputTokens: number; outputTokens: number; since: number }

async function recordUsage(meta: ResponseMeta) {
  const u = (await getMeta<UsageTotals>('usage')) ?? { requests: 0, cached: 0, inputTokens: 0, outputTokens: 0, since: Date.now() };
  u.requests++;
  if (meta.cached) u.cached++;
  u.inputTokens += meta.usage?.inputTokens ?? 0;
  u.outputTokens += meta.usage?.outputTokens ?? 0;
  await setMeta('usage', u);
}

// ---- Explanations (cached locally, deduplicated while in flight) ----

export const analysisKey = (p: Poem, n: number, section: Section) => `${p.id}|${p.textVersion}|${n}|${section}|${PROMPT_VERSION}`;

export async function cachedAnalysis(p: Poem, n: number, section: Section): Promise<AnalysisRecord | undefined> {
  const rec = await (await db()).get('analyses', analysisKey(p, n, section));
  if (!rec) return undefined;
  // Re-validate stored data; a record from an incompatible version is ignored, not shown.
  return ExplainedSchema[section].safeParse(rec.data).success ? rec : undefined;
}

const inflight = new Map<string, Promise<AnalysisRecord>>();

export function requestAnalysis(p: Poem, n: number, section: Section, opts: { fresh?: boolean } = {}): Promise<AnalysisRecord> {
  const key = analysisKey(p, n, section);
  const existing = inflight.get(key);
  if (existing) return existing;
  const run = (async () => {
    const { data, meta } = await post({ type: 'explain', poem: poemPayload(p), verse: n, section, fresh: opts.fresh });
    const parsed = ExplainedSchema[section].safeParse(data);
    if (!parsed.success) throw new HooshvareError('invalid_output', MESSAGES.invalid_output);
    const rec: AnalysisRecord = {
      key, poemId: p.id, textVersion: p.textVersion, n, section, data: parsed.data,
      model: meta.model, promptVersion: meta.promptVersion, createdAt: Date.now(), demo: meta.demo,
    };
    await (await db()).put('analyses', rec);
    return rec;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export type SectionData<S extends Section> = Explained[S];

// ---- Chat and reflection (never cached) ----

export async function sendChat(p: Poem, n: number, history: { role: 'user' | 'assistant'; text: string }[], message: string, signal: AbortSignal) {
  const { data, meta } = await post({ type: 'chat', poem: poemPayload(p), verse: n, history, message }, signal);
  const parsed = ModelOutput.chat.safeParse(data);
  if (!parsed.success) throw new HooshvareError('invalid_output', MESSAGES.invalid_output);
  return { ...parsed.data, meta };
}

export async function sendReflection(p: Poem, n: number, reflection: string, signal: AbortSignal): Promise<{ data: ModelOutputs['reflect']; meta: ResponseMeta }> {
  const { data, meta } = await post({ type: 'reflect', poem: poemPayload(p), verse: n, reflection }, signal);
  const parsed = ModelOutput.reflect.safeParse(data);
  if (!parsed.success) throw new HooshvareError('invalid_output', MESSAGES.invalid_output);
  return { data: parsed.data, meta };
}

export async function sendReport(p: Poem, n: number, section: string, model: string | null, analysis: unknown, message: string) {
  await post({
    type: 'report', poemId: p.origin === 'library' ? p.id : 'user-poem', textVersion: p.textVersion, verse: n, section, model, message,
    analysis: JSON.stringify(analysis).slice(0, 12000),
  });
}

// ---- One-time notice before the first request ----

export const hasConsent = async () => (await getMeta<boolean>('aiConsent')) === true;
export const giveConsent = () => setMeta('aiConsent', true);
