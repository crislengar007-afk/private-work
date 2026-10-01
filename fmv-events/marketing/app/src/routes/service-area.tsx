import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead, Soon } from "@/components/fmv/chrome";
import { useSite } from "@/components/fmv/use-site";
import { money, placeLabel } from "@/fmv/format";

export const Route = createFileRoute("/service-area")({
  head: () => ({
    meta: [
      { title: "Service area: Fredericton & New Brunswick · FMV Events" },
      { name: "description", content: "FMV Events & Photography is based in Fredericton and travels across New Brunswick. See travel zones and fees." },
    ],
  }),
  component: ServiceArea,
});

function ServiceArea() {
  const { settings, catalog } = useSite();
  const zones = catalog?.zones ?? [];
  return (
    <main>
      <PageHero eyebrow="Service area" title={`Based in ${placeLabel(settings).split(",")[0]}, travelling across New Brunswick`} lede="Travel within our home area is included. Further afield, a travel fee is shown when you build your event and confirmed in your quote." plate="/assets/plates/bokeh.webp">
        <BuildCta />
      </PageHero>
      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow="Travel zones" title="Where we go" />
            {zones.length ? (
              <div className="fmv-panel">
                {zones.map((z) => (
                  <div key={z.id} className="fmv-row">
                    <div>
                      <p className="font-semibold">{z.name}</p>
                      {z.description ? <p className="fmv-body text-sm">{z.description}</p> : null}
                    </div>
                    <p className="fmv-display text-xl">
                      {z.travel_fee_cents === null ? "Quoted" : z.travel_fee_cents === 0 ? "Included" : money(z.travel_fee_cents)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <Soon title="Travel zones coming soon">Tell us your venue when you build your event and we&apos;ll confirm travel in your quote.</Soon>
            )}
          </div>
          <figure className="grid gap-3">
            <iframe
              title="Map of Fredericton, New Brunswick"
              className="h-96 w-full rounded-2xl border border-line"
              loading="lazy"
              src="https://www.openstreetmap.org/export/embed.html?bbox=-67.30%2C45.40%2C-64.50%2C46.60&amp;layer=mapnik&amp;marker=45.9636%2C-66.6431"
            />
            <figcaption className="text-sm text-ink-soft">
              Map data © <a className="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
            </figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}
