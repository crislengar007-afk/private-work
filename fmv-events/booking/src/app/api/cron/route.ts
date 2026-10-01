import { createHash, timingSafeEqual } from 'node:crypto';
import { runCron } from '@/lib/workflows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store' };

/** Constant-time comparison (hashing first so length differences don't leak). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Vercel Cron (every 15 min, see vercel.json): releases unpaid holds, expires
// quotes, sends reminders, completes past events and sends thank-yous.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set');
    return Response.json({ ok: false, error: 'not_configured' }, { status: 500, headers: noStore });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: noStore });
  }

  const startedAt = new Date();
  try {
    const report = await runCron(startedAt);
    return Response.json(
      { ok: true, started_at: startedAt.toISOString(), duration_ms: Date.now() - startedAt.getTime(), report },
      { headers: noStore },
    );
  } catch (e) {
    console.error('[cron] failed', e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: 'cron_failed' }, { status: 500, headers: noStore });
  }
}
