'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, friendlyDbError, ok } from '@/lib/errors';
import { computeTotals } from '@/lib/money';
import { monctonToday } from '@/lib/time';
import { randomToken } from '@/lib/tokens';
import type { FormState } from './form-state';
import { formFields } from './form-state';
import { INQUIRY_STATUSES } from './labels';
import { NOT_OWNER, invalid, ownerSession, revalidate } from './server';
import { addDaysIso } from './dates';
import { buildQuoteLinesFromInquiry, loadTeamCatalog, parseSelection } from './catalog';

const statusSchema = z.object({
  inquiry_id: z.string().uuid(),
  status: z.enum(INQUIRY_STATUSES),
});

export async function setInquiryStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = statusSchema.safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const sb = await createClient();
  const { data, error } = await sb.from('inquiries').update({ status: parsed.data.status }).eq('id', parsed.data.inquiry_id).select('id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Inquiry not found.');
  revalidate('/admin/inquiries', `/admin/inquiries/${parsed.data.inquiry_id}`, '/admin');
  return ok(undefined, `Moved to ${parsed.data.status}.`);
}

/**
 * One click: a draft quote pre-filled from the inquiry's selection, priced from
 * the team-visible catalog (so drafts/unpriced items show up as $0 lines to fill in).
 */
export async function createQuoteFromInquiry(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = z.object({ inquiry_id: z.string().uuid() }).safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const inquiryId = parsed.data.inquiry_id;

  const sb = await createClient();
  const [{ data: inq, error: inqErr }, { data: settings, error: setErr }, catalog] = await Promise.all([
    sb.from('inquiries').select('id, client_id, zone_id, selection, status').eq('id', inquiryId).maybeSingle(),
    sb.from('settings').select('tax_enabled, tax_rate_bp, deposit_pct, quote_valid_days').eq('id', 1).single(),
    loadTeamCatalog(sb),
  ]);
  if (inqErr) return fail(friendlyDbError(inqErr));
  if (!inq) return fail('Inquiry not found.');
  if (setErr || !settings) return fail(friendlyDbError(setErr, 'Could not load settings.'));
  if (!catalog) return fail('Could not load the catalog. Please try again.');

  const lines = buildQuoteLinesFromInquiry(parseSelection(inq.selection), inq.zone_id, catalog, settings);
  const totals = computeTotals({
    lineTotalsCents: lines.map((l) => l.line_total_cents),
    discountCents: 0,
    taxEnabled: settings.tax_enabled,
    taxRateBp: settings.tax_rate_bp,
    depositPct: settings.deposit_pct,
  });

  const { data: quote, error: qErr } = await sb
    .from('quotes')
    .insert({
      inquiry_id: inq.id,
      client_id: inq.client_id,
      status: 'draft',
      public_token: randomToken(),
      valid_until: addDaysIso(monctonToday(), settings.quote_valid_days),
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      tax_rate_bp: totals.taxRateBp,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      deposit_pct: totals.depositPct,
      deposit_cents: totals.depositCents,
    })
    .select('id')
    .single();
  if (qErr || !quote) return fail(friendlyDbError(qErr, 'Could not create the quote.'));

  if (lines.length > 0) {
    const { error: lErr } = await sb.from('quote_lines').insert(lines.map((l, i) => ({ ...l, quote_id: quote.id, sort: i })));
    if (lErr) {
      await sb.from('quotes').delete().eq('id', quote.id);
      return fail(friendlyDbError(lErr, 'Could not add the quote lines.'));
    }
  }

  revalidate('/admin/quotes', `/admin/inquiries/${inq.id}`, '/admin/inquiries');
  redirect(`/admin/quotes/${quote.id}`);
}
