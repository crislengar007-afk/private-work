import { GROSS_PAYOUT_MINOR } from './rules.js';

const DIGITS = '0123456789';

function sixDigitSets(): string[] {
  const out: string[] = [];
  const rec = (start: number, acc: string) => {
    if (acc.length === 6) return void out.push(acc);
    for (let i = start; i < 10; i++) rec(i + 1, acc + DIGITS[i]);
  };
  rec(0, '');
  return out; // C(10,6) = 210 sets
}
const SETS = sixDigitSets();

export interface Exposure {
  maxWinners: number;
  maxPayoutMinor: number;
  worstDigitSet: string | null;
  upperBoundMinor: number;
  approvedEntries: number;
}

/** Pre-draw maximum prize exposure (SPEC §8). A result has at most six distinct
 *  digits; adding digits never removes a win, so evaluating every 6-digit set
 *  covers every possible result. `counts` maps canonical key -> approved entries. */
export function maxExposure(counts: Map<string, number>): Exposure {
  let total = 0;
  for (const n of counts.values()) total += n;
  let best = 0;
  let bestSet: string | null = null;
  for (const set of SETS) {
    let winners = 0;
    for (const [key, n] of counts) {
      if (set.includes(key[0]) && set.includes(key[1]) && set.includes(key[2])) winners += n;
    }
    if (winners > best) {
      best = winners;
      bestSet = set;
    }
  }
  return {
    maxWinners: best,
    maxPayoutMinor: best * GROSS_PAYOUT_MINOR,
    worstDigitSet: bestSet,
    upperBoundMinor: total * GROSS_PAYOUT_MINOR,
    approvedEntries: total,
  };
}
