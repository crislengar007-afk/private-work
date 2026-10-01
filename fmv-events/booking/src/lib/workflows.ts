import 'server-only';
// Server-side business workflows. Server actions and route handlers call these
// after authenticating/validating; they do the DB transaction (via SQL functions)
// and then send the emails/PDFs. An email failure never undoes a booking.

import { createAdminClient, type AdminClient } from './supabase/admin';
import { computeEstimate, type Selection } from './estimate';
import { getPublicCatalog } from './catalog';
import { sendTemplatedEmail, ownerAlertEmail } from './email';
import { loadInvoiceDoc, loadQuoteDoc } from './documents';
import { renderInvoicePdf, renderQuotePdf } from './pdf';
import { buildIcs } from './ics';
import { formatCAD } from './money';
import { formatDate, formatDateTime, formatWallTime, monctonToday } from './time';
import { formatPhone } from './phone';
import { appUrl } from './request';
import { friendlyDbError, errorCode } from './errors';
import { eventTypeLabels, type inquirySchema } from './schemas';
import type { z } from 'zod';
import type { Json } from './database.types';

type InquiryData = z.output<typeof inquirySchema>;

const eventLabel = (t: string) => eventTypeLabels[t as keyof typeof eventTypeLabels] ?? t;

// ---------------------------------------------------------------- clients
export async function upsertClient(
  admin: AdminClient,
  c: { full_name: string; email: string; phone: string | null },
): Promise<string> {
  const { data, error } = await admin
    .from('clients')
    .upsert({ full_name: c.full_name, email: c.email.trim().toLowerCase(), phone_e164: c.phone }, { onConflict: 'email_normalized' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`client upsert failed: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------- inquiry
export async function createInquiry(input: InquiryData): Promise<{ inquiryId: string; estimateCents: number }> {
  const admin = createAdminClient();
  const [catalog, { data: settings }] = await Promise.all([
    getPublicCatalog(),
    admin.from('settings').select('tax_enabled, tax_rate_bp, deposit_pct').eq('id', 1).single(),
  ]);

  // Recompute the estimate on the server from the live catalog.
  const selection: Selection = {
    package_id: input.selection.package_id ?? null,
    service_ids: input.selection.service_ids,
    addon_ids: input.selection.addon_ids,
    hours: input.selection.hours,
    qty: input.selection.qty,
  };
  const estimate = computeEstimate(selection, {
    services: catalog.services,
    packages: catalog.packages,
    addons: catalog.addons,
    zones: catalog.zones,
    zoneId: input.zone_id ?? null,
    taxEnabled: settings?.tax_enabled ?? false,
    taxRateBp: settings?.tax_rate_bp ?? 1500,
    depositPct: settings?.deposit_pct ?? 50,
  });

  const clientId = await upsertClient(admin, {
    full_name: input.contact.full_name,
    email: input.contact.email,
    phone: input.contact.phone,
  });

  const { data: inq, error } = await admin
    .from('inquiries')
    .insert({
      client_id: clientId,
      event_type: input.event_type,
      event_date: input.event_date,
      start_time: input.start_time,
      end_time: input.end_time,
      venue_name: input.venue_name || null,
      venue_address: input.venue_address || null,
      zone_id: input.zone_id ?? null,
      guest_count: input.guest_count ?? null,
      theme: input.theme || null,
      notes: input.notes || null,
      selection: selection as unknown as Json,
      reference_paths: input.reference_paths,
      estimated_total_cents: estimate.totals.totalCents,
      source: input.source ?? 'builder',
    })
    .select('id')
    .single();
  if (error || !inq) throw new Error(`inquiry insert failed: ${error?.message}`);

  const vars = {
    client_name: input.contact.full_name,
    client_email: input.contact.email,
    client_phone: formatPhone(input.contact.phone),
    event_type: eventLabel(input.event_type),
    event_date: formatDate(input.event_date),
    event_time: `${formatWallTime(input.start_time)} – ${formatWallTime(input.end_time)}`,
    venue: [input.venue_name, input.venue_address].filter(Boolean).join(', ') || 'TBD',
    estimate: estimate.hasVariablePricing ? `from ${formatCAD(estimate.totals.totalCents)}` : formatCAD(estimate.totals.totalCents),
    admin_url: appUrl(`/admin/inquiries/${inq.id}`),
  };
  await sendTemplatedEmail({ template: 'inquiry_received_client', to: input.contact.email, vars, entity: { type: 'inquiry', id: inq.id } });
  const owner = await ownerAlertEmail();
  if (owner) await sendTemplatedEmail({ template: 'inquiry_received_owner', to: owner, vars, entity: { type: 'inquiry', id: inq.id } });

  return { inquiryId: inq.id, estimateCents: estimate.totals.totalCents };
}

// ---------------------------------------------------------------- documents in storage
async function storePdf(admin: AdminClient, path: string, pdf: Buffer): Promise<string | null> {
  const { error } = await admin.storage.from('documents').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error('[pdf] upload failed', path, error.message);
    return null;
  }
  return path;
}

export async function invoicePdfAttachment(invoiceId: string) {
  const admin = createAdminClient();
  const doc = await loadInvoiceDoc({ id: invoiceId });
  if (!doc) return null;
  const pdf = await renderInvoicePdf(doc);
  const path = await storePdf(admin, `invoices/${doc.number}.pdf`, pdf);
  if (path) await admin.from('invoices').update({ pdf_path: path }).eq('id', invoiceId);
  return { doc, attachment: { filename: `${doc.number}.pdf`, content: pdf, contentType: 'application/pdf' } };
}

// ---------------------------------------------------------------- send quote
export async function sendQuote(quoteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: q } = await admin.from('quotes').select('id, status, number, valid_until, inquiry_id, total_cents').eq('id', quoteId).single();
  if (!q) return { ok: false, error: 'Quote not found.' };
  if (!['draft', 'sent'].includes(q.status)) return { ok: false, error: `A ${q.status} quote cannot be sent.` };
  if (q.total_cents <= 0) return { ok: false, error: 'Add priced lines before sending.' };

  const { data: policies } = await admin.from('policies').select('key, title, body_md, version').order('sort');
  const { data: settings } = await admin.from('settings').select('quote_valid_days').eq('id', 1).single();
  let number = q.number;
  if (!number) {
    const { data: n, error } = await admin.rpc('next_doc_number', { p_kind: 'quote' });
    if (error || !n) return { ok: false, error: 'Could not number the quote.' };
    number = n;
  }
  const validUntil = q.valid_until ?? addDaysIso(monctonToday(), settings?.quote_valid_days ?? 7);

  const { error: upErr } = await admin
    .from('quotes')
    .update({ status: 'sent', number, sent_at: new Date().toISOString(), valid_until: validUntil, policies_snapshot: policies ?? [] })
    .eq('id', quoteId);
  if (upErr) return { ok: false, error: friendlyDbError(upErr) };
  // Any other open quote for this inquiry is replaced by this one.
  await admin.from('quotes').update({ status: 'superseded' }).eq('inquiry_id', q.inquiry_id).neq('id', quoteId).in('status', ['draft', 'sent']);
  await admin.from('inquiries').update({ status: 'quoted' }).eq('id', q.inquiry_id).in('status', ['new', 'quoted']);

  const doc = await loadQuoteDoc({ id: quoteId });
  if (!doc) return { ok: false, error: 'Quote not found after sending.' };
  const pdf = await renderQuotePdf(doc);
  await storePdf(admin, `quotes/${doc.number}.pdf`, pdf);
  await sendTemplatedEmail({
    template: 'quote_sent',
    to: doc.client.email,
    vars: {
      client_name: doc.client.full_name,
      quote_number: doc.number,
      event_date: doc.event.dateLabel,
      total: formatCAD(doc.total_cents),
      deposit: formatCAD(doc.deposit_cents),
      quote_url: doc.url,
      valid_until: doc.valid_until ? formatDate(doc.valid_until) : '',
    },
    attachments: [{ filename: `${doc.number}.pdf`, content: pdf, contentType: 'application/pdf' }],
    entity: { type: 'quote', id: quoteId },
  });
  return { ok: true };
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- accept quote
export type AcceptResult =
  | { ok: true; invoiceToken: string; alreadyAccepted: boolean }
  | { ok: false; code: string | undefined; error: string };

export async function acceptQuote(token: string, name: string, ip: string): Promise<AcceptResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('accept_quote', { p_token: token, p_name: name, p_ip: ip });
  if (error) return { ok: false, code: errorCode(error), error: friendlyDbError(error) };
  const r = data as { booking_id: string; invoice_id: string; invoice_token: string; already_accepted: boolean };

  if (!r.already_accepted && r.invoice_id) {
    const att = await invoicePdfAttachment(r.invoice_id);
    if (att) {
      const { doc } = att;
      const bookingDate = doc.booking_id
        ? (await admin.from('bookings').select('event_date').eq('id', doc.booking_id).single()).data?.event_date
        : null;
      await sendTemplatedEmail({
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
  }
  return { ok: true, invoiceToken: r.invoice_token, alreadyAccepted: r.already_accepted };
}

// ---------------------------------------------------------------- report payment ("I've sent it")
export async function reportPayment(token: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('report_invoice_payment', { p_token: token });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const r = data as { invoice_id: string; changed: boolean };
  if (r.changed) {
    const doc = await loadInvoiceDoc({ id: r.invoice_id });
    const owner = await ownerAlertEmail();
    if (doc && owner) {
      await sendTemplatedEmail({
        template: 'payment_reported_owner',
        to: owner,
        vars: {
          client_name: doc.client.full_name,
          amount: formatCAD(doc.amount_cents - doc.paid_cents),
          invoice_number: doc.number,
          reference: doc.reference,
          admin_url: appUrl(`/admin/payments?ref=${encodeURIComponent(doc.reference)}`),
        },
        entity: { type: 'invoice', id: doc.id },
      });
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------- record payment (owner)
export async function recordPayment(opts: {
  invoiceId: string;
  method: 'etransfer' | 'cash' | 'other';
  amountCents: number;
  receivedAt: string;
  note: string | null;
  actorId: string;
}): Promise<{ ok: true; bookingConfirmed: boolean; miniConfirmed: boolean; invoicePaid: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_payment', {
    p_invoice_id: opts.invoiceId,
    p_method: opts.method,
    p_amount_cents: opts.amountCents,
    p_received_at: opts.receivedAt,
    p_note: opts.note ?? '',
    p_actor: opts.actorId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const r = data as { booking_confirmed: boolean; mini_confirmed: boolean; invoice_paid: boolean; balance_invoice_id: string | null; paid_cents: number };

  if (r.booking_confirmed) {
    const paid = await loadInvoiceDoc({ id: opts.invoiceId });
    let balanceLine = 'Your booking is paid in full. Thank you!';
    const attachments = [];
    if (r.balance_invoice_id) {
      const bal = await invoicePdfAttachment(r.balance_invoice_id);
      if (bal) {
        balanceLine = `The balance of **${formatCAD(bal.doc.amount_cents)}** is due **${bal.doc.dueLabel}** ([pay page](${bal.doc.pay_url}), reference **${bal.doc.reference}**). The balance invoice is attached.`;
        attachments.push(bal.attachment);
      }
    }
    if (paid) {
      const { data: b } = await admin.from('bookings').select('event_date').eq('id', paid.booking_id!).single();
      await sendTemplatedEmail({
        template: 'booking_confirmed',
        to: paid.client.email,
        vars: {
          client_name: paid.client.full_name,
          amount: formatCAD(r.paid_cents),
          event_date: b ? formatDate(b.event_date) : paid.eventLabel,
          balance_line: balanceLine,
          portal_url: appUrl('/portal'),
        },
        attachments,
        entity: { type: 'booking', id: paid.booking_id! },
      });
    }
  }

  if (r.mini_confirmed) await sendMiniConfirmation(opts.invoiceId);
  return { ok: true, bookingConfirmed: r.booking_confirmed, miniConfirmed: r.mini_confirmed, invoicePaid: r.invoice_paid };
}

async function sendMiniConfirmation(invoiceId: string) {
  const doc = await loadInvoiceDoc({ id: invoiceId });
  if (!doc?.mini) return;
  const ics = buildIcs({
    uid: `${doc.mini_booking_id}@fmv-bookings`,
    start: new Date(doc.mini.starts_at),
    end: new Date(doc.mini.ends_at),
    summary: `${doc.mini.campaign_name} – ${doc.business.name}`,
    location: doc.mini.location,
    description: `Your mini session with ${doc.business.name}.`,
    organizerName: doc.business.name,
    organizerEmail: doc.business.email ?? undefined,
  });
  await sendTemplatedEmail({
    template: 'mini_confirmed',
    to: doc.client.email,
    vars: { client_name: doc.client.full_name, campaign_name: doc.mini.campaign_name, slot_time: doc.mini.slot_label, location: doc.mini.location || 'TBA' },
    attachments: [{ filename: 'mini-session.ics', content: Buffer.from(ics, 'utf8'), contentType: 'text/calendar' }],
    entity: { type: 'mini_booking', id: doc.mini_booking_id! },
  });
}

// ---------------------------------------------------------------- mini-session hold
export async function holdMiniSlot(opts: {
  slotId: string;
  contact: { full_name: string; email: string; phone: string };
  notes: string;
}): Promise<{ ok: true; invoiceToken: string } | { ok: false; code: string | undefined; error: string }> {
  const admin = createAdminClient();
  const clientId = await upsertClient(admin, opts.contact);
  const { data, error } = await admin.rpc('hold_mini_slot', { p_slot_id: opts.slotId, p_client_id: clientId, p_notes: opts.notes });
  if (error) return { ok: false, code: errorCode(error), error: friendlyDbError(error) };
  const r = data as { invoice_id: string; invoice_token: string };
  const att = await invoicePdfAttachment(r.invoice_id);
  if (att?.doc.mini) {
    await sendTemplatedEmail({
      template: 'mini_held',
      to: opts.contact.email,
      vars: {
        client_name: opts.contact.full_name,
        campaign_name: att.doc.mini.campaign_name,
        slot_time: att.doc.mini.slot_label,
        location: att.doc.mini.location || 'TBA',
        amount: formatCAD(att.doc.amount_cents),
        reference: att.doc.reference,
        due: att.doc.dueLabel,
        pay_url: att.doc.pay_url,
      },
      attachments: [att.attachment],
      entity: { type: 'invoice', id: att.doc.id },
    });
  }
  return { ok: true, invoiceToken: r.invoice_token };
}

// ---------------------------------------------------------------- cron
export interface CronReport {
  holdsExpired: number;
  expiryEmails: number;
  quotesExpired: number;
  balanceReminders: number;
  miniReminders: number;
  completed: number;
  thankYous: number;
}

export async function runCron(now = new Date()): Promise<CronReport> {
  const admin = createAdminClient();
  const report: CronReport = { holdsExpired: 0, expiryEmails: 0, quotesExpired: 0, balanceReminders: 0, miniReminders: 0, completed: 0, thankYous: 0 };

  // 1. Release unpaid holds.
  const { data: expired } = await admin.rpc('expire_stale_holds');
  report.holdsExpired = Number(expired ?? 0);

  // 2. Tell clients whose hold was released.
  const { data: expBookings } = await admin
    .from('bookings')
    .select('id, event_date, client:clients(full_name, email)')
    .eq('status', 'cancelled').eq('cancel_reason', 'hold_expired').is('expiry_notified_at', null).limit(50);
  for (const b of expBookings ?? []) {
    const c = b.client as unknown as { full_name: string; email: string };
    await sendTemplatedEmail({
      template: 'hold_expired', to: c.email,
      vars: { client_name: c.full_name, event_date: formatDate(b.event_date), rebook_url: appUrl('/build') },
      entity: { type: 'booking', id: b.id },
    });
    await admin.from('bookings').update({ expiry_notified_at: now.toISOString() }).eq('id', b.id);
    report.expiryEmails++;
  }
  const { data: expMinis } = await admin
    .from('mini_bookings')
    .select('id, client:clients(full_name, email), slot:mini_slots(starts_at, campaign:mini_campaigns(slug))')
    .eq('status', 'cancelled').eq('cancel_reason', 'hold_expired').is('expiry_notified_at', null).limit(50);
  for (const m of expMinis ?? []) {
    const c = m.client as unknown as { full_name: string; email: string };
    const slot = m.slot as unknown as { starts_at: string; campaign: { slug: string } };
    await sendTemplatedEmail({
      template: 'mini_hold_expired', to: c.email,
      vars: { client_name: c.full_name, slot_time: formatDateTime(slot.starts_at), rebook_url: appUrl(`/minis/${slot.campaign.slug}`) },
      entity: { type: 'mini_booking', id: m.id },
    });
    await admin.from('mini_bookings').update({ expiry_notified_at: now.toISOString() }).eq('id', m.id);
    report.expiryEmails++;
  }

  // 3. Expire sent quotes past their validity.
  const { data: oldQuotes } = await admin.from('quotes').update({ status: 'expired' })
    .eq('status', 'sent').lt('valid_until', monctonToday(now)).select('id');
  report.quotesExpired = oldQuotes?.length ?? 0;

  // 4. Balance reminders: 3 days before due, and on the due date (once per day).
  const today = monctonToday(now);
  const in3 = addDaysIso(today, 3);
  const { data: balances } = await admin
    .from('invoices')
    .select('id, due_at, last_reminder_at, client:clients(email)')
    .eq('kind', 'balance').in('status', ['unpaid', 'reported']).limit(200);
  for (const inv of balances ?? []) {
    const dueDay = monctonToday(new Date(inv.due_at));
    const remindedToday = inv.last_reminder_at && monctonToday(new Date(inv.last_reminder_at)) === today;
    if (remindedToday || (dueDay !== in3 && dueDay !== today)) continue;
    const doc = await loadInvoiceDoc({ id: inv.id });
    if (!doc) continue;
    const { data: b } = await admin.from('bookings').select('event_date, status').eq('id', doc.booking_id!).single();
    if (!b || b.status !== 'confirmed') continue;
    await sendTemplatedEmail({
      template: 'balance_reminder', to: doc.client.email,
      vars: {
        client_name: doc.client.full_name, amount: formatCAD(doc.amount_cents - doc.paid_cents), due: doc.dueLabel,
        event_date: formatDate(b.event_date), reference: doc.reference, pay_url: doc.pay_url,
      },
      entity: { type: 'invoice', id: inv.id },
    });
    await admin.from('invoices').update({ last_reminder_at: now.toISOString() }).eq('id', inv.id);
    report.balanceReminders++;
  }

  // 5. Mini-session reminders ~24 h before.
  const windowEnd = new Date(now.getTime() + 25 * 3600_000).toISOString();
  const { data: upcomingMinis } = await admin
    .from('mini_bookings')
    .select('id, client:clients(full_name, email), slot:mini_slots!inner(starts_at, campaign:mini_campaigns(name, location_name, location_address))')
    .eq('status', 'confirmed').is('reminder_sent_at', null)
    .gt('slot.starts_at', now.toISOString()).lte('slot.starts_at', windowEnd).limit(100);
  for (const m of upcomingMinis ?? []) {
    const c = m.client as unknown as { full_name: string; email: string };
    const slot = m.slot as unknown as { starts_at: string; campaign: { name: string; location_name: string | null; location_address: string | null } };
    await sendTemplatedEmail({
      template: 'mini_reminder', to: c.email,
      vars: {
        client_name: c.full_name, campaign_name: slot.campaign.name, slot_time: formatDateTime(slot.starts_at),
        location: [slot.campaign.location_name, slot.campaign.location_address].filter(Boolean).join(', ') || 'TBA',
      },
      entity: { type: 'mini_booking', id: m.id },
    });
    await admin.from('mini_bookings').update({ reminder_sent_at: now.toISOString() }).eq('id', m.id);
    report.miniReminders++;
  }

  // 6. Complete past events, then thank-you + review request + gallery link.
  const { data: completed } = await admin.rpc('complete_past_bookings');
  report.completed = Number(completed ?? 0);
  const { data: settings } = await admin.from('settings').select('google_review_url, facebook_review_url').eq('id', 1).single();
  const reviewLinks = [
    settings?.google_review_url ? `- [Review us on Google](${settings.google_review_url})` : null,
    settings?.facebook_review_url ? `- [Review us on Facebook](${settings.facebook_review_url})` : null,
  ].filter(Boolean).join('\n') || 'Just reply to this email. We read every message.';
  const { data: done } = await admin
    .from('bookings')
    .select('id, gallery_url, client:clients(full_name, email)')
    .eq('status', 'completed').is('thank_you_sent_at', null).limit(50);
  for (const b of done ?? []) {
    const c = b.client as unknown as { full_name: string; email: string };
    await sendTemplatedEmail({
      template: 'thank_you', to: c.email,
      vars: {
        client_name: c.full_name,
        gallery_line: b.gallery_url ? `Your gallery is ready: [view your photos](${b.gallery_url})` : 'We’ll send your gallery link as soon as it’s ready.',
        review_links: reviewLinks,
      },
      entity: { type: 'booking', id: b.id },
    });
    await admin.from('bookings').update({ thank_you_sent_at: now.toISOString() }).eq('id', b.id);
    report.thankYous++;
  }
  return report;
}
