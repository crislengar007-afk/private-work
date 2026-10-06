import { describe, expect, it } from 'vitest';
import { matchEntry } from '../../src/domain/digits.js';
import { maxExposure } from '../../src/domain/exposure.js';
import { GROSS_PAYOUT_MINOR, STAKE_MINOR } from '../../src/domain/rules.js';

const ALL_COMBOS: string[] = [];
for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) for (let c = b + 1; c < 10; c++) ALL_COMBOS.push(`${a}${b}${c}`);

/** Worst case by brute force over EVERY valid six-digit result: all strings
 *  000000–999999 whose six digits are different (151,200 results). */
function bruteForceWorst(counts: Map<string, number>): { winners: number; result: string } {
  const seen = new Map<number, string>();
  for (let n = 0; n < 1_000_000; n++) {
    const s = String(n).padStart(6, '0');
    if (new Set(s).size !== 6) continue; // not a valid result
    let mask = 0;
    for (const ch of s) mask |= 1 << (ch.charCodeAt(0) - 48);
    if (!seen.has(mask)) seen.set(mask, s);
  }
  let best = { winners: 0, result: '' };
  for (const [mask, result] of seen) {
    let w = 0;
    for (const [k, c] of counts) if ([...k].every((d) => mask & (1 << Number(d)))) w += c;
    if (w > best.winners) best = { winners: w, result };
  }
  return best;
}

describe('payout scenarios (owner examples)', () => {
  it('there are 120 unordered combinations; result 123456 makes exactly 20 of them win', () => {
    expect(ALL_COMBOS).toHaveLength(120);
    expect(ALL_COMBOS.filter((k) => matchEntry(k, '123456').won)).toHaveLength(20);
  });

  it('one approved ₱10 entry on every combination: ₱1,200 collected, ₱62,000 paid for 123456', () => {
    const counts = new Map(ALL_COMBOS.map((k) => [k, 1]));
    const collected = 120 * STAKE_MINOR;
    const winners = ALL_COMBOS.filter((k) => matchEntry(k, '123456').won).length;
    expect(collected).toBe(1_200_00);
    expect(winners * GROSS_PAYOUT_MINOR).toBe(62_000_00);
    // ₱62,000 includes the ₱200 of winning stakes (gross, stake included).
    const e = maxExposure(counts);
    expect(e.maxWinners).toBe(20);
    expect(e.maxPayoutMinor).toBe(62_000_00);
    expect(e.upperBoundMinor).toBe(120 * 310000); // conservative bound ₱372,000
  });

  it('every combination filled to ₱500: ₱60,000 collected, ₱3,100,000 paid for 123456', () => {
    const counts = new Map(ALL_COMBOS.map((k) => [k, 50]));
    const collected = 120 * 50 * STAKE_MINOR;
    expect(collected).toBe(60_000_00);
    const winners = ALL_COMBOS.filter((k) => matchEntry(k, '123456').won).length * 50;
    expect(winners).toBe(1000);
    expect(winners * GROSS_PAYOUT_MINOR).toBe(3_100_000_00);
    expect(maxExposure(counts).maxPayoutMinor).toBe(3_100_000_00);
    // Hypothetical shortfall if that result is drawn: ₱3,100,000 − ₱60,000 = ₱3,040,000.
    expect(maxExposure(counts).maxPayoutMinor - collected).toBe(3_040_000_00);
  });

  it('the 210-set exposure search equals a brute force over every valid result', () => {
    const scenarios: Map<string, number>[] = [
      new Map(ALL_COMBOS.map((k) => [k, 1])),
      new Map([['123', 49], ['456', 50], ['135', 2], ['789', 1], ['012', 7]]),
      new Map([['019', 3], ['238', 5], ['467', 4], ['015', 1]]),
      new Map([['123', 1]]),
    ];
    for (const counts of scenarios) {
      const fast = maxExposure(counts);
      const brute = bruteForceWorst(counts);
      expect(fast.maxWinners).toBe(brute.winners);
    }
  });

  it('every valid result (six different digits) makes exactly 20 of the 120 combinations win', () => {
    for (const r of ['123456', '847123', '012345', '907531']) {
      expect(ALL_COMBOS.filter((k) => matchEntry(k, r).won), r).toHaveLength(20);
    }
  });

});
