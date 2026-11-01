// Contract for Hooshvare output. Model output is validated against these
// schemas, anchored to the original text, and validated again before it is
// stored or displayed.
import { z } from 'zod';

export const PROMPT_VERSION = 'p1';

export const SECTIONS = ['simple', 'words', 'structure', 'grammar', 'devices', 'deeper'] as const;
export type Section = (typeof SECTIONS)[number];

export const LIMITS = {
  maxVerses: 40,
  maxMisraChars: 200,
  maxTitleChars: 120,
  maxMessageChars: 800,
  maxHistory: 8,
  maxReflectionChars: 1500,
  maxReportChars: 600,
} as const;

// ---- What the model returns (also the stored shape before anchoring) ----

const Ref = z.object({
  misra: z.number().int().describe('0 = first misra, 1 = second misra'),
  from: z.number().int().describe('index of first token'),
  to: z.number().int().describe('index of last token (inclusive)'),
  quote: z.string().describe('exact words of the original text covered by from..to'),
});

export const ModelOutput = {
  simple: z.object({
    meaning: z.string(),
    feeling: z.string().nullable(),
    textNotes: z.array(z.string()),
    unsure: z.boolean(),
  }),
  words: z.object({
    items: z.array(
      z.object({
        ref: Ref,
        meaningHere: z.string(),
        note: z.string().nullable(),
        alternatives: z.array(z.object({ meaning: z.string(), why: z.string() })),
      }),
    ),
  }),
  structure: z.object({
    prose: z.string().describe('the verse in ordinary sentence order; implied words inside [ ]'),
    additions: z.array(z.object({ text: z.string(), why: z.string() })),
    note: z.string().nullable(),
  }),
  grammar: z.object({
    rows: z.array(
      z.object({
        ref: Ref,
        type: z.string().describe('نوع واژه یا گروه'),
        role: z.string().describe('نقش در جمله'),
        why: z.string(),
        certain: z.boolean(),
      }),
    ),
    note: z.string().nullable(),
  }),
  devices: z.object({
    items: z.array(z.object({ name: z.string(), ref: Ref, explanation: z.string(), effect: z.string() })),
  }),
  deeper: z.object({
    readings: z.array(z.object({ kind: z.string(), text: z.string(), fit: z.string() })),
    culturalNotes: z.array(z.string()),
    contextNote: z.string().nullable(),
    caution: z.string().nullable(),
  }),
  chat: z.object({ reply: z.string(), canContinue: z.boolean() }),
  reflect: z.object({
    whatIsRight: z.string(),
    corrections: z.array(z.string()),
    defensible: z.boolean(),
    note: z.string().nullable(),
  }),
} as const;

export type ModelOutputs = { [K in keyof typeof ModelOutput]: z.infer<(typeof ModelOutput)[K]> };

export const AnchorSchema = z.object({ misra: z.union([z.literal(0), z.literal(1)]), from: z.number().int(), to: z.number().int() });
export type AnchorT = z.infer<typeof AnchorSchema>;

/** A model ref after server-side anchoring; `anchor` is null when the quote could not be located. */
export type AnchoredRef = { quote: string; anchor: AnchorT | null };

export const ERROR_CODES = [
  'invalid_request',
  'rate_limited',
  'quota_exceeded',
  'not_configured',
  'upstream_auth',
  'upstream_unavailable',
  'invalid_output',
  'refused',
  'timeout',
  'forbidden_origin',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
