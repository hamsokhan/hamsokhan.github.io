// Hooshvare HTTPS function: the only component that holds the Anthropic API key.
// Enforces origin, input size, per-IP and global daily limits, validates model
// output, and anchors word references before anything reaches the app.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { onRequest, type Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { anchorSection } from '../../shared/anchor';
import { HooshvareRequest, ModelOutput, PROMPT_VERSION, type ErrorCode, type HooshvareRequestT, type ResponseMeta, type Section } from '../../shared/contract';
import library from '../../src/data/library.json';
import { CHAT_TASK, poemBlock, REFLECT_TASK, SECTION_TASK, SYSTEM, type PoemContext } from './prompts';

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
// Model and limits are deploy-time parameters (set in functions/.env); raising them is a cost decision.
const MODEL = defineString('HOOSHVARE_MODEL', { default: 'claude-sonnet-5-5' });
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS', { default: 'http://localhost:5173' });
const DAILY_REQUESTS = defineInt('DAILY_REQUEST_CAP', { default: 300 });
const DAILY_OUTPUT_TOKENS = defineInt('DAILY_OUTPUT_TOKEN_CAP', { default: 300_000 });
const IP_PER_HOUR = defineInt('IP_HOURLY_CAP', { default: 30 });
const IP_PER_DAY = defineInt('IP_DAILY_CAP', { default: 120 });

const MAX_BODY_BYTES = 64 * 1024;
const TZ_OFFSET_MS = 3 * 3600_000; // days roll over at midnight Asia/Baghdad (UTC+3, no DST)

