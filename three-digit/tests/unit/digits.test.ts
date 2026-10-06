import { describe, expect, it } from 'vitest';
import { canonicalKey, isValidResult, matchEntry, permutations, validateResult, validateSelection } from '../../src/domain/digits.js';
import { maxExposure } from '../../src/domain/exposure.js';
import { fromManilaInput, peso, toManilaInput } from '../../src/lib/format.js';

describe('selection validation (acceptance 1)', () => {
  it('accepts 012 and preserves its leading zero', () => {
    const r = validateSelection('012');
    expect(r).toEqual({ ok: true, digits: '012', canonical: '012' });
  });
  it.each(['123', '507', '012', '987'])('accepts %s', (d) => expect(validateSelection(d).ok).toBe(true));
  it.each(['112', '555', '101', '121'])('rejects repeated digits %s', (d) => {
    const r = validateSelection(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REPEATED');
  });
  it.each(['12', '1234', 'abc', '1a2', ' 12', '١٢٣', '', '12.', '-12'])('rejects malformed %j', (d) => {
    expect(validateSelection(d).ok).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(validateSelection(123 as unknown).ok).toBe(false);
    expect(validateSelection(null).ok).toBe(false);
  });
  it('stores canonical sorted key and preserves order separately', () => {
    expect(canonicalKey('507')).toBe('057');
    expect(canonicalKey('531')).toBe(canonicalKey('135'));
    expect(permutations('135').sort()).toEqual(['135', '153', '315', '351', '513', '531']);
  });
});

describe('matching (acceptance 2 + SPEC §4 table)', () => {
  it.each([
    ['135', '123456', true],
    ['531', '123456', true],
    ['507', '705129', true],
    ['012', '301245', true],
    ['789', '123456', false],
    ['123', '124567', false],
  ])('%s vs %s -> won=%s', (entry, result, won) => {
    expect(matchEntry(entry, result).won).toBe(won);
  });
  it('explains the missing digit', () => {
    expect(matchEntry('123', '124567')).toEqual({ won: false, matched: ['1', '2'], missing: ['3'] });
  });
  it('never matches an invalid entry', () => {
    expect(() => matchEntry('112', '123456')).toThrow();
  });
  it('results must be six DIFFERENT digits (owner rule: walang inuulit na numero)', () => {
    expect(validateResult('847123')).toEqual({ ok: true, result: '847123' });
    expect(isValidResult('012345')).toBe(true);
    for (const r of ['001234', '111222', '112345', '847127', '123451']) {
      const v = validateResult(r);
      expect(v.ok, r).toBe(false);
      if (!v.ok) expect(v.code).toBe('REPEATED');
    }
    for (const r of ['12345', '12345a', '1234567', '', ' 12345']) {
      const v = validateResult(r);
      expect(v.ok, r).toBe(false);
      if (!v.ok) expect(v.code).toBe('FORMAT');
    }
  });
});

describe('exposure', () => {
  it('finds the worst-case six-digit set and the conservative bound', () => {
    const e = maxExposure(new Map([['123', 2], ['456', 1], ['789', 5]]));
    expect(e.approvedEntries).toBe(8);
    expect(e.upperBoundMinor).toBe(8 * 310000);
    // 123 and 456 together fit in one six-digit set (3 winners) but 789 + 123 also fits (7 winners).
    expect(e.maxWinners).toBe(7);
    expect(e.maxPayoutMinor).toBe(7 * 310000);
  });
  it('one entry on every distinct combination -> 20 winners for a 6-distinct-digit result (SPEC §16)', () => {
    const counts = new Map<string, number>();
    for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) for (let c = b + 1; c < 10; c++) counts.set(`${a}${b}${c}`, 1);
    const e = maxExposure(counts);
    expect(counts.size).toBe(120);
    expect(e.maxWinners).toBe(20);
    expect(e.maxPayoutMinor).toBe(6_200_000); // PHP 62,000
  });
});

describe('formatting', () => {
  it('formats centavos without floating point storage', () => {
    expect(peso(310000)).toBe('₱3,100.00');
    expect(peso(1000)).toBe('₱10.00');
    expect(peso(309000)).toBe('₱3,090.00');
  });
  it('round-trips Asia/Manila datetime inputs', () => {
    const iso = fromManilaInput('2026-10-06T20:00');
    expect(iso).toBe('2026-10-06T12:00:00.000Z');
    expect(toManilaInput(iso!)).toBe('2026-10-06T20:00');
    expect(fromManilaInput('2026-02-30T10:00')).toBeNull();
  });
});
