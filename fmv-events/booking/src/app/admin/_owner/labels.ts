// Human labels for enum values used across the owner admin (client- and server-safe).
import { Constants } from '@/lib/database.types';

const E = Constants.public.Enums;

export const PRICE_MODES = E.price_mode;
export const CATALOG_STATUSES = E.catalog_status;
export const PACKAGE_STATUSES = E.package_status;
export const INVENTORY_KINDS = E.inventory_kind;
export const CAMPAIGN_STATUSES = E.campaign_status;
export const MINI_PAYMENT_MODES = E.mini_payment_mode;
export const TESTIMONIAL_SOURCES = E.testimonial_source;
export const MEDIA_KINDS = E.media_kind;
export const APP_ROLES = E.app_role;

export const priceModeLabels: Record<(typeof PRICE_MODES)[number], string> = {
  flat: 'Flat price',
  per_hour: 'Per hour',
  per_item: 'Per item',
  from: 'From (starting at)',
};

export const catalogStatusLabels: Record<(typeof CATALOG_STATUSES)[number], string> = {
  draft: 'Draft',
  needs_price: 'Needs price',
  active: 'Active',
  archived: 'Archived',
};

export const inventoryKindLabels: Record<(typeof INVENTORY_KINDS)[number], string> = {
  mirror_booth: 'Mirror booth',
  booth_360: '360 booth',
  video_guestbook: 'Video guestbook',
  arch: 'Arch',
  table_set: 'Table set',
  staff: 'Staff (person)',
  other: 'Other',
};

export const sourceLabels: Record<(typeof TESTIMONIAL_SOURCES)[number], string> = {
  site: 'Website',
  facebook: 'Facebook',
  google: 'Google',
};

/** Caption every AI concept board carries (spec §2, §6.3). */
export const AI_CAPTION = 'Concept inspiration, not a past FMV event';

export function priceSuffix(mode: string): string {
  return mode === 'per_hour' ? ' / hr' : mode === 'per_item' ? ' / item' : '';
}
