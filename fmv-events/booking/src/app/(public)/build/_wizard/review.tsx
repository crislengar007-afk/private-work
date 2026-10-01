'use client';
// Step 9: summary, live estimate, deposit, policy highlights and Turnstile.
import * as React from 'react';
import type { PublicCatalog } from '@/lib/catalog';
import type { Estimate } from '@/lib/estimate';
import { eventTypeLabels } from '@/lib/schemas';
import { formatCAD, formatPercentBp } from '@/lib/money';
import { formatDate, formatWallTime } from '@/lib/time';
import { Notice } from '@/components/ui';
import { Turnstile } from '@/components/ui/client';
import { LinesTable, type TotalRow } from '@/components/booking/lines-table';
import type { Errors, PolicyHighlight, WizardSettings, WizardState } from './types';

export function StepReview({
  state,
  catalog,
  settings,
  estimate,
  policies,
  errors,
  goTo,
  onToken,
}: {
  state: WizardState;
  catalog: PublicCatalog;
  settings: WizardSettings;
  estimate: Estimate;
  policies: PolicyHighlight[];
  errors: Errors;
  goTo: (step: number) => void;
  onToken: (t: string) => void;
}) {
  const zone = catalog.zones.find((z) => z.id === state.zone_id);
  const t = estimate.totals;
  const rows: TotalRow[] = [{ label: 'Subtotal', cents: t.subtotalCents, isFrom: estimate.hasVariablePricing }];
  if (settings.tax_enabled) rows.push({ label: `HST (${formatPercentBp(t.taxRateBp)})`, cents: t.taxCents });
  rows.push({ label: 'Estimated total', cents: t.totalCents, strong: true, isFrom: estimate.hasVariablePricing });

  const items: { label: string; value: React.ReactNode; step: number }[] = [
    { label: 'Event', value: state.event_type ? eventTypeLabels[state.event_type] : '—', step: 0 },
    {
      label: 'Date & time',
      value: state.event_date
        ? `${formatDate(state.event_date)}${state.start_time && state.end_time ? `, ${formatWallTime(state.start_time)} to ${formatWallTime(state.end_time)}` : ''}`
        : '—',
      step: 1,
    },
    {
      label: 'Venue',
      value:
        [state.venue_name, state.venue_address].filter(Boolean).join(', ') ||
        'Not decided yet',
      step: 2,
    },
    { label: 'Area', value: zone ? zone.name : state.zone_id === 'unsure' ? 'Not sure yet' : '—', step: 2 },
    { label: 'Guests', value: state.guest_count || '—', step: 6 },
    { label: 'Theme', value: state.theme || '—', step: 6 },
    {
      label: 'Reference photos',
      value: state.references.length ? `${state.references.length} attached` : 'None',
      step: 6,
    },
    {
      label: 'Contact',
      value: (
        <>
          {state.contact.full_name}
          <br />
          {state.contact.email}
          <br />
          {state.contact.phone}
        </>
      ),
      step: 7,
    },
  ];

  return (
    <div className="space-y-6">
      {Object.keys(errors).length > 0 && (
        <Notice tone="bad" title="Please check a few details">
          <ul className="mt-1 list-disc pl-5">
            {Object.entries(errors).map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        </Notice>
      )}

      <section aria-labelledby="estimate-heading" className="rounded-[var(--radius-card)] border border-line bg-white p-5">
        <h3 id="estimate-heading" className="font-display text-2xl font-semibold text-ink">Your estimate</h3>
        <div className="mt-3">
          <LinesTable
            caption="Estimate"
            lines={estimate.lines.map((l) => ({ description: l.description, line_total_cents: l.line_total_cents, is_from: l.is_from }))}
            rows={rows}
            emptyText="Prices for your selection will be in your quote."
          />
        </div>
        <div className="mt-4 rounded-xl bg-blush-soft px-4 py-3 text-sm text-ink">
          <p>
            <strong className="font-semibold">Deposit to confirm your date ({settings.deposit_pct}%):</strong>{' '}
            <span className="tabular-nums">
              {estimate.hasVariablePricing ? 'from ' : ''}
              {formatCAD(t.depositCents)}
            </span>
          </p>
          <p className="mt-1 text-ink-soft">
            Paid by Interac e-Transfer after you accept your quote. The rest is due before your event.
          </p>
        </div>
        <p className="mt-3 text-sm font-medium text-ink">Final quote will be confirmed by {settings.owner_name}.</p>
        {estimate.hasVariablePricing && (
          <p className="mt-1 text-sm text-ink-soft">
            Some prices are &ldquo;from&rdquo; prices or depend on travel, so your final total may differ. Everything is spelled out in your quote before you commit.
          </p>
        )}
        {estimate.notes.map((n) => (
          <p key={n} className="mt-1 text-sm text-ink-soft">{n}</p>
        ))}
      </section>

      <section aria-labelledby="summary-heading">
        <h3 id="summary-heading" className="font-display text-2xl font-semibold text-ink">Your details</h3>
        <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
          {items.map((it) => (
            <div key={it.label} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <dt className="text-ink-soft">{it.label}</dt>
                <dd className="break-words text-ink">{it.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => goTo(it.step)}
                className="shrink-0 rounded-full px-2 py-1 text-xs text-rose-deep underline hover:bg-blush-soft"
                aria-label={`Edit ${it.label.toLowerCase()}`}
              >
                Edit
              </button>
            </div>
          ))}
        </dl>
      </section>

      {policies.length > 0 && (
        <section aria-labelledby="policies-heading">
          <h3 id="policies-heading" className="font-display text-2xl font-semibold text-ink">Good to know</h3>
          <div className="mt-3 space-y-3">
            {policies.map((p) => (
              <div key={p.key} className="rounded-xl border border-line bg-white px-4 py-3">
                <p className="font-semibold text-ink">{p.title}</p>
                <div className="prose-fmv text-sm text-ink-soft" dangerouslySetInnerHTML={{ __html: p.html }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Full policies are on the{' '}
            <a href="/policies" target="_blank" rel="noopener" className="text-rose-deep underline">
              policies page
            </a>{' '}
            and in your quote.
          </p>
        </section>
      )}

      <Notice tone="gold">
        Sending this request doesn&rsquo;t hold your date or commit you to anything. {settings.owner_name} will reply with a quote.
      </Notice>

      <Turnstile onToken={onToken} />
    </div>
  );
}
