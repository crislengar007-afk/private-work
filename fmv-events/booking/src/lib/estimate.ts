// Builds estimate/quote lines from a builder selection. Used live in the browser
// (for the estimate) and again on the server (never trust the client's numbers),
// and to pre-fill the admin quote builder.

import { computeTotals, lineTotal, type Totals } from './money';

export type PriceMode = 'flat' | 'per_hour' | 'per_item' | 'from';
export type LineKind = 'package' | 'service' | 'addon' | 'travel' | 'custom';

export interface CatalogService {
  id: string;
  slug: string;
  name: string;
  category_id: string;
  price_cents: number | null;
  price_mode: PriceMode;
  min_hours: number | null;
  included_hours: number | null;
}

export interface CatalogPackage {
  id: string;
  slug: string;
  name: string;
  price_cents: number | null;
  items: { service_id: string; qty: number }[];
}

export interface CatalogAddon {
  id: string;
  slug: string;
  name: string;
  price_cents: number | null;
  price_mode: PriceMode;
}

export interface CatalogZone {
  id: string;
  name: string;
  travel_fee_cents: number | null;
}

export interface Selection {
  package_id?: string | null;
  service_ids: string[];
  addon_ids: string[];
  /** hours for per_hour services/add-ons, keyed by id */
  hours: Record<string, number>;
  /** quantity for per_item services/add-ons, keyed by id */
  qty: Record<string, number>;
}

export interface EstimateLine {
  kind: LineKind;
  ref_id: string | null;
  description: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  /** "from" pricing: the final price is confirmed in the quote */
  is_from: boolean;
}

export interface Estimate {
  lines: EstimateLine[];
  totals: Totals;
  /** true when something has a "from" price or an unset travel fee */
  hasVariablePricing: boolean;
  notes: string[];
}

export interface EstimateContext {
  services: CatalogService[];
  packages: CatalogPackage[];
  addons: CatalogAddon[];
  zones: CatalogZone[];
  zoneId?: string | null;
  taxEnabled: boolean;
  taxRateBp: number;
  depositPct: number;
}

export const emptySelection = (): Selection => ({ package_id: null, service_ids: [], addon_ids: [], hours: {}, qty: {} });

function clampQty(n: unknown, min: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : min;
  return Math.max(min, Math.round(v * 4) / 4); // quarter-hour / whole-ish steps
}

/** Quantity used for a service or add-on line given its price mode. */
export function quantityFor(
  id: string,
  mode: PriceMode,
  selection: Selection,
  minHours: number | null = null,
): number {
  if (mode === 'per_hour') return clampQty(selection.hours[id], Math.max(minHours ?? 1, 0.25));
  if (mode === 'per_item') return Math.max(1, Math.round(selection.qty[id] ?? 1));
  return 1;
}

export function computeEstimate(selection: Selection, ctx: EstimateContext): Estimate {
  const lines: EstimateLine[] = [];
  const notes: string[] = [];
  let hasVariablePricing = false;

  const pkg = selection.package_id ? ctx.packages.find((p) => p.id === selection.package_id) : undefined;
  const coveredByPackage = new Set(pkg?.items.map((i) => i.service_id) ?? []);

  if (pkg && pkg.price_cents !== null) {
    lines.push({
      kind: 'package',
      ref_id: pkg.id,
      description: pkg.name,
      qty: 1,
      unit_price_cents: pkg.price_cents,
      line_total_cents: pkg.price_cents,
      is_from: false,
    });
  }

  for (const id of selection.service_ids) {
    if (coveredByPackage.has(id)) continue;
    const s = ctx.services.find((x) => x.id === id);
    if (!s || s.price_cents === null) continue;
    const qty = quantityFor(s.id, s.price_mode, selection, s.min_hours);
    const isFrom = s.price_mode === 'from';
    if (isFrom) hasVariablePricing = true;
    const unitLabel = s.price_mode === 'per_hour' ? ` (${qty} hr)` : s.price_mode === 'per_item' ? ` (×${qty})` : '';
    lines.push({
      kind: 'service',
      ref_id: s.id,
      description: `${s.name}${unitLabel}`,
      qty,
      unit_price_cents: s.price_cents,
      line_total_cents: lineTotal(qty, s.price_cents),
      is_from: isFrom,
    });
  }

  for (const id of selection.addon_ids) {
    const a = ctx.addons.find((x) => x.id === id);
    if (!a || a.price_cents === null) continue;
    const qty = quantityFor(a.id, a.price_mode, selection, a.price_mode === 'per_hour' ? 1 : null);
    const isFrom = a.price_mode === 'from';
    if (isFrom) hasVariablePricing = true;
    lines.push({
      kind: 'addon',
      ref_id: a.id,
      description: a.name + (a.price_mode === 'per_hour' ? ` (${qty} hr)` : a.price_mode === 'per_item' ? ` (×${qty})` : ''),
      qty,
      unit_price_cents: a.price_cents,
      line_total_cents: lineTotal(qty, a.price_cents),
      is_from: isFrom,
    });
  }

  const zone = ctx.zoneId ? ctx.zones.find((z) => z.id === ctx.zoneId) : undefined;
  if (zone) {
    if (zone.travel_fee_cents === null) {
      hasVariablePricing = true;
      notes.push(`Travel to ${zone.name} is confirmed in your quote.`);
    } else if (zone.travel_fee_cents > 0) {
      lines.push({
        kind: 'travel',
        ref_id: zone.id,
        description: `Travel: ${zone.name}`,
        qty: 1,
        unit_price_cents: zone.travel_fee_cents,
        line_total_cents: zone.travel_fee_cents,
        is_from: false,
      });
    }
  }

  const totals = computeTotals({
    lineTotalsCents: lines.map((l) => l.line_total_cents),
    taxEnabled: ctx.taxEnabled,
    taxRateBp: ctx.taxRateBp,
    depositPct: ctx.depositPct,
  });

  return { lines, totals, hasVariablePricing, notes };
}

/** Sum of the included services at their à la carte prices ("à la carte value"). */
export function alaCarteValue(pkg: Pick<CatalogPackage, 'items'>, services: CatalogService[]): {
  cents: number;
  isFrom: boolean;
  complete: boolean;
} {
  let cents = 0;
  let isFrom = false;
  let complete = true;
  for (const item of pkg.items) {
    const s = services.find((x) => x.id === item.service_id);
    if (!s || s.price_cents === null) {
      complete = false;
      continue;
    }
    if (s.price_mode === 'from') isFrom = true;
    cents += lineTotal(item.qty, s.price_cents);
  }
  return { cents, isFrom, complete };
}
