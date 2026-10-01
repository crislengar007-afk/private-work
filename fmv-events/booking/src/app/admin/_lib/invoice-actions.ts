'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, friendlyDbError, ok } from '@/lib/errors';
import { sendTemplatedEmail } from '@/lib/email';
import { formatCAD } from '@/lib/money';
import { formatDate } from '@/lib/time';
import { invoicePdfAttachment } from '@/lib/workflows';
import type { FormState } from './form-state';
import { formFields } from './form-state';
import { MONEY_PATHS, NOT_OWNER, invalid, ownerSession, revalidate } from './server';

const idSchema = z.object({ invoice_id: z.string().uuid() });

/**
 * Re-sends the invoice email with a fresh PDF: deposit/full use the
 * "quote accepted" template, balance the balance reminder, mini the mini hold.
 * Merge variables match what @/lib/workflows sends.
 */
export async function resendInvoiceEmail(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = idSchema.safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const invoiceId = parsed.data.invoice_id;

  const sb = await createClient();
  const { data: inv, error } = await sb
    .from('invoices')
    .select('id, kind, status, booking:bookings(event_date)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) return fail(friendlyDbError(error));
  if (!inv) return fail('Invoice not found.');
  if (inv.status === 'void') return fail('This invoice is void, so it can’t be re-sent.');
  if (inv.status === 'paid') return fail('This invoice is already paid.');

  const att = await invoicePdfAttachment(invoiceId);
  if (!att) return fail('Could not build the invoice PDF.');
  const { doc } = att;
  const bookingDate = (inv.booking as { event_date: string } | null)?.event_date ?? null;

  let result: { ok: boolean; status: 'sent' | 'failed' | 'skipped' };
  if (doc.invoice_kind === 'mini') {
    if (!doc.mini) return fail('The mini session for this invoice could not be found.');
    result = await sendTemplatedEmail({
      template: 'mini_held',
      to: doc.client.email,
      vars: {
        client_name: doc.client.full_name,
        campaign_name: doc.mini.campaign_name,
        slot_time: doc.mini.slot_label,
        location: doc.mini.location || 'TBA',
        amount: formatCAD(doc.amount_cents),
        reference: doc.reference,
        due: doc.dueLabel,
        pay_url: doc.pay_url,
      },
      attachments: [att.attachment],
      entity: { type: 'invoice', id: doc.id },
    });
  } else if (doc.invoice_kind === 'balance') {
    result = await sendTemplatedEmail({
      template: 'balance_reminder',
      to: doc.client.email,
      vars: {
        client_name: doc.client.full_name,
        amount: formatCAD(doc.amount_cents - doc.paid_cents),
        due: doc.dueLabel,
        event_date: bookingDate ? formatDate(bookingDate) : doc.eventLabel,
        reference: doc.reference,
        pay_url: doc.pay_url,
      },
      attachments: [att.attachment],
      entity: { type: 'invoice', id: doc.id },
    });
  } else {
    result = await sendTemplatedEmail({
      template: 'quote_accepted',
      to: doc.client.email,
      vars: {
        client_name: doc.client.full_name,
        invoice_number: doc.number,
        event_date: bookingDate ? formatDate(bookingDate) : doc.eventLabel,
        amount: formatCAD(doc.amount_cents),
        reference: doc.reference,
        due: doc.dueLabel,
        pay_url: doc.pay_url,
      },
      attachments: [att.attachment],
      entity: { type: 'invoice', id: doc.id },
    });
  }

  revalidate('/admin/invoices');
  if (result.status === 'failed') return fail('The email could not be sent. Check the email log and try again.');
  if (result.status === 'skipped') return ok(undefined, 'Email sending isn’t configured, so it was logged but not delivered.');
  return ok(undefined, `Emailed ${doc.client.email}.`);
}

/** Voids an invoice that hasn't been paid (unpaid or reported only). */
export async function voidInvoice(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = idSchema.safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const sb = await createClient();
  const { data, error } = await sb
    .from('invoices')
    .update({ status: 'void' })
    .eq('id', parsed.data.invoice_id)
    .in('status', ['unpaid', 'reported'])
    .select('id, booking_id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Only an unpaid or reported invoice can be voided.');
  revalidate(...MONEY_PATHS, ...(data[0].booking_id ? [`/admin/bookings/${data[0].booking_id}`] : []));
  return ok(undefined, 'Invoice voided.');
}
