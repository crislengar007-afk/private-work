import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const OTP_TYPES = new Set<EmailOtpType>(['email', 'magiclink', 'signup', 'invite', 'email_change', 'recovery']);

/**
 * Only same-origin, path-only redirects ("/portal", "/admin?x=1"). Anything
 * absolute, protocol-relative ("//evil.example") or with backslashes / control
 * characters falls back to /portal.
 */
function safeNext(raw: string | null, origin: string): string {
  const fallback = '/portal';
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}

// Magic-link landing: supports the PKCE `code` flow and the `token_hash` + `type`
// email-template flow, then links the verified email to its client record.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const origin = url.origin;
  const next = safeNext(url.searchParams.get('next'), origin);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const sb = await createClient();
  let signedIn = false;
  try {
    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      signedIn = !error;
      if (error) console.warn('[auth/callback] code exchange failed:', error.message);
    } else if (tokenHash && type && OTP_TYPES.has(type)) {
      const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
      signedIn = !error;
      if (error) console.warn('[auth/callback] verifyOtp failed:', error.message);
    }
  } catch (e) {
    console.warn('[auth/callback] sign-in failed:', e instanceof Error ? e.message : e);
  }

  if (!signedIn) {
    const fail = new URL('/portal', origin);
    fail.searchParams.set('error', 'link');
    return NextResponse.redirect(fail, 303);
  }

  const { error: linkError } = await sb.rpc('link_my_client_account');
  if (linkError) console.warn('[auth/callback] link_my_client_account failed:', linkError.message);

  return NextResponse.redirect(new URL(next, origin), 303);
}
