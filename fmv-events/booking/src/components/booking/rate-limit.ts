import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Per-IP rate limit only (no Turnstile). For anonymous writes that are already
 * gated by an unguessable token (accept a quote, "I've sent it") or that cannot
 * carry a single-use Turnstile token (reference photo uploads, whose inquiry
 * submit is Turnstile-protected). Uses the same `hit_rate_limit` SQL function
 * as `guardAnonymousWrite`. Fails closed.
 */
export async function rateLimitOnly(opts: {
  action: string;
  ip: string;
  max?: number;
  windowSeconds?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('hit_rate_limit', {
      p_key: `${opts.action}:${opts.ip}`,
      p_max: opts.max ?? 5,
      p_window_seconds: opts.windowSeconds ?? 600,
    });
    if (error) {
      console.error('[rate-limit] check failed', error.message);
      return { ok: false, error: 'Please try again in a moment.' };
    }
    if (!data) return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
    return { ok: true };
  } catch (e) {
    console.error('[rate-limit] unavailable', e);
    return { ok: false, error: 'Please try again in a moment.' };
  }
}
