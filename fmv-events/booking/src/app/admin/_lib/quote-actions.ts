'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, friendlyDbError, ok } from '@/lib/errors';
import { computeTotals, lineTotal, parseDollarsToCents } from '@/lib/money';
import { fieldErrors, quoteDraftSchema } from '@/lib/schemas';
import { sendQuote } from '@/lib/workflows';
import type { FormState, QuoteEditorInput } from './form-state';
import { NOT_OWNER, ownerSession, revalidate } from './server';

const quotePaths = (id: string, inquiryId?: string | null) => [
  `/admin/quotes/${id}`, '/admin/quotes', '/admin', ...(inquiryId ? [`/admin/inquiries/${inquiryId}`, '/admin/inquiries'] : []),
];

/**
 * Saves a draft/sent quote: validates, recomputes every total on the server,
 * replaces the lines and updates the quote. Editing a sent quote takes it back
 * to draft (the client must be sent the new version).
 */
export async function saveQuoteDraft(input: QuoteEditorInput): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  if (!input || typeof input !== 'object' || !Array.isArray(input.lines)) return fail('Invalid quote data.');

  // Dollars typed by the owner -> integer cents.
  const errors: Record<string, string[]> = {};
  const lines = input.lines.slice(0, 61).map((l, i) => {
    const cents = parseDollarsToCents(String(l?.unit_price ?? ''));
    if (cents === null) errors[`lines.${i}.unit_price_cents`] = [`Line ${i + 1}: enter a price like 450 or 450.00`];
    const qty = Number(String(l?.qty ?? '').trim());
    return {
      kind: l?.kind,
      ref_id: l?.ref_id || null,
      description: String(l?.description ?? ''),
      qty: Number.isFinite(qty) ? qty : NaN,
      unit_price_cents: cents ?? 0,
    };
  });
  const discountRaw = String(input.discount ?? '').trim();
  const discount = discountRaw === '' ? 0 : parseDollarsToCents(discountRaw);
  if (discount === null) errors.discount_cents = ['Enter the discount like 50 or 50.00'];
  if (Object.keys(errors).length) return fail(Object.values(errors)[0][0], errors);

  const parsed = quoteDraftSchema.safeParse({
    quote_id: input.quote_id,
    lines,
    discount_cents: discount ?? 0,
    valid_until: input.valid_until,
    deposit_pct: Number(input.deposit_pct),
    notes_md: input.notes_md ?? '',
  });
  if (!parsed.success) {
    const err = parsed.error;
    const first = err.issues[0];
    const where = first?.path[0] === 'lines' && typeof first.path[1] === 'number' ? `Line ${first.path[1] + 1}: ` : '';
    return fail(`${where}${first?.message ?? 'Please check the quote.'}`, fieldErrors(err));
  }
  const d = parsed.data;

  const sb = await createClient();
  const [{ data: q, error: qErr }, { data: settings, error: sErr }] = await Promise.all([
    sb.from('quotes').select('id, status, inquiry_id').eq('id', d.quote_id).maybeSingle(),
    sb.from('settings').select('tax_enabled, tax_rate_bp').eq('id', 1).single(),
  ]);
  if (qErr) return fail(friendlyDbError(qErr));
  if (!q) return fail('Quote not found.');
  if (!['draft', 'sent'].includes(q.status)) return fail(`A ${q.status} quote can no longer be edited.`);
  if (sErr || !settings) return fail(friendlyDbError(sErr, 'Could not load tax settings.'));

  const rows = d.lines.map((l, i) => ({
    quote_id: q.id,
    kind: l.kind,
    ref_id: l.kind === 'custom' ? null : (l.ref_id ?? null),
    description: l.description,
    qty: l.qty,
    unit_price_cents: l.unit_price_cents,
    line_total_cents: lineTotal(l.qty, l.unit_price_cents),
    sort: i,
  }));
  const totals = computeTotals({
    lineTotalsCents: rows.map((r) => r.line_total_cents),
    discountCents: d.discount_cents,
    taxEnabled: settings.tax_enabled,
    taxRateBp: settings.tax_rate_bp,
    depositPct: d.deposit_pct,
  });
  if (d.discount_cents > totals.subtotalCents) {
    return fail('The discount can’t be more than the subtotal.', { discount_cents: ['The discount can’t be more than the subtotal.'] });
  }

  // Insert the new lines first, then drop the old ones, so a failure never leaves the quote empty.
  const { data: oldLines } = await sb.from('quote_lines').select('id').eq('quote_id', q.id);
  const { error: insErr } = await sb.from('quote_lines').insert(rows);
  if (insErr) return fail(friendlyDbError(insErr, 'Could not save the lines.'));
  const oldIds = (oldLines ?? []).map((l) => l.id);
  if (oldIds.length) {
    const { error: delErr } = await sb.from('quote_lines').delete().in('id', oldIds);
    if (delErr) return fail(friendlyDbError(delErr, 'Could not replace the old lines.'));
  }

  const { error: upErr } = await sb
    .from('quotes')
    .update({
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      tax_rate_bp: totals.taxRateBp,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      deposit_pct: totals.depositPct,
      deposit_cents: totals.depositCents,
      valid_until: d.valid_until,
      notes_md: d.notes_md || null,
      status: 'draft',
    })
    .eq('id', q.id);
  if (upErr) return fail(friendlyDbError(upErr, 'Could not save the quote.'));

  revalidate(...quotePaths(q.id, q.inquiry_id));
  return ok(
    { status: 'draft' },
    q.status === 'sent' ? 'Saved. The quote is back to draft: send it again so the client sees the changes.' : 'Draft saved.',
  );
}

const idSchema = z.string().uuid();

/** Freezes the policies, numbers the quote, emails the client the link + PDF. */
export async function sendQuoteAction(quoteId: string): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  if (!idSchema.safeParse(quoteId).success) return fail('Invalid quote.');
  const sb = await createClient();
  const { data: q } = await sb.from('quotes').select('id, inquiry_id').eq('id', quoteId).maybeSingle();
  if (!q) return fail('Quote not found.');
  const r = await sendQuote(quoteId);
  if (!r.ok) return fail(r.error);
  revalidate(...quotePaths(quoteId, q.inquiry_id));
  return ok(undefined, 'Quote sent to the client.');
}

export async function declineQuote(quoteId: string): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  if (!idSchema.safeParse(quoteId).success) return fail('Invalid quote.');
  const sb = await createClient();
  const { data, error } = await sb
    .from('quotes')
    .update({ status: 'declined' })
    .eq('id', quoteId)
    .in('status', ['draft', 'sent'])
    .select('id, inquiry_id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Only a draft or sent quote can be marked declined.');
  revalidate(...quotePaths(quoteId, data[0].inquiry_id));
  return ok(undefined, 'Quote marked as declined.');
}
