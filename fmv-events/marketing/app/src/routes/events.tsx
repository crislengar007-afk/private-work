import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { BeforeAfter, Gallery, PackagesGrid, ServiceList } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Balloon décor & event styling in Fredericton · FMV Events" },
      { name: "description", content: "Birthdays, baby showers, graduations and corporate events: balloon décor, themed styling and photo booths in Fredericton, NB." },
    ],
  }),
  component: Events,
});

const OCCASIONS = [
  { title: "Birthdays", text: "Themed balloon décor and backdrops for every age.", type: "birthday" },
  { title: "Baby showers", text: "Soft, pretty setups and a spot for photos.", type: "baby_shower" },
  { title: "Graduations", text: "Celebrate the milestone with styling and booths.", type: "graduation" },
  { title: "Corporate", text: "Branded backdrops and booths for launches and parties.", type: "corporate" },
] as const;

function Events() {
  const { portfolio } = useSite();
  const styled = portfolio.filter((p) => p.category === "styling" || (p.event_type && p.event_type !== "wedding"));
  return (
    <main>
      <PageHero eyebrow="Events & Décor" title="Celebrations, styled with care" lede="Balloon décor, themed backdrops and table styling for birthdays, showers, graduations and corporate events." plate="/assets/plates/balloons.webp">
        <BuildCta>Style your event</BuildCta>
      </PageHero>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {OCCASIONS.map((o) => (
            <a key={o.type} className="fmv-panel grid gap-2 no-underline" href="#styling">
              <p className="fmv-h3">{o.title}</p>
              <p className="fmv-body text-sm">{o.text}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="fmv-section bg-cream-deep" id="styling">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow="Styling" title="Balloons, backdrops and themes" lede="Tell us your theme and colours. Final pricing depends on the size and design, and is confirmed in your quote." />
          </div>
          <ServiceList categories={["styling"]} />
        </div>
      </section>

      <BeforeAfter />

      <section className="fmv-section">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Packages" title="Celebration bundles" />
          <PackagesGrid eventType="birthday" />
        </div>
      </section>

      <section className="fmv-section bg-paper">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Real events" title="Parties we've styled" />
          <Gallery items={styled} filters={false} />
        </div>
      </section>
    </main>
  );
}
