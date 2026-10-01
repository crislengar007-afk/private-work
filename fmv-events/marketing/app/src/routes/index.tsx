import { createFileRoute, Link } from "@tanstack/react-router";

import { ScrollScrub } from "@/components/scroll-scrub/scroll-scrub";
import { scrollScrubScenes, scrollScrubTheme } from "@/scroll-scrub-scenes";
import { BuildCta, SectionHead } from "@/components/fmv/chrome";
import { CheckDate } from "@/components/fmv/check-date";
import { Gallery, HowItWorks, MiniBanner, PackagesGrid, Testimonials } from "@/components/fmv/blocks";
import { useSite } from "@/components/fmv/use-site";
import { money } from "@/fmv/format";

export const Route = createFileRoute("/")({
  component: Index,
});

function HeroActions() {
  return (
    <div className="flex flex-wrap items-center gap-5">
      <BuildCta />
      <Link to="/packages" className="fmv-link-underline">See packages</Link>
    </div>
  );
}

// Module constant: the scrub controller rebuilds if this identity changes.
const scenes = scrollScrubScenes.map((s) => ({ ...s, actions: <HeroActions /> }));

const PILLARS = [
  { to: "/photography", title: "Photography", text: "Sessions, weddings and seasonal minis. Digital photos included.", img: "/assets/plates/still-camera.webp" },
  { to: "/weddings", title: "Weddings & Coordination", text: "Timelines, vendors and a calm day for you.", img: "/assets/plates/silk.webp" },
  { to: "/events", title: "Décor & Styling", text: "Backdrops, florals, balloons and table styling.", img: "/assets/plates/balloons.webp" },
  { to: "/booths", title: "Photo Booth Rentals", text: "Mirror booth, 360 booth, video guestbook and more.", img: "/assets/plates/confetti.webp" },
] as const;

function Index() {
  const { portfolio, catalog } = useSite();
  const featured = portfolio.filter((p) => p.featured).slice(0, 6);
  const strip = featured.length ? featured : portfolio.slice(0, 6);
  const zones = catalog?.zones ?? [];
  return (
    <main>
      <MiniBanner />
      <div className="fmv-journey">
        <ScrollScrub scenes={scenes} theme={scrollScrubTheme} />
      </div>

      <section className="fmv-section fmv-resolve" aria-labelledby="resolve-title">
        <div className="fmv-wrap grid justify-items-center gap-4 text-center">
          <p aria-hidden="true" className="fmv-endmark__mono">FMV</p>
          <p className="fmv-endmark__sub">Events &amp; Photography</p>
          <h2 id="resolve-title" className="fmv-h2 max-w-3xl">Every detail of your day, in one pair of hands.</h2>
          <p className="fmv-lede">Marie and the FMV team, Fredericton and across New Brunswick.</p>
        </div>
      </section>

      <section className="fmv-section pt-0">
        <div className="fmv-wrap">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <Link key={p.to} to={p.to} className="fmv-pillar">
                <div className="fmv-arch"><img src={p.img} alt="" loading="lazy" /></div>
                <p className="fmv-h3">{p.title}</p>
                <p className="fmv-body text-sm">{p.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Packages" title="Bundles that keep it simple" lede="Each package shows its à la carte value, so you can see what's included." />
          <PackagesGrid limit={3} />
          <p className="pt-8"><Link to="/packages" className="fmv-link-underline">All packages and prices</Link></p>
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Portfolio" title="Real events, real people" lede="Every photo here is from an FMV event." />
          <Gallery items={strip} filters={false} />
          {portfolio.length > strip.length ? <p className="pt-6"><Link to="/portfolio" className="fmv-link-underline">See the full portfolio</Link></p> : null}
        </div>
      </section>

      <section className="fmv-section bg-paper">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow="How booking works" title="Four calm steps" />
            <HowItWorks />
          </div>
          <div className="grid content-start gap-6">
            <CheckDate />
          </div>
        </div>
      </section>

      <Testimonials />

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <SectionHead eyebrow="Service area" title="Fredericton and across New Brunswick" />
            {zones.length ? (
              <ul className="grid gap-2">
                {zones.map((z) => (
                  <li key={z.id} className="fmv-row">
                    <span>{z.name}</span>
                    <span className="text-sm text-ink-soft">
                      {z.travel_fee_cents === null ? "Travel quoted" : z.travel_fee_cents === 0 ? "Travel included" : `Travel ${money(z.travel_fee_cents)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fmv-lede">Based in Fredericton. Travel further afield is confirmed in your quote.</p>
            )}
            <p className="pt-6"><Link to="/service-area" className="fmv-link-underline">Where we travel</Link></p>
          </div>
          <div className="fmv-arch max-w-sm justify-self-center"><img src="/assets/plates/still-cascade.webp" alt="" loading="lazy" /></div>
        </div>
      </section>

      <section className="fmv-section fmv-closing">
        <div className="fmv-wrap grid justify-items-start gap-6">
          <p className="fmv-eyebrow">Your date</p>
          <h2 className="fmv-h2 max-w-3xl">Tell us about your event and get a live estimate in minutes.</h2>
          <BuildCta />
        </div>
      </section>
    </main>
  );
}
