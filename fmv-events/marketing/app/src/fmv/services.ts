// The service pages and how catalog services group into tiered "families"
// (Sapphire / Garnet / Emerald). Shared by the navigation, /services, the
// packages tabs and the booking builder, so every page reads the same structure.
import type { Addon, Catalog, Service } from "./types";

export type ServicePath =
  | "/services/weddings"
  | "/services/photography"
  | "/services/event-decor"
  | "/services/photo-booths"
  | "/services/event-coordination";

export interface ServicePage {
  to: ServicePath;
  label: string;
  blurb: string;
  img: string;
  /** Catalog category slugs priced on the page. */
  categories: string[];
  /** Which services count toward the page's "from" price. */
  priceMatch: (s: Service) => boolean;
}

export const SERVICE_PAGES: ServicePage[] = [
  {
    to: "/services/weddings",
    label: "Weddings",
    blurb: "Coordination, styling, photography and booths, planned together.",
    img: "/assets/plates/silk.webp",
    categories: ["coordination", "styling", "photography", "rentals"],
    priceMatch: (s) => s.slug.startsWith("wedding"),
  },
  {
    to: "/services/photography",
    label: "Photography",
    blurb: "Wedding, engagement and birthday coverage, plus seasonal minis.",
    img: "/assets/plates/still-camera.webp",
    categories: ["photography", "minis"],
    priceMatch: (s) => s.category_slug === "photography",
  },
  {
    to: "/services/event-decor",
    label: "Event décor & styling",
    blurb: "Balloon décor, backdrops, florals and table styling.",
    img: "/assets/plates/balloons.webp",
    categories: ["styling"],
    priceMatch: (s) => s.category_slug === "styling",
  },
  {
    to: "/services/photo-booths",
    label: "Photo booths & rentals",
    blurb: "Mirror booth, Magazine Photobox, 360 booth, guestbook, arch and tables.",
    img: "/assets/plates/confetti.webp",
    categories: ["rentals"],
    priceMatch: (s) => s.category_slug === "rentals" && s.price_mode !== "per_item",
  },
  {
    to: "/services/event-coordination",
    label: "Event coordination",
    blurb: "Half-day, full-day and month-of wedding coordination.",
    img: "/assets/plates/still-cascade.webp",
    categories: ["coordination"],
    priceMatch: (s) => s.category_slug === "coordination",
  },
];

/** Plate image for a catalog category, used where there is no real photo yet. */
export const CATEGORY_PLATE: Record<string, string> = {
  photography: "/assets/plates/still-camera.webp",
  minis: "/assets/plates/bokeh.webp",
  coordination: "/assets/plates/still-cascade.webp",
  styling: "/assets/plates/balloons.webp",
  rentals: "/assets/plates/confetti.webp",
};

/** Sapphire / Garnet / Emerald tiers of one service share a family key. */
export const tierFamily = (slug: string) => slug.replace(/-(sapphire|garnet|emerald)$/, "");

/** "Wedding Photography: Garnet" -> "Garnet"; untiered services keep their name. */
export function tierName(s: Service): string {
  const i = s.name.indexOf(":");
  return i === -1 ? s.name : s.name.slice(i + 1).trim();
}

/** Sentences of a description as bullet points. */
export function bullets(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\.\s+(?=[A-Z0-9])/)
    .map((t) => t.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

export interface Family {
  key: string;
  name: string;
  category: string;
  services: Service[];
}

/** Priced services in the given categories, grouped into tier families (cheapest tier first). */
export function families(catalog: Catalog, categories: string[]): Family[] {
  const map = new Map<string, Family>();
  const list = catalog.services
    .filter((s) => categories.includes(s.category_slug) && s.price_cents !== null)
    .sort((a, b) => a.sort - b.sort);
  for (const s of list) {
    const key = tierFamily(s.slug);
    const fam = map.get(key) ?? { key, name: s.name.split(":")[0].trim(), category: s.category_slug, services: [] };
    fam.services.push(s);
    map.set(key, fam);
  }
  return [...map.values()]
    .sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category))
    .map((f) => ({ ...f, services: [...f.services].sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0)) }));
}

/** Add-ons offered with a service (by its category). */
export function addonsFor(catalog: Catalog, s: Service): Addon[] {
  return catalog.addons.filter((a) => a.price_cents !== null && a.applies_to_category_ids.includes(s.category_id));
}

/** Lowest price among a page's services, for "from $X" labels. */
export function fromCents(catalog: Catalog | null, page: ServicePage): number | null {
  const prices = (catalog?.services ?? [])
    .filter((s) => s.price_cents !== null && page.priceMatch(s))
    .map((s) => s.price_cents as number);
  return prices.length ? Math.min(...prices) : null;
}
