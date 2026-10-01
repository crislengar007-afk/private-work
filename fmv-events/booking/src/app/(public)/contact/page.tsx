import type { Metadata } from 'next';
import { getPublicSettings, type PublicSettings } from '@/lib/catalog';
import { formatPhone, telHref, whatsappHref } from '@/lib/phone';
import { ButtonLink, Card, PageHeader } from '@/components/ui';
import { ContactForm } from './contact-form';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Call, message or send us a quick question about photography, styling, photo booths or coordination for your event.',
};

async function loadSettings(): Promise<PublicSettings | null> {
  try {
    return await getPublicSettings();
  } catch (e) {
    console.error('[contact] settings unavailable', e);
    return null;
  }
}

export default async function ContactPage() {
  const s = await loadSettings();
  const channels: { label: string; value: string; href: string; external?: boolean }[] = [];
  if (s?.phone_e164) channels.push({ label: 'Call or text', value: formatPhone(s.phone_e164), href: telHref(s.phone_e164) });
  if (s?.email) channels.push({ label: 'Email', value: s.email, href: `mailto:${s.email}` });
  if (s?.whatsapp_e164) channels.push({ label: 'WhatsApp', value: formatPhone(s.whatsapp_e164), href: whatsappHref(s.whatsapp_e164), external: true });
  if (s?.messenger_url) channels.push({ label: 'Messenger', value: 'Message us on Facebook', href: s.messenger_url, external: true });
  const address = s ? [s.address_line, s.city, s.province, s.postal_code].filter(Boolean).join(', ') : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <PageHeader
        title="Say hello"
        description={
          s?.owner_name
            ? `${s.owner_name} and the team read every message. Ask anything, or build your event for a live estimate.`
            : 'We read every message. Ask anything, or build your event for a live estimate.'
        }
      />

      <div className="mb-8 rounded-[var(--radius-card)] bg-blush-soft p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Planning an event?</h2>
          <p className="mt-1 text-sm text-ink-soft">The builder takes a few minutes and gives you an instant estimate. No commitment.</p>
        </div>
        <ButtonLink href="/build" size="lg" className="mt-4 sm:mt-0">Build your event</ButtonLink>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-2">
          <h2 className="font-display text-2xl font-semibold text-ink">Reach us directly</h2>
          {channels.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {channels.map((c) => (
                <li key={c.label}>
                  <p className="text-xs uppercase tracking-wide text-ink-soft">{c.label}</p>
                  <a
                    href={c.href}
                    className="break-all font-medium text-rose-deep underline-offset-2 hover:underline"
                    {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {c.value}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">Use the form and we&rsquo;ll get back to you.</p>
          )}
          {address && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Based in</p>
              <p className="text-sm text-ink">{address}</p>
            </div>
          )}
          {s?.hours_text && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Hours</p>
              <p className="whitespace-pre-line text-sm text-ink">{s.hours_text}</p>
            </div>
          )}
        </Card>

        <Card className="md:col-span-3">
          <h2 className="font-display text-2xl font-semibold text-ink">Ask a general question</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">For quotes, the builder is faster. For anything else, write to us here.</p>
          <ContactForm />
        </Card>
      </div>
    </div>
  );
}
