import type { SiteData } from "./types";

/** LocalBusiness JSON-LD from booking-app data; fields that aren't set are omitted. */
export function businessJsonLd(site: SiteData, origin: string): string | null {
  const s = site.settings;
  if (!s) return null;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ProfessionalService"],
    name: s.business_name,
    ...(origin ? { url: origin } : {}),
    description: "Photography, wedding coordination, event styling and photo booth rentals.",
    knowsAbout: ["Event photography", "Wedding coordination", "Event decor and styling", "Photo booth rental", "Mini photo sessions"],
    address: {
      "@type": "PostalAddress",
      addressLocality: s.city,
      addressRegion: s.province,
      addressCountry: "CA",
      ...(s.address_line ? { streetAddress: s.address_line } : {}),
      ...(s.postal_code ? { postalCode: s.postal_code } : {}),
    },
    areaServed: [{ "@type": "City", name: s.city }, { "@type": "AdministrativeArea", name: "New Brunswick" }],
    currenciesAccepted: "CAD",
    paymentAccepted: "Interac e-Transfer",
  };
  if (s.phone_e164) data.telephone = s.phone_e164;
  if (s.email) data.email = s.email;
  const sameAs = [s.facebook_url, s.instagram_url].filter(Boolean);
  if (sameAs.length) data.sameAs = sameAs;
  const offers = (site.catalog?.services ?? [])
    .filter((x) => x.price_cents !== null)
    .map((x) => ({
      "@type": "Offer",
      name: x.name,
      priceCurrency: "CAD",
      price: ((x.price_cents ?? 0) / 100).toFixed(2),
      ...(x.price_mode === "from" ? { priceSpecification: { "@type": "PriceSpecification", minPrice: ((x.price_cents ?? 0) / 100).toFixed(2), priceCurrency: "CAD" } } : {}),
    }));
  if (offers.length) data.makesOffer = offers;
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
