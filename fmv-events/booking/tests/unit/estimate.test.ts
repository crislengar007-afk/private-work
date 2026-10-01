import { describe, expect, it } from 'vitest';
import { alaCarteValue, computeEstimate, emptySelection, type EstimateContext } from '@/lib/estimate';

const services = [
  { id: 'photo', slug: 'wedding-photography-outdoor', name: 'Wedding Photography (Outdoor)', category_id: 'c1', price_cents: 15000, price_mode: 'per_hour' as const, min_hours: 1, included_hours: null },
  { id: 'coord', slug: 'wedding-coordination', name: 'Wedding Coordination', category_id: 'c2', price_cents: 40000, price_mode: 'flat' as const, min_hours: null, included_hours: null },
  { id: 'style', slug: 'wedding-setup-styling', name: 'Wedding Setup & Styling', category_id: 'c3', price_cents: 50000, price_mode: 'flat' as const, min_hours: null, included_hours: null },
  { id: 'mirror', slug: 'mirror-photobooth', name: 'Mirror Photobooth', category_id: 'c4', price_cents: 45000, price_mode: 'flat' as const, min_hours: null, included_hours: 2 },
  { id: '360', slug: 'photobooth-360', name: '360 Photobooth', category_id: 'c4', price_cents: 40000, price_mode: 'flat' as const, min_hours: null, included_hours: 2 },
  { id: 'vg', slug: 'video-guestbook', name: 'Video Guestbook', category_id: 'c4', price_cents: 10000, price_mode: 'flat' as const, min_hours: null, included_hours: null },
  { id: 'arch', slug: 'wedding-arch', name: 'Wedding Arch', category_id: 'c4', price_cents: 15000, price_mode: 'flat' as const, min_hours: null, included_hours: null },
  { id: 'balloon', slug: 'balloon-decor', name: 'Balloon Décor Setup', category_id: 'c3', price_cents: 18000, price_mode: 'from' as const, min_hours: null, included_hours: null },
  { id: 'tables', slug: 'event-table-setup', name: 'Event Table Setup', category_id: 'c4', price_cents: 1500, price_mode: 'per_item' as const, min_hours: null, included_hours: null },
];

const ctx: EstimateContext = {
  services,
  packages: [{ id: 'pkg', slug: 'wedding-essentials', name: 'Wedding Essentials', price_cents: 40000, items: [{ service_id: 'photo', qty: 2 }, { service_id: 'arch', qty: 1 }] }],
  addons: [{ id: 'prints', slug: 'printed-photos', name: 'Printed photos', price_cents: 500, price_mode: 'per_item' }],
  zones: [
    { id: 'fred', name: 'Fredericton', travel_fee_cents: 0 },
    { id: 'far', name: 'Outside Fredericton', travel_fee_cents: null },
    { id: 'oro', name: 'Oromocto', travel_fee_cents: 2500 },
  ],
  taxEnabled: false,
  taxRateBp: 1500,
  depositPct: 50,
};

describe('à la carte value (spec §3)', () => {
  const v = (items: { service_id: string; qty: number }[]) => alaCarteValue({ items }, services);
  it('matches the spec figures', () => {
    expect(v([{ service_id: 'photo', qty: 2 }, { service_id: 'arch', qty: 1 }]).cents).toBe(45000);
    expect(v([{ service_id: 'style', qty: 1 }, { service_id: 'photo', qty: 2 }, { service_id: 'vg', qty: 1 }]).cents).toBe(90000);
    expect(v([{ service_id: 'coord', qty: 1 }, { service_id: 'style', qty: 1 }, { service_id: 'photo', qty: 2 }, { service_id: 'mirror', qty: 1 }]).cents).toBe(165000);
    const celebration = v([{ service_id: 'balloon', qty: 1 }, { service_id: '360', qty: 1 }]);
    expect(celebration.cents).toBe(58000);
    expect(celebration.isFrom).toBe(true);
  });
});

describe('estimate', () => {
  it('prices hours, items and flat services', () => {
    const sel = { ...emptySelection(), service_ids: ['photo', 'mirror', 'tables'], hours: { photo: 3 }, qty: { tables: 4 } };
    const e = computeEstimate(sel, { ...ctx, zoneId: 'fred' });
    expect(e.lines.map((l) => l.line_total_cents)).toEqual([45000, 45000, 6000]);
    expect(e.totals.totalCents).toBe(96000);
    expect(e.totals.depositCents).toBe(48000);
    expect(e.hasVariablePricing).toBe(false);
  });

  it('enforces the minimum hours', () => {
    const e = computeEstimate({ ...emptySelection(), service_ids: ['photo'], hours: { photo: 0 } }, ctx);
    expect(e.lines[0].qty).toBe(1);
  });

  it('does not double-charge services already in the chosen package', () => {
    const e = computeEstimate({ ...emptySelection(), package_id: 'pkg', service_ids: ['photo', 'arch', 'vg'] }, ctx);
    expect(e.lines.map((l) => l.description)).toEqual(['Wedding Essentials', 'Video Guestbook']);
    expect(e.totals.subtotalCents).toBe(50000);
  });

  it('adds a travel line for priced zones and flags unpriced ones', () => {
    const priced = computeEstimate({ ...emptySelection(), service_ids: ['arch'] }, { ...ctx, zoneId: 'oro' });
    expect(priced.lines.at(-1)).toMatchObject({ kind: 'travel', line_total_cents: 2500 });
    const unpriced = computeEstimate({ ...emptySelection(), service_ids: ['arch'] }, { ...ctx, zoneId: 'far' });
    expect(unpriced.hasVariablePricing).toBe(true);
    expect(unpriced.notes[0]).toMatch(/confirmed in your quote/);
  });

  it('marks "from" prices as variable', () => {
    const e = computeEstimate({ ...emptySelection(), service_ids: ['balloon'] }, ctx);
    expect(e.hasVariablePricing).toBe(true);
    expect(e.lines[0].is_from).toBe(true);
  });

  it('applies HST when enabled', () => {
    const e = computeEstimate({ ...emptySelection(), service_ids: ['coord'] }, { ...ctx, taxEnabled: true });
    expect(e.totals.taxCents).toBe(6000);
    expect(e.totals.totalCents).toBe(46000);
  });

  it('prices per-item add-ons and ignores unknown ids', () => {
    const e = computeEstimate({ ...emptySelection(), service_ids: ['nope'], addon_ids: ['prints', 'nope'], qty: { prints: 10 } }, ctx);
    expect(e.lines).toHaveLength(1);
    expect(e.lines[0].line_total_cents).toBe(5000);
  });
});
