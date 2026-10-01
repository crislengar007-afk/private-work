// Money is always integer cents (CAD). Never use floats for stored amounts.

const cadFormatter = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

export function formatCAD(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return cadFormatter.format(Number(cents) / 100);
}

/** Parses "1,234.56" / "$450" / "450" into cents. Returns null for blank or invalid input. */
export function parseDollarsToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[\s$,]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export function centsToDollarString(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

/** Round half away from zero to a whole cent. */
export function roundCents(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** qty may be fractional (hours); the line total is rounded to the cent. */
export function lineTotal(qty: number, unitPriceCents: number): number {
  return roundCents(qty * unitPriceCents);
}

export interface TotalsInput {
  lineTotalsCents: number[];
  discountCents?: number;
  taxEnabled: boolean;
  taxRateBp: number; // 1500 = 15%
  depositPct: number; // 0..100
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  taxRateBp: number;
  taxCents: number;
  totalCents: number;
  depositPct: number;
  depositCents: number;
  balanceCents: number;
}

/**
 * Subtotal − discount, then HST on the discounted amount (only when enabled),
 * then the deposit as a percentage of the tax-inclusive total.
 * Always satisfies total = subtotal − discount + tax (the DB checks this too).
 */
export function computeTotals(input: TotalsInput): Totals {
  const subtotalCents = input.lineTotalsCents.reduce((a, b) => a + b, 0);
  const discountCents = Math.min(Math.max(input.discountCents ?? 0, 0), Math.max(subtotalCents, 0));
  const taxable = subtotalCents - discountCents;
  const taxRateBp = input.taxEnabled ? input.taxRateBp : 0;
  const taxCents = input.taxEnabled ? roundCents((taxable * taxRateBp) / 10000) : 0;
  const totalCents = taxable + taxCents;
  const depositPct = Math.min(Math.max(input.depositPct, 0), 100);
  const depositCents = roundCents((totalCents * depositPct) / 100);
  return {
    subtotalCents,
    discountCents,
    taxRateBp,
    taxCents,
    totalCents,
    depositPct,
    depositCents,
    balanceCents: totalCents - depositCents,
  };
}

/** Portion of tax included in a partial amount (e.g. the deposit), as the DB computes it. */
export function proportionalTax(taxCents: number, partCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0;
  return roundCents((taxCents * partCents) / totalCents);
}

export function formatPercentBp(bp: number): string {
  return `${(bp / 100).toLocaleString('en-CA', { maximumFractionDigits: 2 })}%`;
}
