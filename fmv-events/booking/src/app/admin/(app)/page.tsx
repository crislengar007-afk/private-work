import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTeam } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDate, formatDateTime, monctonToday, formatTime } from '@/lib/time';
import { Badge, EmptyState, Money, Notice, PageHeader, StatusBadge, Table, Td, Th } from '@/components/ui';
import { Countdown } from '@/components/ui/client';
import { Section, sp1, type SearchParams } from '../_components/bits';
import { addDaysIso, monthLabel, monthOf, monthRangeUtc, nowMs, parseTstzRange } from '../_lib/dates';
import { eventLabel, invoiceKindLabels } from '../_lib/labels';

export const metadata: Metadata = { title: 'Dashboard' };

type ClientRef = { full_name: string } | null;
const clientName = (c: unknown) => (c as ClientRef)?.full_name ?? '—';
const paidOf = (p: { amount_cents: number }[] | null | undefined) => (p ?? []).reduce((a, x) => a + Number(x.amount_cents), 0);

function StatCard({ label, value, href, hint, tone }: { label: string; value: React.ReactNode; href?: string; hint?: React.ReactNode; tone?: 'warn' | 'rose' | 'ok' }) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold tabular-nums ${tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-rose-deep'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </>
  );
  const cls = 'block rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-sm';
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-rose-deep`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, sp] = await Promise.all([requireTeam(), searchParams]);
  const isOwner = session.role === 'owner';
  const sb = await createClient();

  const today = monctonToday();
  const in7 = addDaysIso(today, 7);
  const in30 = addDaysIso(today, 30);
  const now = nowMs();
  const in24h = new Date(now + 24 * 3600_000).toISOString();
  const month = monthOf(today);
  const { start: monthStart, end: monthEnd } = monthRangeUtc(month);

  const [upcomingRes, holdsRes] = await Promise.all([
    sb.from('bookings')
      .select('id, title, status, event_type, event_date, period, venue_name, client:clients(full_name)')
      .in('status', ['held', 'confirmed'])
      .gte('event_date', today)
      .lte('event_date', in30)
      .order('event_date')
      .limit(100),
    sb.from('bookings')
      .select('id, title, event_date, hold_expires_at, client:clients(full_name)')
      .eq('status', 'held')
      .lte('hold_expires_at', in24h)
      .order('hold_expires_at')
      .limit(50),
  ]);
  const upcoming = upcomingRes.data ?? [];
  const next7 = upcoming.filter((b) => b.event_date <= in7);
  const holds = holdsRes.data ?? [];

  let owner: null | {
    newInquiries: { id: string; event_type: string; event_date: string; estimated_total_cents: number | null; created_at: string; client: unknown }[];
    newCount: number;
    sentQuotes: { id: string; number: string | null; valid_until: string | null; total_cents: number; client: unknown; inquiry: unknown }[];
    reported: { id: string; number: string; kind: string; amount_cents: number; etransfer_reference: string; reported_at: string | null; client: unknown; payments: { amount_cents: number }[] }[];
    balances: { id: string; number: string; amount_cents: number; due_at: string; etransfer_reference: string; status: string; client: unknown; payments: { amount_cents: number }[]; booking: unknown }[];
    bookedCents: number;
    receivedCents: number;
  } = null;

  if (isOwner) {
    const [inqRes, quoteRes, repRes, balRes, accRes, payRes] = await Promise.all([
      sb.from('inquiries')
        .select('id, event_type, event_date, estimated_total_cents, created_at, client:clients(full_name)', { count: 'exact' })
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(8),
      sb.from('quotes')
        .select('id, number, valid_until, total_cents, client:clients(full_name), inquiry:inquiries(event_date, event_type)')
        .eq('status', 'sent')
        .order('valid_until')
        .limit(50),
      sb.from('invoices')
        .select('id, number, kind, amount_cents, etransfer_reference, reported_at, client:clients(full_name), payments(amount_cents)')
        .eq('status', 'reported')
        .order('reported_at')
        .limit(50),
      sb.from('invoices')
        .select('id, number, amount_cents, due_at, etransfer_reference, status, client:clients(full_name), payments(amount_cents), booking:bookings(id, title, event_date, status)')
        .eq('kind', 'balance')
        .in('status', ['unpaid', 'reported'])
        .order('due_at')
        .limit(100),
      sb.from('quotes').select('total_cents').eq('status', 'accepted').gte('accepted_at', monthStart.toISOString()).lt('accepted_at', monthEnd.toISOString()),
      sb.from('payments').select('amount_cents').gte('received_at', monthStart.toISOString()).lt('received_at', monthEnd.toISOString()),
    ]);
    owner = {
      newInquiries: inqRes.data ?? [],
      newCount: inqRes.count ?? inqRes.data?.length ?? 0,
      sentQuotes: quoteRes.data ?? [],
      reported: repRes.data ?? [],
      balances: balRes.data ?? [],
      bookedCents: (accRes.data ?? []).reduce((a, q) => a + Number(q.total_cents), 0),
      receivedCents: (payRes.data ?? []).reduce((a, p) => a + Number(p.amount_cents), 0),
    };
  }

  const unpaidBalanceCents = owner ? owner.balances.reduce((a, i) => a + (Number(i.amount_cents) - paidOf(i.payments)), 0) : 0;

  return (
    <>
      <PageHeader title="Dashboard" description={`Today is ${formatShortDate(today)} (Atlantic Time).`} />
      {sp1(sp.denied) === '1' && (
        <Notice tone="warn" title="Owner access required" className="mb-6">
          That page is only available to the owner.
        </Notice>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {owner && <StatCard label="New inquiries" value={owner.newCount} href="/admin/inquiries" tone="rose" />}
        {owner && <StatCard label="Quotes awaiting response" value={owner.sentQuotes.length} href="/admin/quotes?status=sent" />}
        <StatCard label="Holds expiring (24 h)" value={holds.length} href="/admin/bookings?status=held" tone={holds.length ? 'warn' : undefined} />
        {owner && (
          <StatCard
            label="Deposits reported"
            value={owner.reported.length}
            href="/admin/payments"
            hint="Sent by the client, not yet recorded"
            tone={owner.reported.length ? 'warn' : undefined}
          />
        )}
        <StatCard label="Events next 7 days" value={next7.length} href="/admin/calendar?view=week" hint={`${upcoming.length} in the next 30 days`} />
        {owner && (
          <StatCard label="Unpaid balances" value={<Money cents={unpaidBalanceCents} />} href="/admin/invoices?kind=balance&status=open" hint={`${owner.balances.length} invoice${owner.balances.length === 1 ? '' : 's'}`} />
        )}
        {owner && (
          <StatCard
            label={`Booked in ${monthLabel(month)}`}
            value={<Money cents={owner.bookedCents} />}
            tone="ok"
            hint={
              <>
                Accepted quotes · <Money cents={owner.receivedCents} /> received
              </>
            }
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {owner && owner.reported.length > 0 && (
          <Section title="Deposits reported, not recorded" className="xl:col-span-2">
            <Table>
              <thead>
                <tr><Th>Reference</Th><Th>Client</Th><Th>Invoice</Th><Th className="text-right">Due now</Th><Th className="hidden md:table-cell">Reported</Th><Th><span className="sr-only">Action</span></Th></tr>
              </thead>
              <tbody>
                {owner.reported.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-mono font-semibold">{i.etransfer_reference}</Td>
                    <Td>{clientName(i.client)}</Td>
                    <Td>{i.number} <span className="text-ink-soft">· {invoiceKindLabels[i.kind]}</span></Td>
                    <Td className="text-right"><Money cents={Number(i.amount_cents) - paidOf(i.payments)} /></Td>
                    <Td className="hidden md:table-cell">{i.reported_at ? formatDateTime(i.reported_at) : '—'}</Td>
                    <Td><Link className="text-rose-deep underline" href={`/admin/payments?ref=${encodeURIComponent(i.etransfer_reference)}`}>Record</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        )}

        <Section title="Holds expiring in the next 24 hours">
          {holds.length === 0 ? (
            <EmptyState>No holds expiring soon.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {holds.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/admin/bookings/${b.id}`} className="font-medium text-ink hover:text-rose-deep">{b.title}</Link>
                    <p className="text-xs text-ink-soft">{clientName(b.client)} · {formatShortDate(b.event_date)}</p>
                  </div>
                  {b.hold_expires_at && <Countdown to={b.hold_expires_at} className="text-sm" />}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Upcoming events" actions={<Link href="/admin/calendar" className="text-sm text-rose-deep underline">Calendar</Link>}>
          {upcoming.length === 0 ? (
            <EmptyState>No events in the next 30 days.</EmptyState>
          ) : (
            <>
              {[{ label: 'Next 7 days', list: next7 }, { label: '8–30 days', list: upcoming.filter((b) => b.event_date > in7) }].map((g) => (
                <div key={g.label} className="mb-3">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{g.label}</h3>
                  {g.list.length === 0 ? (
                    <p className="text-sm text-ink-soft">None.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {g.list.map((b) => {
                        const r = parseTstzRange(b.period);
                        return (
                          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div>
                              <Link href={`/admin/bookings/${b.id}`} className="font-medium text-ink hover:text-rose-deep">{b.title}</Link>
                              <p className="text-xs text-ink-soft">
                                {formatShortDate(b.event_date)}
                                {r && ` · ${formatTime(r.start)}–${formatTime(r.end)}`} · {clientName(b.client)}
                                {b.venue_name && ` · ${b.venue_name}`}
                              </p>
                            </div>
                            <StatusBadge status={b.status} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </>
          )}
        </Section>

        {owner && (
          <Section title="New inquiries" actions={<Link href="/admin/inquiries" className="text-sm text-rose-deep underline">Pipeline</Link>}>
            {owner.newInquiries.length === 0 ? (
              <EmptyState>No new inquiries.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {owner.newInquiries.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/admin/inquiries/${i.id}`} className="font-medium text-ink hover:text-rose-deep">{clientName(i.client)}</Link>
                      <p className="text-xs text-ink-soft">{eventLabel(i.event_type)} · {formatShortDate(i.event_date)} · received {formatShortDate(i.created_at)}</p>
                    </div>
                    <Money cents={i.estimated_total_cents} className="text-sm" />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {owner && (
          <Section title="Quotes awaiting response" actions={<Link href="/admin/quotes?status=sent" className="text-sm text-rose-deep underline">All quotes</Link>}>
            {owner.sentQuotes.length === 0 ? (
              <EmptyState>No quotes waiting on a client.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {owner.sentQuotes.slice(0, 10).map((q) => {
                  const inq = q.inquiry as { event_date: string; event_type: string } | null;
                  const expired = q.valid_until !== null && q.valid_until < today;
                  return (
                    <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <Link href={`/admin/quotes/${q.id}`} className="font-medium text-ink hover:text-rose-deep">{q.number ?? 'Quote'} · {clientName(q.client)}</Link>
                        <p className="text-xs text-ink-soft">
                          {inq ? `${eventLabel(inq.event_type)} · ${formatShortDate(inq.event_date)}` : ''}
                          {q.valid_until && ` · valid until ${formatShortDate(q.valid_until)}`}
                          {expired && <Badge tone="bad" className="ml-1">past validity</Badge>}
                        </p>
                      </div>
                      <Money cents={q.total_cents} className="text-sm" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        {owner && (
          <Section title="Unpaid balances" actions={<Link href="/admin/invoices?kind=balance&status=open" className="text-sm text-rose-deep underline">Invoices</Link>}>
            {owner.balances.length === 0 ? (
              <EmptyState>No balances outstanding.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {owner.balances.slice(0, 10).map((i) => {
                  const b = i.booking as { id: string; title: string; event_date: string } | null;
                  const overdue = new Date(i.due_at).getTime() < now;
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p className="font-medium text-ink">
                          {clientName(i.client)}
                          {b && (
                            <>
                              {' · '}
                              <Link href={`/admin/bookings/${b.id}`} className="hover:text-rose-deep">{b.title}</Link>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {i.number} · ref {i.etransfer_reference} · due {formatShortDate(i.due_at)}
                          {overdue && <Badge tone="bad" className="ml-1">overdue</Badge>}
                          {i.status === 'reported' && <Badge tone="gold" className="ml-1">reported</Badge>}
                        </p>
                      </div>
                      <Money cents={Number(i.amount_cents) - paidOf(i.payments)} className="text-sm" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
