// Shapes of the booking app's public API (Part B, /api/public/*, { v: 1, data }).
// Money is integer CAD cents. Nothing here is a business fact: it all arrives
// from the booking app at runtime.

export type PriceMode = "flat" | "per_hour" | "per_item" | "from";

export interface PublicSettings {
  business_name: string;
  owner_name: string;
  phone_e164: string | null;
  email: string | null;
  whatsapp_e164: string | null;
  messenger_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  address_line: string | null;
  city: string;
  province: string;
  postal_code: string | null;
  hours_text: string | null;
  timezone: string;
  currency: string;
  deposit_pct: number;
  hold_hours: number;
  balance_due_days_before_event: number;
  tax_enabled: boolean;
  tax_rate_bp: number;
  google_review_url: string | null;
  facebook_review_url: string | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  sort: number;
}

export interface Service {
  id: string;
  slug: string;
  name: string;
  category_id: string;
  category_slug: string;
  short_desc: string | null;
  long_desc_md: string | null;
  price_cents: number | null;
  price_mode: PriceMode;
  min_hours: number | null;
  included_hours: number | null;
  sort: number;
  cover_url: string | null;
}

export interface Package {
  id: string;
  slug: string;
  name: string;
  event_type: string;
  description_md: string | null;
  price_cents: number | null;
  sort: number;
  items: { service_id: string; qty: number }[];
  ala_carte_cents: number;
  ala_carte_is_from: boolean;
  cover_url: string | null;
}

export interface Addon {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  price_mode: PriceMode;
  applies_to_category_ids: string[];
}

export interface Zone {
  id: string;
  name: string;
  description: string | null;
  travel_fee_cents: number | null;
  sort: number;
}

export interface Catalog {
  categories: Category[];
  services: Service[];
  packages: Package[];
  addons: Addon[];
  zones: Zone[];
}

export interface MiniCampaign {
  id: string;
  slug: string;
  name: string;
  season: string | null;
  description_md: string | null;
  location_name: string | null;
  location_address: string | null;
  price_cents: number | null;
  duration_min: number;
  payment_mode: "deposit" | "full";
  cover_url: string | null;
  open_slots: number;
  next_slot_at: string | null;
  book_url: string;
}

export interface PortfolioItem {
  id: string;
  url: string | null;
  kind: "photo" | "video";
  alt_text: string;
  width: number | null;
  height: number | null;
  category: string | null;
  event_type: string | null;
  caption: string | null;
  taken_on: string | null;
  featured: boolean;
  before_after: { pair_id: string; role: "before" | "after" | null } | null;
}

export interface Testimonial {
  id: string;
  client_name: string;
  event_type: string | null;
  quote: string;
  rating: number | null;
  source: "site" | "facebook" | "google";
}

export interface Policy {
  key: string;
  title: string;
  body_md: string;
  version: number;
  sort: number;
  updated_at: string;
}

export interface SiteData {
  /** True when BOOKING_API_URL is set and the booking app answered (or prototype data is shown). */
  live: boolean;
  /** Prototype preview: sample data from FMV's flyers, local booking/inquiry forms that send nothing. */
  prototype: boolean;
  /** Booking app origin for CTAs, or null while booking isn't open yet. */
  bookingUrl: string | null;
  /** Booking API origin for the browser "check a date" widget, or null. */
  apiUrl: string | null;
  settings: PublicSettings | null;
  catalog: Catalog | null;
  minis: MiniCampaign[];
  portfolio: PortfolioItem[];
  testimonials: Testimonial[];
  policies: Policy[];
}
