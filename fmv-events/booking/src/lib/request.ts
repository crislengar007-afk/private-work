import 'server-only';
import { headers } from 'next/headers';

/** Best-effort client IP from Vercel/standard proxy headers. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function appUrl(path = ''): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function siteOrigin(): string | null {
  return process.env.PUBLIC_SITE_ORIGIN?.replace(/\/$/, '') || null;
}
