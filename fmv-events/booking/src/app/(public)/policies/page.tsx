import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicPolicies, type PolicyRow } from '@/lib/catalog';
import { formatShortDate } from '@/lib/time';
import { Notice, PageHeader } from '@/components/ui';
import { Markdown } from '@/components/booking/markdown';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Policies & privacy',
  description: 'Deposit, cancellation, rescheduling, weather, rentals, prints, travel and privacy policies for bookings.',
};

async function loadPolicies(): Promise<PolicyRow[] | null> {
  try {
    return await getPublicPolicies();
  } catch (e) {
    console.error('[policies] unavailable', e);
    return null;
  }
}

const anchor = (key: string) => key.toLowerCase().replace(/[^a-z0-9-]+/g, '-');

export default async function PoliciesPage() {
  const policies = await loadPolicies();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <PageHeader
        title="Policies & privacy"
        description="The terms that apply to every quote and booking. Each quote keeps a copy of the versions in effect when it was sent."
      />

      {!policies ? (
        <Notice tone="warn" title="Our policies are taking a moment to load">
          Please refresh in a minute, or <Link href="/contact" className="underline">ask us a question</Link>.
        </Notice>
      ) : policies.length === 0 ? (
        <p className="text-ink-soft">No policies have been published yet.</p>
      ) : (
        <>
          <nav aria-label="Policies" className="mb-8 rounded-[var(--radius-card)] border border-line bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">On this page</h2>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {policies.map((p) => (
                <li key={p.key}>
                  <a href={`#${anchor(p.key)}`} className="text-rose-deep underline-offset-2 hover:underline">
                    {p.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-10">
            {policies.map((p) => (
              <section key={p.key} id={anchor(p.key)} aria-labelledby={`${anchor(p.key)}-title`} className="scroll-mt-24">
                <h2 id={`${anchor(p.key)}-title`} className="font-display text-3xl font-semibold text-ink">
                  {p.title}
                </h2>
                <p className="mt-1 text-xs text-ink-soft">
                  Version {p.version}
                  {p.updated_at && <> · Last updated {formatShortDate(p.updated_at)}</>}
                </p>
                <Markdown md={p.body_md} className="mt-3 text-base" />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
