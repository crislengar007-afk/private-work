import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero } from "@/components/fmv/chrome";
import { BeforeAfter, Gallery } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · FMV Events & Photography" },
      { name: "description", content: "Weddings, celebrations, styling and photo booth moments from real FMV events in Fredericton and New Brunswick." },
    ],
  }),
  component: Portfolio,
});

function Portfolio() {
  const { portfolio } = useSite();
  return (
    <main>
      <PageHero eyebrow="Portfolio" title="Our work, and only our work" lede="Every image here is from a real FMV event. Filter by what you're planning." plate="/assets/plates/still-cascade.webp">
        <BuildCta />
      </PageHero>
      <section className="fmv-section">
        <div className="fmv-wrap">
          <Gallery items={portfolio} />
        </div>
      </section>
      <BeforeAfter />
    </main>
  );
}
