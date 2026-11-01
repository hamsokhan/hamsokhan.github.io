// Splitting pasted text into misras and verses. The user's text is never
// rewritten: each line is kept exactly (only surrounding whitespace is trimmed),
// and the user can change where each verse starts before saving.
import { LIMITS } from '../../shared/contract';
import type { Verse } from '../data/library';

export interface DraftLine { text: string; startsVerse: boolean }

/** Separators people use to put both misras on one line. */
const INLINE_SEP = /\s+(?:\/|\||\*{2,}|\t)\s+|\t+| {4,}/;

export function draftFromText(input: string): DraftLine[] {
  const lines: string[] = [];
  for (const raw of input.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(INLINE_SEP).map((p) => p.trim()).filter(Boolean);
    lines.push(...(parts.length === 2 ? parts : [line]));
  }
  return lines.map((text, i) => ({ text, startsVerse: i % 2 === 0 }));
}

export function versesFromDraft(lines: DraftLine[]): Verse[] {
  const verses: Verse[] = [];
  for (const [i, l] of lines.entries()) {
    if (i === 0 || l.startsVerse || verses[verses.length - 1].misras.length >= 2) verses.push({ n: verses.length + 1, misras: [l.text] });
    else verses[verses.length - 1].misras.push(l.text);
  }
  return verses;
}

export type DraftProblem = 'empty' | 'too_many_verses' | 'line_too_long';

export function draftProblems(lines: DraftLine[]): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!lines.length) out.push('empty');
  if (versesFromDraft(lines).length > LIMITS.maxVerses) out.push('too_many_verses');
  if (lines.some((l) => l.text.length > LIMITS.maxMisraChars)) out.push('line_too_long');
  return out;
}

/** Sets whether line i starts a verse, then re-pairs the lines after it two by two. */
export function setVerseStart(lines: DraftLine[], i: number, starts: boolean): DraftLine[] {
  const out = lines.map((l, j) => (j === i ? { ...l, startsVerse: starts } : { ...l }));
  let inVerse = 1;
  for (let j = 1; j < out.length; j++) {
    if (j > i) out[j].startsVerse = inVerse >= 2;
    inVerse = out[j].startsVerse ? 1 : inVerse + 1;
  }
  return out;
}
