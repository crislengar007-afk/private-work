import 'server-only';
import { createPublicClient } from './supabase/public';
import type { CatalogAddon, CatalogPackage, CatalogService, CatalogZone, PriceMode } from './estimate';
import { alaCarteValue } from './estimate';

export interface PublicSettings {
  business_name: string;
  owner_name: string;
  phone_e164: string | null;
  email: string | null;
  whatsapp_e164: string | null;
  messenger_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  address_line: string | null;
  city: string;
  province: string;
  postal_code: string | null;
  hours_text: string | null;
  timezone: string;
  currency: string;
  deposit_pct: number;
  hold_hours: number;
  balance_due_days_before_event: number;
  tax_enabled: boolean;
  tax_rate_bp: number;
  google_review_url: string | null;
  facebook_review_url: string | null;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const sb = createPublicClient();
  const { data, error } = await sb.rpc('public_settings');
  if (error || !data?.[0]) throw new Error(`Could not load settings: ${error?.message ?? 'missing row'}`);
  return data[0] as PublicSettings;
}

export interface PublicCategory { id: string; slug: string; name: string; sort: number }

export interface PublicService extends CatalogService {
  short_desc: string | null;
  long_desc_md: string | null;
  category_slug: string;
  sort: number;
  cover_url: string | null;
}

export interface PublicPackage extends CatalogPackage {
  event_type: string;
  description_md: string | null;
  sort: number;
  ala_carte_cents: number;
  ala_carte_is_from: boolean;
  cover_url: string | null;
}

export interface PublicAddon extends CatalogAddon {
  description: string | null;
  applies_to_category_ids: string[];
}

export interface PublicCatalog {
  categories: PublicCategory[];
  services: PublicService[];
  packages: PublicPackage[];
  addons: PublicAddon[];
  zones: (CatalogZone & { description: string | null; sort: number })[];
}

export function mediaPublicUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${storagePath}`;
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const sb = createPublicClient();
  const [cats, svcs, pkgs, adds, zones] = await Promise.all([
    sb.from('service_categories').select('id, slug, name, sort').order('sort'),
    sb.from('services')
      .select('id, slug, name, category_id, short_desc, long_desc_md, price_cents, price_mode, min_hours, included_hours, sort, cover:media!services_cover_media_id_fkey(storage_path)')
      .eq('status', 'active').eq('is_public', true).order('sort'),
    sb.from('packages')
      .select('id, slug, name, event_type, description_md, price_cents, sort, package_items(service_id, qty), cover:media!packages_cover_media_id_fkey(storage_path)')
      .eq('status', 'active').order('sort'),
    sb.from('addons').select('id, slug, name, description, price_cents, price_mode, applies_to_category_ids, sort')
      .eq('status', 'active').order('sort'),
    sb.from('service_zones').select('id, name, description, travel_fee_cents, sort').order('sort'),
  ]);
  for (const r of [cats, svcs, pkgs, adds, zones]) {
    if (r.error) throw new Error(`Could not load catalog: ${r.error.message}`);
  }
  const categories = cats.data ?? [];
  const catSlug = new Map(categories.map((c) => [c.id, c.slug]));

  const services: PublicService[] = (svcs.data ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    category_id: s.category_id,
    category_slug: catSlug.get(s.category_id) ?? '',
    short_desc: s.short_desc,
    long_desc_md: s.long_desc_md,
    price_cents: s.price_cents,
    price_mode: s.price_mode as PriceMode,
    min_hours: s.min_hours,
    included_hours: s.included_hours,
    sort: s.sort,
    cover_url: mediaPublicUrl((s.cover as { storage_path: string } | null)?.storage_path),
  }));

  const packages: PublicPackage[] = (pkgs.data ?? []).map((p) => {
    const items = (p.package_items ?? []).map((i) => ({ service_id: i.service_id, qty: Number(i.qty) }));
    const value = alaCarteValue({ items }, services);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      event_type: p.event_type,
      description_md: p.description_md,
      price_cents: p.price_cents,
      sort: p.sort,
      items,
      ala_carte_cents: value.cents,
      ala_carte_is_from: value.isFrom,
      cover_url: mediaPublicUrl((p.cover as { storage_path: string } | null)?.storage_path),
    };
  });

  const addons: PublicAddon[] = (adds.data ?? []).map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    price_cents: a.price_cents,
    price_mode: a.price_mode as PriceMode,
    applies_to_category_ids: a.applies_to_category_ids,
  }));

  return { categories, services, packages, addons, zones: zones.data ?? [] };
}

export async function getPublicPolicies() {
  const sb = createPublicClient();
  const { data, error } = await sb.from('policies').select('key, title, body_md, version, sort, updated_at').order('sort');
  if (error) throw new Error(`Could not load policies: ${error.message}`);
  return data ?? [];
}

export type PolicyRow = Awaited<ReturnType<typeof getPublicPolicies>>[number];
