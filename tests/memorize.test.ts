import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../src/data/library';
import { coveredAt, coverOrder, firstToPractise, LAST_STAGE, nextToPractise, tokenId } from '../src/lib/memorize';
import { tokenize } from '../shared/text';

const verse = ['الا یا ایها الساقی ادر کاسا و ناولها', 'که عشق آسان نمود اول ولی افتاد مشکل‌ها'];

describe('covering a verse in stages', () => {
  it('shows everything first and covers everything last, for every library verse', () => {
    for (const p of LIBRARY)
      for (const v of p.verses) {
        const words = v.misras.reduce((sum, m) => sum + tokenize(m).length, 0);
        expect(coveredAt(v.misras, 0).size).toBe(0);
        expect(coveredAt(v.misras, LAST_STAGE).size).toBe(words);
      }
  });

  it('never uncovers a word at a later stage', () => {
    for (let s = 1; s <= LAST_STAGE; s++) {
      const before = coveredAt(verse, s - 1);
      const now = coveredAt(verse, s);
      expect(now.size).toBeGreaterThan(before.size);
      expect([...before].every((id) => now.has(id))).toBe(true);
    }
  });

  it('is the same on every visit', () => {
    expect(coverOrder(verse)).toEqual(coverOrder([...verse]));
  });

  it('covers both misras evenly and keeps their first words until the end', () => {
    const third = [...coveredAt(verse, 1)];
    const perMisra = [0, 1].map((m) => third.filter((id) => id.startsWith(`${m}:`)).length);
    expect(Math.abs(perMisra[0] - perMisra[1])).toBeLessThanOrEqual(1);
    const twoThirds = coveredAt(verse, 2);
    expect(twoThirds.has(tokenId(0, 0))).toBe(false);
    expect(twoThirds.has(tokenId(1, 0))).toBe(false);
    expect(coverOrder(verse).slice(-2)).toEqual([tokenId(0, 0), tokenId(1, 0)]);
  });

  it('handles a one-word verse and a single misra', () => {
    expect([...coveredAt(['تنها'], 1)]).toEqual([tokenId(0, 0)]);
    expect(coverOrder(['یک دو', '']).length).toBe(2);
  });
});

describe('choosing the next verse', () => {
  it('starts at the first verse still to learn', () => {
    expect(firstToPractise(3, new Set())).toBe(1);
    expect(firstToPractise(3, new Set([1]))).toBe(2);
    expect(firstToPractise(3, new Set([1, 2, 3]))).toBe(1);
  });

  it('moves to the next unknown verse, going round the poem', () => {
    expect(nextToPractise(4, new Set([1]), 1)).toBe(2);
    expect(nextToPractise(4, new Set([1, 2, 4]), 4)).toBe(3);
    expect(nextToPractise(4, new Set([2, 3, 4]), 4)).toBe(1);
  });

  it('walks to the end when reviewing a fully known poem, then stops', () => {
    const all = new Set([1, 2, 3]);
    expect(nextToPractise(3, all, 1)).toBe(2);
    expect(nextToPractise(3, all, 3)).toBeNull();
    expect(nextToPractise(1, new Set([1]), 1)).toBeNull();
  });
});
