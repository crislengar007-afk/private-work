import 'server-only';
import { createAdminClient } from './supabase/admin';
import { appUrl } from './request';
import { formatDate, formatDateTime, formatWallTime } from './time';
import { formatPhone } from './phone';

// Loads everything a quote/invoice PDF or page needs, by id, with the service role.
// Callers must have authorized access first (owner session, or the public token).

export interface DocLine { description: string; qty: number; unit_price_cents: number; line_total_cents: number; kind: string }
export interface DocPolicy { key: string; title: string; body_md: string; version: number }

export interface DocBusiness {
  name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  address: string;
  hst_number: string | null;
  tax_enabled: boolean;
  etransfer_email: string | null;
  etransfer_autodeposit: boolean;
}

export interface QuoteDoc {
  kind: 'quote';
  id: string;
  number: string;
  status: string;
  public_token: string;
  created_at: string;
  valid_until: string | null;
  client: { full_name: string; email: string; phone: string };
  event: { type: string; date: string; dateLabel: string; timeLabel: string; venue: string; guest_count: number | null };
  lines: DocLine[];
  subtotal_cents: number;
  discount_cents: number;
  tax_rate_bp: number;
  tax_cents: number;
  total_cents: number;
  deposit_pct: number;
  deposit_cents: number;
  notes_md: string | null;
  policies: DocPolicy[];
  accepted_at: string | null;
  accepted_name: string | null;
  business: DocBusiness;
  url: string;
}

export interface InvoiceDoc {
  kind: 'invoice';
  id: string;
  number: string;
  invoice_kind: 'deposit' | 'balance' | 'full' | 'mini';
  status: string;
  public_token: string;
  amount_cents: number;
  tax_cents: number;
  paid_cents: number;
  due_at: string;
  dueLabel: string;
  reference: string;
  created_at: string;
  client: { full_name: string; email: string; phone: string };
  title: string;
  eventLabel: string;
  venue: string;
  booking_id: string | null;
  mini_booking_id: string | null;
  booking_status: string | null;
  quote: { number: string | null; total_cents: number; lines: DocLine[]; policies: DocPolicy[] } | null;
  mini: { campaign_name: string; slot_label: string; location: string; total_cents: number; starts_at: string; ends_at: string; payment_mode: 'deposit' | 'full' } | null;
  business: DocBusiness;
  pay_url: string;
}

const eventTypeLabel = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function loadBusiness(): Promise<DocBusiness> {
  const admin = createAdminClient();
  const { data: s } = await admin.from('settings').select('*').eq('id', 1).single();
  if (!s) throw new Error('settings row missing');
  const addr = [s.address_line, s.city, s.province, s.postal_code].filter(Boolean).join(', ');
  return {
    name: s.business_name,
    owner_name: s.owner_name,
    phone: formatPhone(s.phone_e164),
    email: s.email,
    address: addr,
    hst_number: s.hst_number,
    tax_enabled: s.tax_enabled,
    etransfer_email: s.etransfer_email,
    etransfer_autodeposit: s.etransfer_autodeposit,
  };
}

export async function loadQuoteDoc(where: { id?: string; token?: string }): Promise<QuoteDoc | null> {
  const admin = createAdminClient();
  let q = admin.from('quotes').select(`
      id, number, status, public_token, created_at, valid_until, subtotal_cents, discount_cents, tax_rate_bp,
      tax_cents, total_cents, deposit_pct, deposit_cents, notes_md, policies_snapshot, accepted_at, accepted_name,
      client:clients(full_name, email, phone_e164),
      inquiry:inquiries(event_type, event_date, start_time, end_time, venue_name, venue_address, guest_count),
      quote_lines(description, qty, unit_price_cents, line_total_cents, kind, sort)`);
  if (where.id) q = q.eq('id', where.id);
  else if (where.token) q = q.eq('public_token', where.token);
  else return null;
  const { data } = await q.maybeSingle();
  if (!data) return null;

  const business = await loadBusiness();
  const inq = data.inquiry as unknown as { event_type: string; event_date: string; start_time: string; end_time: string; venue_name: string | null; venue_address: string | null; guest_count: number | null };
  const client = data.client as unknown as { full_name: string; email: string; phone_e164: string | null };
  let policies = (data.policies_snapshot as unknown as DocPolicy[] | null) ?? null;
  if (!policies) {
    const { data: live } = await admin.from('policies').select('key, title, body_md, version').order('sort');
    policies = live ?? [];
  }

  return {
    kind: 'quote',
    id: data.id,
    number: data.number ?? 'DRAFT',
    status: data.status,
    public_token: data.public_token,
    created_at: data.created_at,
    valid_until: data.valid_until,
    client: { full_name: client.full_name, email: client.email, phone: formatPhone(client.phone_e164) },
    event: {
      type: eventTypeLabel(inq.event_type),
      date: inq.event_date,
      dateLabel: formatDate(inq.event_date),
      timeLabel: `${formatWallTime(inq.start_time)} – ${formatWallTime(inq.end_time)}`,
      venue: [inq.venue_name, inq.venue_address].filter(Boolean).join(', '),
      guest_count: inq.guest_count,
    },
    lines: [...(data.quote_lines ?? [])].sort((a, b) => a.sort - b.sort).map((l) => ({ ...l, qty: Number(l.qty) })),
    subtotal_cents: data.subtotal_cents,
    discount_cents: data.discount_cents,
    tax_rate_bp: data.tax_rate_bp,
    tax_cents: data.tax_cents,
    total_cents: data.total_cents,
    deposit_pct: data.deposit_pct,
    deposit_cents: data.deposit_cents,
    notes_md: data.notes_md,
    policies,
    accepted_at: data.accepted_at,
    accepted_name: data.accepted_name,
    business,
    url: appUrl(`/q/${data.public_token}`),
  };
}

