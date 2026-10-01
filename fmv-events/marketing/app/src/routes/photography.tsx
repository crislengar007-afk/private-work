import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { AddonList, Gallery, MiniCampaigns, ServiceList } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";

export const Route = createFileRoute("/photography")({
  head: () => ({
    meta: [
      { title: "Photographer in Fredericton: sessions & Christmas mini sessions · FMV Events" },
      { name: "description", content: "Wedding and event photography, portrait sessions and seasonal mini sessions in Fredericton, NB. Digital photos included." },
    ],
  }),
  component: Photography,
});

function Photography() {
  const { portfolio } = useSite();
  const photos = portfolio.filter((p) => p.category === "photography" || p.category === "minis");
  return (
    <main>
      <PageHero eyebrow="Photography" title="Photos you'll want to frame" lede="Wedding and event coverage, relaxed sessions and seasonal minis, in natural light and real moments." plate="/assets/plates/still-camera.webp">
        <BuildCta>Book photography</BuildCta>
      </PageHero>

      <section className="fmv-section--tight">
        <div className="fmv-wrap">
          <div className="fmv-panel fmv-panel--blush grid gap-2 text-center">
            <p className="fmv-h3">Digital photos included · prints &amp; albums available as add-ons</p>
            <p className="fmv-body">Every session comes with an online gallery of your edited photos.</p>
          </div>
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <SectionHead eyebrow="Sessions" title="Coverage and sessions" />
            <ServiceList categories={["photography", "minis"]} />
          </div>
          <div className="grid content-start gap-6">
            <p className="fmv-eyebrow">Add-ons</p>
            <AddonList />
          </div>
        </div>
      </section>

      <section className="fmv-section bg-cream-deep" id="minis">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Mini sessions" title="Seasonal minis" lede="Short, sweet sessions on set dates. Pick a time and pay online to confirm your spot." />
          <MiniCampaigns />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Portfolio" title="Recent photography" />
          <Gallery items={photos} filters={false} />
        </div>
      </section>
    </main>
  );
}
