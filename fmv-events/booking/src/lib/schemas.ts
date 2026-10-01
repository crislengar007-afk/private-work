// Zod schemas shared by client forms (UX) and server actions (enforcement).
import { z } from 'zod';
import { normalizePhone } from './phone';

export const EVENT_TYPES = ['wedding', 'birthday', 'baby_shower', 'corporate', 'graduation', 'other'] as const;
export const eventTypeLabels: Record<(typeof EVENT_TYPES)[number], string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  baby_shower: 'Baby shower',
  corporate: 'Corporate',
  graduation: 'Graduation',
  other: 'Other celebration',
};

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time');

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone is required')
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 506-555-0123' });
      return z.NEVER;
    }
    return n;
  });

export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 506-555-0123' });
      return z.NEVER;
    }
    return n;
  });

export const contactSchema = z.object({
  full_name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: phoneSchema,
});

export const selectionSchema = z.object({
  package_id: uuid.nullable().optional(),
  service_ids: z.array(uuid).max(30).default([]),
  addon_ids: z.array(uuid).max(30).default([]),
  hours: z.record(z.string(), z.number().min(0).max(24)).default({}),
  qty: z.record(z.string(), z.number().int().min(0).max(500)).default({}),
});

export const inquirySchema = z
  .object({
    event_type: z.enum(EVENT_TYPES),
    event_date: isoDate,
    start_time: wallTime,
    end_time: wallTime,
    venue_name: z.string().trim().max(200).optional().default(''),
    venue_address: z.string().trim().max(300).optional().default(''),
    zone_id: uuid.nullable().optional(),
    guest_count: z.number().int().min(0).max(5000).nullable().optional(),
    theme: z.string().trim().max(200).optional().default(''),
    notes: z.string().trim().max(3000).optional().default(''),
    selection: selectionSchema,
    contact: contactSchema,
    reference_paths: z.array(z.string().max(300)).max(5).default([]),
    turnstile_token: z.string().optional().nullable(),
    source: z.string().max(100).optional().nullable(),
  })
  .refine((v) => v.selection.package_id || v.selection.service_ids.length > 0, {
    message: 'Choose a package or at least one service',
    path: ['selection'],
  });
export type InquiryInput = z.input<typeof inquirySchema>;

export const acceptQuoteSchema = z.object({
  token: z.string().min(20).max(100),
  accepted_name: z.string().trim().min(2, 'Type your full name to sign').max(120),
  agree: z.literal(true, { message: 'Please agree to the policies' }),
});

export const miniHoldSchema = z.object({
  slot_id: uuid,
  contact: contactSchema,
  notes: z.string().trim().max(1000).optional().default(''),
  turnstile_token: z.string().optional().nullable(),
});

export const messageSchema = z.object({
  full_name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: optionalPhoneSchema,
  body: z.string().trim().min(5, 'Please write your question').max(3000),
  turnstile_token: z.string().optional().nullable(),
});

export const recordPaymentSchema = z.object({
  invoice_id: uuid,
  method: z.enum(['etransfer', 'cash', 'other']),
  amount: z.string().min(1, 'Enter the amount'),
  received_on: isoDate,
  note: z.string().trim().max(500).optional().default(''),
});

export const quoteLineSchema = z.object({
  kind: z.enum(['package', 'service', 'addon', 'travel', 'custom']),
  ref_id: uuid.nullable().optional(),
  description: z.string().trim().min(1, 'Description required').max(300),
  qty: z.number().positive().max(10000),
  unit_price_cents: z.number().int().min(0).max(100_000_000),
});

export const quoteDraftSchema = z.object({
  quote_id: uuid,
  lines: z.array(quoteLineSchema).min(1, 'Add at least one line').max(60),
  discount_cents: z.number().int().min(0).default(0),
  valid_until: isoDate,
  deposit_pct: z.number().int().min(0).max(100),
  notes_md: z.string().max(5000).optional().default(''),
});

export function fieldErrors(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
