import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../src/data/library';
import { localDayIndex, verseOfDay } from '../src/lib/verseOfDay';

describe('verse of the day', () => {
  it('is stable within a local day and changes at local midnight', () => {
    expect(localDayIndex(new Date(2026, 10, 9, 0, 1))).toBe(localDayIndex(new Date(2026, 10, 9, 23, 59)));
    expect(localDayIndex(new Date(2026, 10, 10, 0, 0))).toBe(localDayIndex(new Date(2026, 10, 9)) + 1);
  });

  it('shows every library verse once before repeating', () => {
    const total = LIBRARY.reduce((s, p) => s + p.verses.length, 0);
    const seen = new Set<string>();
    for (let d = 20_000; d < 20_000 + total; d++) {
      const v = verseOfDay(d)!;
      seen.add(`${v.poem.id}#${v.verse.n}`);
    }
    expect(seen.size).toBe(total);
  });

  it('only picks verified library text', () => {
    for (let d = 0; d < 50; d++) {
      const v = verseOfDay(d)!;
      expect(v.poem.origin).toBe('library');
      expect(v.poem.verses).toContain(v.verse);
    }
  });

  it('handles an empty or single-verse library', () => {
    expect(verseOfDay(5, [])).toBeNull();
    const one = { ...LIBRARY[0], verses: [LIBRARY[0].verses[0]] };
    expect(verseOfDay(123, [one])?.verse).toBe(one.verses[0]);
  });
});
