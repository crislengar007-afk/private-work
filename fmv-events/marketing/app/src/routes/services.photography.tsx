import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { Gallery, MiniCampaigns, PackagesGrid, ServiceCards, TierCards } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";
import { pageHead } from "@/fmv/seo";

export const Route = createFileRoute("/services/photography")({
  head: () =>
    pageHead(
      "/services/photography",
      "Photographer in Fredericton: weddings, engagements, birthdays & mini sessions · FMV",
      "Wedding, engagement and birthday photography plus seasonal mini sessions in Fredericton, NB. Unlimited shots and edited digital photos.",
    ),
  component: Photography,
});

function Photography() {
  const { portfolio } = useSite();
  const photos = portfolio.filter((p) => p.category === "photography" || p.category === "minis");
  return (
    <main>
      <PageHero
        eyebrow="Photography"
        title="Photos you'll want to frame"
        lede="Wedding and event coverage, relaxed sessions and seasonal minis, in natural light and real moments."
        plate="/assets/plates/still-camera.webp"
        crumbs={[{ to: "/services", label: "Services" }, { label: "Photography" }]}
      >
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
        <div className="fmv-wrap">
          <SectionHead eyebrow="Packages" title="Coverage and sessions" lede="Compare the Sapphire, Garnet and Emerald packages for each kind of shoot." />
          <TierCards categories={["photography"]} />
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Bundles" title="Wedding & engagement together" />
          <PackagesGrid eventType="wedding" />
        </div>
      </section>

      <section className="fmv-section" id="minis">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Mini sessions" title="Seasonal minis" lede="Short, sweet sessions on set dates. Pick a time and pay online to confirm your spot." />
          <MiniCampaigns />
        </div>
      </section>

      <section className="fmv-section bg-paper">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Portfolio" title="Recent photography" />
          <Gallery items={photos} filters={false} />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap pb-8"><SectionHead eyebrow="More services" title="Pairs well with" /></div>
        <ServiceCards exclude="/services/photography" />
      </section>
    </main>
  );
}