export async function loadInvoiceDoc(where: { id?: string; token?: string }): Promise<InvoiceDoc | null> {
  const admin = createAdminClient();
  let q = admin.from('invoices').select(`
      id, number, kind, status, public_token, amount_cents, tax_cents, due_at, etransfer_reference, created_at,
      booking_id, mini_booking_id,
      client:clients(full_name, email, phone_e164),
      payments(amount_cents),
      booking:bookings(id, title, status, event_date, period, venue_name, venue_address, quote_id),
      mini:mini_bookings(id, status, slot:mini_slots(starts_at, ends_at, campaign:mini_campaigns(name, location_name, location_address, price_cents, payment_mode)))`);
  if (where.id) q = q.eq('id', where.id);
  else if (where.token) q = q.eq('public_token', where.token);
  else return null;
  const { data } = await q.maybeSingle();
  if (!data) return null;

  const business = await loadBusiness();
  const client = data.client as unknown as { full_name: string; email: string; phone_e164: string | null };
  const booking = data.booking as unknown as { id: string; title: string; status: string; event_date: string; venue_name: string | null; venue_address: string | null; quote_id: string } | null;
  const mini = data.mini as unknown as {
    id: string; status: string;
    slot: { starts_at: string; ends_at: string; campaign: { name: string; location_name: string | null; location_address: string | null; price_cents: number | null; payment_mode: 'deposit' | 'full' } };
  } | null;
  const paid = (data.payments ?? []).reduce((a, p) => a + Number(p.amount_cents), 0);

  let quote: InvoiceDoc['quote'] = null;
  if (booking) {
    const qd = await loadQuoteDoc({ id: booking.quote_id });
    if (qd) quote = { number: qd.number, total_cents: qd.total_cents, lines: qd.lines, policies: qd.policies };
  }

  const kindTitle: Record<string, string> = { deposit: 'Deposit invoice', balance: 'Balance invoice', full: 'Invoice', mini: 'Mini session invoice' };
  let miniInfo: InvoiceDoc['mini'] = null;
  if (mini) {
    const { data: s } = await admin.from('settings').select('tax_enabled, tax_rate_bp').eq('id', 1).single();
    const price = mini.slot.campaign.price_cents ?? 0;
    const total = price + (s?.tax_enabled ? Math.round((price * s.tax_rate_bp) / 10000) : 0);
    miniInfo = {
      campaign_name: mini.slot.campaign.name,
      slot_label: formatDateTime(mini.slot.starts_at),
      location: [mini.slot.campaign.location_name, mini.slot.campaign.location_address].filter(Boolean).join(', '),
      total_cents: total,
      starts_at: mini.slot.starts_at,
      ends_at: mini.slot.ends_at,
      payment_mode: mini.slot.campaign.payment_mode,
    };
  }

  return {
    kind: 'invoice',
    id: data.id,
    number: data.number,
    invoice_kind: data.kind,
    status: data.status,
    public_token: data.public_token,
    amount_cents: data.amount_cents,
    tax_cents: data.tax_cents,
    paid_cents: paid,
    due_at: data.due_at,
    dueLabel: formatDateTime(data.due_at),
    reference: data.etransfer_reference,
    created_at: data.created_at,
    client: { full_name: client.full_name, email: client.email, phone: formatPhone(client.phone_e164) },
    title: kindTitle[data.kind] ?? 'Invoice',
    eventLabel: booking ? `${booking.title}` : miniInfo ? `${miniInfo.campaign_name} · ${miniInfo.slot_label}` : '',
    venue: booking ? [booking.venue_name, booking.venue_address].filter(Boolean).join(', ') : miniInfo?.location ?? '',
    booking_id: data.booking_id,
    mini_booking_id: data.mini_booking_id,
    booking_status: booking?.status ?? mini?.status ?? null,
    quote,
    mini: miniInfo,
    business,
    pay_url: appUrl(`/pay/${data.public_token}`),
  };
}
