import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { AddonList, Gallery, ServiceList } from "@/components/fmv/blocks";
import { CheckDate } from "@/components/fmv/check-date";
import { useSite } from "@/components/fmv/use-site";

export const Route = createFileRoute("/booths")({
  head: () => ({
    meta: [
      { title: "Photo booth rental in Fredericton: mirror & 360 booths · FMV Events" },
      { name: "description", content: "Mirror photo booth, 360 photo booth, video guestbook, wedding arch and table rentals across New Brunswick. Check your date online." },
    ],
  }),
  component: Booths,
});

function Booths() {
  const { portfolio } = useSite();
  const reels = portfolio.filter((p) => p.category === "rentals");
  return (
    <main>
      <PageHero eyebrow="Photo booths & rentals" title="The corner everyone crowds around" lede="Mirror booth, 360 booth, video guestbook, wedding arch and table setups, delivered, set up and taken down by our team." plate="/assets/plates/confetti.webp">
        <BuildCta>Check availability</BuildCta>
      </PageHero>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <SectionHead eyebrow="Rentals" title="What you can book" lede="Rental length and what's included are listed with each item. Space and power needs are confirmed with your quote." />
            <ServiceList categories={["rentals"]} />
          </div>
          <div className="grid content-start gap-6">
            <CheckDate />
            <AddonList />
          </div>
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="See them in action" title="Booth reels from real events" />
          <Gallery items={reels} filters={false} />
        </div>
      </section>
    </main>
  );
}
