// The light half of the AI client: settings, error messages and consent.
// It loads with the home screen; the request code in `client.ts` (zod schemas,
// prompts, anchoring) loads only when a screen that asks the model opens.
import type { ErrorCode } from '../../shared/contract';
import { getMeta, setMeta } from '../lib/db';
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
export const fail = (code: HooshvareError['code']) => new HooshvareError(code, MESSAGES[code]);

export interface UsageTotals { requests: number; inputTokens: number; outputTokens: number; cachedInputTokens?: number; since: number; day?: string; dayRequests?: number }

// ---- One-time notice before the first request ----

export const hasConsent = async () => (await getMeta<boolean>('aiConsent')) === true;
export const giveConsent = () => setMeta('aiConsent', true);
