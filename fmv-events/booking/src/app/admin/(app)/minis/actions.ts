'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { generateSlots, monctonDateOf, monctonToday } from '@/lib/time';
import {
  dbFail, dollars, formFields, intField, invalid, isoDate, optText, optUuid, refresh, reqText, slugField, slugify, uuidField, wallTime,
} from '@/app/admin/_owner/server';
import { CAMPAIGN_STATUSES, MINI_PAYMENT_MODES } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = ['/admin/minis', '/admin/minis/[id]'];
const NEEDS_PRICE = 'Set a price before making this campaign live.';

const campaignSchema = z
  .object({
    name: reqText('Name'),
    slug: slugField,
    season: optText(80),
    description_md: optText(10000),
    location_name: optText(200),
    location_address: optText(300),
    price: dollars,
    duration_min: intField('Duration', 5, 480),
    payment_mode: z.enum(MINI_PAYMENT_MODES),
    hold_hours: intField('Hold hours', 1, 168),
    status: z.enum(CAMPAIGN_STATUSES),
    cover_media_id: optUuid,
  })
  .superRefine((v, ctx) => {
    if (v.status === 'live' && v.price === null) ctx.addIssue({ code: 'custom', path: ['price'], message: NEEDS_PRICE });
  });

export async function createCampaign(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const raw = formFields(fd);
  const p = campaignSchema.safeParse({
    ...raw,
    slug: slugify(raw.slug || raw.name || ''),
    status: 'draft',
    payment_mode: raw.payment_mode || 'full',
    hold_hours: raw.hold_hours || '24',
  });
  if (!p.success) return invalid(p.error);
  const { price, ...rest } = p.data;
  const sb = await createClient();
  const { data, error } = await sb.from('mini_campaigns').insert({ ...rest, price_cents: price }).select('id').single();
  if (error || !data) return dbFail(error, { duplicate: 'Another campaign already uses that slug.' });
  refresh(PATH);
  redirect(`/admin/minis/${data.id}`);
}

export async function updateCampaign(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown campaign.');
  const p = campaignSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const { price, ...rest } = p.data;
  const sb = await createClient();
  const { error } = await sb.from('mini_campaigns').update({ ...rest, price_cents: price }).eq('id', id);
  if (error) return dbFail(error, { duplicate: 'Another campaign already uses that slug.' });
  refresh(PATH, { public: true });
  return ok(null);
}

// ------------------------------------------------------------------ slot generator
const generatorSchema = z
  .object({
    dates: z.array(isoDate).min(1, 'Add at least one date').max(60, 'Up to 60 dates at a time'),
    window_start: wallTime,
    window_end: wallTime,
    interval_min: intField('Interval', 5, 240),
  })
  .superRefine((v, ctx) => {
    if (v.window_end <= v.window_start) ctx.addIssue({ code: 'custom', path: ['window_end'], message: 'End must be after the start' });
  });

