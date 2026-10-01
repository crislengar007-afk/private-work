import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadQuoteDoc, type QuoteDoc } from '@/lib/documents';
import { getPublicSettings } from '@/lib/catalog';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlausibleToken } from '@/lib/tokens';
import { formatCAD, formatPercentBp } from '@/lib/money';
import { formatDate, formatDateTime, monctonToday } from '@/lib/time';
import { ButtonLink, Card, Notice, StatusBadge, buttonClass } from '@/components/ui';
import { LinesTable, type TotalRow } from '@/components/booking/lines-table';
import { Markdown } from '@/components/booking/markdown';
import { PolicyDetails } from '@/components/booking/policy-details';
import { AcceptForm } from './accept-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your quote',
  robots: { index: false, follow: false },
};

async function bookingForQuote(quoteId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from('bookings')
    .select('id, status, hold_expires_at')
    .eq('quote_id', quoteId)
    .maybeSingle();
  if (!booking) return { booking: null, invoice: null };
  const { data: invoice } = await admin
    .from('invoices')
    .select('public_token, number, status, amount_cents, due_at')
    .eq('booking_id', booking.id)
    .in('status', ['unpaid', 'reported'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { booking, invoice };
}

async function holdHours(): Promise<number | null> {
  try {
    return (await getPublicSettings()).hold_hours;
  } catch {
    return null;
  }
}

function totalsRows(doc: QuoteDoc): TotalRow[] {
  const rows: TotalRow[] = [{ label: 'Subtotal', cents: doc.subtotal_cents }];
  if (doc.discount_cents > 0) rows.push({ label: 'Discount', cents: doc.discount_cents, negative: true });
  if (doc.tax_cents > 0 || doc.tax_rate_bp > 0) rows.push({ label: `HST (${formatPercentBp(doc.tax_rate_bp)})`, cents: doc.tax_cents });
  rows.push({ label: 'Total', cents: doc.total_cents, strong: true });
  return rows;
}

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isPlausibleToken(token)) notFound();
  const doc = await loadQuoteDoc({ token });
  if (!doc || doc.status === 'draft') notFound();

  const today = monctonToday();
  const expired = doc.status === 'expired' || (doc.status === 'sent' && Boolean(doc.valid_until) && doc.valid_until! < today);
  const open = doc.status === 'sent' && !expired;
  const accepted = doc.status === 'accepted';
  const [acceptInfo, hours] = await Promise.all([
    accepted ? bookingForQuote(doc.id) : Promise.resolve(null),
    open ? holdHours() : Promise.resolve(null),
  ]);
  const balance = doc.total_cents - doc.deposit_cents;
  const b = doc.business;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Business header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="font-display text-2xl font-semibold text-ink">{b.name}</p>
          <p className="text-sm text-ink-soft">
            {[b.address, b.phone, b.email].filter(Boolean).join(' · ')}
          </p>
          {b.hst_number && <p className="text-xs text-ink-soft">HST # {b.hst_number}</p>}
        </div>
        <div className="text-right">
          <h1 className="font-display text-3xl font-semibold text-ink">Quote {doc.number}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            <StatusBadge status={expired ? 'expired' : doc.status} />
          </p>
          {doc.valid_until && (
            <p className="mt-1 text-xs text-ink-soft">Valid until {formatDate(doc.valid_until)}</p>
          )}
        </div>
      </header>

      {/* State banners */}
      {accepted && (
        <Card className="mt-6 border-ok/30 bg-ok-soft/40">
          <h2 className="font-display text-2xl font-semibold text-ink">Quote accepted</h2>
          <p className="mt-1 text-sm text-ink">
            Accepted by <strong className="font-semibold">{doc.accepted_name}</strong>
            {doc.accepted_at && <> on {formatDateTime(doc.accepted_at)}</>}.
          </p>
          {acceptInfo?.booking?.status === 'cancelled' ? (
            <div className="mt-3 text-sm">
              <p>This hold expired before the deposit was recorded, so the date was released.</p>
              <ButtonLink href="/build" className="mt-3">Check another date</ButtonLink>
            </div>
          ) : acceptInfo?.invoice ? (
            <div className="mt-3 text-sm">
              <p>
                Invoice {acceptInfo.invoice.number}: {formatCAD(acceptInfo.invoice.amount_cents)} due {formatDateTime(acceptInfo.invoice.due_at)}
                {acceptInfo.invoice.status === 'reported' && ' (payment reported, waiting for us to confirm)'}.
              </p>
              <ButtonLink href={`/pay/${acceptInfo.invoice.public_token}`} className="mt-3">Go to your pay page</ButtonLink>
            </div>
          ) : (
            <p className="mt-3 text-sm">
              Nothing is due right now. You can see your booking and invoices in <Link href="/portal" className="text-rose-deep underline">My bookings</Link>.
            </p>
          )}
        </Card>
      )}
      {expired && (
        <Notice tone="warn" title="This quote has expired" className="mt-6">
          Dates and prices may have changed. <Link href="/contact" className="underline">Contact us</Link> for an updated quote, or{' '}
          <Link href="/build" className="underline">start a new request</Link>.
        </Notice>
      )}
      {doc.status === 'superseded' && (
        <Notice tone="neutral" title="This quote has been replaced" className="mt-6">
          We sent you a newer version of this quote. Please use the link in our most recent email, or{' '}
          <Link href="/contact" className="underline">contact us</Link>.
        </Notice>
      )}
      {doc.status === 'declined' && (
        <Notice tone="neutral" title="This quote was declined" className="mt-6">
          Changed your mind? <Link href="/contact" className="underline">Get in touch</Link> or{' '}
          <Link href="/build" className="underline">start a new request</Link>.
        </Notice>
      )}

      {/* Client + event */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Prepared for</h2>
          <p className="mt-1 font-semibold text-ink">{doc.client.full_name}</p>
          <p className="text-sm text-ink-soft">{doc.client.email}</p>
          {doc.client.phone && <p className="text-sm text-ink-soft">{doc.client.phone}</p>}
        </Card>
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your event</h2>
          <p className="mt-1 font-semibold text-ink">{doc.event.type}</p>
          <p className="text-sm text-ink">{doc.event.dateLabel}</p>
          <p className="text-sm text-ink-soft">{doc.event.timeLabel}</p>
          {doc.event.venue && <p className="text-sm text-ink-soft">{doc.event.venue}</p>}
          {doc.event.guest_count !== null && <p className="text-sm text-ink-soft">{doc.event.guest_count} guests</p>}
        </Card>
      </section>

      {/* Lines + totals */}
      <Card className="mt-4">
        <h2 className="font-display text-2xl font-semibold text-ink">Quote details</h2>
        <div className="mt-3">
          <LinesTable
            caption={`Quote ${doc.number} line items`}
            lines={doc.lines.map((l) => ({
              description: l.qty !== 1 ? `${l.description} · ${l.qty} × ${formatCAD(l.unit_price_cents)}` : l.description,
              line_total_cents: l.line_total_cents,
            }))}
            rows={totalsRows(doc)}
          />
        </div>
        <dl className="mt-4 grid gap-2 rounded-xl bg-blush-soft px-4 py-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-soft">Deposit to confirm ({doc.deposit_pct}%)</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{formatCAD(doc.deposit_cents)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Balance before your event</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{formatCAD(balance)}</dd>
          </div>
        </dl>
        {doc.notes_md && (
          <div className="mt-4">
            <h3 className="font-semibold text-ink">Notes</h3>
            <Markdown md={doc.notes_md} className="mt-1" />
          </div>
        )}
        <p className="mt-4">
          <a href={`/api/documents/quote/${doc.public_token}`} className={buttonClass('secondary', 'sm')} target="_blank" rel="noopener">
            Download PDF
          </a>
        </p>
      </Card>

      {/* Policies */}
      <section className="mt-6" aria-labelledby="policies-heading">
        <h2 id="policies-heading" className="font-display text-2xl font-semibold text-ink">Policies</h2>
        <p className="mb-3 text-sm text-ink-soft">These are the policies that apply to this quote. Tap each one to read it.</p>
        <PolicyDetails policies={doc.policies} />
      </section>

      {/* Accept */}
      {open && (
        <Card className="mt-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Accept your quote</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">
            Sign by typing your name. This is your agreement to the quote and the policies above.
          </p>
          <AcceptForm token={doc.public_token} depositLabel={formatCAD(doc.deposit_cents)} holdHours={hours} />
        </Card>
      )}
    </div>
  );
}
