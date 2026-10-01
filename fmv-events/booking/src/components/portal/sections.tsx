// Read-only lists for the client portal. Server components; data is loaded by
// the page with the user's own (RLS-scoped) Supabase session.
import Link from 'next/link';
import { formatCAD } from '@/lib/money';
import { formatDate, formatDateTime, formatShortDate } from '@/lib/time';
import { Card, CardTitle, EmptyState, StatusBadge, buttonClass } from '@/components/ui';

export interface PortalBooking {
  id: string;
  title: string;
  event_date: string;
  status: string;
  venue_name: string | null;
  venue_address: string | null;
  gallery_url: string | null;
  hold_expires_at: string | null;
}

export interface PortalQuote {
  id: string;
  number: string | null;
  status: string;
  total_cents: number;
  valid_until: string | null;
  public_token: string;
}

export interface PortalInvoice {
  id: string;
  number: string;
  kind: string;
  amount_cents: number;
  status: string;
  due_at: string;
  public_token: string;
}

export interface PortalMini {
  id: string;
  status: string;
  hold_expires_at: string | null;
  starts_at: string | null;
  campaign_name: string | null;
  location_name: string | null;
}

const invoiceKindLabel: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  full: 'Payment in full',
  mini: 'Mini session',
};

function isHttpUrl(u: string | null): u is string {
  if (!u) return false;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch {
    return false;
  }
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <CardTitle id={id} className="text-2xl">{title}</CardTitle>
      {children}
    </section>
  );
}

export function BookingsSection({ bookings }: { bookings: PortalBooking[] }) {
  return (
    <Section id="portal-bookings" title="Events">
      {bookings.length === 0 ? (
        <EmptyState>No event bookings yet.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{b.title}</p>
                    <p className="text-sm text-ink-soft">{formatDate(b.event_date)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                {(b.venue_name || b.venue_address) && (
                  <p className="text-sm text-ink-soft">
                    {b.venue_name}
                    {b.venue_name && b.venue_address ? ' · ' : ''}
                    {b.venue_address}
                  </p>
                )}
                {b.status === 'held' && b.hold_expires_at && (
                  <p className="text-sm text-warn">
                    Your date is held until {formatDateTime(b.hold_expires_at)}. Pay the deposit invoice below to confirm it.
                  </p>
                )}
                {isHttpUrl(b.gallery_url) && (
                  <a href={b.gallery_url} target="_blank" rel="noopener noreferrer" className={buttonClass('gold', 'sm')}>
                    View your photo gallery
                  </a>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function MinisSection({ minis }: { minis: PortalMini[] }) {
  if (minis.length === 0) return null;
  return (
    <Section id="portal-minis" title="Mini sessions">
      <ul className="space-y-3">
        {minis.map((m) => (
          <li key={m.id}>
            <Card className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{m.campaign_name ?? 'Mini session'}</p>
                {m.starts_at && <p className="text-sm text-ink-soft">{formatDateTime(m.starts_at)}</p>}
                {m.location_name && <p className="text-sm text-ink-soft">{m.location_name}</p>}
                {m.status === 'held' && m.hold_expires_at && (
                  <p className="mt-1 text-sm text-warn">Held until {formatDateTime(m.hold_expires_at)}. Pay the invoice below to confirm.</p>
                )}
              </div>
              <StatusBadge status={m.status} />
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function QuotesSection({ quotes }: { quotes: PortalQuote[] }) {
  return (
    <Section id="portal-quotes" title="Quotes">
      {quotes.length === 0 ? (
        <EmptyState>No quotes yet. When we send you a quote, it will appear here.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {quotes.map((q) => (
            <li key={q.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{q.number ?? 'Quote'}</p>
                  <p className="text-sm text-ink-soft">
                    <span className="tabular-nums">{formatCAD(q.total_cents)}</span>
                    {q.valid_until && q.status === 'sent' ? ` · valid until ${formatShortDate(q.valid_until)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={q.status} />
                  <Link href={`/q/${q.public_token}`} className={buttonClass(q.status === 'sent' ? 'primary' : 'secondary', 'sm')}>
                    {q.status === 'sent' ? 'Review & accept' : 'View'}
                    <span className="sr-only"> quote {q.number ?? ''}</span>
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function InvoicesSection({ invoices }: { invoices: PortalInvoice[] }) {
  return (
    <Section id="portal-invoices" title="Invoices">
      {invoices.length === 0 ? (
        <EmptyState>No invoices yet.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {invoices.map((i) => {
            const open = i.status === 'unpaid' || i.status === 'reported';
            return (
              <li key={i.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {i.number} <span className="font-normal text-ink-soft">· {invoiceKindLabel[i.kind] ?? i.kind}</span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      <span className="tabular-nums">{formatCAD(i.amount_cents)}</span>
                      {open ? ` · due ${formatDateTime(i.due_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={i.status} />
                    {i.status !== 'void' && (
                      <>
                        <Link href={`/pay/${i.public_token}`} className={buttonClass(i.status === 'unpaid' ? 'primary' : 'secondary', 'sm')}>
                          {i.status === 'unpaid' ? 'Pay' : 'View'}
                          <span className="sr-only"> invoice {i.number}</span>
                        </Link>
                        <a href={`/api/documents/invoice/${i.public_token}`} className={buttonClass('ghost', 'sm')}>
                          PDF<span className="sr-only"> of invoice {i.number}</span>
                        </a>
                      </>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
