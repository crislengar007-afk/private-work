// Shared types for the /build wizard (server page → client wizard). No runtime
// imports from server-only modules: `import type` is erased at compile time.
import type { PublicCatalog } from '@/lib/catalog';
import type { Selection } from '@/lib/estimate';
import type { EVENT_TYPES } from '@/lib/schemas';

export type EventType = (typeof EVENT_TYPES)[number];

export interface WizardSettings {
  business_name: string;
  owner_name: string;
  deposit_pct: number;
  hold_hours: number;
  tax_enabled: boolean;
  tax_rate_bp: number;
  phone_e164: string | null;
  email: string | null;
}

export interface ConceptBoard {
  id: string;
  url: string;
  alt: string;
  theme: string;
  caption: string | null;
}

export interface PolicyHighlight {
  key: string;
  title: string;
  version: number;
  /** pre-rendered (escaped) markdown */
  html: string;
}

export interface WizardPrefill {
  /** stable key of the prefill query; a new key starts a fresh wizard */
  key: string;
  event_type: EventType | '';
  event_date: string;
  package_id: string | null;
  service_ids: string[];
}

export interface WizardProps {
  catalog: PublicCatalog;
  settings: WizardSettings;
  conceptBoards: ConceptBoard[];
  policies: PolicyHighlight[];
  prefill: WizardPrefill;
  /** package id → pre-rendered (escaped) description markdown */
  packageDescriptions: Record<string, string>;
  /** today in America/Moncton (YYYY-MM-DD), computed on the server */
  today: string;
}

export type AvailabilityStatus = 'available' | 'limited' | 'unavailable';

export interface ServiceAvailability {
  service_id: string;
  slug: string;
  status: AvailabilityStatus;
  reason: string | null;
}

export interface UploadedReference {
  path: string;
  name: string;
}

export interface WizardState {
  v: 1;
  prefillKey: string;
  step: number;
  /** furthest step reached (for the clickable progress list) */
  maxStep: number;
  event_type: EventType | '';
  event_date: string;
  start_time: string;
  end_time: string;
  venue_name: string;
  venue_address: string;
  /** '' = not chosen, 'unsure' = "not sure yet" */
  zone_id: string;
  selection: Selection;
  guest_count: string;
  theme: string;
  notes: string;
  references: UploadedReference[];
  contact: { full_name: string; email: string; phone: string };
}

export type Errors = Record<string, string>;
