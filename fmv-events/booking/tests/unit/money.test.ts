import { describe, expect, it } from 'vitest';
import { computeTotals, formatCAD, lineTotal, parseDollarsToCents, proportionalTax } from '@/lib/money';

describe('money', () => {
  it('formats CAD in en-CA', () => {
    expect(formatCAD(45000)).toBe('$450.00');
    expect(formatCAD(165000)).toBe('$1,650.00');
    expect(formatCAD(null)).toBe('—');
  });

  it('parses dollar input to integer cents', () => {
    expect(parseDollarsToCents('450')).toBe(45000);
    expect(parseDollarsToCents('$1,650.5')).toBe(165050);
    expect(parseDollarsToCents('0.07')).toBe(7);
    expect(parseDollarsToCents('')).toBeNull();
    expect(parseDollarsToCents('12.345')).toBeNull();
    expect(parseDollarsToCents('-5')).toBeNull();
  });

  it('computes line totals for fractional hours', () => {
    expect(lineTotal(2, 15000)).toBe(30000);
    expect(lineTotal(1.5, 15000)).toBe(22500);
    expect(lineTotal(3, 1500)).toBe(4500);
  });

  it('computes totals without tax (default: not HST-registered)', () => {
    const t = computeTotals({ lineTotalsCents: [45000, 15000], taxEnabled: false, taxRateBp: 1500, depositPct: 50 });
    expect(t).toMatchObject({ subtotalCents: 60000, taxCents: 0, totalCents: 60000, depositCents: 30000, balanceCents: 30000, taxRateBp: 0 });
  });

  it('applies 15% HST on the discounted subtotal when enabled', () => {
    const t = computeTotals({ lineTotalsCents: [100000], discountCents: 10000, taxEnabled: true, taxRateBp: 1500, depositPct: 50 });
    expect(t.taxCents).toBe(13500);
    expect(t.totalCents).toBe(103500);
    expect(t.depositCents).toBe(51750);
    expect(t.totalCents).toBe(t.subtotalCents - t.discountCents + t.taxCents);
  });

  it('rounds odd deposits to the cent and keeps deposit + balance = total', () => {
    const t = computeTotals({ lineTotalsCents: [33333], taxEnabled: true, taxRateBp: 1500, depositPct: 50 });
    expect(t.taxCents).toBe(5000);
    expect(t.totalCents).toBe(38333);
    expect(t.depositCents + t.balanceCents).toBe(t.totalCents);
  });

  it('caps the discount at the subtotal', () => {
    const t = computeTotals({ lineTotalsCents: [5000], discountCents: 9000, taxEnabled: false, taxRateBp: 0, depositPct: 50 });
    expect(t.discountCents).toBe(5000);
    expect(t.totalCents).toBe(0);
  });

  it('splits tax proportionally like the database', () => {
    expect(proportionalTax(13500, 51750, 103500)).toBe(6750);
    expect(proportionalTax(0, 100, 0)).toBe(0);
  });
});
