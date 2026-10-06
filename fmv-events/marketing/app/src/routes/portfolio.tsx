import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { BeforeAfter, Gallery, ServiceCards } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";
import { pageHead } from "@/fmv/seo";

export const Route = createFileRoute("/portfolio")({
  head: () =>
    pageHead(
      "/portfolio",
      "Portfolio · FMV Events & Photography",
      "Weddings, birthdays, corporate events, décor and photo booth moments from real FMV events in Fredericton and New Brunswick.",
    ),
  component: Portfolio,
});

function Portfolio() {
  const { portfolio } = useSite();
  const featured = portfolio.filter((p) => p.featured);
  return (
    <main>
      <PageHero
        eyebrow="Portfolio"
        title="Our work, and only our work"
        lede="Every image here is from a real FMV event. Filter by occasion or by service."
        plate="/assets/plates/still-cascade.webp"
        crumbs={[{ label: "Portfolio" }]}
      >
        <BuildCta />
      </PageHero>

      {featured.length ? (
        <section className="fmv-section">
          <div className="fmv-wrap">
            <SectionHead eyebrow="Featured" title="Highlights" />
            <Gallery items={featured} filters={false} />
          </div>
        </section>
      ) : null}

      <section className={featured.length ? "fmv-section bg-paper" : "fmv-section"}>
        <div className="fmv-wrap">
          {featured.length ? <SectionHead eyebrow="All work" title="Browse by occasion" /> : null}
          <Gallery items={portfolio} />
        </div>
      </section>

      <BeforeAfter />

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap pb-8"><SectionHead eyebrow="Explore" title="See it by service" /></div>
        <ServiceCards />
      </section>
    </main>
  );
}
