import { createFileRoute } from "@tanstack/react-router";
import { PageHero, Soon } from "@/components/fmv/chrome";
import { BookWizard, type BookSearch } from "@/components/fmv/book-wizard";
import { useSite } from "@/components/fmv/use-site";
import { pageHead } from "@/fmv/seo";

const str = (v: unknown) => (typeof v === "string" && v.length < 80 ? v : undefined);

export const Route = createFileRoute("/book")({
  validateSearch: (s: Record<string, unknown>): BookSearch => ({
    package: str(s.package),
    service: str(s.service),
    event_type: str(s.event_type),
    date: str(s.date),
  }),
  head: () =>
    pageHead(
      "/book",
      "Book or get a quote · FMV Events & Photography",
      "Choose your event, services and packages, see a live estimate and request your quote. A 50% deposit confirms your date.",
    ),
  component: Book,
});

function Book() {
  const { prototype, catalog } = useSite();
  const search = Route.useSearch();
  return (
    <main>
      <PageHero eyebrow="Book / Get a quote" title="Let's plan your day" lede="Choose your event, services and packages, see a live estimate, and we'll send your personal quote." plate="/assets/plates/silk.webp" />
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
