import { getCampaignSlots, getLiveCampaign } from '@/components/minis/data';
import { CACHE_NONE, apiError, publicJson } from '../../../_lib';

export const dynamic = 'force-dynamic';

// Live slot list for the /minis/[slug] picker (polled every 30 s and on focus),
// so it is never cached. Only open/booked flags: never who booked.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return publicJson(
    req,
    'mini-slots',
    async () => {
      const campaign = await getLiveCampaign(slug);
      if (!campaign) return apiError(404, 'not_found');
      const slots = await getCampaignSlots(campaign.id);
      return { slug: campaign.slug, slots, fetched_at: new Date().toISOString() };
    },
    { cache: CACHE_NONE },
  );
}
