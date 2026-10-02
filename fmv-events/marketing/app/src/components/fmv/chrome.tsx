import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { bookHref } from "@/fmv/links";
import { phoneLabel, placeLabel, provinceName, whatsappHref } from "@/fmv/format";
import { useSite } from "./use-site";

export const NAV = [
  { to: "/weddings", label: "Weddings" },
  { to: "/events", label: "Events & Décor" },
  { to: "/booths", label: "Photo Booths" },
  { to: "/photography", label: "Photography" },
  { to: "/packages", label: "Packages" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/service-area", label: "Service Area" },
  { to: "/faq", label: "FAQ" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function Monogram() {
  return (
    <span aria-hidden="true" className="fmv-monogram">
      FMV
    </span>
  );
}

export function BuildCta({ path = "/build", children = "Build your event", small = false }: { path?: string; children?: string; small?: boolean }) {
  const { bookingUrl } = useSite();
  return (
    <a className={small ? "fmv-cta-build fmv-cta-build--sm" : "fmv-cta-build"} href={bookHref(bookingUrl, path)}>
      <span aria-hidden="true" className="fmv-cta-build__dot" />
      {children}
    </a>
  );
}

export function SiteHeader() {
  const { settings, prototype } = useSite();
  const [open, setOpen] = useState(false);
  const name = settings?.business_name ?? "FMV Events & Photography";
  return (
    <header className="fmv-header">
      {prototype ? (
        <p className="fmv-proto">
          Prototype preview · prices from FMV&apos;s flyers · forms don&apos;t send anything yet ·{" "}
          <Link to="/owner-preview">Owner inbox</Link>
        </p>
      ) : null}
      <div className="fmv-header__inner">
        <Link to="/" className="fmv-brand" aria-label={`${name} home`}>
          <Monogram />
          <span className="fmv-brand__name hidden sm:inline">{name}</span>
        </Link>
        <nav aria-label="Main" className="fmv-nav">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeProps={{ "data-status": "active" }}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <BuildCta small />
          <button type="button" className="fmv-menu-btn" aria-expanded={open} aria-controls="fmv-drawer" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open ? (
        <nav id="fmv-drawer" aria-label="Mobile" className="fmv-drawer">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  const { settings: s, bookingUrl } = useSite();
  const name = s?.business_name ?? "FMV Events & Photography";
  const address = s ? [s.address_line, s.city, provinceName(s.province), s.postal_code].filter(Boolean).join(", ") : "";
  return (
    <footer className="fmv-footer">
      <div className="fmv-wrap grid gap-10 py-14 md:grid-cols-4">
        <div className="grid content-start gap-3">
          <div className="flex items-center gap-3">
            <Monogram />
            <span className="fmv-display text-2xl">{name}</span>
          </div>
          <p className="opacity-80">
            {s?.owner_name ? `${s.owner_name} and the FMV team. ` : "Marie and the FMV team. "}
            {placeLabel(s)} and across New Brunswick.
          </p>
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="fmv-footer__label">Visit &amp; call</p>
          {address ? <p>{address}</p> : null}
          {s?.phone_e164 ? <a href={`tel:${s.phone_e164}`}>{phoneLabel(s.phone_e164)}</a> : null}
          {s?.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : null}
          {s?.hours_text ? <p className="whitespace-pre-line opacity-80">{s.hours_text}</p> : null}
          {!s ? <p className="opacity-80">Contact details are on their way.</p> : null}
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="fmv-footer__label">Explore</p>
          {NAV.slice(0, 6).map((n) => (
            <Link key={n.to} to={n.to}>{n.label}</Link>
          ))}
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="fmv-footer__label">Book &amp; follow</p>
          <a href={bookHref(bookingUrl)}>Build your event</a>
          {bookingUrl ? <a href={`${bookingUrl}/minis`}>Mini sessions</a> : null}
          <Link to="/faq" hash="policies">Policies</Link>
          {bookingUrl ? <a href={`${bookingUrl}/policies#privacy`}>Privacy</a> : null}
          {s?.facebook_url ? <a href={s.facebook_url} rel="noopener">Facebook</a> : null}
          {s?.instagram_url ? <a href={s.instagram_url} rel="noopener">Instagram</a> : null}
        </div>
      </div>
      <p className="pb-8 text-center text-xs opacity-70">© {name} · Prices in CAD</p>
    </footer>
  );
}

/** Mobile floating WhatsApp / Messenger / Call, only for channels that are set. */
export function ContactFab() {
  const { settings: s } = useSite();
  if (!s || (!s.whatsapp_e164 && !s.messenger_url && !s.phone_e164)) return null;
  return (
    <div className="fmv-fab">
      {s.whatsapp_e164 ? <a href={whatsappHref(s.whatsapp_e164)} aria-label="Message us on WhatsApp">WA</a> : null}
      {s.messenger_url ? <a href={s.messenger_url} aria-label="Message us on Messenger">Msg</a> : null}
      {s.phone_e164 ? <a href={`tel:${s.phone_e164}`} aria-label={`Call ${phoneLabel(s.phone_e164)}`}>Call</a> : null}
    </div>
  );
}

export function PageHero({ eyebrow, title, lede, plate, children }: { eyebrow: string; title: string; lede: string; plate: string; children?: ReactNode }) {
  return (
    <section className="fmv-pagehero">
      <div aria-hidden="true" className="fmv-pagehero__plate" style={{ backgroundImage: `url(${plate})` }} />
      <div aria-hidden="true" className="fmv-pagehero__veil" />
      <div className="fmv-wrap grid gap-5">
        <p className="fmv-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="fmv-lede">{lede}</p>
        {children ? <div className="flex flex-wrap items-center gap-5 pt-2">{children}</div> : null}
      </div>
    </section>
  );
}

/** Honest placeholder used while the booking app isn't connected or has no data yet. */
export function Soon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fmv-soon">
      <span aria-hidden="true" className="fmv-soon__mark" />
      <p className="fmv-h3">{title}</p>
      <div className="fmv-body">{children}</div>
    </div>
  );
}

export function SectionHead({ eyebrow, title, lede, id }: { eyebrow: string; title: string; lede?: string; id?: string }) {
  return (
    <div className="grid gap-4 pb-10" id={id}>
      <p className="fmv-eyebrow">{eyebrow}</p>
      <h2 className="fmv-h2">{title}</h2>
      {lede ? <p className="fmv-lede">{lede}</p> : null}
    </div>
  );
}
