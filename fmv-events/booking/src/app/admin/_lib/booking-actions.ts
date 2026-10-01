'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, friendlyDbError, ok } from '@/lib/errors';
import type { FormState } from './form-state';
import { formFields } from './form-state';
import { MONEY_PATHS, NOT_OWNER, NOT_TEAM, invalid, ownerSession, revalidate, teamSession } from './server';

const uuid = z.string().uuid();
const bookingPaths = (id: string) => [`/admin/bookings/${id}`, '/admin/bookings', '/admin/calendar', '/admin'];

/** Staff and owner tick checklist items off (RLS allows team updates on booking_tasks). */
export async function toggleTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await teamSession();
  if (!session?.userId) return fail(NOT_TEAM);
  const parsed = z.object({ task_id: uuid, done: z.enum(['true', 'false']) }).safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const done = parsed.data.done === 'true';
  const sb = await createClient();
  const { data, error } = await sb
    .from('booking_tasks')
    .update({ done, done_by: done ? session.userId : null, done_at: done ? new Date().toISOString() : null })
    .eq('id', parsed.data.task_id)
    .select('booking_id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Task not found.');
  revalidate(`/admin/bookings/${data[0].booking_id}`);
  return ok(undefined);
}

export async function addTask(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = z
    .object({ booking_id: uuid, label: z.string().trim().min(1, 'Describe the task').max(200, 'Keep it under 200 characters') })
    .safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const sb = await createClient();
  const { data: last } = await sb
    .from('booking_tasks')
    .select('sort')
    .eq('booking_id', parsed.data.booking_id)
    .order('sort', { ascending: false })
    .limit(1);
  const { error } = await sb
    .from('booking_tasks')
    .insert({ booking_id: parsed.data.booking_id, label: parsed.data.label, sort: (last?.[0]?.sort ?? 0) + 1 });
  if (error) return fail(friendlyDbError(error));
  revalidate(`/admin/bookings/${parsed.data.booking_id}`);
  return ok(undefined, 'Task added.');
}

export async function removeTask(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = z.object({ task_id: uuid }).safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const sb = await createClient();
  const { data, error } = await sb.from('booking_tasks').delete().eq('id', parsed.data.task_id).select('booking_id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Task not found.');
  revalidate(`/admin/bookings/${data[0].booking_id}`);
  return ok(undefined);
}

const detailsSchema = z.object({
  booking_id: uuid,
  gallery_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'Enter a full https:// link to the gallery'),
  internal_notes: z.string().trim().max(5000, 'Notes are too long'),
});

export async function updateBookingDetails(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = detailsSchema.safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const sb = await createClient();
  const { data, error } = await sb
    .from('bookings')
    .update({ gallery_url: d.gallery_url || null, internal_notes: d.internal_notes || null })
    .eq('id', d.booking_id)
    .select('id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Booking not found.');
  revalidate(`/admin/bookings/${d.booking_id}`);
  return ok(undefined, 'Saved.');
}

/**
 * Owner cancels a held/confirmed booking: frees its inventory (trigger on
 * bookings.status) and voids invoices that haven't been paid. Paid invoices stay
 * as they are; any refund is handled outside the app.
 */
export async function cancelBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = z.object({ booking_id: uuid }).safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const id = parsed.data.booking_id;
  const sb = await createClient();
  const { data, error } = await sb
    .from('bookings')
    .update({ status: 'cancelled', cancel_reason: 'cancelled_by_owner' })
    .eq('id', id)
    .in('status', ['held', 'confirmed'])
    .select('id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Only a held or confirmed booking can be cancelled.');

  const { data: voided, error: vErr } = await sb
    .from('invoices')
    .update({ status: 'void' })
    .eq('booking_id', id)
    .in('status', ['unpaid', 'reported'])
    .select('id');
  revalidate(...bookingPaths(id), ...MONEY_PATHS);
  if (vErr) return fail(`The booking was cancelled, but its open invoices could not be voided: ${friendlyDbError(vErr)}`);
  const n = voided?.length ?? 0;
  return ok(undefined, `Booking cancelled${n ? ` and ${n} open invoice${n > 1 ? 's' : ''} voided` : ''}. Paid amounts are not refunded automatically.`);
}
