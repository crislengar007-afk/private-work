import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { Gallery, PackagesGrid, ServiceList } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";

export const Route = createFileRoute("/weddings")({
  head: () => ({
    meta: [
      { title: "Wedding coordination, styling & photography in Fredericton · FMV Events" },
      { name: "description", content: "Wedding coordinator, setup and styling, photography and photo booths in Fredericton, New Brunswick. One team for your whole day." },
    ],
  }),
  component: Weddings,
});

function Weddings() {
  const { portfolio, settings, catalog } = useSite();
  const weddingPhotos = portfolio.filter((p) => p.event_type === "wedding");
  const zonesNote = catalog?.zones.length ? "Travel within our service area is shown on the Service Area page and confirmed in your quote." : "Travel outside Fredericton is confirmed in your quote.";
  return (
    <main>
      <PageHero eyebrow="Weddings" title="A calm, beautiful wedding day" lede="Coordination, ceremony and reception styling, photography and booths, planned together so nothing falls between the cracks." plate="/assets/plates/silk.webp">
        <BuildCta path="/build?event_type=wedding">Plan your wedding</BuildCta>
        <Link to="/packages" className="fmv-link-underline">Wedding packages</Link>
      </PageHero>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow="Coordination" title="We keep the day on time" lede="Timeline management and vendor coordination, so you and your family can be present for every moment." />
            <ol className="fmv-steps">
              <li className="fmv-step"><p className="fmv-h3 fmv-h3--sm">We talk through your day</p><p className="fmv-body">Your vision, guest count, venue and must-have moments.</p></li>
              <li className="fmv-step"><p className="fmv-h3 fmv-h3--sm">We build the timeline</p><p className="fmv-body">Setup, ceremony, photos, reception and teardown, mapped out with your vendors.</p></li>
              <li className="fmv-step"><p className="fmv-h3 fmv-h3--sm">We run the day</p><p className="fmv-body">We cue vendors, solve surprises and keep everything moving.</p></li>
            </ol>
          </div>
          <div>
            <SectionHead eyebrow="Setup & styling" title="Backdrops, florals and tables" />
            <ServiceList categories={["coordination", "styling"]} />
          </div>
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Wedding packages" title="Bundled for the big day" />
          <PackagesGrid eventType="wedding" />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Real weddings" title="Weddings we've been part of" />
          <Gallery items={weddingPhotos} filters={false} />
        </div>
      </section>

      <section className="fmv-section bg-paper">
        <div className="fmv-wrap grid gap-6">
          <SectionHead eyebrow="For couples" title="Questions we hear a lot" />
          <details className="fmv-panel"><summary className="fmv-h3 fmv-h3--sm cursor-pointer">How do we hold our date?</summary>
            <p className="fmv-body pt-3">Build your wedding online and we send a personal quote. When you accept it your date is held{settings ? ` for ${settings.hold_hours} hours` : ""}, and it's confirmed once your {settings ? `${settings.deposit_pct}% ` : ""}deposit arrives by Interac e-Transfer.</p>
          </details>
          <details className="fmv-panel"><summary className="fmv-h3 fmv-h3--sm cursor-pointer">Can we combine photography, styling and a photo booth?</summary>
            <p className="fmv-body pt-3">Yes. That's what we do best: one team, one timeline. Packages show their à la carte value so you can compare.</p>
          </details>
          <details className="fmv-panel"><summary className="fmv-h3 fmv-h3--sm cursor-pointer">Do you travel to our venue?</summary>
            <p className="fmv-body pt-3">{zonesNote}</p>
          </details>
          <details className="fmv-panel"><summary className="fmv-h3 fmv-h3--sm cursor-pointer">Are digital photos included?</summary>
            <p className="fmv-body pt-3">Yes. Digital photos are delivered in an online gallery. Prints and albums are available as add-ons.</p>
          </details>
          <p><Link to="/faq" className="fmv-link-underline">All questions and policies</Link></p>
        </div>
      </section>
    </main>
  );
}
