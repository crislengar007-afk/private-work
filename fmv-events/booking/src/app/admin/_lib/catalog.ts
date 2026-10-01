import 'server-only';
// The catalog as the team sees it (RLS: owner/staff also see drafts and
// unpriced items), shaped for @/lib/estimate.
import type { ServerClient } from '@/lib/supabase/server';
import {
  computeEstimate, emptySelection, quantityFor,
  type CatalogAddon, type CatalogPackage, type CatalogService, type CatalogZone, type LineKind, type PriceMode, type Selection,
} from '@/lib/estimate';
import { lineTotal } from '@/lib/money';
import { selectionSchema } from '@/lib/schemas';

export interface TeamService extends CatalogService {
  status: string;
  is_public: boolean;
}
export interface TeamPackage extends CatalogPackage {
  status: string;
}
export interface TeamAddon extends CatalogAddon {
  status: string;
}
export interface TeamCatalog {
  services: TeamService[];
  packages: TeamPackage[];
  addons: TeamAddon[];
  zones: CatalogZone[];
}

export async function loadTeamCatalog(sb: ServerClient): Promise<TeamCatalog | null> {
  const [svcs, pkgs, adds, zones] = await Promise.all([
    sb.from('services').select('id, slug, name, category_id, price_cents, price_mode, min_hours, included_hours, status, is_public, sort').order('sort'),
    sb.from('packages').select('id, slug, name, price_cents, status, sort, package_items(service_id, qty)').order('sort'),
    sb.from('addons').select('id, slug, name, price_cents, price_mode, status, sort').order('sort'),
    sb.from('service_zones').select('id, name, travel_fee_cents, sort').order('sort'),
  ]);
  if (svcs.error || pkgs.error || adds.error || zones.error) return null;
  return {
    services: (svcs.data ?? []).map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      category_id: s.category_id,
      price_cents: s.price_cents === null ? null : Number(s.price_cents),
      price_mode: s.price_mode as PriceMode,
      min_hours: s.min_hours === null ? null : Number(s.min_hours),
      included_hours: s.included_hours === null ? null : Number(s.included_hours),
      status: s.status,
      is_public: s.is_public,
    })),
    packages: (pkgs.data ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price_cents: p.price_cents === null ? null : Number(p.price_cents),
      status: p.status,
      items: (p.package_items ?? []).map((i) => ({ service_id: i.service_id, qty: Number(i.qty) })),
    })),
    addons: (adds.data ?? []).map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      price_cents: a.price_cents === null ? null : Number(a.price_cents),
      price_mode: a.price_mode as PriceMode,
      status: a.status,
    })),
    zones: (zones.data ?? []).map((z) => ({ id: z.id, name: z.name, travel_fee_cents: z.travel_fee_cents === null ? null : Number(z.travel_fee_cents) })),
  };
}

/** The inquiry's stored selection, defensively parsed. */
export function parseSelection(raw: unknown): Selection {
  const r = selectionSchema.safeParse(raw ?? {});
  if (!r.success) return emptySelection();
  return { package_id: r.data.package_id ?? null, service_ids: r.data.service_ids, addon_ids: r.data.addon_ids, hours: r.data.hours, qty: r.data.qty };
}

export interface DraftLine {
  kind: LineKind;
  ref_id: string | null;
  description: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
}

/**
 * Quote lines for an inquiry: priced lines come from computeEstimate; selected
 * items without a price (or a zone without a set fee) become $0 lines for the
 * owner to price, so nothing the client asked for silently disappears.
 */
export function buildQuoteLinesFromInquiry(
  selection: Selection,
  zoneId: string | null,
  catalog: TeamCatalog,
  settings: { tax_enabled: boolean; tax_rate_bp: number; deposit_pct: number },
): DraftLine[] {
  const est = computeEstimate(selection, {
    services: catalog.services,
    packages: catalog.packages,
    addons: catalog.addons,
    zones: catalog.zones,
    zoneId,
    taxEnabled: settings.tax_enabled,
    taxRateBp: settings.tax_rate_bp,
    depositPct: settings.deposit_pct,
  });
  const priced = (kind: LineKind, id: string) => est.lines.find((l) => l.kind === kind && l.ref_id === id);
  const toDraft = (l: (typeof est.lines)[number]): DraftLine => ({
    kind: l.kind, ref_id: l.ref_id, description: l.description, qty: l.qty, unit_price_cents: l.unit_price_cents, line_total_cents: l.line_total_cents,
  });
  const zero = (kind: LineKind, id: string, description: string, qty = 1): DraftLine => ({
    kind, ref_id: id, description, qty, unit_price_cents: 0, line_total_cents: lineTotal(qty, 0),
  });

  const out: DraftLine[] = [];
  const pkg = selection.package_id ? catalog.packages.find((p) => p.id === selection.package_id) : undefined;
  const covered = new Set(pkg?.items.map((i) => i.service_id) ?? []);
  if (pkg) {
    const l = priced('package', pkg.id);
    out.push(l ? toDraft(l) : zero('package', pkg.id, pkg.name));
  }
  for (const id of selection.service_ids) {
    if (covered.has(id)) continue;
    const s = catalog.services.find((x) => x.id === id);
    if (!s) continue;
    const l = priced('service', id);
    if (l) out.push(toDraft(l));
    else {
      const qty = quantityFor(s.id, s.price_mode, selection, s.min_hours);
      const unit = s.price_mode === 'per_hour' ? ` (${qty} hr)` : s.price_mode === 'per_item' ? ` (×${qty})` : '';
      out.push(zero('service', id, `${s.name}${unit}`, qty));
    }
  }
  for (const id of selection.addon_ids) {
    const a = catalog.addons.find((x) => x.id === id);
    if (!a) continue;
    const l = priced('addon', id);
    if (l) out.push(toDraft(l));
    else out.push(zero('addon', id, a.name, quantityFor(a.id, a.price_mode, selection, a.price_mode === 'per_hour' ? 1 : null)));
  }
  const zone = zoneId ? catalog.zones.find((z) => z.id === zoneId) : undefined;
  if (zone) {
    const l = priced('travel', zone.id);
    if (l) out.push(toDraft(l));
    else if (zone.travel_fee_cents === null) out.push(zero('travel', zone.id, `Travel: ${zone.name}`));
  }
  return out;
}
