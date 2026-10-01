import { z } from 'zod';
import { createPublicClient } from '@/lib/supabase/public';
import { mediaPublicUrl } from '@/lib/catalog';
import { apiError, publicJson } from '../_lib';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  category: z.string().regex(/^[a-z0-9-]{1,60}$/, 'category must be a category slug').optional(),
  featured: z.enum(['true', 'false']).optional(),
});

// Real work only: show_in_portfolio = true. AI media can never pass (DB CHECK
// media_ai_never_portfolio); is_ai_generated = false is filtered as well.
export async function GET(req: Request) {
  return publicJson(req, 'portfolio', async () => {
    const sp = new URL(req.url).searchParams;
    const parsed = querySchema.safeParse({
      category: sp.get('category') || undefined,
      featured: sp.get('featured') || undefined,
    });
    if (!parsed.success) {
      return apiError(400, 'invalid_request', undefined, parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const { category, featured } = parsed.data;
    const sb = createPublicClient();

    const { data: cats, error: catErr } = await sb.from('service_categories').select('id, slug');
    if (catErr) throw new Error(catErr.message);
    const slugById = new Map((cats ?? []).map((c) => [c.id, c.slug]));

    let q = sb
      .from('media')
      .select('id, storage_path, kind, alt_text, width, height, category_id, event_type, caption, taken_on, featured, sort, is_before_after_pair_id, before_after_role, created_at')
      .eq('show_in_portfolio', true)
      .eq('is_ai_generated', false);

    if (category) {
      const cat = (cats ?? []).find((c) => c.slug === category);
      if (!cat) return [];
      q = q.eq('category_id', cat.id);
    }
    if (featured === 'true') q = q.eq('featured', true);
    if (featured === 'false') q = q.eq('featured', false);

    const { data, error } = await q
      .order('featured', { ascending: false })
      .order('sort', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    return (data ?? []).map((m) => ({
      id: m.id,
      url: mediaPublicUrl(m.storage_path),
      kind: m.kind,
      alt_text: m.alt_text,
      width: m.width,
      height: m.height,
      category: m.category_id ? slugById.get(m.category_id) ?? null : null,
      event_type: m.event_type,
      caption: m.caption,
      taken_on: m.taken_on,
      featured: m.featured,
      before_after: m.is_before_after_pair_id
        ? { pair_id: m.is_before_after_pair_id, role: m.before_after_role }
        : null,
    }));
  });
}
