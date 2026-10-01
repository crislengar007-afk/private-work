// Admin navigation. Staff see only the items marked `staff`; the owner sees everything.
export interface NavItem {
  href: string;
  label: string;
  staff?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', staff: true },
  { href: '/admin/inquiries', label: 'Inquiries' },
  { href: '/admin/quotes', label: 'Quotes' },
  { href: '/admin/invoices', label: 'Invoices' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/bookings', label: 'Bookings', staff: true },
  { href: '/admin/calendar', label: 'Calendar', staff: true },
  { href: '/admin/minis', label: 'Mini sessions' },
  { href: '/admin/catalog', label: 'Catalog' },
  { href: '/admin/media', label: 'Media' },
  { href: '/admin/testimonials', label: 'Testimonials' },
  { href: '/admin/policies', label: 'Policies' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/emails', label: 'Emails' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/audit', label: 'Audit log' },
];

export function navFor(role: 'owner' | 'staff'): NavItem[] {
  return role === 'owner' ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.staff);
}
