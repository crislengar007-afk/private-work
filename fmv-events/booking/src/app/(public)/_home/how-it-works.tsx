import type { PublicSettings } from '@/lib/catalog';

/** The 4 booking steps. Numbers (deposit %, hold hours) come from settings. */
export function HowItWorks({ settings }: { settings: PublicSettings | null }) {
  const reviews = settings?.owner_name
    ? `${settings.owner_name} reviews your request and emails you`
    : 'We review your request and email you';
  const steps = [
    {
      title: 'Build',
      body: 'Pick your date, a package or individual services, and any extras. You see a live estimate as you go.',
    },
    {
      title: 'Quote',
      body: `${reviews} a quote with every line and policy spelled out. Accept it online with your typed name.`,
    },
    {
      title: `${settings ? `${settings.deposit_pct}% deposit` : 'Deposit'} by e-Transfer`,
      body: settings
        ? `Accepting holds your date for ${settings.hold_hours} hours. Send the ${settings.deposit_pct}% deposit by Interac e-Transfer from your pay page.`
        : 'Accepting holds your date for a short time. Send the deposit by Interac e-Transfer from your pay page.',
    },
    {
      title: 'Date confirmed',
      body: 'As soon as we record your deposit, your date is confirmed and you get a confirmation email.',
    },
  ];

  return (
    <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-12">
      <h2 id="how-heading" className="font-display text-3xl font-semibold text-ink sm:text-4xl">How booking works</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-sm">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blush font-display text-lg font-semibold text-rose-deep"
            >
              {i + 1}
            </span>
            <h3 className="mt-3 font-display text-xl font-semibold text-ink">
              <span className="sr-only">Step {i + 1}: </span>
              {s.title}
            </h3>
            <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-ink-soft">
        No date is held until you accept a quote, and it is confirmed only once your deposit is recorded.
      </p>
    </section>
  );
}
