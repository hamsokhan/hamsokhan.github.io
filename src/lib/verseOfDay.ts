import { LIBRARY, type Poem, type Verse } from '../data/library';

export interface DayVerse {
  poem: Poem;
  verse: Verse;
}

/** Days since 1970-01-01 in the device's local calendar, so the verse changes at local midnight. */
export function localDayIndex(date = new Date()): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * One library verse per day, with no AI request and no stored state.
 * Steps through every library verse with a stride coprime to the total, so no verse
 * repeats until all have been shown and neighbouring days land in different poems.
 */
export function verseOfDay(day = localDayIndex(), poems: Poem[] = LIBRARY): DayVerse | null {
  const all = poems.flatMap((poem) => poem.verses.map((verse) => ({ poem, verse })));
  if (all.length === 0) return null;
  let stride = 7919;
  while (all.length > 1 && gcd(stride, all.length) !== 1) stride++;
  const i = (((day * stride) % all.length) + all.length) % all.length;
  return all[i];
}
