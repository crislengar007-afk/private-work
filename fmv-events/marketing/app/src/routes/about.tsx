import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { HowItWorks, WhyFmv } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";
import { money, placeLabel } from "@/fmv/format";
import { pageHead } from "@/fmv/seo";

export const Route = createFileRoute("/about")({
  head: () =>
    pageHead(
      "/about",
      "About · FMV Events & Photography, Fredericton",
      "FMV Events & Photography is run by Marie Valenciano in Fredericton, New Brunswick: photography, coordination, décor and photo booths.",
    ),
  component: About,
});

function About() {
  const { settings, catalog } = useSite();
  const owner = settings?.owner_name ?? "Marie Valenciano";
  const zones = catalog?.zones ?? [];
  return (
    <main>
      <PageHero
        eyebrow="About"
        title={`Hi, I'm ${owner.split(" ")[0]}`}
        lede={`${owner} runs FMV Events & Photography from ${placeLabel(settings)}.`}
        plate="/assets/plates/still-camera.webp"
        crumbs={[{ label: "About" }]}
      />

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div className="fmv-arch max-w-sm"><img src="/assets/plates/still-cascade.webp" alt="" loading="lazy" /></div>
          <div className="grid gap-5">
            <SectionHead eyebrow="What we do" title="One team for your whole event" />
            <p className="fmv-lede">
              FMV brings photography, wedding coordination, event styling and photo booth rentals together, so one small team
              plans your day with you from the first idea to the last photo.
            </p>
            <p className="fmv-body">
              We work across Fredericton and New Brunswick: weddings, birthdays, baby showers, graduations, corporate events
              and seasonal mini sessions.
            </p>
            <div className="flex flex-wrap items-center gap-5 pt-2">
              <BuildCta />
              <Link to="/services" className="fmv-link-underline">Our services</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Why FMV" title="Why clients choose FMV" />
          <WhyFmv />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <SectionHead eyebrow="Our approach" title="How we work with you" />
            <HowItWorks />
          </div>
          <div className="grid content-start gap-4">
            <SectionHead eyebrow="Where we work" title={`${placeLabel(settings)} and beyond`} />
            {zones.length ? (
              <div className="fmv-panel">
                {zones.map((z) => (
                  <div key={z.id} className="fmv-row">
                    <span>{z.name}</span>
                    <span className="text-sm text-ink-soft">
                      {z.travel_fee_cents === null ? "Travel quoted" : z.travel_fee_cents === 0 ? "Travel included" : `Travel ${money(z.travel_fee_cents)}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="fmv-body">Based in Fredericton. Travel further afield is confirmed in your quote.</p>
            )}
            <p><Link to="/service-area" className="fmv-link-underline">Service area details</Link></p>
          </div>
        </div>
      </section>
    </main>
  );
}
