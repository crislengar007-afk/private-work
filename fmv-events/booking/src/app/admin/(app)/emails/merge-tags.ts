// Merge tags each email template receives, derived from the seeded templates
// (supabase/migrations/20261001001000_seed_email_templates.sql) and the vars
// passed by src/lib/workflows.ts / the contact form. business_name and
// owner_name are added to every email by sendTemplatedEmail.

export interface MergeTag {
  tag: string;
  description: string;
  sample: string;
}

const T = {
  business_name: { description: 'Business name (from Settings)', sample: '' },
  owner_name: { description: 'Owner name (from Settings)', sample: '' },
  client_name: { description: 'Client’s full name', sample: 'Jordan Sample' },
  client_email: { description: 'Client’s email', sample: 'jordan@example.com' },
  client_phone: { description: 'Client’s phone', sample: '506-555-0123' },
  event_type: { description: 'Event type', sample: 'Wedding' },
  event_date: { description: 'Event date', sample: 'Saturday, June 12, 2027' },
  event_time: { description: 'Event start – end time', sample: '2:00 PM – 6:00 PM' },
  venue: { description: 'Venue name and address', sample: 'Sample Hall, 123 Example St' },
  estimate: { description: 'Builder estimate', sample: '$1,200.00' },
  admin_url: { description: 'Link into the admin (owner emails only)', sample: '/admin' },
  quote_number: { description: 'Quote number', sample: 'FMV-Q-2027-0001' },
  total: { description: 'Quote total', sample: '$1,200.00' },
  deposit: { description: 'Deposit amount', sample: '$600.00' },
  quote_url: { description: 'Link to view/accept the quote', sample: '/q/sample-token' },
  valid_until: { description: 'Quote valid until', sample: 'Friday, May 14, 2027' },
  invoice_number: { description: 'Invoice number', sample: 'FMV-2027-0001' },
  amount: { description: 'Amount due / received', sample: '$600.00' },
  reference: { description: 'e-Transfer reference code', sample: 'FMV0042' },
  due: { description: 'Due date / hold deadline', sample: 'Monday, May 3, 2027 at 5:00 PM' },
  pay_url: { description: 'Link to the private pay page', sample: '/pay/sample-token' },
  balance_line: { description: 'Sentence about the remaining balance (or “paid in full”)', sample: 'The balance of **$600.00** is due **May 29, 2027**.' },
  portal_url: { description: 'Client portal link', sample: '/portal' },
  rebook_url: { description: 'Link to book again', sample: '/build' },
  campaign_name: { description: 'Mini-session campaign name', sample: 'Christmas Mini Sessions' },
  slot_time: { description: 'Mini-session date and time', sample: 'Sat, Dec 5, 2026 at 10:00 AM' },
  location: { description: 'Mini-session location', sample: 'Sample Park, Fredericton' },
  gallery_line: { description: 'Gallery sentence with link (or “coming soon”)', sample: 'Your gallery is ready: [view your photos](https://example.com/gallery)' },
  review_links: { description: 'Google/Facebook review links (from Settings)', sample: '- [Review us on Google](https://example.com)\n- [Review us on Facebook](https://example.com)' },
  message: { description: 'The visitor’s question', sample: 'Hi! Do you travel to Saint John?' },
} as const;

type TagName = keyof typeof T;

const BY_TEMPLATE: Record<string, TagName[]> = {
  inquiry_received_client: ['client_name', 'client_email', 'client_phone', 'event_type', 'event_date', 'event_time', 'venue', 'estimate'],
  inquiry_received_owner: ['client_name', 'client_email', 'client_phone', 'event_type', 'event_date', 'event_time', 'venue', 'estimate', 'admin_url'],
  quote_sent: ['client_name', 'quote_number', 'event_date', 'total', 'deposit', 'quote_url', 'valid_until'],
  quote_accepted: ['client_name', 'invoice_number', 'event_date', 'amount', 'reference', 'due', 'pay_url'],
  payment_reported_owner: ['client_name', 'amount', 'invoice_number', 'reference', 'admin_url'],
  booking_confirmed: ['client_name', 'amount', 'event_date', 'balance_line', 'portal_url'],
  hold_expired: ['client_name', 'event_date', 'rebook_url'],
  balance_reminder: ['client_name', 'amount', 'due', 'event_date', 'reference', 'pay_url'],
  mini_held: ['client_name', 'campaign_name', 'slot_time', 'location', 'amount', 'reference', 'due', 'pay_url'],
  mini_confirmed: ['client_name', 'campaign_name', 'slot_time', 'location'],
  mini_reminder: ['client_name', 'campaign_name', 'slot_time', 'location'],
  mini_hold_expired: ['client_name', 'slot_time', 'rebook_url'],
  thank_you: ['client_name', 'gallery_line', 'review_links'],
  message_received_owner: ['client_name', 'client_email', 'client_phone', 'message', 'admin_url'],
};

/** Tags available in a template (always includes business_name and owner_name). */
export function tagsFor(key: string): MergeTag[] {
  const names: TagName[] = ['business_name', 'owner_name', ...(BY_TEMPLATE[key] ?? [])];
  return names.map((n) => ({ tag: n, description: T[n].description, sample: T[n].sample }));
}

/** Tags used in a text, e.g. ["client_name", "amount"]. */
export function tagsUsed(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1]))];
}