export async function generateCampaignSlots(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown campaign.');
  const raw = formFields(fd);
  const fromInputs = fd.getAll('dates').filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  const fromText = (raw.dates_text ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const dates = [...new Set([...fromInputs, ...fromText])].sort();
  const p = generatorSchema.safeParse({ ...raw, dates });
  if (!p.success) {
    const bad = dates.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
    if (bad) return fail(`“${bad}” is not a date. Use YYYY-MM-DD, one per line.`, { dates_text: ['Use YYYY-MM-DD, one per line'] });
    return invalid(p.error);
  }
  const today = monctonToday();
  const past = p.data.dates.filter((d) => d < today);
  if (past.length) return fail(`These dates are in the past: ${past.join(', ')}`, { dates_text: ['Remove past dates'] });

  const sb = await createClient();
  const { data: c, error: cErr } = await sb.from('mini_campaigns').select('duration_min').eq('id', id).single();
  if (cErr || !c) return dbFail(cErr);

  const now = Date.now();
  const slots = generateSlots({
    dates: p.data.dates,
    windowStart: p.data.window_start,
    windowEnd: p.data.window_end,
    intervalMin: p.data.interval_min,
    durationMin: c.duration_min,
  }).filter((s) => new Date(s.starts_at).getTime() > now);
  if (slots.length === 0) return fail('No slots fit in that window. Check the times, interval and session length.');
  if (slots.length > 1000) return fail(`That would create ${slots.length} slots. Generate up to 1,000 at a time.`);

  const { data: inserted, error } = await sb
    .from('mini_slots')
    .upsert(slots.map((s) => ({ campaign_id: id, ...s })), { onConflict: 'campaign_id,starts_at', ignoreDuplicates: true })
    .select('id');
  if (error) return dbFail(error);
  const created = inserted?.length ?? 0;
  const skipped = slots.length - created;
  refresh(PATH, { public: true });
  return ok(
    null,
    `Created ${created} slot${created === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} already existed and were skipped)` : ''} ✓`,
  );
}

/** Deletes one slot, only if nobody has ever booked it. */
export async function deleteSlot(campaignId: string, slotId: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(campaignId).success || !uuidField.safeParse(slotId).success) return fail('Unknown slot.');
  const sb = await createClient();
  const { count } = await sb.from('mini_bookings').select('id', { count: 'exact', head: true }).eq('slot_id', slotId);
  if (count) return fail('This slot has a booking (or booking history), so it can’t be deleted.');
  const { error } = await sb.from('mini_slots').delete().eq('id', slotId).eq('campaign_id', campaignId);
  if (error) return dbFail(error, { inUse: 'This slot has booking history, so it can’t be deleted.' });
  refresh(PATH, { public: true });
  return ok(null, 'Slot deleted');
}

/** Deletes every never-booked slot of a campaign on one Moncton date. */
export async function deleteOpenSlotsOnDate(campaignId: string, date: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(campaignId).success || !isoDate.safeParse(date).success) return fail('Unknown date.');
  const sb = await createClient();
  const { data: slots, error } = await sb
    .from('mini_slots')
    .select('id, starts_at, mini_bookings(id)')
    .eq('campaign_id', campaignId);
  if (error) return dbFail(error);
  const ids = (slots ?? [])
    .filter((s) => {
      const mb = s.mini_bookings as unknown;
      const booked = Array.isArray(mb) ? mb.length > 0 : Boolean(mb);
      return monctonDateOf(s.starts_at) === date && !booked;
    })
    .map((s) => s.id);
  if (ids.length === 0) return fail('There are no unbooked slots on that date.');
  const { error: delErr } = await sb.from('mini_slots').delete().in('id', ids);
  if (delErr) return dbFail(delErr);
  refresh(PATH, { public: true });
  return ok(null, `Deleted ${ids.length} open slot${ids.length === 1 ? '' : 's'}`);
}

// ------------------------------------------------------------------ bookings
const bookingStatus = z.enum(['cancelled', 'no_show']);

/** Cancels a held/confirmed mini booking (frees the slot) or marks a no-show. */
export async function setMiniBookingStatus(bookingId: string, status: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  const st = bookingStatus.safeParse(status);
  if (!uuidField.safeParse(bookingId).success || !st.success) return fail('Unknown booking.');
  const sb = await createClient();
  const { data: b, error: bErr } = await sb.from('mini_bookings').select('status').eq('id', bookingId).single();
  if (bErr || !b) return dbFail(bErr);
  if (st.data === 'no_show' && b.status !== 'confirmed') return fail('Only confirmed bookings can be marked as a no-show.');
  if (st.data === 'cancelled' && !['held', 'confirmed'].includes(b.status)) return fail('This booking is not active.');
  const { error } = await sb.from('mini_bookings').update({ status: st.data }).eq('id', bookingId);
  if (error) return dbFail(error);
  if (st.data === 'cancelled') {
    // Unpaid invoices for a cancelled spot are voided so no reminders go out. Paid ones stay (refunds are manual).
    await sb.from('invoices').update({ status: 'void' }).eq('mini_booking_id', bookingId).in('status', ['unpaid', 'reported']);
  }
  refresh(PATH, { public: true });
  return ok(null, st.data === 'cancelled' ? 'Booking cancelled; the slot is open again.' : 'Marked as no-show');
}
