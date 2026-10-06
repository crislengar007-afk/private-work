import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { AddonList, PackagesGrid, TierCards } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";
import { money } from "@/fmv/format";
import { pageHead } from "@/fmv/seo";

const RENTALS = new Set(["wedding-arch", "event-table-setup"]);

const TABS = [
  { key: "wedding", label: "Wedding packages", title: "Wedding & engagement bundles", lede: "Wedding coverage plus an engagement session, for less than booking them separately.", service: "/services/weddings" },
  { key: "photography", label: "Photography", title: "Photography packages", lede: "Sapphire, Garnet and Emerald coverage for weddings, engagements and birthdays.", service: "/services/photography" },
  { key: "coordination", label: "Coordination", title: "Coordination packages", lede: "From half-day support to coordination over the weeks before your wedding.", service: "/services/event-coordination" },
  { key: "booths", label: "Photo booths", title: "Photo booth packages", lede: "Mirror booth, Magazine Photobox, 360 booth and video guestbook.", service: "/services/photo-booths" },
  { key: "decor", label: "Décor", title: "Décor & styling", lede: "Wedding setup and styling, and themed balloon décor.", service: "/services/event-decor" },
  { key: "rentals", label: "Rentals & add-ons", title: "Rentals and add-ons", lede: "The wedding arch, table setups and extras you can add to any booking.", service: "/services/photo-booths" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export const Route = createFileRoute("/packages")({
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey } => ({
    tab: TABS.some((t) => t.key === s.tab) ? (s.tab as TabKey) : undefined,
  }),
  head: () =>
    pageHead(
      "/packages",
      "Packages & pricing · FMV Events & Photography, Fredericton",
      "Compare wedding, photography, coordination, photo booth and décor packages with published prices, inclusions and add-ons. Fredericton, NB.",
    ),
  component: Packages,
});

function TabPanel({ tab }: { tab: TabKey }) {
  if (tab === "wedding") return <PackagesGrid eventType="wedding" />;
  if (tab === "photography") return <TierCards categories={["photography", "minis"]} />;
  if (tab === "coordination") return <TierCards categories={["coordination"]} />;
  if (tab === "booths") return <TierCards categories={["rentals"]} only={(f) => !RENTALS.has(f.key)} />;
  if (tab === "decor") return <TierCards categories={["styling"]} />;
  return (
    <div className="grid gap-12">
      <TierCards categories={["rentals"]} only={(f) => RENTALS.has(f.key)} />
      <div className="grid gap-6">
        <p className="fmv-h3">Add-ons</p>
        <AddonList />
      </div>
    </div>
  );
}

function Packages() {
  const { settings, catalog } = useSite();
  const { tab = "wedding" } = Route.useSearch();
  const navigate = useNavigate({ from: "/packages" });
  const zones = catalog?.zones ?? [];
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const select = (key: TabKey) => navigate({ search: { tab: key }, replace: true, resetScroll: false });
  return (
    <main>
      <PageHero
        eyebrow="Packages & pricing"
        title="Clear prices, no guesswork"
        lede="Pick a category to compare packages side by side, then book one or build your own combination."
        plate="/assets/plates/bokeh.webp"
        crumbs={[{ label: "Packages" }]}
      >
        <BuildCta>Build your own</BuildCta>
      </PageHero>

      <section className="fmv-section pt-0">
        <div className="fmv-tabbar">
          <div className="fmv-wrap">
            <div className="fmv-tabs" role="tablist" aria-label="Package categories">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`tab-${t.key}`}
                  aria-selected={t.key === tab}
                  aria-controls="package-panel"
                  tabIndex={t.key === tab ? 0 : -1}
                  onClick={() => select(t.key)}
                  onKeyDown={(e) => {
                    const i = TABS.findIndex((x) => x.key === tab);
                    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
                    if (next === null) return;
                    e.preventDefault();
                    const k = TABS[(next + TABS.length) % TABS.length].key;
                    select(k);
                    document.getElementById(`tab-${k}`)?.focus();
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="fmv-wrap pt-10" id="package-panel" role="tabpanel" aria-labelledby={`tab-${current.key}`}>
          <div className="flex flex-wrap items-end justify-between gap-4 pb-10">
            <div className="grid gap-3">
              <h2 className="fmv-h2">{current.title}</h2>
              <p className="fmv-lede">{current.lede}</p>
            </div>
            <Link to={current.service} className="fmv-link-underline">About this service</Link>
          </div>
          <TabPanel tab={current.key} />
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Good to know" title="How pricing works" />
          <div className="grid gap-6 md:grid-cols-3">
            <div className="fmv-panel grid gap-2">
              <p className="fmv-h3 fmv-h3--sm">Digital photos included</p>
              <p className="fmv-body">Every photography service includes an online gallery. Prints and albums are add-ons.</p>
            </div>
            <div className="fmv-panel grid gap-2">
              <p className="fmv-h3 fmv-h3--sm">{settings ? `${settings.deposit_pct}% deposit` : "Deposit"} confirms your date</p>
              <p className="fmv-body">
                Paid by Interac e-Transfer after you accept your quote{settings ? `; the balance is due ${settings.balance_due_days_before_event} days before your event` : ""}.
              </p>
            </div>
            <div className="fmv-panel grid gap-2">
              <p className="fmv-h3 fmv-h3--sm">Travel</p>
              <p className="fmv-body">
                {zones.length
                  ? zones.map((z) => `${z.name}: ${z.travel_fee_cents === null ? "quoted" : z.travel_fee_cents === 0 ? "included" : money(z.travel_fee_cents)}`).join(" · ")
                  : "Travel outside Fredericton is confirmed in your quote."}
              </p>
              <Link to="/service-area" className="fmv-link-underline text-sm">Service area</Link>
            </div>
          </div>
          {settings?.tax_enabled ? <p className="pt-6 text-sm text-ink-soft">Prices are before HST, which is added in your quote.</p> : null}
        </div>
      </section>
    </main>
  );
}
