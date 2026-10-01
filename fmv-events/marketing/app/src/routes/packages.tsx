import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { AddonList, PackagesGrid, ServiceList } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";
import { money } from "@/fmv/format";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: "Packages & pricing · FMV Events & Photography, Fredericton" },
      { name: "description", content: "Wedding, celebration and corporate packages plus à la carte prices for photography, coordination, styling and photo booth rentals in Fredericton, NB." },
    ],
  }),
  component: Packages,
});

function Packages() {
  const { settings, catalog } = useSite();
  const zones = catalog?.zones ?? [];
  return (
    <main>
      <PageHero eyebrow="Packages & pricing" title="Clear prices, no guesswork" lede="Start from a package or build your own. Every price below comes straight from our booking system, so it's always current." plate="/assets/plates/bokeh.webp">
        <BuildCta />
      </PageHero>

      <section className="fmv-section">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Packages" title="Bundles" lede="Each package shows its à la carte value next to the bundle price." />
          <PackagesGrid />
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2">
          <div className="grid content-start gap-8">
            <SectionHead eyebrow="À la carte" title="Photography & minis" />
            <ServiceList categories={["photography", "minis"]} />
            <SectionHead eyebrow="À la carte" title="Coordination & styling" />
            <ServiceList categories={["coordination", "styling"]} />
          </div>
          <div className="grid content-start gap-8">
            <SectionHead eyebrow="À la carte" title="Booths & rentals" />
            <ServiceList categories={["rentals"]} />
            {catalog?.addons.length ? (
              <>
                <SectionHead eyebrow="Add-ons" title="Extras" />
                <AddonList />
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-6 md:grid-cols-3">
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
        {settings?.tax_enabled ? <p className="fmv-wrap pt-6 text-sm text-ink-soft">Prices are before HST, which is added in your quote.</p> : null}
      </section>
    </main>
  );
}
