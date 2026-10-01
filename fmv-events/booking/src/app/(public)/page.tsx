import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicSettings, type PublicSettings } from '@/lib/catalog';
import { ButtonLink, Notice } from '@/components/ui';
import { HowItWorks } from './_home/how-it-works';

export const revalidate = 300;

export const metadata: Metadata = {
  description:
    'Plan your wedding, birthday, shower or corporate event: build it online, get a quote, and secure your date with an e-Transfer deposit.',
};

async function loadSettings(): Promise<PublicSettings | null> {
  try {
    return await getPublicSettings();
  } catch (e) {
    console.error('[home] settings unavailable', e);
    return null;
  }
}

export default async function HomePage() {
  const settings = await loadSettings();
  const site = process.env.PUBLIC_SITE_ORIGIN?.replace(/\/$/, '') || null;
  const region = settings
    ? `${settings.city}${settings.province === 'NB' ? ' & across New Brunswick' : `, ${settings.province}`}`
    : null;

  return (
    <>
      <section className="bg-gradient-to-b from-blush-soft to-cream">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:pt-20">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-deep">Bookings</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight text-ink sm:text-6xl">
            Let&rsquo;s plan something beautiful together.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Photography, styling, photo booths and coordination, all in one place. Build your event, see a live estimate,
            and {settings?.owner_name ? `${settings.owner_name} will` : 'we will'} send you a personal quote.
            {region && <> Serving {region}.</>}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/build" size="lg">Build your event</ButtonLink>
            <ButtonLink href="/minis" variant="secondary" size="lg">Mini sessions</ButtonLink>
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            Have a quick question first? <Link href="/contact" className="text-rose-deep underline">Ask us here</Link>.
            {site && (
              <>
                {' '}Or <a href={site} className="text-rose-deep underline">visit our main website</a> for our portfolio and packages.
              </>
            )}
          </p>
        </div>
      </section>

      {!settings && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <Notice tone="warn" title="Some details are taking a moment to load">
            You can still build your event. Pricing and availability will appear in the builder.
          </Notice>
        </div>
      )}

      <HowItWorks settings={settings} />

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Looking for a mini session?</h2>
            <p className="mt-1 text-sm text-ink-soft">Seasonal mini sessions are booked by time slot. Pick a time and reserve it in a minute.</p>
          </div>
          <ButtonLink href="/minis" variant="secondary" className="mt-4 sm:mt-0">See mini sessions</ButtonLink>
        </div>
      </section>
    </>
  );
}
