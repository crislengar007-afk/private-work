// Shared plumbing for the public read-only API (spec §5.7), consumed by the
// marketing site (Part A). Every response is versioned: { v: 1, data } or
// { v: 1, error }. Errors never leak internal details.
import 'server-only';
import { publicApiRateLimit } from '@/lib/guard';
import { siteOrigin } from '@/lib/request';

export const API_VERSION = 1 as const;

/** Default CDN caching for catalog-like data (Part A sees changes within 5 min). */
export const CACHE_DEFAULT = 'public, s-maxage=300, stale-while-revalidate=600';
/** Shorter caching for availability. */
export const CACHE_SHORT = 'public, s-maxage=60, stale-while-revalidate=120';
/** Never cache (errors, rate limits, live slot pickers). */
export const CACHE_NONE = 'no-store';

export function requestIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function json(body: unknown, status: number, cache: string, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set('Cache-Control', cache);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers });
}

export function apiError(status: number, error: string, extra?: HeadersInit, details?: unknown): Response {
  const body: Record<string, unknown> = { v: API_VERSION, error };
  if (details !== undefined) body.details = details;
  return json(body, status, CACHE_NONE, extra);
}

/**
 * Rate limits by IP + bucket, runs the loader and wraps its result as
 * { v: 1, data }. Any thrown error becomes a 500 { v: 1, error: 'unavailable' }.
 * `load` may return a Response itself (e.g. a 400 or 404) to short-circuit.
 */
export async function publicJson<T>(
  req: Request,
  bucket: string,
  load: () => Promise<T | Response>,
  opts: { cache?: string; headers?: HeadersInit } = {},
): Promise<Response> {
  const allowed = await publicApiRateLimit(requestIp(req), bucket);
  if (!allowed) {
    const h = new Headers(opts.headers);
    h.set('Retry-After', '60');
    return apiError(429, 'rate_limited', h);
  }
  try {
    const data = await load();
    if (data instanceof Response) return data;
    return json({ v: API_VERSION, data }, 200, opts.cache ?? CACHE_DEFAULT, opts.headers);
  } catch (e) {
    console.error(`[api/public/${bucket}]`, e instanceof Error ? e.message : e);
    return apiError(500, 'unavailable', opts.headers);
  }
}

/**
 * CORS for Part A's origin (PUBLIC_SITE_ORIGIN) only. The allow-origin header
 * is sent only when the request's Origin matches exactly.
 */
export function corsHeaders(req: Request, preflight = false): Headers {
  const h = new Headers({ Vary: 'Origin' });
  const allowed = siteOrigin();
  const origin = req.headers.get('origin');
  if (allowed && origin && origin === allowed) {
    h.set('Access-Control-Allow-Origin', allowed);
    if (preflight) {
      h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      h.set('Access-Control-Allow-Headers', 'Content-Type');
      h.set('Access-Control-Max-Age', '86400');
    }
  }
  return h;
}

/** First name + last initial ("Marie Valenciano" -> "Marie V."). */
export function shortName(full: string | null | undefined): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Client';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}
