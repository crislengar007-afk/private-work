/**
 * Business facts, as displayed on theflowerstudiotci.com (read 2026-09-27;
 * see CONTENT_MAP.md and reference/*.txt). Confirm with the owner before
 * publication. Any value that is `null` is omitted rather than guessed.
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
  mapUrl: string | null;
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
    instagram: 'theflowerstudiotci',
    facebook: 'https://www.facebook.com/theflowerstudiotci',
    address: 'Ports of Call, Leeward through Grace Bay, Turks and Caicos Islands, TKCA 1ZZ',
    mapUrl: 'https://goo.gl/maps/64xcxPowM6JqJkMa7',
    hours: 'Monday to Saturday, 7am to 7pm. Sunday, 8am to 3pm.',
  } satisfies ContactDetails as ContactDetails,
};

export const hours = [
  { days: 'Monday to Saturday', time: '7:00 AM to 7:00 PM' },
  { days: 'Sunday', time: '8:00 AM to 3:00 PM' },
];

export const tagline = 'Bringing flower elegance to your island experience';

export const nav = [
  { href: '/our-services/', label: 'Services' },
  { href: '/gallery/', label: 'Gallery' },
  { href: '/contact/', label: 'Contact' },
] as const;

