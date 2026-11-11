import { describe, expect, it } from 'vitest';
import { libraryPoem, type Verse } from '../src/data/library';
import { rhymeScheme } from '../src/lib/rhyme';
import { tokenize } from '../shared/text';

const word = (v: Verse[], k: string, idx: number | null) => {
  const [n, m] = k.split(':').map(Number);
  return idx === null ? null : tokenize(v[n - 1].misras[m])[idx].text;
};
const verses = (pairs: [string, string][]): Verse[] => pairs.map((misras, i) => ({ n: i + 1, misras }));

describe('rhyme scheme', () => {
  it('finds a two-word radif and the rhyme word before it', () => {
    const p = libraryPoem('hafez-ghazal-255')!;
    const s = rhymeScheme(p.verses)!;
    expect(s.radif).toBe('غم مخور');
    const r = s.misras.get('2:1')!;
    expect(word(p.verses, '2:1', r.rhyme)).toBe('سامان');
    expect(r.radifFrom).toBe(tokenize(p.verses[1].misras[1]).length - 2);
  });

  it('marks the first misra of the opening verse', () => {
    const p = libraryPoem('saadi-ghazal-268')!;
    const s = rhymeScheme(p.verses)!;
    expect(s.radif).toBe('می‌رود');
    expect(s.misras.has('1:0')).toBe(true);
    expect(s.misras.has('2:0')).toBe(false);
  });

  it('handles a poem without radif', () => {
    const p = libraryPoem('saadi-ghazal-405')!;
    const s = rhymeScheme(p.verses)!;
    expect(s.radif).toBeNull();
    expect(word(p.verses, '1:1', s.misras.get('1:1')!.rhyme)).toBe('نجوشم');
  });

  it('accepts a one-word radif joined to the rhyme word in some verses', () => {
    const p = libraryPoem('hafez-ghazal-5')!;
    const s = rhymeScheme(p.verses)!;
    expect(s.radif).toBe('را');
    expect(s.misras.get('1:1')).toEqual({ rhyme: tokenize(p.verses[0].misras[1]).length - 1, radifFrom: null });
  });

  it('leaves the rhyme word unmarked where it does not rhyme, but keeps the radif', () => {
    const p = libraryPoem('hafez-ghazal-2')!;
    const r = rhymeScheme(p.verses)!.misras.get('1:1')!;
    expect(r.rhyme).toBeNull();
    expect(r.radifFrom).not.toBeNull();
  });

  it('shows nothing for verses that do not share one rhyme', () => {
    expect(rhymeScheme(libraryPoem('saadi-golestan-1-10')!.verses)).toBeNull();
    // A masnavi: each couplet rhymes within itself only.
    expect(rhymeScheme(verses([
      ['بشنو این نی چون شکایت می‌کند', 'از جدایی‌ها حکایت می‌کند'],
      ['کز نیستان تا مرا ببریده‌اند', 'در نفیرم مرد و زن نالیده‌اند'],
      ['سینه خواهم شرحه شرحه از فراق', 'تا بگویم شرح درد اشتیاق'],
      ['هر کسی کو دور ماند از اصل خویش', 'باز جوید روزگار وصل خویش'],
    ]))).toBeNull();
  });

  it('needs at least three couplets', () => {
    expect(rhymeScheme(verses([['الف ب', 'ج دل'], ['ه و', 'ز گل']]))).toBeNull();
    expect(rhymeScheme([])).toBeNull();
  });
});
