import { createFileRoute } from "@tanstack/react-router";
import { PageHero, Soon } from "@/components/fmv/chrome";
import { BookWizard, type BookSearch } from "@/components/fmv/book-wizard";
import { useSite } from "@/components/fmv/use-site";

const str = (v: unknown) => (typeof v === "string" && v.length < 80 ? v : undefined);

export const Route = createFileRoute("/book")({
  validateSearch: (s: Record<string, unknown>): BookSearch => ({
    package: str(s.package),
    service: str(s.service),
    event_type: str(s.event_type),
    date: str(s.date),
  }),
  head: () => ({
    meta: [
      { title: "Build your event · FMV Events & Photography" },
      { name: "description", content: "Pick your date, services and add-ons, see a live estimate and request your quote." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Book,
});

function Book() {
  const { prototype, catalog } = useSite();
  const search = Route.useSearch();
  return (
    <main>
      <PageHero eyebrow="Build your event" title="Let's plan your day" lede="Choose your date, services and extras, see a live estimate, and we'll send your personal quote." plate="/assets/plates/silk.webp" />
      <section className="fmv-section">
        <div className="fmv-wrap">
          {prototype && catalog ? (
            <BookWizard search={search} />
          ) : (
            <Soon title="Online booking opens soon">
              Our booking system is being set up. In the meantime, reach out and we&apos;ll put together your quote personally.
            </Soon>
          )}
        </div>
      </section>
    </main>
  );
}
