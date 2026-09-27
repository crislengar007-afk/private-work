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
 * Contact details below were read on 2026-09-27 from the search-engine index
 * of theflowerstudiotci.com (consistent across several queries) and the
 * studio's Facebook page title. Confirm them against the live Contact page
 * with `npm run import:gallery`, which saves reference/contact.txt.
 * Any value that is `null` is omitted by every component rather than guessed.
 */

export interface ContactDetails {
  email: string | null;
  phone: string | null;
  landline: string | null;
  /** Digits only, international format, for wa.me links. */
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  address: string | null;
  hours: string | null;
}

export const site = {
  name: 'The Flower Studio TCI',
  shortName: 'The Flower Studio',
  url: 'https://theflowerstudiotci.com',
  location: 'Ports of Call',
  area: 'Grace Bay, Providenciales',
  region: 'Turks and Caicos Islands',
  opened: 'March 2023',
  contact: {
    email: 'orders@theflowerstudiotci.com',
    phone: '+1 649 241 4343',
    landline: '+1 649 946 4043',
    whatsapp: null,
    instagram: null,
    facebook: 'https://www.facebook.com/theflowerstudiotci/',
    address: 'Ports of Call, Grace Bay, Providenciales, Turks and Caicos Islands',
    hours: 'Monday to Saturday, 7am to 7pm. Sunday, 8am to 3pm.',
  } satisfies ContactDetails as ContactDetails,
};

export const nav = [
  { href: '/gallery/', label: 'Gallery' },
  { href: '/services/', label: 'Services' },
  { href: '/contact/', label: 'Contact' },
] as const;

