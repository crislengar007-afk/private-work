'use server';
import { createClient } from '@/lib/supabase/server';
import { fail, ok } from '@/lib/errors';
import { formatCAD, parseDollarsToCents } from '@/lib/money';
import { recordPaymentSchema } from '@/lib/schemas';
import { monctonToUtc } from '@/lib/time';
import { recordPayment } from '@/lib/workflows';
import type { FormState } from './form-state';
import { formFields } from './form-state';
import { MONEY_PATHS, NOT_OWNER, invalid, ownerSession, revalidate } from './server';

/**
 * Records a payment the owner has received. Only this confirms a booking or a
 * mini session ("I've sent it" on the Pay page never does).
 */
export async function recordPaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await ownerSession();
  if (!session?.userId) return fail(NOT_OWNER);

  const parsed = recordPaymentSchema.safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const amountCents = parseDollarsToCents(d.amount);
  if (amountCents === null || amountCents <= 0) {
    return fail('Enter the amount received, like 450 or 450.00.', { amount: ['Enter the amount received, like 450 or 450.00.'] });
  }

  // The received date is a Moncton calendar day; store it at local noon.
  const receivedAt = monctonToUtc(d.received_on, '12:00').toISOString();
  const r = await recordPayment({
    invoiceId: d.invoice_id,
    method: d.method,
    amountCents,
    receivedAt,
    note: d.note || null,
    actorId: session.userId,
  });
  if (!r.ok) return fail(r.error);

  const sb = await createClient();
  const { data: inv } = await sb
    .from('invoices')
    .select('id, booking_id, mini_booking_id, amount_cents, payments(amount_cents)')
    .eq('id', d.invoice_id)
    .maybeSingle();

  let message: string;
  if (r.bookingConfirmed) {
    const { data: balance } = inv?.booking_id
      ? await sb.from('invoices').select('id').eq('booking_id', inv.booking_id).eq('kind', 'balance').neq('status', 'void').limit(1)
      : { data: null };
    message = balance?.length
      ? 'Payment recorded. Booking confirmed and balance invoice sent.'
      : 'Payment recorded. Booking confirmed (paid in full) and confirmation sent.';
  } else if (r.miniConfirmed) {
    message = 'Payment recorded. Mini session confirmed and the confirmation (with calendar invite) sent.';
  } else if (r.invoicePaid) {
    message = 'Payment recorded. The invoice is now paid.';
  } else {
    const paid = (inv?.payments ?? []).reduce((a, p) => a + Number(p.amount_cents), 0);
    const left = inv ? Number(inv.amount_cents) - paid : null;
    message = left !== null && left > 0 ? `Partial payment recorded. ${formatCAD(left)} is still due on this invoice.` : 'Payment recorded.';
  }

  revalidate(
    ...MONEY_PATHS,
    ...(inv?.booking_id ? [`/admin/bookings/${inv.booking_id}`] : []),
    '/admin/minis',
  );
  return ok({ invoiceId: d.invoice_id }, message);
}
