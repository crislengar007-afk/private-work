import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { ServiceCards, TierCards } from "@/components/fmv/blocks";
import { pageHead } from "@/fmv/seo";

export const Route = createFileRoute("/services/event-coordination")({
  head: () =>
    pageHead(
      "/services/event-coordination",
      "Wedding coordinator in Fredericton: half-day, full-day & month-of · FMV Events",
      "Wedding-day and month-of coordination in Fredericton, NB: timelines, vendor coordination and support from start to finish.",
    ),
  component: Coordination,
});

function Coordination() {
  return (
    <main>
      <PageHero
        eyebrow="Event coordination"
        title="We keep the day on time"
        lede="Timeline management and vendor coordination, so you and your family can be present for every moment."
        plate="/assets/plates/still-cascade.webp"
        crumbs={[{ to: "/services", label: "Services" }, { label: "Event coordination" }]}
      >
        <BuildCta path="/build?event_type=wedding">Plan your day</BuildCta>
      </PageHero>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow="How it works" title="Three steps to a calm day" />
            <ol className="fmv-steps">
              <li className="fmv-step"><p className="fmv-h3 fmv-h3--sm">We talk through your day</p><p className="fmv-body">Your vision, guest count, venue and must-have moments.</p></li>
              <li className="fmv-step"><p className="fmv-h3 fmv-h3--sm">We build the timeline</p><p className="fmv-body">Setup, ceremony, photos, reception and teardown, mapped out with your vendors.</p></li>
              <li className="fmv-step"><p className="fmv-h3 fmv-h3--sm">We run the day</p><p className="fmv-body">We cue vendors, solve surprises and keep everything moving.</p></li>
            </ol>
          </div>
          <div className="fmv-panel fmv-panel--blush grid content-start gap-3">
            <p className="fmv-h3">Coordination plus photography or styling?</p>
            <p className="fmv-body">Add any other service in the same quote. One team means one timeline and one point of contact.</p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link to="/services/weddings" className="fmv-link-underline">Weddings</Link>
              <Link to="/services/event-decor" className="fmv-link-underline">Setup &amp; styling</Link>
              <Link to="/services/photography" className="fmv-link-underline">Photography</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Packages" title="Choose your level of support" />
          <TierCards categories={["coordination"]} />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap pb-8"><SectionHead eyebrow="More services" title="Pairs well with" /></div>
        <ServiceCards exclude="/services/event-coordination" />
      </section>
    </main>
  );
}
