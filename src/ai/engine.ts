// Direct call from the app to the Anthropic API with the user's own key.
// Loaded lazily, only when the first explanation/chat is requested.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { SYSTEM } from '../../shared/prompts';
import type { ErrorCode } from '../../shared/contract';

export class EngineError extends Error {
  code: ErrorCode | 'aborted';
  constructor(code: EngineError['code']) {
    super(code);
    this.code = code;
  }
}

let cached: { key: string; client: Anthropic } | null = null;
function clientFor(apiKey: string) {
  if (cached?.key !== apiKey) {
    // The key belongs to the person using this device; it is sent only to api.anthropic.com.
    cached = { key: apiKey, client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 60_000, maxRetries: 1 }) };
  }
  return cached.client;
}

function mapError(e: unknown, signal?: AbortSignal): EngineError {
  if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) return new EngineError('aborted');
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new EngineError('upstream_auth');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new EngineError('timeout');
  if (e instanceof Anthropic.RateLimitError) return new EngineError('rate_limited');
  if (e instanceof Anthropic.BadRequestError) {
    console.error('Anthropic bad request', e.message);
    return new EngineError('invalid_request');
  }
  return new EngineError('upstream_unavailable');
}

export async function runModel<T extends z.ZodType>(
  apiKey: string,
  model: string,
  schema: T,
  user: string,
  opts: { maxTokens: number; effort: 'low' | 'medium'; signal?: AbortSignal },
): Promise<{ data: z.infer<T>; model: string; usage: { inputTokens: number; outputTokens: number } }> {
  let msg;
  try {
    msg = await clientFor(apiKey).beta.messages.parse(
      {
        model,
        max_tokens: opts.maxTokens,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        output_config: { format: betaZodOutputFormat(schema), effort: opts.effort },
        // If the model declines for policy reasons, the API retries on its default fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal: opts.signal },
    );
  } catch (e) {
    throw mapError(e, opts.signal);
  }
  const usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
  if (msg.stop_reason === 'refusal') throw Object.assign(new EngineError('refused'), { usage });
  if (msg.stop_reason === 'max_tokens' || !msg.parsed_output) throw Object.assign(new EngineError('invalid_output'), { usage });
  const parsed = schema.safeParse(msg.parsed_output);
  if (!parsed.success) throw Object.assign(new EngineError('invalid_output'), { usage });
  return { data: parsed.data, model: msg.model, usage };
}

/** Checks the key with the free Models endpoint (no tokens are spent). */
export async function checkKey(apiKey: string, model: string): Promise<'ok' | 'bad_key' | 'bad_model' | 'network'> {
  try {
    await clientFor(apiKey).models.retrieve(model);
    return 'ok';
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'bad_key';
    if (e instanceof Anthropic.NotFoundError) return 'bad_model';
    return 'network';
  }
}
