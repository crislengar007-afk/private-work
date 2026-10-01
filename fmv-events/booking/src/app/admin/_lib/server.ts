import 'server-only';
// Server-side helpers for the admin's server actions.
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { assertOwner, assertTeam, type SessionInfo } from '@/lib/auth';
import { fail } from '@/lib/errors';
import { fieldErrors } from '@/lib/schemas';

export const NOT_OWNER = 'Owner access (with two-step verification) is required for that.';
export const NOT_TEAM = 'Please sign in to the admin again.';

/** assertOwner() that returns null instead of throwing, so actions can return a friendly error. */
export async function ownerSession(): Promise<SessionInfo | null> {
  try {
    return await assertOwner();
  } catch {
    return null;
  }
}

export async function teamSession(): Promise<SessionInfo | null> {
  try {
    return await assertTeam();
  } catch {
    return null;
  }
}

export function invalid(err: z.ZodError) {
  return fail(err.issues[0]?.message ?? 'Please check the form.', fieldErrors(err));
}

export function revalidate(...paths: string[]) {
  for (const p of new Set(paths)) revalidatePath(p);
}

/** Paths whose numbers change whenever money or bookings change. */
export const MONEY_PATHS = ['/admin', '/admin/invoices', '/admin/payments', '/admin/bookings', '/admin/calendar'];
