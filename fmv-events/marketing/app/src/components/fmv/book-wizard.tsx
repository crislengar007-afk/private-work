import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hoursLabel, money, priceLabel } from "@/fmv/format";
import { EMAIL_RE, protoRef, protoStore, validPhone, type ProtoLine, type ProtoRequest } from "@/fmv/proto-store";
import type { Addon, Catalog, Service } from "@/fmv/types";
import { useSite } from "./use-site";

// Prototype of the booking app's "Build your event" flow (Part B /build).
// Same steps and fields; the request is kept in this browser only.

const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "engagement", label: "Engagement" },
  { value: "birthday", label: "Birthday" },
  { value: "baby_shower", label: "Baby shower" },
  { value: "corporate", label: "Corporate" },
  { value: "graduation", label: "Graduation" },
  { value: "other", label: "Something else" },
];

const CONTACT_PREFS = ["Email", "Phone call", "Text", "WhatsApp"];
const HEARD = ["", "Facebook", "Instagram", "Google", "A friend or family", "Saw you at an event", "Other"];

const STEPS = ["Your event", "Date & place", "Add-ons", "Details", "Your info", "Review"] as const;

export interface BookSearch {
  package?: string;
  service?: string;
  event_type?: string;
  date?: string;
}

interface Draft {
  eventType: string;
  packageSlug: string | null;
  services: Record<string, number>;
  date: string;
  start: string;
  end: string;
  venueName: string;
  venueAddress: string;
  zoneId: string;
  km: string;
  addons: Record<string, number>;
  guests: string;
  theme: string;
  notes: string;
  fullName: string;
  email: string;
  phone: string;
  contactPref: string;
  heard: string;
  consent: boolean;
}

type Errors = Partial<Record<string, string>>;

/** Sapphire / Garnet / Emerald tiers of one service are alternatives: picking one replaces the other. */
const tierGroup = (slug: string) => slug.replace(/-(sapphire|garnet|emerald)$/, "");
const qtyMode = (mode: string) => mode === "per_hour" || mode === "per_item";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function dateLabel(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(y, m - 1, d));
}

function timeLabel(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, h, m));
}

function initialDraft(catalog: Catalog, search: BookSearch): Draft {
  const pkg = catalog.packages.find((p) => p.slug === search.package);
  const svc = catalog.services.find((s) => s.slug === search.service && s.category_slug !== "minis");
  const eventType =
    EVENT_TYPES.find((e) => e.value === search.event_type)?.value ??
    (pkg ? "wedding" : svc?.slug.startsWith("engagement") ? "engagement" : svc?.slug.startsWith("birthday") ? "birthday" : svc?.slug.startsWith("wedding") ? "wedding" : "");
  return {
    eventType,
    packageSlug: pkg?.slug ?? null,
    services: svc ? { [svc.slug]: 1 } : {},
    date: search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : "",
    start: "14:00",
    end: "18:00",
    venueName: "",
    venueAddress: "",
    zoneId: catalog.zones[0]?.id ?? "",
    km: "",
    addons: {},
    guests: "",
    theme: "",
    notes: "",
    fullName: "",
    email: "",
    phone: "",
    contactPref: "Email",
    heard: "",
    consent: false,
  };
}

function estimate(d: Draft, c: Catalog) {
  const lines: ProtoLine[] = [];
  const pkg = c.packages.find((p) => p.slug === d.packageSlug) ?? null;
  const included = new Set(pkg?.items.map((i) => i.service_id) ?? []);
  if (pkg) {
    const names = pkg.items.map((i) => c.services.find((s) => s.id === i.service_id)?.name).filter(Boolean);
    lines.push({ label: pkg.name, detail: names.join(" + "), cents: pkg.price_cents });
  }
  for (const [slug, qty] of Object.entries(d.services)) {
    const s = c.services.find((x) => x.slug === slug);
    if (!s || included.has(s.id)) continue;
    const q = qtyMode(s.price_mode) ? qty : 1;
    const detail = s.price_mode === "per_hour" ? hoursLabel(q) : s.price_mode === "per_item" ? `${q} × ${money(s.price_cents)}` : s.included_hours ? `${hoursLabel(s.included_hours)} included` : undefined;
    lines.push({ label: s.name, detail, cents: s.price_cents === null ? null : s.price_cents * q, from: s.price_mode === "from" });
  }
  for (const [slug, qty] of Object.entries(d.addons)) {
    const a = c.addons.find((x) => x.slug === slug);
    if (!a) continue;
    const q = qtyMode(a.price_mode) ? qty : 1;
    lines.push({ label: a.name, detail: a.price_mode === "per_hour" ? hoursLabel(q) : undefined, cents: a.price_cents === null ? null : a.price_cents * q });
  }
  const zone = c.zones.find((z) => z.id === d.zoneId);
  let travel: ProtoLine | null = null;
  if (zone) {
    if (zone.travel_fee_cents !== null) travel = { label: `Travel · ${zone.name}`, detail: zone.travel_fee_cents === 0 ? "Included" : undefined, cents: zone.travel_fee_cents };
    else {
      const km = Number(d.km);
      travel = km > 0
        ? { label: `Travel · ${zone.name}`, detail: `about ${km} km at $0.50/km`, cents: Math.round(km * 50), from: true }
        : { label: `Travel · ${zone.name}`, detail: "Confirmed in your quote", cents: null };
    }
  }
  const all = travel ? [...lines, travel] : lines;
  const total = all.reduce((sum, l) => sum + (l.cents ?? 0), 0);
  const isFrom = all.some((l) => l.from || l.cents === null);
  return { lines, travel, all, total, isFrom };
}