class Fail extends Error {
  code: ErrorCode;
  status: number;
  retryAfterSec?: number;
  constructor(code: ErrorCode, status: number, message: string = code, retryAfterSec?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

// ---- Poem lookup: library text comes from the server's own copy, never from the client ----

type LibPoem = (typeof library.poems)[number];
const POET_NAMES: Record<string, string> = { saadi: 'سعدی', hafez: 'حافظ' };

function poemContext(req: Extract<HooshvareRequestT, { poem: unknown }>): { ctx: PoemContext; libraryId: string | null } {
  const p = req.poem;
  if (p.kind === 'library') {
    const lib = library.poems.find((x: LibPoem) => x.id === p.id);
    if (!lib) throw new Fail('invalid_request', 400, 'unknown poem');
    if (lib.textVersion !== p.textVersion) throw new Fail('invalid_request', 400, 'text version mismatch');
    const ctx = { title: lib.title, poet: POET_NAMES[lib.poetId] ?? null, origin: 'library' as const, sourceTitle: lib.source.fullTitle, verses: lib.verses.map((v) => v.misras) };
    if (req.verse > ctx.verses.length) throw new Fail('invalid_request', 400, 'verse out of range');
    return { ctx, libraryId: lib.id };
  }
  if (req.verse > p.verses.length) throw new Fail('invalid_request', 400, 'verse out of range');
  return { ctx: { title: p.title, poet: p.poet, origin: 'user', sourceTitle: null, verses: p.verses }, libraryId: null };
}

// ---- Limits (Firestore counters) ----

const dayKey = (now = Date.now()) => new Date(now + TZ_OFFSET_MS).toISOString().slice(0, 10);
const hourKey = (now = Date.now()) => new Date(now + TZ_OFFSET_MS).toISOString().slice(0, 13);

let saltPromise: Promise<string> | null = null;
function ipSalt(): Promise<string> {
  saltPromise ??= db.runTransaction(async (tx) => {
    const ref = db.doc('hooshvareConfig/ipSalt');
    const snap = await tx.get(ref);
    if (snap.exists) return snap.get('value') as string;
    const value = randomBytes(24).toString('hex');
    tx.set(ref, { value });
    return value;
  });
  return saltPromise;
}

function clientIp(req: Request): string {
  // Behind Google's front end the first X-Forwarded-For entry is the client.
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}

/** Counts this request against the per-IP limits (every request, cached or not). */
async function reserveIp(ipHash: string) {
  const now = Date.now();
  const expireAt = Timestamp.fromMillis(now + 3 * 86400_000);
  const hourRef = db.doc(`hooshvareRate/${ipHash}_${hourKey(now)}`);
  const dayRef = db.doc(`hooshvareRate/${ipHash}_${dayKey(now)}`);
  await db.runTransaction(async (tx) => {
    const [h, d] = await Promise.all([tx.get(hourRef), tx.get(dayRef)]);
    if ((h.get('count') ?? 0) >= IP_PER_HOUR.value()) throw new Fail('rate_limited', 429, 'ip hourly', 3600 - Math.floor((now / 1000) % 3600));
    if ((d.get('count') ?? 0) >= IP_PER_DAY.value()) throw new Fail('rate_limited', 429, 'ip daily');
    tx.set(hourRef, { count: FieldValue.increment(1), expireAt }, { merge: true });
    tx.set(dayRef, { count: FieldValue.increment(1), expireAt }, { merge: true });
  });
}

/** Counts a model call against the global daily caps (applies to all visitors together). */
async function reserveModelCall() {
  const ref = db.doc(`hooshvareUsage/${dayKey()}`);
  await db.runTransaction(async (tx) => {
    const g = await tx.get(ref);
    if ((g.get('requests') ?? 0) >= DAILY_REQUESTS.value()) throw new Fail('quota_exceeded', 429, 'daily requests');
    if ((g.get('outputTokens') ?? 0) >= DAILY_OUTPUT_TOKENS.value()) throw new Fail('quota_exceeded', 429, 'daily tokens');
    tx.set(ref, { requests: FieldValue.increment(1) }, { merge: true });
  });
}

async function recordTokens(model: string, usage: { input_tokens: number; output_tokens: number }) {
  await db.doc(`hooshvareUsage/${dayKey()}`).set(
    { inputTokens: FieldValue.increment(usage.input_tokens), outputTokens: FieldValue.increment(usage.output_tokens), [`byModel.${model.replace(/\W/g, '_')}`]: FieldValue.increment(usage.output_tokens) },
    { merge: true },
  );
}

// ---- Model call ----

let client: Anthropic | null = null;

async function callModel<T extends z.ZodType>(schema: T, user: string, opts: { maxTokens: number; effort: 'low' | 'medium' }) {
  client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), timeout: 50_000, maxRetries: 1 });
  const model = MODEL.value();
  let msg;
  try {
    msg = await client.beta.messages.parse({
      model,
      max_tokens: opts.maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
      output_config: { format: betaZodOutputFormat(schema), effort: opts.effort },
      // Server-side fallback if the model declines for policy reasons.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new Fail('upstream_auth', 502);
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new Fail('timeout', 504);
    if (e instanceof Anthropic.RateLimitError) throw new Fail('upstream_unavailable', 503, 'upstream rate limit', 60);
    if (e instanceof Anthropic.BadRequestError) {
      console.error('anthropic bad request', e.message);
      throw new Fail('upstream_unavailable', 502, 'bad request upstream');
    }
    if (e instanceof Anthropic.APIError) throw new Fail('upstream_unavailable', 503, `upstream ${e.status}`);
    throw e;
  }
  await recordTokens(msg.model, msg.usage);
  const usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
  if (msg.stop_reason === 'refusal') throw new Fail('refused', 422);
  if (msg.stop_reason === 'max_tokens' || !msg.parsed_output) throw new Fail('invalid_output', 502);
  const parsed = schema.safeParse(msg.parsed_output);
  if (!parsed.success) throw new Fail('invalid_output', 502);
  return { data: parsed.data as z.infer<T>, meta: { model: msg.model, promptVersion: PROMPT_VERSION, cached: false, usage } satisfies ResponseMeta };
}

// ---- Handlers ----

async function explain(req: Extract<HooshvareRequestT, { type: 'explain' }>, ipHash: string) {
  const { ctx, libraryId } = poemContext(req);
  const section: Section = req.section;
  // Shared cache only for library poems: pasted text and chats are never cached server-side.
  const cacheRef = libraryId
    ? db.doc(`hooshvareCache/${createHash('sha256').update([libraryId, req.poem.textVersion, req.verse, section, MODEL.value(), PROMPT_VERSION].join('|')).digest('hex')}`)
    : null;
  await reserveIp(ipHash);
  if (cacheRef && !req.fresh) {
    const hit = await cacheRef.get();
    if (hit.exists) return { data: hit.get('data'), meta: { model: hit.get('model'), promptVersion: PROMPT_VERSION, cached: true, usage: { inputTokens: 0, outputTokens: 0 } } };
  }
  await reserveModelCall();

  const user = `${poemBlock(ctx, req.verse)}\n\n<task>\n${SECTION_TASK[section]}\n</task>`;
  const out = await callModel(ModelOutput[section], user, { maxTokens: section === 'simple' ? 2000 : 6000, effort: section === 'simple' ? 'low' : 'medium' });
  const data = anchorSection(section, out.data as never, ctx.verses[req.verse - 1]);
  if (cacheRef) await cacheRef.set({ data, model: out.meta.model, createdAt: FieldValue.serverTimestamp() });
  return { data, meta: out.meta };
}

async function chat(req: Extract<HooshvareRequestT, { type: 'chat' }>, ipHash: string) {
  const { ctx } = poemContext(req);
  await reserveIp(ipHash);
  await reserveModelCall();
  const history = req.history.map((m) => `<${m.role === 'user' ? 'reader' : 'hooshvare'}>${m.text}</${m.role === 'user' ? 'reader' : 'hooshvare'}>`).join('\n');
  const user = `${poemBlock(ctx, req.verse)}\n\n<conversation_so_far>\n${history || '(none)'}\n</conversation_so_far>\n\n<reader_message>\n${req.message}\n</reader_message>\n\n<task>\n${CHAT_TASK}\n</task>`;
  return callModel(ModelOutput.chat, user, { maxTokens: 2000, effort: 'low' });
}

async function reflect(req: Extract<HooshvareRequestT, { type: 'reflect' }>, ipHash: string) {
  const { ctx } = poemContext(req);
  await reserveIp(ipHash);
  await reserveModelCall();
  const user = `${poemBlock(ctx, req.verse)}\n\n<reflection>\n${req.reflection}\n</reflection>\n\n<task>\n${REFLECT_TASK}\n</task>`;
  return callModel(ModelOutput.reflect, user, { maxTokens: 2000, effort: 'low' });
}

async function report(req: Extract<HooshvareRequestT, { type: 'report' }>, ipHash: string) {
  await reserveIp(ipHash);
  await db.collection('hooshvareReports').add({ ...req, createdAt: FieldValue.serverTimestamp(), status: 'new' });
  return { data: { received: true }, meta: { model: 'none', promptVersion: PROMPT_VERSION, cached: false, usage: { inputTokens: 0, outputTokens: 0 } } };
}

function sendError(res: Response, f: Fail) {
  if (f.retryAfterSec) res.set('Retry-After', String(f.retryAfterSec));
  res.status(f.status).json({ ok: false, error: { code: f.code, message: f.message, retryAfterSec: f.retryAfterSec } });
}

export const hooshvare = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, maxInstances: 3, memory: '256MiB', cors: false },
  async (req, res) => {
    const origin = req.headers.origin ?? '';
    const allowed = ALLOWED_ORIGINS.value().split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Max-Age', '3600');
    }
    if (req.method === 'OPTIONS') return void res.status(204).end();
    try {
      // Origin checks stop other websites' browsers; the rate limits below are the real cost guard.
      if (!origin || !allowed.includes(origin)) throw new Fail('forbidden_origin', 403);
      if (req.method !== 'POST') throw new Fail('invalid_request', 405);
      if ((req.rawBody?.length ?? 0) > MAX_BODY_BYTES) throw new Fail('invalid_request', 413, 'too large');
      if (!ANTHROPIC_API_KEY.value()) throw new Fail('not_configured', 503);
      const parsed = HooshvareRequest.safeParse(req.body);
      if (!parsed.success) throw new Fail('invalid_request', 400);
      const body = parsed.data;
      const ipHash = createHash('sha256').update(`${await ipSalt()}|${clientIp(req)}`).digest('hex').slice(0, 32);

      const result =
        body.type === 'explain' ? await explain(body, ipHash)
        : body.type === 'chat' ? await chat(body, ipHash)
        : body.type === 'reflect' ? await reflect(body, ipHash)
        : await report(body, ipHash);
      // Metadata only: poem text and messages are never logged.
      console.log(JSON.stringify({ type: body.type, section: body.type === 'explain' ? body.section : undefined, model: result.meta.model, cached: result.meta.cached, usage: result.meta.usage }));
      res.status(200).json({ ok: true, ...result });
    } catch (e) {
      if (e instanceof Fail) return sendError(res, e);
      console.error('hooshvare unexpected error', e instanceof Error ? e.message : e);
      sendError(res, new Fail('upstream_unavailable', 500));
    }
  },
);
