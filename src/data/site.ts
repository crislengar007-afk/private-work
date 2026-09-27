/**
 * Business facts. Only verified information belongs here.
 *
 * Verified 2026-09-27 from the search-engine index of theflowerstudiotci.com
 * (the live site itself was unreachable from the build environment):
 *   - The Flower Studio at Ports of Call opened in March 2023.
 *   - Serves the Turks and Caicos Islands, residents and visitors.
 *   - Founded by a young entrepreneur with a background in luxury services.
 *   - Floral design for events and personal celebrations.
 *
 * Contact details are `null` until copied from the live Contact page. Every
 * component checks for null and omits the detail rather than guessing.
 */

export interface ContactDetails {
  email: string | null;
  phone: string | null;
  /** Digits only, international format, for wa.me links. */
  whatsapp: string | null;
  instagram: string | null;
  address: string | null;
  hours: string | null;
}

export const site = {
  name: 'The Flower Studio TCI',
  shortName: 'The Flower Studio',
  url: 'https://theflowerstudiotci.com',
  location: 'Ports of Call',
  region: 'Turks and Caicos Islands',
  opened: 'March 2023',
  contact: {
    email: null,
    phone: null,
    whatsapp: null,
    instagram: null,
    address: null,
    hours: null,
  } satisfies ContactDetails as ContactDetails,
};

export const nav = [
  { href: '/gallery/', label: 'Gallery' },
  { href: '/services/', label: 'Services' },
  { href: '/contact/', label: 'Contact' },
] as const;

export const hasDirectContact = Object.values(site.contact).some(Boolean);
