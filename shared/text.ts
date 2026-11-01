// Text utilities shared by the app and the server.
// The original poem text is never modified; these functions only build
// comparison keys and token lists derived from it.

const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
const ZWNJ = /[\u200C\u200E\u200F]|\u200D/g;
const PUNCT = /[.,،؛;:!?؟«»"'()[\]{}\-–—…/|]/g;

/** Comparison key for search: letter variants unified, diacritics/ZWNJ/spaces removed. */
export function searchKey(text: string): string {
  return text
    .normalize('NFC')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ۀ/g, 'ه')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(ZWNJ, '')
    .replace(PUNCT, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export interface Token {
  /** Index inside the misra, 0-based. */
  i: number;
  text: string;
  /** UTF-16 offsets into the original misra string. */
  start: number;
  end: number;
}

/**
 * Splits a misra on whitespace. A ZWNJ never splits a word, so «می‌کرد» is one
 * token. Repeated words get distinct indices, which is how evidence is anchored.
 */
export function tokenize(misra: string): Token[] {
  const tokens: Token[] = [];
  const re = /[^\s\u00A0]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(misra))) tokens.push({ i: tokens.length, text: m[0], start: m.index, end: m.index + m[0].length });
  return tokens;
}

/** Text of the verse shown to the model, with token indices: «[0]بنی [1]آدم ...». */
export function indexedMisra(misra: string): string {
  return tokenize(misra)
    .map((t) => `[${t.i}]${t.text}`)
    .join(' ');
}

export interface Anchor {
  misra: 0 | 1;
  from: number;
  to: number;
}

/**
 * Validates that `quote` really is tokens from..to of the given misra. If not,
 * looks for a unique place where the quote occurs and returns that instead.
 * Returns null when the quote cannot be anchored with confidence.
 */
export function resolveAnchor(misras: string[], ref: { misra: number; from: number; to: number; quote: string }): Anchor | null {
  const want = searchKey(ref.quote);
  if (!want) return null;
  const matchAt = (mi: number, from: number, to: number) => {
    const toks = tokenize(misras[mi] ?? '');
    if (from < 0 || to < from || to >= toks.length) return false;
    return searchKey(toks.slice(from, to + 1).map((t) => t.text).join(' ')) === want;
  };
  if ((ref.misra === 0 || ref.misra === 1) && matchAt(ref.misra, ref.from, ref.to)) {
    return { misra: ref.misra, from: ref.from, to: ref.to };
  }
  const found: Anchor[] = [];
  misras.forEach((m, mi) => {
    const n = tokenize(m).length;
    for (let from = 0; from < n; from++)
      for (let to = from; to < Math.min(n, from + 8); to++)
        if (matchAt(mi, from, to)) found.push({ misra: mi as 0 | 1, from, to });
  });
  return found.length === 1 ? found[0] : null;
}

/** Short stable hash (FNV-1a, hex) for cache keys and text versions computed in the browser. */
export function shortHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function versesFingerprint(verses: { misras: string[] }[]): string {
  return shortHash(verses.map((v) => v.misras.join('\n')).join('\n\n'));
}
