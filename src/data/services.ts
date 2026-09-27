/**
 * The five service groups published on theflowerstudiotci.com/our-services/
 * (read 2026-09-27; full text in reference/our-services.txt). Copy is
 * condensed from the studio's own wording; no packages, prices, delivery
 * zones or turnaround times are added.
 */

export interface Service {
  id: string;
  title: string;
  /** The studio's own tagline, where the live page has one. */
  tagline?: string;
  /** One line for index lists. */
  summary: string;
  /** Short paragraph for the Services page. */
  description: string;
  /** Who it is for, stated plainly. */
  audience: string;
  /** Occasion value pre-selected in the enquiry form. */
  occasion: string;
  /** Event-type enquiries may show optional venue and guest fields. */
  isEvent: boolean;
  /** Optional follow-up questions shown in the enquiry form (SPEC §5). */
  questions?: 'wedding' | 'hospitality';
  /** Key into the campaign imagery (generated concepts, not portfolio). */
  campaign?: string;
  /** Where the arrangement sits in the wide film, for the crop on portrait screens. */
  focus: string;
}

export const services: Service[] = [
  {
    id: 'arrangements',
    title: 'Arrangements',
    tagline: 'Celebrate every moment.',
    summary: 'Crafted arrangements for ordinary days and grand celebrations alike.',
    description:
      'Every occasion, big or small, deserves a bloom. The studio composes arrangements that bring beauty and elegance to your moments, from a simple gesture to a milestone celebration.',
    audience: 'For residents and visitors marking a moment, or simply brightening a day.',
    occasion: 'Arrangement',
    isEvent: false,
    campaign: 'arrangements',
    focus: '26% 50%',
  },
  {
    id: 'weddings',
    title: 'Wedding decoration',
    tagline: 'Forever blooms for your special day.',
    summary: 'Floral decor that tells your love story on the day itself.',
    description:
      'Flowers that bear witness to your wedding day. The studio designs floral decor around your story, so the celebration feels unmistakably yours and is remembered long after.',
    audience: 'For couples and wedding planners celebrating in the Turks and Caicos Islands.',
    occasion: 'Wedding',
    isEvent: true,
    questions: 'wedding',
    campaign: 'weddings',
    focus: '50% 50%',
  },
  {
    id: 'corporate',
    title: 'Corporate flowers',
    summary: 'Arrangements that give meetings and workplaces a considered presence.',
    description:
      'Thoughtfully crafted arrangements for corporate meetings and environments. The designs are a quiet statement of professionalism and elegance, made to reflect the character of your business.',
    audience: 'For offices, meetings and corporate events.',
    occasion: 'Corporate',
    isEvent: true,
    questions: 'hospitality',
    campaign: 'corporate',
    focus: '74% 50%',
  },
  {
    id: 'house-guests',
    title: 'House guest flowers',
    summary: 'A warm, blossoming welcome waiting for your guests.',
    description:
      'Flowers that set the tone for a stay. The studio prepares welcoming arrangements for your home, so visitors arrive to beauty and a sense of hospitality.',
    audience: 'For homeowners and villa hosts preparing for guests.',
    occasion: 'House guests',
    isEvent: false,
    campaign: 'house-guests',
    focus: '74% 50%',
  },
  {
    id: 'hotels',
    title: 'Luxury hotel flowers',
    tagline: 'Tailored elegance for every corner.',
    summary: 'Island-inspired arrangements from grand lobbies to intimate suites.',
    description:
      'Floral designs curated for every corner of a hotel, from the lobby to the suites, creating a warm island welcome and elevating each guest’s stay.',
    audience: 'For hotels, resorts and hospitality teams.',
    occasion: 'Hotel or resort',
    isEvent: true,
    questions: 'hospitality',
    campaign: 'hotels',
    focus: '27% 50%',
  },
];

export const occasions = [...services.map((s) => s.occasion), 'Something else'];

/** The studio's own mission statement (site footer). */
export const mission =
  'We believe in the power of personalization, where every bloom and every interaction is carefully tailored to reflect your individual style, emotions and occasions.';
