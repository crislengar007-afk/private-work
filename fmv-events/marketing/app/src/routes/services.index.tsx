import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { HowItWorks, ServiceCards, WhyFmv } from "@/components/fmv/blocks";
import { pageHead } from "@/fmv/seo";

export const Route = createFileRoute("/services/")({
  head: () =>
    pageHead(
      "/services",
      "Event services in Fredericton: photography, décor, photo booths & coordination · FMV",
      "Wedding and event photography, décor and styling, photo booth rentals and wedding coordination in Fredericton and across New Brunswick.",
    ),
  component: Services,
});

function Services() {
  return (
    <main>
      <PageHero
        eyebrow="Services"
        title="Photography, décor, booths and coordination"
        lede="Choose a service to see what's included and what it costs, or build your event to combine several into one quote."
        plate="/assets/plates/bokeh.webp"
        crumbs={[{ label: "Services" }]}
      >
        <BuildCta>Build your event</BuildCta>
        <Link to="/packages" className="fmv-link-underline">Compare packages</Link>
      </PageHero>

      <section className="fmv-section pt-0" aria-label="Our services">
        <ServiceCards />
      </section>

      <section className="fmv-section bg-cream-deep">
        <div className="fmv-wrap">
          <SectionHead eyebrow="Why FMV" title="One team, one timeline" />
          <WhyFmv />
        </div>
      </section>

      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <SectionHead eyebrow="How booking works" title="From idea to confirmed date" />
            <HowItWorks />
          </div>
          <div className="fmv-panel fmv-panel--blush grid gap-4">
            <p className="fmv-h3">Not sure what you need?</p>
            <p className="fmv-body">
              Tell us the occasion and pick the services that interest you. If you&apos;re unsure about a package, choose
              &ldquo;Help me choose&rdquo; and we&apos;ll suggest one in your quote.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <BuildCta>Get a quote</BuildCta>
              <Link to="/contact" hash="inquiry" className="fmv-link-underline">Ask a question</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
