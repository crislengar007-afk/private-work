import { createFileRoute } from "@tanstack/react-router";
import { BuildCta, PageHero, SectionHead, Soon } from "@/components/fmv/chrome";
import { InquiryForm } from "@/components/fmv/inquiry-form";
import { useSite } from "@/components/fmv/use-site";
import { phoneLabel, provinceName, whatsappHref } from "@/fmv/format";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact · FMV Events & Photography, Fredericton" },
      { name: "description", content: "Call, message or email FMV Events & Photography, or build your event online for a live estimate." },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { settings: s, bookingUrl, prototype } = useSite();
  const address = s ? [s.address_line, s.city, provinceName(s.province), s.postal_code].filter(Boolean).join(", ") : "";
  const channels = s
    ? [
        s.phone_e164 ? { label: "Call", value: phoneLabel(s.phone_e164), href: `tel:${s.phone_e164}` } : null,
        s.email ? { label: "Email", value: s.email, href: `mailto:${s.email}` } : null,
        s.whatsapp_e164 ? { label: "WhatsApp", value: phoneLabel(s.whatsapp_e164), href: whatsappHref(s.whatsapp_e164) } : null,
        s.messenger_url ? { label: "Messenger", value: "Message us on Facebook", href: s.messenger_url } : null,
      ].filter((x): x is { label: string; value: string; href: string } => Boolean(x))
    : [];
  return (
    <main>
      <PageHero eyebrow="Contact" title="Let's talk about your event" lede="The fastest way to a quote is to build your event online. Questions? Reach us any way you like." plate="/assets/plates/balloons.webp">
        <BuildCta />
      </PageHero>
      <section className="fmv-section">
        <div className="fmv-wrap grid gap-12 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <SectionHead eyebrow="Reach us" title="Get in touch" />
            {channels.length ? (
              <div className="fmv-panel">
                {channels.map((c) => (
                  <div key={c.label} className="fmv-row">
                    <span className="fmv-eyebrow">{c.label}</span>
                    <a className="fmv-link-underline" href={c.href}>{c.value}</a>
                  </div>
                ))}
              </div>
            ) : (
              <Soon title="Contact details are on their way">Our phone number, email and messaging links will appear here shortly.</Soon>
            )}
            {address ? <p className="fmv-body">{address}</p> : null}
            {s?.hours_text ? <p className="fmv-body whitespace-pre-line">{s.hours_text}</p> : null}
            {bookingUrl ? (
              <p><a className="fmv-cta-ghost" href={`${bookingUrl}/contact`}>Send us a question</a></p>
            ) : null}
          </div>
          <div id="booking-soon" className="grid content-start gap-4">
            {prototype ? (
              <div id="inquiry" className="grid scroll-mt-28 gap-4">
                <InquiryForm />
                <div className="fmv-panel fmv-panel--blush grid gap-3">
                  <p className="fmv-h3">Ready for a quote?</p>
                  <p className="fmv-body">Choose your date and services, see a live estimate, and we&apos;ll send your quote.</p>
                  <div><BuildCta /></div>
                </div>
              </div>
            ) : bookingUrl ? (
              <div className="fmv-panel fmv-panel--blush grid gap-3">
                <p className="fmv-h3">Build your event</p>
                <p className="fmv-body">Choose your date and services, see a live estimate, and we&apos;ll send your quote.</p>
                <div><BuildCta /></div>
              </div>
            ) : (
              <Soon title="Online booking opens soon">
                Our booking system is being set up. In the meantime, reach out and we&apos;ll put together your quote personally.
              </Soon>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
