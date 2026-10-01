import 'server-only';
// Shared server-side helpers for the owner admin (validation fields, error
// mapping, revalidation, team lookup). Server actions live next to each page.
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { fail, friendlyDbError, type ActionResult } from '@/lib/errors';
import { fieldErrors } from '@/lib/schemas';
import { parseDollarsToCents } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ------------------------------------------------------------------ form data
/** FormData -> plain object of its string values (last value wins). */
export function formFields(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === 'string' && !k.startsWith('$ACTION')) out[k] = v;
  });
  return out;
}

// ------------------------------------------------------------------ zod fields
export const reqText = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const optText = (max = 5000) =>
  z
    .string()
    .trim()
    .max(max, 'Too long')
    .optional()
    .transform((v) => (v ? v : null));

/** Dollars typed by the owner -> integer cents; blank -> null ("no price"). */
export const dollars = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const c = parseDollarsToCents(v);
    if (c === null) {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount like 450 or 450.00' });
      return z.NEVER;
    }
    return c;
  });

export const intField = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .transform((v, ctx) => {
      if (!/^-?\d+$/.test(v)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a whole number` });
        return z.NEVER;
      }
      const n = Number(v);
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    });

/** Optional non-negative number with up to 2 decimals (hours, quantities). Blank -> null. */
export const optDecimal = (label: string, max = 999) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return null;
      const s = v.trim();
      if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a number between 0 and ${max}` });
        return z.NEVER;
      }
      return Number(s);
    });

export const checkbox = z
  .string()
  .optional()
  .transform((v) => v === 'on' || v === 'true');

export const uuidField = z.string().uuid('Pick an item');
export const optUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Slug is required')
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes, e.g. fall-minis-2026');

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
export const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time');

export const optEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().email('Enter a valid email address').nullable());

export const optUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(
    z
      .string()
      .url('Enter a full link starting with https://')
      .refine((u) => /^https?:\/\//i.test(u), 'Enter a full link starting with https://')
      .nullable(),
  );

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ------------------------------------------------------------------ results
export function invalid(err: z.ZodError): ActionResult<never> {
  return fail('Please fix the highlighted fields.', fieldErrors(err));
}

/** Maps a Supabase/Postgres error to an owner-friendly message. */
export function dbFail(
  err: { code?: string; message?: string; details?: string | null } | null | undefined,
  hints: { inUse?: string; duplicate?: string } = {},
): ActionResult<never> {
  if (err?.code === '23503') {
    return fail(hints.inUse ?? 'This is still used elsewhere (bookings, quotes or packages), so it can’t be removed. Archive it instead.');
  }
  if (err?.code === '23505' && hints.duplicate) return fail(hints.duplicate);
  if (err) console.error('[admin]', err.code, err.message);
  return fail(friendlyDbError(err));
}

/**
 * Revalidates admin paths (literal paths, or route patterns like
 * /admin/minis/[id]), and the whole public site when the change shows there.
 */
export function refresh(paths: string | string[], opts: { public?: boolean } = {}) {
  for (const p of Array.isArray(paths) ? paths : [paths]) {
    if (p.includes('[')) revalidatePath(p, 'page');
    else revalidatePath(p);
  }
  if (opts.public) revalidatePath('/', 'layout');
}

// ------------------------------------------------------------------ team
export interface TeamMember {
  user_id: string;
  role: 'owner' | 'staff';
  display_name: string | null;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  invited: boolean;
}

/**
 * Owner/staff accounts with their sign-in emails. Emails live in auth.users,
 * which RLS can't expose, so they come from the Auth admin API (call this only
 * after requireOwner()).
 */
export async function getTeamMembers(): Promise<TeamMember[]> {
  const sb = await createClient();
  const { data: roles } = await sb.from('user_roles').select('user_id, role, display_name, created_at').order('created_at');
  if (!roles?.length) return [];
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }
  return Promise.all(
    roles.map(async (r) => {
      let email: string | null = null;
      let last: string | null = null;
      let invited = false;
      if (admin) {
        const { data } = await admin.auth.admin.getUserById(r.user_id);
        email = data.user?.email ?? null;
        last = data.user?.last_sign_in_at ?? null;
        invited = Boolean(data.user?.invited_at && !data.user?.last_sign_in_at);
      }
      return {
        user_id: r.user_id,
        role: r.role,
        display_name: r.display_name,
        email,
        created_at: r.created_at,
        last_sign_in_at: last,
        invited,
      };
    }),
  );
}
