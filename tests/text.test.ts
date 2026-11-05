import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anchorSection } from '../shared/anchor';
import { ModelOutput } from '../shared/contract';
import { resolveAnchor, searchKey, tokenize } from '../shared/text';
import library from '../src/data/library.json';
import manifest from '../src/data/library-manifest.json';

// Stored explanations are tied to these. Changing one must be a deliberate `--refresh`.
const PUBLISHED_TEXT_VERSIONS = {
  'saadi-golestan-1-10': '881b9c94592a7653',
  'saadi-ghazal-402': '4f7ae3ce4447d1d5',
  'saadi-ghazal-405': 'ffc0c36ffca1a197',
  'saadi-ghazal-51': '84b454ebe03b928b',
  'saadi-mavaez-ghazal-13': '5eb0b3b3ebedfb91',
  'saadi-ghazal-63': 'f824aec400f240db',
  'saadi-ghazal-268': '9e3690f6f1482616',
  'saadi-ghazal-14': 'a4c8af0f7ba73c10',
  'hafez-ghazal-1': 'd443d21ab7f5baf6',
  'hafez-ghazal-4': '4b50215b1dd67ee5',
  'hafez-ghazal-143': 'a4510d9e1b846df9',
  'hafez-ghazal-184': '0ab84f5b6e7e3cfb',
  'hafez-ghazal-255': '0ec430b7a4ad0815',
  'hafez-ghazal-3': 'c1e5e74265ef5796',
  'hafez-ghazal-5': '748d5ebe5c215e10',
  'hafez-ghazal-7': 'e25d45dc16b10903',
};

describe('searchKey', () => {
  it('unifies Arabic/Persian letters, diacritics and ZWNJ', () => {
    expect(searchKey('مي‌كرد')).toBe(searchKey('میکرد'));
    expect(searchKey('اَلا یا اَیُّهَا السّاقی')).toBe(searchKey('الا یا ایها الساقی'));
    expect(searchKey('بنی‌آدم')).toBe(searchKey('بنی آدم'));
    expect(searchKey('آسان')).toBe(searchKey('اسان'));
  });
  it('finds a library poem typed without diacritics or with Arabic ye/kaf', () => {
    const hafez1 = library.poems.find((p) => p.id === 'hafez-ghazal-1')!;
    const hay = hafez1.verses.flatMap((v) => v.misras).map(searchKey);
    expect(hay.some((h) => h.includes(searchKey('ادر کاسا')))).toBe(true);
    expect(hay.some((h) => h.includes(searchKey('مشكلها')))).toBe(true);
  });
});

describe('tokenize', () => {
  it('keeps ZWNJ words whole and records offsets into the original', () => {
    const m = 'سال‌ها دل طلبِ جامِ جم از ما می‌کرد';
    const t = tokenize(m);
    expect(t.map((x) => x.text)).toEqual(['سال‌ها', 'دل', 'طلبِ', 'جامِ', 'جم', 'از', 'ما', 'می‌کرد']);
    for (const x of t) expect(m.slice(x.start, x.end)).toBe(x.text);
  });
});

describe('resolveAnchor', () => {
  const misras = ['به جهان خُرَّم از آنم که جهان خُرَّم از اوست', 'عاشقم بر همه عالم که همه عالم از اوست'];
  it('accepts a correct reference to a repeated word', () => {
    expect(resolveAnchor(misras, { misra: 0, from: 6, to: 7, quote: 'جهان خرم' })).toEqual({ misra: 0, from: 6, to: 7 });
  });
  it('rejects an ambiguous quote whose indices are wrong', () => {
    // «جهان» occurs twice; with wrong indices it cannot be placed with confidence.
    expect(resolveAnchor(misras, { misra: 0, from: 0, to: 0, quote: 'جهان' })).toBeNull();
  });
  it('repairs wrong indices when the quote is unique', () => {
    expect(resolveAnchor(misras, { misra: 1, from: 0, to: 0, quote: 'عاشقم' })).toEqual({ misra: 1, from: 0, to: 0 });
    expect(resolveAnchor(misras, { misra: 0, from: 9, to: 9, quote: 'بر همه' })).toEqual({ misra: 1, from: 1, to: 2 });
  });
  it('returns null for words not in the verse', () => {
    expect(resolveAnchor(misras, { misra: 0, from: 0, to: 0, quote: 'گوهر' })).toBeNull();
  });
});

describe('anchorSection', () => {
  it('turns model refs into validated anchors and keeps unplaceable ones unanchored', () => {
    const raw = ModelOutput.words.parse({
      items: [
        { ref: { misra: 0, from: 0, to: 1, quote: 'بنی آدم' }, meaningHere: 'فرزندان آدم', note: null, alternatives: [] },
        { ref: { misra: 1, from: 0, to: 0, quote: 'ناموجود' }, meaningHere: 'x', note: null, alternatives: [] },
      ],
    });
    const out = anchorSection('words', raw, ['بنی آدم اعضایِ یکدیگرند', 'که در آفرینش ز یک گوهرند']);
    expect(out.items[0].ref).toEqual({ quote: 'بنی آدم', anchor: { misra: 0, from: 0, to: 1 } });
    expect(out.items[1].ref.anchor).toBeNull();
  });
});

describe('library data', () => {
  it('has poems from Saadi and Hafez with a recorded source page', () => {
    expect(library.poems.length).toBe(manifest.poems.length);
    expect(library.poems.map((p) => p.id)).toEqual(manifest.poems.map((p) => p.id));
    expect(new Set(library.poems.map((p) => p.id)).size).toBe(library.poems.length);
    for (const p of library.poems) {
      expect(['saadi', 'hafez']).toContain(p.poetId);
      expect(p.source.url).toMatch(/^https:\/\/ganjoor\.net\//);
      expect(p.verses.every((v) => v.misras.length === 2 && v.misras.every((m) => m.trim().length > 0))).toBe(true);
    }
  });

  it('keeps each textVersion equal to the hash of its stored text', () => {
    for (const p of library.poems) {
      const text = p.verses.map((v) => v.misras.join('\n')).join('\n\n');
      expect(createHash('sha256').update(text).digest('hex').slice(0, 16)).toBe(p.textVersion);
    }
  });

  it('does not change the text of poems readers may already have explanations for', () => {
    const versions = Object.fromEntries(library.poems.map((p) => [p.id, p.textVersion]));
    expect(versions).toMatchObject(PUBLISHED_TEXT_VERSIONS);
  });
});
