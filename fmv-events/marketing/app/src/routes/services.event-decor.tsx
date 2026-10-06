import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { BeforeAfter, Gallery, ServiceCards, TierCards } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";
import { pageHead } from "@/fmv/seo";

export const Route = createFileRoute("/services/event-decor")({
  head: () =>
    pageHead(
      "/services/event-decor",
      "Balloon décor & event styling in Fredericton · FMV Events",
      "Wedding styling, balloon décor and themed backdrops for birthdays, baby showers, graduations and corporate events in Fredericton, NB.",
    ),
  component: EventDecor,
});

const OCCASIONS = [
  { title: "Weddings", text: "Ceremony backdrops, arches, florals and table styling." },
  { title: "Birthdays", text: "Themed balloon décor and backdrops for every age." },
  { title: "Baby showers", text: "Soft, pretty setups and a spot for photos." },
  { title: "Graduations & corporate", text: "Milestone celebrations and branded backdrops." },
] as const;

function EventDecor() {
  const { portfolio } = useSite();
  const styled = portfolio.filter((p) => p.category === "styling");
  return (
    <main>
      <PageHero
        eyebrow="Event décor & styling"
        title="Celebrations, styled with care"
        lede="Wedding styling, balloon décor, themed backdrops and table styling, set up and taken down by our team."
        plate="/assets/plates/balloons.webp"
        crumbs={[{ to: "/services", label: "Services" }, { label: "Event décor & styling" }]}
      >
        <BuildCta>Style your event</BuildCta>
      </PageHero>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {OCCASIONS.map((o) => (
            <a key={o.title} className="fmv-panel grid gap-2 no-underline" href="#styling">
              <p className="fmv-h3">{o.title}</p>
              <p className="fmv-body text-sm">{o.text}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="fmv-section bg-cream-deep" id="styling">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Styling" title="Balloons, backdrops and themes" lede="Tell us your theme and colours. Final pricing depends on the size and design, and is confirmed in your quote." />
          <TierCards categories={["styling"]} />
        </div>
      </section>

      <BeforeAfter />

      <section className="fmv-section bg-paper">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Real events" title="Spaces we've styled" />
          <Gallery items={styled} filters={false} />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap pb-8"><SectionHead eyebrow="More services" title="Pairs well with" /></div>
        <ServiceCards exclude="/services/event-decor" />
      </section>
    </main>
  );
}
