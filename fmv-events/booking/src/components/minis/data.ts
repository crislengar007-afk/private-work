// Server-side reads for live mini-session campaigns (public/anon client, RLS
// decides what is public). Shared by /minis pages, the public API and the sitemap.
import 'server-only';
import { createPublicClient } from '@/lib/supabase/public';
import { mediaPublicUrl } from '@/lib/catalog';

export interface MiniCampaign {
  id: string;
  slug: string;
  name: string;
  season: string | null;
  description_md: string | null;
  location_name: string | null;
  location_address: string | null;
  price_cents: number | null;
  duration_min: number;
  payment_mode: 'deposit' | 'full';
  hold_hours: number;
  cover_url: string | null;
  cover_alt: string;
}

export interface MiniSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  is_open: boolean;
}

export interface MiniCampaignSummary extends MiniCampaign {
  open_slots: number;
  next_slot_at: string | null;
}

const CAMPAIGN_COLUMNS =
  'id, slug, name, season, description_md, location_name, location_address, price_cents, duration_min, payment_mode, hold_hours, cover:media!mini_campaigns_cover_media_id_fkey(storage_path, alt_text)';

export function isPlausibleSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/i.test(slug);
}

type CampaignRow = {
  id: string;
  slug: string;
  name: string;
  season: string | null;
  description_md: string | null;
  location_name: string | null;
  location_address: string | null;
  price_cents: number | null;
  duration_min: number;
  payment_mode: 'deposit' | 'full';
  hold_hours: number;
  cover: unknown;
};

function toCampaign(row: CampaignRow): MiniCampaign {
  const cover = row.cover as { storage_path: string; alt_text: string } | null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    season: row.season,
    description_md: row.description_md,
    location_name: row.location_name,
    location_address: row.location_address,
    price_cents: row.price_cents,
    duration_min: row.duration_min,
    payment_mode: row.payment_mode,
    hold_hours: row.hold_hours,
    cover_url: mediaPublicUrl(cover?.storage_path),
    cover_alt: cover?.alt_text ?? '',
  };
}

/** Future slots of a live campaign, with whether each one can still be booked. */
export async function getCampaignSlots(campaignId: string, now: Date = new Date()): Promise<MiniSlot[]> {
  const sb = createPublicClient();
  const { data, error } = await sb.rpc('mini_slot_availability', { p_campaign_id: campaignId });
  if (error) throw new Error(`Could not load slots: ${error.message}`);
  const nowMs = now.getTime();
  return (data ?? [])
    .filter((s) => new Date(s.starts_at).getTime() > nowMs)
    .map((s) => ({ id: s.slot_id, starts_at: s.starts_at, ends_at: s.ends_at, is_open: Boolean(s.is_open) }));
}

export function summarizeSlots(slots: MiniSlot[]): { open_slots: number; next_slot_at: string | null } {
  const open = slots.filter((s) => s.is_open);
  return { open_slots: open.length, next_slot_at: open[0]?.starts_at ?? null };
}

/** A live campaign by slug, or null (draft/closed campaigns are invisible to anon). */
export async function getLiveCampaign(slug: string): Promise<MiniCampaign | null> {
  if (!isPlausibleSlug(slug)) return null;
  const sb = createPublicClient();
  const { data, error } = await sb.from('mini_campaigns').select(CAMPAIGN_COLUMNS).eq('slug', slug).eq('status', 'live').maybeSingle();
  if (error) throw new Error(`Could not load campaign: ${error.message}`);
  return data ? toCampaign(data as CampaignRow) : null;
}

/** All live campaigns with open-slot counts, soonest next open slot first. */
export async function listLiveCampaigns(): Promise<MiniCampaignSummary[]> {
  const sb = createPublicClient();
  const { data, error } = await sb.from('mini_campaigns').select(CAMPAIGN_COLUMNS).eq('status', 'live').order('name');
  if (error) throw new Error(`Could not load campaigns: ${error.message}`);
  const campaigns = (data ?? []).map((r) => toCampaign(r as CampaignRow));
  const withSlots = await Promise.all(
    campaigns.map(async (c) => ({ ...c, ...summarizeSlots(await getCampaignSlots(c.id)) })),
  );
  return withSlots.sort((a, b) => {
    if (a.next_slot_at && b.next_slot_at) return a.next_slot_at.localeCompare(b.next_slot_at);
    if (a.next_slot_at) return -1;
    if (b.next_slot_at) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Slugs of live campaigns only (cheap; used by the sitemap). */
export async function listLiveCampaignSlugs(): Promise<string[]> {
  const sb = createPublicClient();
  const { data, error } = await sb.from('mini_campaigns').select('slug').eq('status', 'live');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.slug);
}
