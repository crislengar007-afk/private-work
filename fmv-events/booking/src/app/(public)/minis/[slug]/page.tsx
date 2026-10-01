import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { renderMarkdown } from '@/lib/markdown';
import { formatCAD, roundCents } from '@/lib/money';
import { safePublicSettings } from '@/components/site/chrome';
import { Card, Notice } from '@/components/ui';
import { getCampaignSlots, getLiveCampaign, type MiniSlot } from '@/components/minis/data';
import { MiniBooking } from '@/components/minis/mini-booking';
import { holdMiniAction } from './actions';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const c = await getLiveCampaign(slug);
    if (!c) return { title: 'Mini session not found', robots: { index: false } };
    const title = c.season ? `${c.name} (${c.season})` : c.name;
    const where = c.location_name ? ` at ${c.location_name}` : '';
    return {
      title,
      description: `${c.duration_min}-minute mini sessions${where}, ${formatCAD(c.price_cents)}. Pick an open time and hold your spot online.`,
      alternates: { canonical: `/minis/${c.slug}` },
      openGraph: c.cover_url ? { images: [{ url: c.cover_url, alt: c.cover_alt || c.name }] } : undefined,
    };
  } catch {
    return { title: 'Mini sessions' };
  }
}

export default async function MiniCampaignPage({ params }: Props) {
  const { slug } = await params;
  const campaign = await getLiveCampaign(slug);
  if (!campaign) notFound();

  const [settings, slots] = await Promise.all([
    safePublicSettings(),
    getCampaignSlots(campaign.id).catch((e: unknown): MiniSlot[] | null => {
      console.error('[minis] slots unavailable', e instanceof Error ? e.message : e);
      return null;
    }),
  ]);

  // Mirrors hold_mini_slot(): HST only when enabled; deposit is settings.deposit_pct of the total.
  const price = campaign.price_cents ?? 0;
  const tax = settings?.tax_enabled ? roundCents((price * settings.tax_rate_bp) / 10000) : 0;
  const total = price + tax;
  const depositPct = settings?.deposit_pct ?? null;
  const dueNow =
    campaign.payment_mode === 'full' ? total : depositPct === null ? null : roundCents((total * depositPct) / 100);
  const paymentLabel =
    campaign.payment_mode === 'full'
      ? 'Pay in full to confirm'
      : depositPct === null
        ? 'Pay a deposit to confirm'
        : `Pay a ${depositPct}% deposit to confirm`;

  const descriptionHtml = renderMarkdown(campaign.description_md);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-soft">
        <Link href="/minis" className="hover:text-rose-deep">Mini sessions</Link>
        <span aria-hidden> / </span>
        <span>{campaign.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <header>
            {campaign.season && <p className="text-xs font-semibold uppercase tracking-widest text-gold-deep">{campaign.season}</p>}
            <h1 className="font-display text-4xl font-semibold text-ink sm:text-5xl">{campaign.name}</h1>
          </header>

          {campaign.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={campaign.cover_url}
              alt={campaign.cover_alt || ''}
              className="aspect-[16/9] w-full rounded-[var(--radius-card)] object-cover"
            />
          )}

          {descriptionHtml && <div className="prose-fmv text-ink" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />}
        </div>

        <aside aria-label="Session details">
          <Card className="space-y-4 lg:sticky lg:top-24">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-soft">Price</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatCAD(campaign.price_cents)}
                  {tax > 0 && <span className="ml-1 text-sm font-normal text-ink-soft">+ {formatCAD(tax)} HST</span>}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft">Session length</dt>
                <dd>{campaign.duration_min} minutes</dd>
              </div>
              {(campaign.location_name || campaign.location_address) && (
                <div>
                  <dt className="text-ink-soft">Location</dt>
                  <dd>
                    {campaign.location_name}
                    {campaign.location_address && <span className="block text-ink-soft">{campaign.location_address}</span>}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-ink-soft">Payment</dt>
                <dd>
                  {paymentLabel}
                  {dueNow !== null && campaign.payment_mode === 'deposit' && (
                    <span className="block text-ink-soft">{formatCAD(dueNow)} due to confirm</span>
                  )}
                  <span className="block text-ink-soft">By Interac e-Transfer</span>
                </dd>
              </div>
            </dl>
            <p className="rounded-lg bg-blush-soft px-3 py-2 text-xs text-ink-soft">
              Digital photos are included. Prints are available as add-ons.{' '}
              <Link href="/policies" className="text-rose-deep underline">Policies</Link>
            </p>
          </Card>
        </aside>
      </div>

      <section aria-labelledby="book-heading" className="mt-10">
        <h2 id="book-heading" className="font-display text-3xl font-semibold text-ink">Book a spot</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Times are shown in Atlantic Time (Moncton). Your spot is held for {campaign.hold_hours}{' '}
          {campaign.hold_hours === 1 ? 'hour' : 'hours'} until payment is received (or until the session starts, if sooner).
          Unpaid holds are released automatically.
        </p>
        {slots === null ? (
          <Notice tone="bad" className="mt-4" title="We couldn’t load the available times.">
            Please refresh the page in a moment.
          </Notice>
        ) : (
          <MiniBooking
            slug={campaign.slug}
            initialSlots={slots}
            holdHours={campaign.hold_hours}
            action={holdMiniAction.bind(null, campaign.slug)}
          />
        )}
      </section>
    </div>
  );
}
