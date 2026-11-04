// Memorising a verse by fading it out. The text itself is never changed; these
// functions only decide which words are covered at each stage.
import { shortHash, tokenize } from '../../shared/text';

/** Stage 0 shows everything, stage LAST_STAGE covers everything. */
export const LAST_STAGE = 3;

export const tokenId = (misra: number, i: number) => `${misra}:${i}`;

/**
 * The order in which a verse's words get covered. It is fixed for a verse, so a
 * word that was covered stays covered at later stages and a return visit looks
 * the same. Misras take turns, so one is not emptied while the other stays
 * whole, and the first word of each misra goes last because it is the strongest
 * cue for recalling the line.
 */
export function coverOrder(misras: string[]): string[] {
  const rest = misras.map((m, mi) =>
    tokenize(m)
      .slice(1)
      .map((t) => ({ id: tokenId(mi, t.i), rank: shortHash(`${mi}|${t.i}|${t.text}`) }))
      .sort((a, b) => a.rank.localeCompare(b.rank))
      .map((t) => t.id),
  );
  const order: string[] = [];
  for (let round = 0; rest.some((r) => round < r.length); round++) {
    for (const r of rest) if (round < r.length) order.push(r[round]);
  }
  misras.forEach((m, mi) => {
    if (tokenize(m).length) order.push(tokenId(mi, 0));
  });
  return order;
}

/** The words covered at a stage. */
export function coveredAt(misras: string[], stage: number): Set<string> {
  const order = coverOrder(misras);
  return new Set(order.slice(0, Math.ceil((order.length * stage) / LAST_STAGE)));
}

/** Where practice starts: the first verse not yet memorised, or the first verse when all are. */
export function firstToPractise(total: number, known: Set<number>): number {
  for (let n = 1; n <= total; n++) if (!known.has(n)) return n;
  return 1;
}

/**
 * The verse after `n`, whose recall was just confirmed: the next one still to
 * learn, going round the poem. Once every verse is known this is a review, so it
 * walks to the end of the poem and then returns null.
 */
export function nextToPractise(total: number, known: Set<number>, n: number): number | null {
  for (let step = 1; step < total; step++) {
    const candidate = ((n - 1 + step) % total) + 1;
    if (candidate !== n && !known.has(candidate)) return candidate;
  }
  return n < total ? n + 1 : null;
}
