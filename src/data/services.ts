/**
 * Services. The studio's published description names two areas of work,
 * events and personal celebrations, and describes a studio supplying fresh
 * blooms to residents and visitors. Those three are presented here.
 *
 * Descriptions restate the published positioning and do not add offerings,
 * prices or venues. Replace or extend them with the exact wording from the
 * live Services page once it can be copied (see README, "Content to verify").
 */

export interface Service {
  id: string;
  title: string;
  /** One line for index lists. */
  summary: string;
  /** Two or three sentences for the Services page. */
  description: string;
  /** Gallery collection that illustrates this service, if one exists. */
  collection?: string;
  /** Occasion value pre-selected in the enquiry form. */
  occasion: string;
}

export const services: Service[] = [
  {
    id: 'events',
    title: 'Events',
    summary: 'Floral design for gatherings, from intimate dinners to full celebrations.',
    description:
      'Floral design created for your event and tailored to its setting, scale and mood. The studio works to your brief so the flowers feel considered in every room they occupy.',
    collection: 'events',
    occasion: 'Event',
  },
  {
    id: 'celebrations',
    title: 'Personal celebrations',
    summary: 'Arrangements for the moments that matter to you and the people you love.',
    description:
      'For the personal moments worth marking. Each arrangement is composed for the person receiving it, with the same attention to detail the studio brings to its events.',
    collection: 'celebrations',
    occasion: 'Personal celebration',
  },
  {
    id: 'studio',
    title: 'The studio at Ports of Call',
    summary: 'Fresh, exquisite blooms for residents of the islands and visitors alike.',
    description:
      'The Flower Studio opened at Ports of Call in March 2023 to bring fresh, exquisite blooms to the community of the Turks and Caicos Islands and to the visitors it welcomes.',
    occasion: 'Flowers from the studio',
  },
];

export const occasions = [...services.map((s) => s.occasion), 'Something else'];
