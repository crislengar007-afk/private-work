import { appUrl } from '@/lib/request';
import { listLiveCampaigns } from '@/components/minis/data';
import { publicJson } from '../_lib';

export const dynamic = 'force-dynamic';

// Live mini-session campaigns with their open-slot count and next open slot.
export async function GET(req: Request) {
  return publicJson(req, 'minis', async () => {
    const campaigns = await listLiveCampaigns();
    return campaigns.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      season: c.season,
      description_md: c.description_md,
      location_name: c.location_name,
      location_address: c.location_address,
      price_cents: c.price_cents,
      duration_min: c.duration_min,
      payment_mode: c.payment_mode,
      cover_url: c.cover_url,
      open_slots: c.open_slots,
      next_slot_at: c.next_slot_at,
      book_url: appUrl(`/minis/${c.slug}`),
    }));
  });
}
