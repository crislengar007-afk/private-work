import { createPublicClient } from '@/lib/supabase/public';
import { publicJson, shortName } from '../_lib';

export const dynamic = 'force-dynamic';

// Approved + consented testimonials only. RLS already enforces this for the
// anon client; the explicit filters are defence in depth.
export async function GET(req: Request) {
  return publicJson(req, 'testimonials', async () => {
    const sb = createPublicClient();
    const { data, error } = await sb
      .from('testimonials')
      .select('id, client_name, event_type, quote, rating, source, created_at')
      .eq('approved', true)
      .eq('consent_to_publish', true)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((t) => ({
      id: t.id,
      client_name: shortName(t.client_name),
      event_type: t.event_type,
      quote: t.quote,
      rating: t.rating,
      source: t.source,
    }));
  });
}
