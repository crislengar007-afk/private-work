import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { money, priceLabel, hoursLabel, dateTimeLabel, EVENT_LABELS, mdParagraphs } from "@/fmv/format";
import { bookHref } from "@/fmv/links";
import { addonsFor, bullets, CATEGORY_PLATE, families, fromCents, SERVICE_PAGES, tierName, type Family, type ServicePath } from "@/fmv/services";
import type { Addon, Package, PortfolioItem, Service } from "@/fmv/types";
import { BuildCta, SectionHead, Soon } from "./chrome";
import { useSite } from "./use-site";

export function HowItWorks() {
  const { settings } = useSite();
  const pct = settings?.deposit_pct;
  const hold = settings?.hold_hours;
  return (
    <ol className="fmv-steps">
      <li className="fmv-step">
        <p className="fmv-h3">Build your event</p>
        <p className="fmv-body">Pick your date, services and add-ons and see a live estimate. Nothing is charged.</p>
      </li>
      <li className="fmv-step">
        <p className="fmv-h3">Get your quote</p>
        <p className="fmv-body">{settings?.owner_name ?? "Marie"} reviews the details and sends a personal quote you can accept online.</p>
      </li>
      <li className="fmv-step">
        <p className="fmv-h3">{pct ? `${pct}% deposit by e-Transfer` : "Deposit by e-Transfer"}</p>
        <p className="fmv-body">
          {hold ? `Your date is held for ${hold} hours after you accept. ` : "Your date is held while you send the deposit. "}
          Pay by Interac e-Transfer with your reference code.
        </p>
      </li>
      <li className="fmv-step">
        <p className="fmv-h3">Date confirmed</p>
        <p className="fmv-body">Once the deposit arrives your date is confirmed, and the balance is due before the event.</p>
      </li>
    </ol>
  );
}