export function BookWizard({ search }: { search: BookSearch }) {
  const { catalog, settings } = useSite();
  const cat = catalog as Catalog;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(cat, search));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<ProtoRequest | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const depositPct = settings?.deposit_pct ?? 50;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const est = useMemo(() => estimate(draft, cat), [draft, cat]);
  const deposit = Math.round((est.total * depositPct) / 100);

  const moved = useRef(false);
  useEffect(() => {
    // Bring the new step into view, but not on first load.
    if (moved.current) topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    moved.current = true;
  }, [step, done]);

  const pkg = cat.packages.find((p) => p.slug === draft.packageSlug) ?? null;
  const includedIds = new Set(pkg?.items.map((i) => i.service_id) ?? []);
  const chosenCategoryIds = new Set<string>([
    ...cat.services.filter((s) => draft.services[s.slug] || includedIds.has(s.id)).map((s) => s.category_id),
  ]);
  const addons = cat.addons.filter((a) => a.price_cents !== null && a.applies_to_category_ids.some((id) => chosenCategoryIds.has(id)));

  function validate(i: number): Errors {
    const e: Errors = {};
    if (i === 0) {
      if (!draft.eventType) e.eventType = "Choose the kind of event.";
      if (!draft.packageSlug && Object.keys(draft.services).length === 0) e.services = "Pick a package or at least one service.";
    }
    if (i === 1) {
      if (!draft.date) e.date = "Choose your event date.";
      else if (draft.date < tomorrow()) e.date = "Choose a date from tomorrow onward.";
      if (!draft.start) e.start = "Add a start time.";
      if (!draft.end) e.end = "Add an end time.";
      else if (minutes(draft.end) <= minutes(draft.start)) e.end = "End time must be after the start time.";
      if (!draft.zoneId) e.zoneId = "Choose the closest area.";
    }
    if (i === 3 && draft.guests && !(Number(draft.guests) > 0)) e.guests = "Enter a number, or leave it blank.";
    if (i === 4) {
      if (draft.fullName.trim().length < 2) e.fullName = "Enter your full name.";
      if (!EMAIL_RE.test(draft.email.trim())) e.email = "Enter a valid email so we can send your quote.";
      if (!validPhone(draft.phone)) e.phone = "Enter a 10-digit phone number, for example 506-555-0123.";
    }
    if (i === 5 && !draft.consent) e.consent = "Please confirm so we can contact you about this request.";
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit() {
    const e = validate(5);
    setErrors(e);
    if (Object.keys(e).length) return;
    const zone = cat.zones.find((z) => z.id === draft.zoneId);
    const req: ProtoRequest = {
      ref: protoRef("Q"),
      created_at: new Date().toISOString(),
      event_type: EVENT_TYPES.find((t) => t.value === draft.eventType)?.label ?? draft.eventType,
      date: draft.date,
      start: draft.start,
      end: draft.end,
      venue_name: draft.venueName.trim(),
      venue_address: draft.venueAddress.trim(),
      zone: zone?.name ?? "",
      km: Number(draft.km) > 0 ? Number(draft.km) : null,
      guests: Number(draft.guests) > 0 ? Number(draft.guests) : null,
      theme: draft.theme.trim(),
      notes: draft.notes.trim(),
      lines: est.all,
      total_cents: est.total,
      total_is_from: est.isFrom,
      deposit_cents: deposit,
      customer: {
        full_name: draft.fullName.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        contact_pref: draft.contactPref,
        heard: draft.heard,
      },
    };
    protoStore.addRequest(req);
    setDone(req);
  }

  function toggleService(s: Service) {
    setDraft((d) => {
      const services = { ...d.services };
      if (services[s.slug]) delete services[s.slug];
      else {
        for (const other of Object.keys(services)) if (tierGroup(other) === tierGroup(s.slug)) delete services[other];
        services[s.slug] = s.price_mode === "per_item" ? 10 : s.price_mode === "per_hour" ? Math.max(1, s.min_hours ?? 1) : 1;
      }
      return { ...d, services };
    });
  }

  function toggleAddon(a: Addon) {
    setDraft((d) => {
      const next = { ...d.addons };
      if (next[a.slug]) delete next[a.slug];
      else next[a.slug] = 1;
      return { ...d, addons: next };
    });
  }

  if (done) return <Confirmation req={done} ownerName={settings?.owner_name?.split(" ")[0] ?? "Marie"} depositPct={depositPct} holdHours={settings?.hold_hours ?? 48} topRef={topRef} />;

  const categories = cat.categories.filter((c) => c.slug !== "minis").sort((a, b) => a.sort - b.sort);
  const packages = cat.packages.filter((p) => p.price_cents !== null && (draft.eventType === "wedding" || draft.eventType === "engagement"));

  return (
    <div ref={topRef} className="fmv-wizard grid scroll-mt-28 gap-10 lg:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-8">
        <div className="grid gap-3">
          <p className="fmv-eyebrow">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          <div className="fmv-progress" aria-hidden="true">
            {STEPS.map((s, i) => <span key={s} data-on={i <= step} />)}
          </div>
        </div>

        {step === 0 ? (
          <div className="grid gap-8">
            <Group title="What are you celebrating?" error={errors.eventType}>
              <div className="fmv-filter" role="group" aria-label="Event type">
                {EVENT_TYPES.map((t) => (
                  <button key={t.value} type="button" aria-pressed={draft.eventType === t.value} onClick={() => set("eventType", t.value)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Group>

            {packages.length ? (
              <Group title="Start with a package" hint="Optional. Packages bundle services for less than à la carte.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Option type="radio" name="pkg" checked={!draft.packageSlug} onChange={() => set("packageSlug", null)} title="No package" text="I'll pick services myself." />
                  {packages.map((p) => (
                    <Option
                      key={p.slug}
                      type="radio"
                      name="pkg"
                      checked={draft.packageSlug === p.slug}
                      onChange={() => set("packageSlug", p.slug)}
                      title={p.name}
                      price={money(p.price_cents)}
                      text={p.items.map((i) => cat.services.find((s) => s.id === i.service_id)?.name).filter(Boolean).join(" + ")}
                    />
                  ))}
                </div>
              </Group>
            ) : null}

            <Group title={pkg ? "Add more services" : "Choose your services"} error={errors.services} hint="Tiers (Sapphire, Garnet, Emerald) are alternatives: choosing one replaces the other.">
              <div className="grid gap-6">
                {categories.map((c) => {
                  const list = cat.services.filter((s) => s.category_id === c.id && s.price_cents !== null).sort((a, b) => a.sort - b.sort);
                  if (!list.length) return null;
                  return (
                    <fieldset key={c.id} className="grid gap-3">
                      <legend className="fmv-eyebrow pb-2">{c.name}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {list.map((s) => {
                          const inPkg = includedIds.has(s.id);
                          const checked = inPkg || Boolean(draft.services[s.slug]);
                          return (
                            <Option
                              key={s.slug}
                              type="checkbox"
                              checked={checked}
                              disabled={inPkg}
                              onChange={() => toggleService(s)}
                              title={s.name}
                              price={inPkg ? "In package" : priceLabel(s.price_cents, s.price_mode)}
                              text={[s.included_hours ? `${hoursLabel(s.included_hours)} included` : "", s.short_desc ?? ""].filter(Boolean).join(" · ")}
                            >
                              {checked && !inPkg && qtyMode(s.price_mode) ? (
                                <Stepper
                                  value={draft.services[s.slug]}
                                  min={1}
                                  max={s.price_mode === "per_item" ? 300 : 12}
                                  step={s.price_mode === "per_item" ? 1 : 0.5}
                                  unit={s.price_mode === "per_item" ? "items" : "hrs"}
                                  onChange={(v) => setDraft((d) => ({ ...d, services: { ...d.services, [s.slug]: v } }))}
                                />
                              ) : null}
                            </Option>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </Group>
            <p className="text-sm text-ink-soft">
              Looking for a mini session? Those are booked by time slot on the <Link to="/photography" hash="minis" className="fmv-link-underline">Photography page</Link>.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Event date" error={errors.date} required>
                <input type="date" min={tomorrow()} value={draft.date} aria-invalid={Boolean(errors.date)} onChange={(e) => set("date", e.target.value)} />
              </Field>
              <Field label="Start time" error={errors.start} required>
                <input type="time" step={900} value={draft.start} aria-invalid={Boolean(errors.start)} onChange={(e) => set("start", e.target.value)} />
              </Field>
              <Field label="End time" error={errors.end} required>
                <input type="time" step={900} value={draft.end} aria-invalid={Boolean(errors.end)} onChange={(e) => set("end", e.target.value)} />
              </Field>
            </div>
            {draft.date && draft.date >= tomorrow() ? (
              <div className="fmv-panel fmv-panel--blush flex flex-wrap items-center justify-between gap-3" aria-live="polite">
                <p className="text-sm"><strong>{dateLabel(draft.date)}</strong>{draft.end && minutes(draft.end) > minutes(draft.start) ? ` · ${timeLabel(draft.start)} to ${timeLabel(draft.end)}` : ""}</p>
                <span className="fmv-chip fmv-chip--ok">Date looks available</span>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Venue name" hint="Leave blank if you haven't chosen one yet.">
                <input value={draft.venueName} onChange={(e) => set("venueName", e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Venue address">
                <input value={draft.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} autoComplete="street-address" />
              </Field>
            </div>
            <Group title="Area" hint="Used for travel. Pick the closest match." error={errors.zoneId}>
              <div className="grid gap-3 sm:grid-cols-2">
                {cat.zones.map((z) => (
                  <Option key={z.id} type="radio" name="zone" checked={draft.zoneId === z.id} onChange={() => set("zoneId", z.id)} title={z.name} price={z.travel_fee_cents === 0 ? "Included" : z.travel_fee_cents ? money(z.travel_fee_cents) : ""} text={z.description ?? ""} />
                ))}
              </div>
            </Group>
            {cat.zones.find((z) => z.id === draft.zoneId)?.travel_fee_cents === null ? (
              <div className="max-w-xs">
                <Field label="About how far from Fredericton? (km)" hint="Optional. Helps us estimate travel.">
                  <input type="number" inputMode="numeric" min={0} value={draft.km} onChange={(e) => set("km", e.target.value)} />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <Group title="Make it extra" hint="Add-ons that go with the services you picked.">
            {addons.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {addons.map((a) => (
                  <Option key={a.slug} type="checkbox" checked={Boolean(draft.addons[a.slug])} onChange={() => toggleAddon(a)} title={a.name} price={priceLabel(a.price_cents, a.price_mode)} text={a.description ?? ""}>
                    {draft.addons[a.slug] && qtyMode(a.price_mode) ? (
                      <Stepper value={draft.addons[a.slug]} min={1} max={6} step={1} unit="hrs" onChange={(v) => setDraft((d) => ({ ...d, addons: { ...d.addons, [a.slug]: v } }))} />
                    ) : null}
                  </Option>
                ))}
              </div>
            ) : (
              <p className="fmv-body">No add-ons for these services right now. You can mention extras in your notes on the next step.</p>
            )}
          </Group>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-5">
            <div className="max-w-xs">
              <Field label="Approximate number of guests" error={errors.guests}>
                <input type="number" inputMode="numeric" min={1} value={draft.guests} aria-invalid={Boolean(errors.guests)} onChange={(e) => set("guests", e.target.value)} />
              </Field>
            </div>
            <Field label="Theme or colours" hint="For example: blush and gold, rustic fall, under the sea.">
              <input value={draft.theme} onChange={(e) => set("theme", e.target.value)} />
            </Field>
            <Field label="Anything else we should know?" hint="Timeline, must-have shots, rentals for the tables, questions…">
              <textarea rows={5} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-5">
            <p className="fmv-body">Where should we send your quote?</p>
            <Field label="Full name" error={errors.fullName} required>
              <input value={draft.fullName} autoComplete="name" aria-invalid={Boolean(errors.fullName)} onChange={(e) => set("fullName", e.target.value)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" hint="We'll send your quote here." error={errors.email} required>
                <input type="email" value={draft.email} autoComplete="email" aria-invalid={Boolean(errors.email)} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Phone" hint="For example 506-555-0123." error={errors.phone} required>
                <input type="tel" value={draft.phone} autoComplete="tel" aria-invalid={Boolean(errors.phone)} onChange={(e) => set("phone", e.target.value)} />
              </Field>
            </div>
            <Group title="Best way to reach you">
              <div className="fmv-filter" role="group" aria-label="Best way to reach you">
                {CONTACT_PREFS.map((p) => (
                  <button key={p} type="button" aria-pressed={draft.contactPref === p} onClick={() => set("contactPref", p)}>{p}</button>
                ))}
              </div>
            </Group>
            <div className="max-w-sm">
              <Field label="How did you hear about us?">
                <select value={draft.heard} onChange={(e) => set("heard", e.target.value)}>
                  {HEARD.map((h) => <option key={h} value={h}>{h || "Choose one (optional)"}</option>)}
                </select>
              </Field>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="grid gap-5">
            <ReviewBlock title="Your event" onEdit={() => setStep(0)}>
              <p>{EVENT_TYPES.find((t) => t.value === draft.eventType)?.label}</p>
              <ul className="grid gap-1 pt-1">
                {est.lines.map((l) => <li key={l.label}>· {l.label}{l.detail ? ` (${l.detail})` : ""}</li>)}
              </ul>
            </ReviewBlock>
            <ReviewBlock title="Date & place" onEdit={() => setStep(1)}>
              <p>{dateLabel(draft.date)} · {timeLabel(draft.start)} to {timeLabel(draft.end)}</p>
              <p>{[draft.venueName, draft.venueAddress].filter(Boolean).join(", ") || "Venue not chosen yet"} · {cat.zones.find((z) => z.id === draft.zoneId)?.name}</p>
            </ReviewBlock>
            <ReviewBlock title="Details" onEdit={() => setStep(3)}>
              <p>{draft.guests ? `${draft.guests} guests` : "Guest count not given"}{draft.theme ? ` · ${draft.theme}` : ""}</p>
              {draft.notes ? <p className="whitespace-pre-line">{draft.notes}</p> : null}
            </ReviewBlock>
            <ReviewBlock title="Your info" onEdit={() => setStep(4)}>
              <p>{draft.fullName}</p>
              <p>{draft.email} · {draft.phone}</p>
              <p>Prefers: {draft.contactPref}</p>
            </ReviewBlock>
            <label className="fmv-opt">
              <input type="checkbox" checked={draft.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={Boolean(errors.consent)} />
              <span className="text-sm">
                I agree that FMV Events &amp; Photography may contact me about this request. Nothing is booked or charged until I accept a quote. See the <Link to="/faq" className="fmv-link-underline">policies</Link>.
              </span>
            </label>
            {errors.consent ? <p className="fmv-err">{errors.consent}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          {step > 0 ? (
            <button type="button" className="fmv-cta-ghost" onClick={() => { setErrors({}); setStep((s) => s - 1); }}>Back</button>
          ) : <span />}
          {step < STEPS.length - 1 ? (
            <button type="button" className="fmv-cta-build" onClick={next}>
              <span aria-hidden="true" className="fmv-cta-build__dot" />
              Continue
            </button>
          ) : (
            <button type="button" className="fmv-cta-build" onClick={submit}>
              <span aria-hidden="true" className="fmv-cta-build__dot" />
              Send my request
            </button>
          )}
        </div>
        {Object.keys(errors).length ? <p className="fmv-err" role="alert">Please check the highlighted fields above.</p> : null}
      </div>

      <aside className="fmv-summary" aria-label="Your estimate">
        <div className="fmv-panel grid gap-3">
          <p className="fmv-eyebrow">Your estimate</p>
          {est.all.length && (est.lines.length || est.travel) ? (
            <ul className="grid gap-2 text-sm">
              {est.all.map((l) => (
                <li key={l.label} className="flex justify-between gap-3 border-b border-line pb-2">
                  <span>
                    {l.label}
                    {l.detail ? <span className="block text-xs text-ink-soft">{l.detail}</span> : null}
                  </span>
                  <span className="whitespace-nowrap font-semibold">{l.cents === null ? "TBD" : `${l.from ? "~" : ""}${money(l.cents)}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">Pick a package or services to see your estimate.</p>
          )}
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">Estimated total</span>
            <span className="fmv-price">{est.isFrom && est.total ? <span className="text-base">from </span> : null}{money(est.total)}</span>
          </div>
          {est.total ? <p className="text-sm text-ink-soft">{depositPct}% deposit ({money(deposit)}) by e-Transfer once you accept your quote. Nothing is charged today.</p> : null}
        </div>
      </aside>

      {est.total ? (
        <div className="fmv-mobilebar" aria-hidden="true">
          <div>
            <p className="text-xs text-ink-soft">Estimated total</p>
            <p className="fmv-mobilebar__total">{est.isFrom ? "from " : ""}{money(est.total)}</p>
          </div>
          <p className="text-right text-xs text-ink-soft">{depositPct}% deposit<br />{money(deposit)}</p>
        </div>
      ) : null}
    </div>
  );
}

function Confirmation({ req, ownerName, depositPct, holdHours, topRef }: { req: ProtoRequest; ownerName: string; depositPct: number; holdHours: number; topRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={topRef} className="mx-auto grid max-w-2xl scroll-mt-28 gap-6 text-center">
      <span aria-hidden="true" className="fmv-soon__mark mx-auto" />
      <p className="fmv-eyebrow">Request sent · {req.ref}</p>
      <h2 className="fmv-h2">Thank you, {req.customer.full_name.split(" ")[0]}!</h2>
      <p className="fmv-lede">
        {ownerName} will review your {req.event_type.toLowerCase()} on {dateLabel(req.date)} and email your personal quote to <strong>{req.customer.email}</strong>, usually within a day.
      </p>
      <div className="fmv-panel grid gap-2 text-left">
        <div className="fmv-row"><span>Estimated total</span><strong>{req.total_is_from ? "from " : ""}{money(req.total_cents)}</strong></div>
        <div className="fmv-row"><span>Deposit when you accept ({depositPct}%)</span><strong>{money(req.deposit_cents)}</strong></div>
        <p className="pt-2 text-sm text-ink-soft">Accept the quote online and your date is held for {holdHours} hours while you send the deposit by Interac e-Transfer.</p>
      </div>
      <div className="fmv-panel fmv-panel--blush grid gap-3 text-left">
        <p className="fmv-h3 fmv-h3--sm">Prototype preview</p>
        <p className="text-sm">Nothing was sent: this request is saved only in this browser. See it the way {ownerName} would receive it, with the customer details and estimate.</p>
        <div><Link to="/owner-preview" className="fmv-cta-ghost">See what {ownerName} receives</Link></div>
      </div>
      <p><Link to="/" className="fmv-link-underline">Back to the home page</Link></p>
    </div>
  );
}

function Group({ title, hint, error, children }: { title: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="fmv-h3 fmv-h3--sm">{title}</p>
        {hint ? <p className="fmv-hint">{hint}</p> : null}
      </div>
      {children}
      {error ? <p className="fmv-err">{error}</p> : null}
    </div>
  );
}

function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="fmv-field">
      <span>{label}{required ? <span aria-hidden="true" className="text-rose-deep"> *</span> : null}</span>
      {children}
      {hint && !error ? <span className="fmv-hint">{hint}</span> : null}
      {error ? <span className="fmv-err">{error}</span> : null}
    </label>
  );
}

function Option({ type, name, checked, disabled, onChange, title, price, text, children }: { type: "radio" | "checkbox"; name?: string; checked: boolean; disabled?: boolean; onChange: () => void; title: string; price?: string; text?: string; children?: ReactNode }) {
  return (
    <div className="fmv-opt" data-checked={checked} data-disabled={disabled}>
      <label className="flex flex-1 cursor-pointer items-start gap-3">
        <input type={type} name={name} checked={checked} disabled={disabled} onChange={onChange} />
        <span className="grid flex-1 gap-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{title}</span>
            {price ? <span className="whitespace-nowrap text-sm font-semibold text-rose-deep">{price}</span> : null}
          </span>
          {text ? <span className="text-sm text-ink-soft">{text}</span> : null}
        </span>
      </label>
      {children ? <div className="pl-8 pt-1">{children}</div> : null}
    </div>
  );
}

function Stepper({ value, min, max, step, unit, onChange }: { value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  return (
    <div className="fmv-stepper">
      <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`Fewer ${unit}`}>−</button>
      <span>{value} {unit}</span>
      <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`More ${unit}`}>+</button>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="fmv-panel grid gap-1 text-sm">
      <div className="flex items-center justify-between pb-1">
        <p className="fmv-eyebrow">{title}</p>
        <button type="button" className="fmv-link-underline text-sm" onClick={onEdit}>Edit</button>
      </div>
      {children}
    </div>
  );
}
