import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/index.js';
import type { Clock } from '../lib/clock.js';
import { ForbiddenError } from '../lib/errors.js';
import { randomToken, safeEqual } from '../lib/ids.js';
import { type Actor, type Ctx, type Role, hasAny } from '../services/context.js';
import { runMaintenance } from '../services/maintenance.js';
import { type SessionInfo, clearFlash, loadSession, pushFlash, toActor } from '../services/users.js';

export interface RequestState {
  requestId: string;
  csrf: string;
  session: SessionInfo | null;
  actor: Actor | null;
  flash: SessionInfo['flash'];
  ctx: Ctx;
  db: Db;
  clock: Clock;
  config: AppConfig;
}

declare module 'express-serve-static-core' {
  interface Request {
    td: RequestState;
  }
}

export const SESSION_COOKIE = 'td_sid';
export const CSRF_COOKIE = 'td_csrf';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function cookieOptions(config: AppConfig, maxAgeMs?: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: config.production, path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}

/** Loads session + roles on EVERY request, so revoked roles, disabled users and
 *  team reassignments take effect on the next request. */
export function requestState(db: Db, clock: Clock, config: AppConfig) {
  let lastMaintenance = 0;
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    let csrf = cookies[CSRF_COOKIE];
    if (!csrf || !/^[A-Za-z0-9_-]{20,}$/.test(csrf)) {
      csrf = randomToken(24);
      res.cookie(CSRF_COOKIE, csrf, cookieOptions(config));
    }
    const session = loadSession(db, cookies[SESSION_COOKIE]);
    const actor = session ? toActor(db, session.user) : null;
    const requestId = randomToken(9);
    if (session?.flash.length) clearFlash(db, session.sessionId);
    if (Date.now() - lastMaintenance > 2000) {
      lastMaintenance = Date.now();
      try {
        runMaintenance(db, clock);
      } catch (err) {
        console.error('[maintenance] failed', (err as Error).message);
      }
    }
    req.td = { requestId, csrf, session, actor, flash: session?.flash ?? [], ctx: { db, clock, actor, requestId }, db, clock, config };
    res.setHeader('X-Request-Id', requestId);
    next();
  };
}

export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  if (req.method !== 'POST') return next();
  const token = typeof req.body?._csrf === 'string' ? req.body._csrf : '';
  if (!token || !safeEqual(token, req.td.csrf)) {
    return next(Object.assign(new ForbiddenError('Your form session expired. Go back, refresh the page and try again.'), { code: 'CSRF' }));
  }
  next();
}

export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.td.actor) {
    const nextUrl = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
    return res.redirect(303, `/login${nextUrl}`);
  }
  next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.td.actor) return requireLogin(req, res, next);
    if (!hasAny(req.td.actor, roles)) return next(new ForbiddenError());
    next();
  };
}

export function flash(req: Request, kind: 'success' | 'error' | 'info', message: string) {
  if (req.td.session) pushFlash(req.td.db, req.td.session.sessionId, kind, message);
}

/** Small fixed-window limiter for auth endpoints (per IP). */
export function rateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    const key = `${req.path}|${req.ip}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > limit) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      return next(Object.assign(new ForbiddenError('Too many attempts. Please wait a few minutes and try again.'), { status: 429, code: 'RATE_LIMITED' }));
    }
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

export const intParam = (v: unknown): number => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : -1;
};

export const str = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '');
