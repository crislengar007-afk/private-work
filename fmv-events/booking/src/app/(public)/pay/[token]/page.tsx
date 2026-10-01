import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadInvoiceDoc } from '@/lib/documents';
import { invoiceQrDataUrl } from '@/lib/pdf';
import { isPlausibleToken } from '@/lib/tokens';
import { centsToDollarString, formatCAD } from '@/lib/money';
import { ButtonLink, Card, Notice, StatusBadge, buttonClass } from '@/components/ui';
import { CopyButton, Countdown } from '@/components/ui/client';
import { ReportPaymentButton } from './report-button';
import { REPORTED_MESSAGE } from './messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pay your invoice',
  robots: { index: false, follow: false },
};

async function qrFor(url: string): Promise<string | null> {
  try {
    return await invoiceQrDataUrl(url);
  } catch (e) {
    console.error('[pay] qr failed', e);
    return null;
  }
}

function CopyRow({ label, value, display, copyLabel }: { label: string; value: string; display?: React.ReactNode; copyLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 py-3 last:border-0">
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-ink-soft">{label}</dt>
        <dd className="break-all text-lg font-semibold text-ink">{display ?? value}</dd>
      </div>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isPlausibleToken(token)) notFound();
  const doc = await loadInvoiceDoc({ token });
  if (!doc) notFound();

  const due = Math.max(0, doc.amount_cents - doc.paid_cents);
  const isPaid = doc.status === 'paid' || (doc.status !== 'void' && due === 0);
  const isVoid = doc.status === 'void';
  const isReported = doc.status === 'reported' && !isPaid;
  const partiallyPaid = doc.paid_cents > 0 && !isPaid && !isVoid;
  const payable = !isPaid && !isVoid;
  const b = doc.business;
  const qr = payable ? await qrFor(doc.pay_url) : null;
  const miniRemainder =
    doc.invoice_kind === 'mini' && doc.mini && doc.mini.total_cents > doc.amount_cents ? doc.mini.total_cents - doc.amount_cents : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <p className="text-sm text-ink-soft">{b.name}</p>
      <h1 className="font-display text-4xl font-semibold text-ink">{doc.title}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <span>{doc.number}</span>
        <StatusBadge status={isPaid ? 'paid' : doc.status} />
      </p>

      {/* What it's for */}
      <Card className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">For</h2>
        <p className="mt-1 font-semibold text-ink">{doc.eventLabel || doc.title}</p>
        {doc.venue && <p className="text-sm text-ink-soft">{doc.venue}</p>}
        <p className="text-sm text-ink-soft">{doc.client.full_name}</p>
        {doc.quote && (
          <p className="mt-2 text-sm text-ink-soft">
            Quote {doc.quote.number} total {formatCAD(doc.quote.total_cents)}
          </p>
        )}
        {miniRemainder > 0 && (
          <p className="mt-2 text-sm text-ink">
            This is your deposit. The remaining {formatCAD(miniRemainder)} is due at your session.
          </p>
        )}
      </Card>

      {/* State banners */}
      {isPaid && (
        <Notice tone="ok" title="Paid – thank you" className="mt-6">
          We&rsquo;ve recorded {formatCAD(doc.paid_cents || doc.amount_cents)} for this invoice.
          {doc.booking_status === 'confirmed' && ' Your booking is confirmed.'}
        </Notice>
      )}
      {isVoid && (
        <Notice tone="warn" title="This hold expired" className="mt-6">
          <p>The deadline passed before a payment was recorded, so the time was released for other clients.</p>
          <p className="mt-2">
            {doc.mini_booking_id ? (
              <Link href="/minis" className="font-semibold underline">See open mini-session times</Link>
            ) : (
              <Link href="/build" className="font-semibold underline">Check another date</Link>
            )}
            {' '}or <Link href="/contact" className="underline">contact us</Link> if you already sent a payment.
          </p>
        </Notice>
      )}
      {isReported && (
        <Notice tone="gold" title="Payment reported" className="mt-6">
          {REPORTED_MESSAGE}
        </Notice>
      )}
      {partiallyPaid && (
        <Notice tone="neutral" title="Partly paid" className="mt-6">
          We&rsquo;ve received {formatCAD(doc.paid_cents)} of {formatCAD(doc.amount_cents)}. The remaining {formatCAD(due)} is shown below.
        </Notice>
      )}

      {payable && (
        <Card className="mt-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Pay by Interac e-Transfer</h2>
          <dl className="mt-2">
            <CopyRow label="Amount due" value={centsToDollarString(due)} display={formatCAD(due)} copyLabel="Copy amount" />
            {b.etransfer_email ? (
              <CopyRow label="Send to" value={b.etransfer_email} copyLabel="Copy email" />
            ) : (
              <div className="border-b border-line/70 py-3">
                <dt className="text-xs uppercase tracking-wide text-ink-soft">Send to</dt>
                <dd className="text-sm text-ink">
                  Contact us for e-Transfer details
                  {(b.phone || b.email) && ': '}
                  {b.phone && <span className="font-semibold">{b.phone}</span>}
                  {b.phone && b.email && ' · '}
                  {b.email && (
                    <a href={`mailto:${b.email}`} className="font-semibold text-rose-deep underline">
                      {b.email}
                    </a>
                  )}
                </dd>
              </div>
            )}
            <CopyRow label="Reference code" value={doc.reference} copyLabel="Copy reference" />
          </dl>

          <p className="mt-4 rounded-xl bg-blush-soft px-4 py-3 text-sm text-ink">
            Please put <strong className="font-semibold">{doc.reference}</strong> in the e-Transfer message.
            {b.etransfer_autodeposit && <span className="mt-1 block">No security question needed.</span>}
          </p>

          <div className="mt-4 text-sm text-ink">
            <p>
              Please send by <strong className="font-semibold">{doc.dueLabel}</strong>
            </p>
            <p>
              <Countdown to={doc.due_at} />
            </p>
            {doc.invoice_kind === 'deposit' && (
              <p className="mt-1 text-ink-soft">Your date is held until then. It&rsquo;s confirmed once we record your deposit.</p>
            )}
          </div>

          {!isReported && (
            <div className="mt-6">
              <ReportPaymentButton token={doc.public_token} />
            </div>
          )}

          {qr && (
            <figure className="mt-6 flex flex-col items-center gap-2 border-t border-line pt-6 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={qr} alt="QR code linking to this pay page" width={180} height={180} className="rounded-lg border border-line" />
              <figcaption className="text-sm text-ink-soft">Open this page on your phone</figcaption>
            </figure>
          )}
        </Card>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <a href={`/api/documents/invoice/${doc.public_token}`} className={buttonClass('secondary')} target="_blank" rel="noopener">
          Download invoice PDF
        </a>
        <ButtonLink href="/portal" variant="ghost">My bookings</ButtonLink>
      </div>
    </div>
  );
}
