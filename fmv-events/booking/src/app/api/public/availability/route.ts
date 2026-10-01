import { z } from 'zod';
import { createPublicClient } from '@/lib/supabase/public';
import { CACHE_SHORT, apiError, corsHeaders, publicJson } from '../_lib';

export const dynamic = 'force-dynamic';

const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour)');

const querySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .refine((d) => {
        const t = new Date(`${d}T12:00:00Z`);
        return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
      }, 'Not a real date'),
    start: wallTime,
    end: wallTime,
  })
  .refine((v) => v.start !== v.end, { message: 'start and end must differ', path: ['end'] });

// Per-service availability for a date and time window (spec §5.3-C). Only
// statuses and generic reasons are returned: never client names or bookings.
// CORS is allowed for Part A's origin (PUBLIC_SITE_ORIGIN) on this endpoint only.
export async function GET(req: Request) {
  const cors = corsHeaders(req);
  return publicJson(
    req,
    'availability',
    async () => {
      const sp = new URL(req.url).searchParams;
      const parsed = querySchema.safeParse({
        date: sp.get('date') ?? '',
        start: sp.get('start') ?? '',
        end: sp.get('end') ?? '',
      });
      if (!parsed.success) {
        return apiError(400, 'invalid_request', cors, parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
      }
      const { date, start, end } = parsed.data;
      const sb = createPublicClient();
      const { data, error } = await sb.rpc('service_availability', { p_date: date, p_start: start, p_end: end });
      if (error) throw new Error(error.message);
      return {
        date,
        start,
        end,
        services: (data ?? []).map((s) => ({
          service_id: s.service_id,
          slug: s.slug,
          status: s.status as 'available' | 'limited' | 'unavailable',
          reason: s.reason ?? null,
        })),
      };
    },
    { cache: CACHE_SHORT, headers: cors },
  );
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req, true) });
}
