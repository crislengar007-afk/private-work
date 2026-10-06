import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { bookHref } from "@/fmv/links";
import { phoneLabel, placeLabel, provinceName, whatsappHref } from "@/fmv/format";
import { SERVICE_PAGES } from "@/fmv/services";
import { useSite } from "./use-site";

/** Primary navigation. Services opens a menu of the service pages. */
export const NAV = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/packages", label: "Packages" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

/** Secondary pages: footer and mobile menu only. */
export const SECONDARY_NAV = [
  { to: "/faq", label: "FAQ & policies" },
  { to: "/service-area", label: "Service area" },
] as const;

export function Monogram() {
  return (
    <span aria-hidden="true" className="fmv-monogram">
      FMV
    </span>
  );
}

export function BuildCta({ path = "/build", children = "Build your event", small = false }: { path?: string; children?: ReactNode; small?: boolean }) {
  const { bookingUrl } = useSite();
  return (
    <a className={small ? "fmv-cta-build fmv-cta-build--sm" : "fmv-cta-build"} href={bookHref(bookingUrl, path)}>
      <span aria-hidden="true" className="fmv-cta-build__dot" />
      {children}
    </a>
  );
}

function usePathname() {
  return useRouterState({ select: (st) => st.location.pathname });
}

/** Desktop "Services" menu: opens on hover (mouse), click/tap and keyboard; Escape or outside click closes it. */
function ServicesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A mouse hover already opened the menu, so the click that follows must not close it again.
  const hovering = useRef(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div
      ref={ref}
      className="fmv-navdrop"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        hovering.current = true;
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        hovering.current = false;
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="fmv-services-menu"
        data-status={path.startsWith("/services") ? "active" : undefined}
        onClick={() => setOpen((v) => (hovering.current ? true : !v))}
      >
        Services <span aria-hidden="true" className="fmv-navdrop__caret">▾</span>
      </button>
      <div id="fmv-services-menu" className="fmv-navdrop__panel" hidden={!open}>
        <Link to="/services" className="fmv-navdrop__all">All services</Link>
        {SERVICE_PAGES.map((s) => (
          <Link key={s.to} to={s.to} activeProps={{ "data-status": "active" }}>
            <span className="font-semibold">{s.label}</span>
            <span className="fmv-navdrop__blurb">{s.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { settings, prototype } = useSite();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const name = settings?.business_name ?? "FMV Events & Photography";
  return (
    <header className="fmv-header">
      {prototype ? (
        <p className="fmv-proto">
          <span className="hidden sm:inline">Prototype preview · prices from FMV&apos;s flyers · forms don&apos;t send anything yet · </span>
          <span className="sm:hidden">Prototype preview · </span>
          <Link to="/owner-preview">Owner inbox</Link>
        </p>
      ) : null}
      <div className="fmv-header__inner">
        <Link to="/" className="fmv-brand" aria-label={`${name} home`}>
          <Monogram />
          <span className="fmv-brand__name hidden sm:inline">{name}</span>
        </Link>
        <nav aria-label="Main" className="fmv-nav">
          {NAV.map((n) =>
            n.to === "/services" ? (
              <ServicesMenu key={n.to} />
            ) : (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} activeProps={{ "data-status": "active" }}>
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          <BuildCta small>
            <span className="hidden sm:inline">Book / </span>Get a quote
          </BuildCta>
          <button type="button" className="fmv-menu-btn" aria-expanded={open} aria-controls="fmv-drawer" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open ? (
        <nav id="fmv-drawer" aria-label="Mobile" className="fmv-drawer">
          {NAV.map((n) => (
            <div key={n.to} className="grid">
              <Link to={n.to} activeOptions={{ exact: n.to === "/" }} activeProps={{ "data-status": "active" }}>
                {n.label}
              </Link>
              {n.to === "/services" ? (
                <div className="fmv-drawer__sub">
                  {SERVICE_PAGES.map((s) => (
                    <Link key={s.to} to={s.to} activeProps={{ "data-status": "active" }}>
                      {s.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <div className="fmv-drawer__secondary">
            {SECONDARY_NAV.map((n) => (
              <Link key={n.to} to={n.to}>{n.label}</Link>
            ))}
          </div>
          <div className="pt-3">
            <BuildCta>Book / Get a quote</BuildCta>
          </div>
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
      <div className="fmv-wrap grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid content-start gap-3 lg:col-span-1">
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
          <p className="fmv-footer__label">Services</p>
          <Link to="/services">All services</Link>
          {SERVICE_PAGES.map((p) => (
            <Link key={p.to} to={p.to}>{p.label}</Link>
          ))}
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="fmv-footer__label">Explore</p>
          {NAV.filter((n) => n.to !== "/" && n.to !== "/services").map((n) => (
            <Link key={n.to} to={n.to}>{n.label}</Link>
          ))}
          {SECONDARY_NAV.map((n) => (
            <Link key={n.to} to={n.to}>{n.label}</Link>
          ))}
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="fmv-footer__label">Visit &amp; call</p>
          {address ? <p>{address}</p> : null}
          {s?.phone_e164 ? <a href={`tel:${s.phone_e164}`}>{phoneLabel(s.phone_e164)}</a> : null}
          {s?.email ? <a href={`mailto:${s.email}`} className="break-all">{s.email}</a> : null}
          {s?.hours_text ? <p className="whitespace-pre-line opacity-80">{s.hours_text}</p> : null}
          {!s ? <p className="opacity-80">Contact details are on their way.</p> : null}
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="fmv-footer__label">Book &amp; follow</p>
          <a href={bookHref(bookingUrl)}>Book / Get a quote</a>
          {bookingUrl ? <a href={`${bookingUrl}/minis`}>Mini sessions</a> : <Link to="/services/photography" hash="minis">Mini sessions</Link>}
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
  const path = usePathname();
  if (!s || (!s.whatsapp_e164 && !s.messenger_url && !s.phone_e164)) return null;
  // The booking builder has its own bottom bar; keep the floating buttons off it.
  if (path === "/book" || path === "/owner-preview") return null;
  return (
    <div className="fmv-fab">
      {s.whatsapp_e164 ? <a href={whatsappHref(s.whatsapp_e164)} aria-label="Message us on WhatsApp">WA</a> : null}
      {s.messenger_url ? <a href={s.messenger_url} aria-label="Message us on Messenger">Msg</a> : null}
      {s.phone_e164 ? <a href={`tel:${s.phone_e164}`} aria-label={`Call ${phoneLabel(s.phone_e164)}`}>Call</a> : null}
    </div>
  );
}

export interface Crumb {
  to?: "/services" | "/packages" | "/portfolio";
  label: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="fmv-crumbs">
      <ol>
        <li><Link to="/">Home</Link></li>
        {items.map((c) => (
          <li key={c.label}>{c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHero({ eyebrow, title, lede, plate, crumbs, children }: { eyebrow: string; title: string; lede: string; plate: string; crumbs?: Crumb[]; children?: ReactNode }) {
  return (
    <section className="fmv-pagehero">
      <div aria-hidden="true" className="fmv-pagehero__plate" style={{ backgroundImage: `url(${plate})` }} />
      <div aria-hidden="true" className="fmv-pagehero__veil" />
      <div className="fmv-wrap grid gap-5">
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
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
