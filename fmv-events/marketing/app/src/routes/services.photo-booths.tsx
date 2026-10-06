import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { Gallery, ServiceCards, TierCards } from "@/components/fmv/blocks";
import { CheckDate } from "@/components/fmv/check-date";
import { useSite } from "@/components/fmv/use-site";
import { pageHead } from "@/fmv/seo";

export const Route = createFileRoute("/services/photo-booths")({
  head: () =>
    pageHead(
      "/services/photo-booths",
      "Photo booth rental in Fredericton: mirror, 360 & Magazine Photobox · FMV",
      "Mirror photo booth, Magazine Photobox, 360 booth, video guestbook, wedding arch and table rentals across New Brunswick. Check your date online.",
    ),
  component: PhotoBooths,
});

const RENTALS = new Set(["wedding-arch", "event-table-setup"]);

function PhotoBooths() {
  const { portfolio } = useSite();
  const reels = portfolio.filter((p) => p.category === "rentals");
  return (
    <main>
      <PageHero
        eyebrow="Photo booths & rentals"
        title="The corner everyone crowds around"
        lede="Mirror booth, Magazine Photobox, 360 booth, video guestbook, wedding arch and table setups, delivered and set up by our team."
        plate="/assets/plates/confetti.webp"
        crumbs={[{ to: "/services", label: "Services" }, { label: "Photo booths & rentals" }]}
      >
        <BuildCta>Check availability</BuildCta>
      </PageHero>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          <div>
            <SectionHead eyebrow="Photo booths" title="Compare the booths" lede="Rental length and what's included are listed with each package. Space and power needs are confirmed with your quote." />
            <TierCards categories={["rentals"]} only={(f) => !RENTALS.has(f.key)} />
          </div>
          <div className="grid content-start gap-6 lg:sticky lg:top-28">
            <CheckDate />
          </div>
        </div>
      </section>

      <section className="fmv-section bg-cream-deep" id="rentals">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Rentals" title="Arch and table setups" />
          <TierCards categories={["rentals"]} only={(f) => RENTALS.has(f.key)} />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap">
          <SectionHead eyebrow="See them in action" title="Booth reels from real events" />
          <Gallery items={reels} filters={false} />
        </div>
      </section>

      <section className="fmv-section bg-paper">
        <div className="fmv-wrap pb-8"><SectionHead eyebrow="More services" title="Pairs well with" /></div>
        <ServiceCards exclude="/services/photo-booths" />
      </section>
    </main>
  );
}
