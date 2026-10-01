import Link from 'next/link';
import { formatCAD } from '@/lib/money';
import { formatDateTime } from '@/lib/time';
import { Badge, buttonClass } from '@/components/ui';
import type { MiniCampaignSummary } from './data';

export function MiniCampaignCard({ campaign }: { campaign: MiniCampaignSummary }) {
  const href = `/minis/${campaign.slug}`;
  const soldOut = campaign.open_slots === 0;
  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-sm">
      <div className="aspect-[4/3] bg-blush-soft">
        {campaign.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.cover_url}
            alt={campaign.cover_alt || ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div aria-hidden className="flex h-full items-center justify-center font-display text-3xl text-rose-deep/60">
            {campaign.season ?? 'Minis'}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          {campaign.season && <p className="text-xs font-semibold uppercase tracking-widest text-gold-deep">{campaign.season}</p>}
          <h2 className="font-display text-2xl font-semibold text-ink">
            <Link href={href} className="hover:text-rose-deep">{campaign.name}</Link>
          </h2>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-soft">Price</dt>
          <dd className="font-semibold tabular-nums">{formatCAD(campaign.price_cents)}</dd>
          <dt className="text-ink-soft">Session</dt>
          <dd>{campaign.duration_min} min</dd>
          {campaign.location_name && (
            <>
              <dt className="text-ink-soft">Location</dt>
              <dd>{campaign.location_name}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {soldOut ? (
            <Badge tone="neutral">Fully booked</Badge>
          ) : (
            <Badge tone="ok">
              {campaign.open_slots} open {campaign.open_slots === 1 ? 'spot' : 'spots'}
            </Badge>
          )}
          {campaign.next_slot_at && <span className="text-ink-soft">Next: {formatDateTime(campaign.next_slot_at)}</span>}
        </div>
        <div className="mt-auto pt-2">
          <Link href={href} className={buttonClass(soldOut ? 'secondary' : 'primary', 'md', 'w-full')}>
            {soldOut ? 'See details' : 'Book a spot'}
            <span className="sr-only"> for {campaign.name}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
