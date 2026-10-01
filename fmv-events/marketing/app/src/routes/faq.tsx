import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead, Soon } from "@/components/fmv/chrome";
import { useSite } from "@/components/fmv/use-site";
import { mdParagraphs } from "@/fmv/format";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ & policies · FMV Events & Photography" },
      { name: "description", content: "How booking works, deposits, e-Transfer payments, rescheduling, weather, prints and travel for FMV Events & Photography." },
    ],
  }),
  component: Faq,
});

function Faq() {
  const { settings, policies, bookingUrl } = useSite();
  const faqs: { q: string; a: string }[] = [
    {
      q: "How do I book?",
      a: "Build your event online to see a live estimate. We review it and send a personal quote. Accept the quote to hold your date, then send the deposit by Interac e-Transfer to confirm it.",
    },
    {
      q: "Is my date held when I send a request?",
      a: settings
        ? `Not yet. Your date is held for ${settings.hold_hours} hours once you accept your quote, and confirmed when the ${settings.deposit_pct}% deposit arrives.`
        : "Not yet. Your date is held once you accept your quote, and confirmed when the deposit arrives.",
    },
    { q: "How do I pay?", a: "By Interac e-Transfer. Each invoice has its own reference code to put in the e-Transfer message, so we can match your payment." },
    { q: "Are digital photos included?", a: "Yes. Digital photos come in an online gallery with every photography service. Printed photos and albums are add-ons." },
    { q: "Do you do birthdays, showers and corporate events?", a: "Yes: décor and balloon styling, photo booths and photography for celebrations of every kind." },
  ];
  return (
    <main>
      <PageHero eyebrow="FAQ & policies" title="Good to know before you book" lede="The short answers first, then our full policies." plate="/assets/plates/silk.webp">
        <BuildCta />
      </PageHero>
      <section className="fmv-section">
        <div className="fmv-wrap grid gap-4">
          <SectionHead eyebrow="Questions" title="Frequently asked" />
          {faqs.map((f) => (
            <details key={f.q} className="fmv-panel">
              <summary className="fmv-h3 fmv-h3--sm cursor-pointer">{f.q}</summary>
              <p className="fmv-body pt-3">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="fmv-section bg-cream-deep" id="policies">
        <div className="fmv-wrap grid gap-4">
          <SectionHead eyebrow="Policies" title="Our policies" lede="These are the same policies attached to every quote." />
          {policies.length ? (
            policies.map((p) => (
              <article key={p.key} id={p.key} className="fmv-panel grid gap-2">
                <h3 className="fmv-h3 fmv-h3--sm">{p.title}</h3>
                {mdParagraphs(p.body_md).map((para) => (
                  <p key={para} className="fmv-body">{para}</p>
                ))}
                <p className="text-xs text-ink-soft">Version {p.version}</p>
              </article>
            ))
          ) : (
            <Soon title="Policies are being finalized">Every quote includes the full policies, which you review before accepting.</Soon>
          )}
          {bookingUrl ? <p><a className="fmv-link-underline" href={`${bookingUrl}/policies`}>Policies on the booking site</a></p> : null}
        </div>
      </section>
    </main>
  );
}
