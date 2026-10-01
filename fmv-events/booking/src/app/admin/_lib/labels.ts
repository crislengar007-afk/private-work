// Display labels shared by the admin pages (safe for client and server).
import { eventTypeLabels } from '@/lib/schemas';

export const eventLabel = (t: string | null | undefined): string =>
  t ? (eventTypeLabels[t as keyof typeof eventTypeLabels] ?? t.replace(/_/g, ' ')) : '';

export const invoiceKindLabels: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  full: 'Full payment',
  mini: 'Mini session',
};

export const paymentMethodLabels: Record<string, string> = {
  etransfer: 'Interac e-Transfer',
  cash: 'Cash',
  other: 'Other',
};

export const lineKindLabels: Record<string, string> = {
  package: 'Package',
  service: 'Service',
  addon: 'Add-on',
  travel: 'Travel',
  custom: 'Custom',
};

export const priceModeLabels: Record<string, string> = {
  flat: 'flat',
  per_hour: 'per hour',
  per_item: 'per item',
  from: 'from',
};

export const INQUIRY_COLUMNS = ['new', 'quoted', 'won', 'lost'] as const;
export const INQUIRY_STATUSES = ['new', 'quoted', 'won', 'lost', 'spam'] as const;
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired', 'superseded'] as const;
export const INVOICE_STATUSES = ['unpaid', 'reported', 'paid', 'void'] as const;
export const INVOICE_KINDS = ['deposit', 'balance', 'full', 'mini'] as const;
export const BOOKING_STATUSES = ['held', 'confirmed', 'completed', 'cancelled'] as const;

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