function PackageCard({ pkg, services }: { pkg: Package; services: Service[] }) {
  const { bookingUrl } = useSite();
  const included = pkg.items
    .map((i) => {
      const s = services.find((x) => x.id === i.service_id);
      if (!s) return null;
      const qty = s.price_mode === "per_hour" ? ` (${hoursLabel(i.qty)})` : i.qty > 1 ? ` ×${i.qty}` : "";
      return `${s.name}${qty}`;
    })
    .filter((x): x is string => Boolean(x));
  const saving = pkg.price_cents !== null && pkg.ala_carte_cents > pkg.price_cents;
  return (
    <article className="fmv-card">
      <div className="fmv-card__window">
        <img src={pkg.cover_url ?? "/assets/plates/silk.webp"} alt="" loading="lazy" />
      </div>
      <div className="fmv-card__body">
        <p className="fmv-eyebrow">{EVENT_LABELS[pkg.event_type] ?? "Package"}</p>
        <h3 className="fmv-h3">{pkg.name}</h3>
        {pkg.price_cents !== null ? <p className="fmv-price">{money(pkg.price_cents)}</p> : null}
        {saving ? (
          <p className="fmv-was">
            À la carte value <s>{pkg.ala_carte_is_from ? "from " : ""}{money(pkg.ala_carte_cents)}</s>
          </p>
        ) : null}
        {mdParagraphs(pkg.description_md).slice(0, 1).map((p) => (
          <p key={p} className="fmv-body">{p}</p>
        ))}
        {included.length ? (
          <ul className="grid gap-1 text-sm">
            {included.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        ) : null}
        <div className="fmv-tier__cta pt-2">
          <a className="fmv-cta-build fmv-cta-build--sm" href={bookHref(bookingUrl, `/build?package=${encodeURIComponent(pkg.slug)}`)}>
            <span aria-hidden="true" className="fmv-cta-build__dot" />
            Book this package
          </a>
          <Link to="/contact" hash="inquiry" className="fmv-link-underline text-sm">Ask a question</Link>
        </div>
      </div>
    </article>
  );
}

export function PackagesGrid({ eventType, limit }: { eventType?: string; limit?: number }) {
  const { catalog } = useSite();
  const list = (catalog?.packages ?? []).filter((p) => !eventType || p.event_type === eventType).slice(0, limit ?? 99);
  if (!catalog || list.length === 0) {
    return (
      <Soon title="Packages are being finalized">
        Bundle prices are being set right now. Build your event to get a personal quote in the meantime.
        <div className="pt-4"><BuildCta /></div>
      </Soon>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {list.map((p) => (
        <PackageCard key={p.id} pkg={p} services={catalog.services} />
      ))}
    </div>
  );
}

/** Price list for catalog categories (by slug), straight from the booking app. */
export function ServiceList({ categories, emptyTitle = "Prices are on their way" }: { categories: string[]; emptyTitle?: string }) {
  const { catalog, bookingUrl } = useSite();
  const list = (catalog?.services ?? []).filter((s) => categories.includes(s.category_slug));
  if (list.length === 0) {
    return (
      <Soon title={emptyTitle}>
        Build your event and you&apos;ll get an exact quote for your date.
        <div className="pt-4"><BuildCta /></div>
      </Soon>
    );
  }
  return (
    <div className="fmv-panel">
      {list.map((s) => (
        <div key={s.id} className="fmv-row">
          <div className="grid gap-1">
            <p className="fmv-h3 fmv-h3--sm">{s.name}</p>
            {s.short_desc ? <p className="fmv-body text-sm">{s.short_desc}</p> : null}
            {s.included_hours ? <p className="text-sm text-ink-soft">{hoursLabel(s.included_hours)} included</p> : null}
            {s.price_mode === "per_hour" && s.min_hours ? <p className="text-sm text-ink-soft">{hoursLabel(s.min_hours)} minimum</p> : null}
          </div>
          <div className="grid justify-items-end gap-2 text-right">
            <p className="fmv-display text-2xl">{priceLabel(s.price_cents, s.price_mode)}</p>
            <a className="fmv-link-underline text-sm" href={bookHref(bookingUrl, `/build?service=${encodeURIComponent(s.slug)}`)}>
              Check availability
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AddonList() {
  const { catalog } = useSite();
  const list = catalog?.addons ?? [];
  if (list.length === 0) return null;
  return (
    <div className="fmv-panel">
      {list.map((a) => (
        <div key={a.id} className="fmv-row">
          <div>
            <p className="font-semibold">{a.name}</p>
            {a.description ? <p className="fmv-body text-sm">{a.description}</p> : null}
          </div>
          <p className="fmv-display text-xl">{priceLabel(a.price_cents, a.price_mode)}</p>
        </div>
      ))}
    </div>
  );
}

/** Portfolio filters: by occasion and by service. A filter only shows when it has real work in it. */
export const PORTFOLIO_FACETS: { key: string; label: string; test: (i: PortfolioItem) => boolean }[] = [
  { key: "weddings", label: "Weddings", test: (i) => i.event_type === "wedding" },
  { key: "birthdays", label: "Birthdays", test: (i) => i.event_type === "birthday" },
  { key: "corporate", label: "Corporate events", test: (i) => i.event_type === "corporate" },
  { key: "photography", label: "Photography", test: (i) => i.category === "photography" || i.category === "minis" },
  { key: "decor", label: "Décor", test: (i) => i.category === "styling" },
  { key: "booths", label: "Photo booths", test: (i) => i.category === "rentals" },
  { key: "special", label: "Special events", test: (i) => ["baby_shower", "graduation", "other"].includes(i.event_type ?? "") },
];

export function Gallery({ items, filters = true }: { items: PortfolioItem[]; filters?: boolean }) {
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const cats = useMemo(() => PORTFOLIO_FACETS.filter((f) => items.some(f.test)).map((f) => ({ slug: f.key, name: f.label })), [items]);
  const facet = PORTFOLIO_FACETS.find((f) => f.key === cat);
  const shown = items.filter((i) => !facet || facet.test(i));
  if (items.length === 0) {
    return (
      <Soon title="Portfolio coming soon">
        We&apos;re gathering photos and booth reels from real FMV events. Only our own work will ever appear here.
      </Soon>
    );
  }
  const step = (d: number) => setOpen((v) => (v === null ? v : (v + d + shown.length) % shown.length));
  const current = open !== null ? shown[open] : null;
  return (
    <div className="grid gap-6">
      {filters && cats.length > 1 ? (
        <div className="fmv-filter" role="group" aria-label="Filter by category">
          <button type="button" aria-pressed={cat === null} onClick={() => setCat(null)}>All</button>
          {cats.map((c) => (
            <button type="button" key={c.slug} aria-pressed={cat === c.slug} onClick={() => setCat(c.slug)}>
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="fmv-masonry">
        {shown.map((m, i) => (
          <button type="button" key={m.id} onClick={() => setOpen(i)} aria-label={`Open ${m.alt_text || m.caption || "photo"}`}>
            {m.kind === "video" ? (
              <video src={m.url ?? undefined} muted playsInline preload="metadata" aria-hidden="true" />
            ) : (
              <img src={m.url ?? undefined} alt={m.alt_text} loading="lazy" width={m.width ?? undefined} height={m.height ?? undefined} />
            )}
          </button>
        ))}
      </div>
      {current ? (
        <div
          className="fmv-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={current.alt_text || "Photo"}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(null);
            if (e.key === "ArrowRight") step(1);
            if (e.key === "ArrowLeft") step(-1);
          }}
        >
          <div>
            {current.kind === "video" ? (
              <video src={current.url ?? undefined} controls autoPlay playsInline />
            ) : (
              <img src={current.url ?? undefined} alt={current.alt_text} />
            )}
            {current.caption ? <p className="mt-3 text-center text-cream">{current.caption}</p> : null}
            <div className="fmv-lightbox__bar">
              <button type="button" onClick={() => step(-1)}>Previous</button>
              <button type="button" autoFocus onClick={() => setOpen(null)}>Close</button>
              <button type="button" onClick={() => step(1)}>Next</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Real before/after pairs only; hidden entirely until one is published. */
export function BeforeAfter() {
  const { portfolio } = useSite();
  const [pos, setPos] = useState(50);
  const pair = useMemo(() => {
    const byPair = new Map<string, { before?: PortfolioItem; after?: PortfolioItem }>();
    for (const m of portfolio) {
      const role = m.before_after?.role;
      if (!m.before_after?.pair_id || !role) continue;
      const p = byPair.get(m.before_after.pair_id) ?? {};
      p[role] = m;
      byPair.set(m.before_after.pair_id, p);
    }
    return [...byPair.values()].find((p) => p.before && p.after);
  }, [portfolio]);
  if (!pair?.before || !pair.after) return null;
  return (
    <section className="fmv-section">
      <div className="fmv-wrap">
        <SectionHead eyebrow="Before & after" title="From empty room to celebration" lede="Drag to compare a real venue before and after FMV styling." />
        <div className="fmv-ba" style={{ ["--ba" as string]: `${pos}%` }}>
          <img src={pair.before.url ?? undefined} alt={pair.before.alt_text || "Venue before styling"} />
          <img className="fmv-ba__after" src={pair.after.url ?? undefined} alt={pair.after.alt_text || "Venue after styling"} />
          <span aria-hidden="true" className="fmv-ba__line" />
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Before and after comparison" />
        </div>
      </div>
    </section>
  );
}

export function Testimonials() {
  const { testimonials } = useSite();
  if (testimonials.length === 0) return null;
  return (
    <section className="fmv-section bg-blush-soft">
      <div className="fmv-wrap">
        <SectionHead eyebrow="Kind words" title="From our clients" />
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.slice(0, 6).map((t) => (
            <figure key={t.id} className="fmv-panel grid gap-4">
              {t.rating ? <p aria-label={`${t.rating} out of 5`} className="text-gold-deep">{"★".repeat(t.rating)}</p> : null}
              <blockquote className="fmv-display text-2xl leading-snug">“{t.quote}”</blockquote>
              <figcaption className="text-sm text-ink-soft">
                {t.client_name}{t.event_type ? ` · ${EVENT_LABELS[t.event_type] ?? t.event_type}` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MiniBanner() {
  const { minis } = useSite();
  const m = minis.find((x) => x.open_slots > 0);
  if (!m) return null;
  return (
    <div className="fmv-ribbon">
      <div className="fmv-wrap flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <p>
          <strong>{m.name}</strong>
          {m.next_slot_at ? ` · next spot ${dateTimeLabel(m.next_slot_at)}` : ""} · {m.open_slots} spot{m.open_slots === 1 ? "" : "s"} open
        </p>
        <a href={m.book_url} className="font-semibold underline">Book a mini session</a>
      </div>
    </div>
  );
}

export function MiniCampaigns() {
  const { minis } = useSite();
  if (minis.length === 0) {
    return (
      <Soon title="No mini sessions are open right now">
        Seasonal minis open a few times a year. New dates are announced here and on Facebook.
      </Soon>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {minis.map((m) => (
        <article key={m.id} className="fmv-card">
          <div className="fmv-card__window">
            <img src={m.cover_url ?? "/assets/plates/bokeh.webp"} alt="" loading="lazy" />
          </div>
          <div className="fmv-card__body">
            <p className="fmv-eyebrow">{m.season ?? "Mini sessions"}</p>
            <h3 className="fmv-h3">{m.name}</h3>
            <p className="fmv-body">
              {m.price_cents !== null ? `${money(m.price_cents)} · ` : ""}{m.duration_min} minutes
              {m.location_name ? ` · ${m.location_name}` : ""}
            </p>
            <p className="text-sm text-ink-soft">
              {m.open_slots > 0 ? `${m.open_slots} spots open${m.next_slot_at ? `, next ${dateTimeLabel(m.next_slot_at)}` : ""}` : "Fully booked"}
            </p>
            {m.open_slots > 0 ? <div className="pt-2"><a className="fmv-cta-ticket" href={m.book_url}>Pick your time</a></div> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Cards for each service page (box frames), with a "from" price when one is published. */
export function ServiceCards({ exclude }: { exclude?: ServicePath }) {
  const { catalog } = useSite();
  const pages = SERVICE_PAGES.filter((p) => p.to !== exclude);
  return (
    <div className={pages.length === 5 ? "fmv-pillars fmv-pillars--5" : "fmv-pillars"}>
      {pages.map((p) => {
        const from = fromCents(catalog, p);
        return (
          <Link key={p.to} to={p.to} className="fmv-pillar">
            <div className="fmv-box"><img src={p.img} alt="" loading="lazy" /></div>
            <p className="fmv-h3">{p.label}</p>
            <p className="fmv-body text-sm">{p.blurb}</p>
            {from !== null ? <p className="text-sm font-semibold text-rose-deep">From {money(from)}</p> : null}
          </Link>
        );
      })}
    </div>
  );
}

function TierCard({ s, family, addons }: { s: Service; family: Family; addons: Addon[] }) {
  const { bookingUrl } = useSite();
  const name = tierName(s);
  const items = bullets(s.short_desc);
  return (
    <article className="fmv-tier">
      {name !== family.name ? <p className="fmv-eyebrow">{name}</p> : null}
      <p className="fmv-price">{priceLabel(s.price_cents, s.price_mode)}</p>
      {items.length ? (
        <ul className="fmv-tier__list">
          {items.map((t) => <li key={t}>{t}</li>)}
        </ul>
      ) : null}
      {addons.length ? (
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-ink">Optional add-ons: </span>
          {addons.map((a) => `${a.name} (${priceLabel(a.price_cents, a.price_mode)})`).join(" · ")}
        </p>
      ) : null}
      <div className="fmv-tier__cta">
        <a className="fmv-cta-build fmv-cta-build--sm" href={bookHref(bookingUrl, `/build?service=${encodeURIComponent(s.slug)}`)}>
          <span aria-hidden="true" className="fmv-cta-build__dot" />
          {family.services.length > 1 ? "Book this package" : "Book this"}
        </a>
        <Link to="/contact" hash="inquiry" className="fmv-link-underline text-sm">Ask a question</Link>
      </div>
    </article>
  );
}

/** Tiered services (Sapphire / Garnet / Emerald) grouped by family, with inclusions, add-ons and booking CTAs. */
export function TierCards({ categories, only }: { categories: string[]; only?: (f: Family) => boolean }) {
  const { catalog } = useSite();
  const list = catalog ? families(catalog, categories).filter((f) => !only || only(f)) : [];
  if (!catalog || list.length === 0) {
    return (
      <Soon title="Prices are on their way">
        Build your event and you&apos;ll get an exact quote for your date.
        <div className="pt-4"><BuildCta /></div>
      </Soon>
    );
  }
  return (
    <div className="grid gap-14">
      {list.map((f) => (
        <section key={f.key} className="fmv-family" aria-labelledby={`fam-${f.key}`}>
          <div className="fmv-family__head">
            <div className="fmv-box fmv-box--wide"><img src={CATEGORY_PLATE[f.category] ?? "/assets/plates/silk.webp"} alt="" loading="lazy" /></div>
            <h3 id={`fam-${f.key}`} className="fmv-h3">{f.name}</h3>
            {f.services.length > 1 ? <p className="text-sm text-ink-soft">{f.services.length} packages to compare</p> : null}
          </div>
          <div className={f.services.length > 1 ? "fmv-tiers" : "fmv-tiers fmv-tiers--single"}>
            {f.services.map((s) => (
              <TierCard key={s.id} s={s} family={f} addons={addonsFor(catalog, s)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Why clients choose FMV: drawn only from what FMV already states (services, published prices, flyer inclusions, deposit rule). */
export function WhyFmv() {
  const { settings } = useSite();
  const pct = settings?.deposit_pct ?? 50;
  const points = [
    { t: "One team for your whole event", d: "Photography, coordination, décor and photo booths planned together, so nothing falls between the cracks." },
    { t: "Clear prices, no guesswork", d: "Prices are published here, and every bundle shows its à la carte value next to the package price." },
    { t: "Unlimited shots, edited photos", d: "Photography packages include unlimited shots and edited digital photos, delivered in an online gallery." },
    { t: "A calm, clear booking process", d: `A personal quote first, then a ${pct}% deposit by Interac e-Transfer confirms your date.` },
  ];
  return (
    <div className="fmv-why">
      {points.map((p, i) => (
        <div key={p.t} className="fmv-why__item">
          <span aria-hidden="true" className="fmv-why__num">{String(i + 1).padStart(2, "0")}</span>
          <p className="fmv-h3 fmv-h3--sm">{p.t}</p>
          <p className="fmv-body">{p.d}</p>
        </div>
      ))}
    </div>
  );
}

/** Booking status, from request to confirmed date. Nothing is marked paid or confirmed by the website itself. */
export function bookingStatuses(depositPct: number) {
  return [
    { label: "Quote requested", text: "We review your event and prepare a personal quote." },
    { label: "Quote approved", text: "You review the quote and accept it online." },
    { label: `${depositPct}% deposit required`, text: "Send the deposit by Interac e-Transfer with the reference code on your invoice." },
    { label: "Payment verified", text: "We match your e-Transfer to your booking." },
    { label: "Booking confirmed", text: "Your date is confirmed. The balance is due before your event." },
  ];
}

export function StatusTimeline({ current = 0 }: { current?: number }) {
  const { settings } = useSite();
  const steps = bookingStatuses(settings?.deposit_pct ?? 50);
  return (
    <ol className="fmv-status">
      {steps.map((st, i) => (
        <li key={st.label} data-state={i < current ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
          <span aria-hidden="true" className="fmv-status__dot" />
          <p className="font-semibold">{st.label}</p>
          <p className="text-sm text-ink-soft">{st.text}</p>
        </li>
      ))}
    </ol>
  );
}
