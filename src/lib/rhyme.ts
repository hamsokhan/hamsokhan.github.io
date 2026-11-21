// Finds the radif (refrain) and the rhyme word of a mono-rhymed poem (ghazal,
// qasida, qit'a) from the letters of the text alone. No request is sent and
// nothing is stored. The poem text itself is never changed.
import { searchKey, tokenize } from '../../shared/text';
import type { Verse } from '../data/library';

/** Highlight for one misra: token indices (from tokenize) of the rhyme word and the radif. */
export interface MisraRhyme {
  /** Token index of the rhyme word, or null when it could not be told apart. */
  rhyme: number | null;
  /** First token index of the radif; radif runs to the end of the misra. Null when fused or absent. */
  radifFrom: number | null;
}

export interface RhymeScheme {
  /** Radif words as written in the first verse that carries them, or null for a poem without radif. */
  radif: string | null;
  /** Keyed by `${verse n}:${misra index}`. */
  misras: Map<string, MisraRhyme>;
}

const key = (word: string) => searchKey(word);
const lastLetter = (word: string) => key(word).slice(-1);

/** Share of `xs` equal to the most common value, and that value. */
function majority<T>(xs: T[]): [T | undefined, number] {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | undefined;
  let n = 0;
  for (const [x, c] of counts) if (c > n) [best, n] = [x, c];
  return [best, xs.length ? n / xs.length : 0];
}

const MIN_VERSES = 3;
/** Share of verse-ends that must agree before anything is marked. */
const AGREE = 0.8;

/**
 * Returns null for poems whose verse-ends do not share one rhyme (a masnavi,
 * a short excerpt, or text too irregular to tell), so nothing misleading is shown.
 */
export function rhymeScheme(verses: Verse[]): RhymeScheme | null {
  const couplets = verses.filter((v) => v.misras.length === 2);
  if (couplets.length < MIN_VERSES || couplets.length < verses.length * AGREE) return null;
  const ends = couplets.map((v) => tokenize(v.misras[1]).map((t) => t.text));
  if (ends.some((e) => e.length < 2)) return null;

  // Radif: the longest run of final words most verse-ends repeat exactly.
  const tailKey = (words: string[], k: number) => words.slice(-k).map(key).join(' ');
  let radifLen = 0;
  // A one-word radif is often joined to the rhyme word in some verses («آشنا را»
  // but «آشکارا»), so for k = 1 those joined endings count as agreeing too.
  const [word1, exact1] = majority(ends.map((e) => tailKey(e, 1)));
  if (word1 && exact1 < 0.5 && exact1 >= 0.3) {
    const joined = ends.filter((e) => { const w = tailKey(e, 1); return w === word1 || (w.length > word1.length && w.endsWith(word1)); }).length;
    if (joined >= ends.length * AGREE) radifLen = 1;
  }
  for (let k = 1; k < Math.min(...ends.map((e) => e.length)); k++) {
    const [, share] = majority(ends.map((e) => tailKey(e, k)));
    if (share < 0.5) break;
    radifLen = k;
  }
  const radifKey = radifLen ? majority(ends.map((e) => tailKey(e, radifLen)))[0] : undefined;

  /** How a misra ending with `words` rhymes, or null if it does not follow the poem's rhyme. */
  const classify = (words: string[]): (MisraRhyme & { rhymeWord: string | null }) | null => {
    if (radifKey !== undefined) {
      if (words.length > radifLen && tailKey(words, radifLen) === radifKey) {
        const i = words.length - radifLen - 1;
        return { rhyme: i, radifFrom: i + 1, rhymeWord: words[i] };
      }
      // «آشکارا» against radif «را»: the radif is joined to the rhyme word.
      const last = key(words[words.length - 1]);
      if (radifLen === 1 && last.length > radifKey.length && last.endsWith(radifKey)) return { rhyme: words.length - 1, radifFrom: null, rhymeWord: null };
      return null;
    }
    return { rhyme: words.length - 1, radifFrom: null, rhymeWord: words[words.length - 1] };
  };

  const found = couplets.map((v, i) => ({ v, r: classify(ends[i]) }));
  const matching = found.filter((f) => f.r);
  if (matching.length < couplets.length * AGREE) return null;

  // Rhyme words must sound alike: most share their last letter. Without a radif
  // this is the only evidence the poem is mono-rhymed at all.
  const rhymeWords = matching.map((f) => f.r!.rhymeWord).filter((w): w is string => !!w);
  const [letter, letterShare] = majority(rhymeWords.map(lastLetter));
  const rhymeOk = rhymeWords.length > 0 && letterShare >= AGREE;
  if (radifKey === undefined && !rhymeOk) return null;

  const misras = new Map<string, MisraRhyme>();
  const add = (n: number, m: number, r: MisraRhyme & { rhymeWord: string | null }) => {
    const rhymes = rhymeOk && (r.rhymeWord === null || lastLetter(r.rhymeWord) === letter);
    if (!rhymes && r.radifFrom === null) return;
    misras.set(`${n}:${m}`, { rhyme: rhymes ? r.rhyme : null, radifFrom: r.radifFrom });
  };
  for (const f of matching) add(f.v.n, 1, f.r!);

  // Opening verse (matla): its first misra rhymes too, in a ghazal or qasida.
  const first = couplets[0];
  const opening = classify(tokenize(first.misras[0]).map((t) => t.text));
  if (first.n === verses[0].n && opening && tokenize(first.misras[0]).length >= 2) add(first.n, 0, opening);

  let radif: string | null = null;
  if (radifKey !== undefined) {
    const sample = ends.find((e) => e.length > radifLen && tailKey(e, radifLen) === radifKey)!;
    radif = sample.slice(-radifLen).join(' ').replace(/[.,،؛;:!?؟«»"]+/g, '');
  }
  return { radif, misras };
}
