import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead } from "@/components/fmv/chrome";
import { useSite } from "@/components/fmv/use-site";
import { placeLabel } from "@/fmv/format";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About · FMV Events & Photography" },
      { name: "description", content: "FMV Events & Photography is run by Marie Valenciano in Fredericton, New Brunswick: photography, coordination, décor and photo booths." },
    ],
  }),
  component: About,
});

function About() {
  const { settings } = useSite();
  const owner = settings?.owner_name ?? "Marie Valenciano";
  return (
    <main>
      <PageHero eyebrow="About" title={`Hi, I'm ${owner.split(" ")[0]}`} lede={`${owner} runs FMV Events & Photography from ${placeLabel(settings)}.`} plate="/assets/plates/still-camera.webp" />
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
            <div className="pt-2"><BuildCta /></div>
          </div>
        </div>
      </section>
    </main>
  );
}
