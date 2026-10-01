// Public header/footer for the booking app. Contact details come from settings
// (one source of truth); nothing is hard-coded.
import Link from 'next/link';
import { getPublicSettings, type PublicSettings } from '@/lib/catalog';
import { formatPhone, telHref, whatsappHref } from '@/lib/phone';
import { buttonClass } from '@/components/ui';

export function Monogram({ className = '' }: { className?: string }) {
  // Text monogram placeholder until the owner supplies the FMV logo (SVG/PNG).
  return (
    <span
      aria-hidden
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold/60 bg-white font-display text-sm font-semibold tracking-widest text-rose-deep ${className}`}
    >
      FMV
    </span>
  );
}

export async function safePublicSettings(): Promise<PublicSettings | null> {
  try {
    return await getPublicSettings();
  } catch (e) {
    console.error('[settings] unavailable', e);
    return null;
  }
}

export async function SiteHeader() {
  const site = process.env.PUBLIC_SITE_ORIGIN;
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href={site || '/'} className="flex items-center gap-3">
          <Monogram />
          <span className="hidden font-display text-xl font-semibold text-ink sm:inline">FMV Events &amp; Photography</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          <Link href="/minis" className="hidden rounded-full px-3 py-2 text-ink hover:bg-blush-soft sm:inline">Mini sessions</Link>
          <Link href="/policies" className="hidden rounded-full px-3 py-2 text-ink hover:bg-blush-soft md:inline">Policies</Link>
          <Link href="/portal" className="rounded-full px-3 py-2 text-ink hover:bg-blush-soft">My bookings</Link>
          <Link href="/build" className={buttonClass('primary', 'sm', 'ml-1')}>Build your event</Link>
        </nav>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const s = await safePublicSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="no-print mt-16 border-t border-line bg-white/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="font-display text-xl font-semibold">{s?.business_name ?? 'FMV Events & Photography'}</p>
          <p className="mt-1 text-ink-soft">
            {s?.owner_name ? `${s.owner_name} and the FMV team · ` : ''}
            {s ? `${s.city}, ${s.province === 'NB' ? 'New Brunswick' : s.province}` : 'Fredericton, New Brunswick'}
          </p>
          {s?.address_line && <p className="text-ink-soft">{s.address_line}</p>}
          {s?.hours_text && <p className="mt-2 whitespace-pre-line text-ink-soft">{s.hours_text}</p>}
        </div>
        <div>
          <p className="font-semibold">Contact</p>
          <ul className="mt-2 space-y-1 text-ink-soft">
            {s?.phone_e164 && <li><a className="hover:text-rose-deep" href={telHref(s.phone_e164)}>{formatPhone(s.phone_e164)}</a></li>}
            {s?.email && <li><a className="hover:text-rose-deep" href={`mailto:${s.email}`}>{s.email}</a></li>}
            {s?.whatsapp_e164 && <li><a className="hover:text-rose-deep" href={whatsappHref(s.whatsapp_e164)}>WhatsApp</a></li>}
            {s?.messenger_url && <li><a className="hover:text-rose-deep" href={s.messenger_url}>Messenger</a></li>}
            <li><Link className="hover:text-rose-deep" href="/contact">Ask a question</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold">Booking</p>
          <ul className="mt-2 space-y-1 text-ink-soft">
            <li><Link className="hover:text-rose-deep" href="/build">Build your event</Link></li>
            <li><Link className="hover:text-rose-deep" href="/minis">Mini sessions</Link></li>
            <li><Link className="hover:text-rose-deep" href="/policies">Policies &amp; privacy</Link></li>
            <li><Link className="hover:text-rose-deep" href="/portal">My bookings</Link></li>
            {s?.facebook_url && <li><a className="hover:text-rose-deep" href={s.facebook_url}>Facebook</a></li>}
            {s?.instagram_url && <li><a className="hover:text-rose-deep" href={s.instagram_url}>Instagram</a></li>}
          </ul>
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-ink-soft">© {year} {s?.business_name ?? 'FMV Events & Photography'} · Prices in CAD</p>
    </footer>
  );
}

/** Mobile floating contact buttons (WhatsApp / Messenger / Call) from settings. */
export async function ContactFab() {
  const s = await safePublicSettings();
  if (!s || (!s.phone_e164 && !s.whatsapp_e164 && !s.messenger_url)) return null;
  const item = 'flex h-12 w-12 items-center justify-center rounded-full bg-white text-xs font-semibold text-rose-deep shadow-lg ring-1 ring-line';
  return (
    <div className="no-print fixed bottom-4 right-4 z-40 flex flex-col gap-2 sm:hidden">
      {s.whatsapp_e164 && <a className={item} href={whatsappHref(s.whatsapp_e164)} aria-label="WhatsApp">WA</a>}
      {s.messenger_url && <a className={item} href={s.messenger_url} aria-label="Messenger">Msg</a>}
      {s.phone_e164 && <a className={item} href={telHref(s.phone_e164)} aria-label={`Call ${formatPhone(s.phone_e164)}`}>Call</a>}
    </div>
  );
}
