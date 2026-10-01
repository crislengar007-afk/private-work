import 'server-only';
import { createAdminClient } from './supabase/admin';

/**
 * Checks Cloudflare Turnstile (when configured) and the per-IP rate limit
 * (5 per 10 minutes per action) before any anonymous write.
 */
export async function guardAnonymousWrite(opts: {
  action: string;
  ip: string;
  turnstileToken: string | null | undefined;
  max?: number;
  windowSeconds?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret) {
    if (!opts.turnstileToken) return { ok: false, error: 'Please complete the verification check.' };
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: opts.turnstileToken, remoteip: opts.ip }),
      });
      const json = (await res.json()) as { success?: boolean };
      if (!json.success) return { ok: false, error: 'Verification failed. Please try again.' };
    } catch {
      return { ok: false, error: 'Verification is unavailable right now. Please try again.' };
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[guard] TURNSTILE_SECRET_KEY is not set; anonymous writes are only rate limited.');
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('hit_rate_limit', {
    p_key: `${opts.action}:${opts.ip}`,
    p_max: opts.max ?? 5,
    p_window_seconds: opts.windowSeconds ?? 600,
  });
  if (error) {
    console.error('[guard] rate limit check failed', error.message);
    return { ok: false, error: 'Please try again in a moment.' };
  }
  if (!data) return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  return { ok: true };
}

/** Same limiter for public GET APIs (generous). Fails open if the DB is unreachable. */
export async function publicApiRateLimit(ip: string, bucket: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('hit_rate_limit', { p_key: `api:${bucket}:${ip}`, p_max: 120, p_window_seconds: 60 });
    if (error) return true;
    return Boolean(data);
  } catch {
    return true;
  }
}
