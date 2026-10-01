import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Normalizes Canadian/NANP input ("506 471 4367", "(506) 471-4367", "+15064714367") to E.164. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input.trim(), 'CA');
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // +15064714367
}

/** "+15064714367" -> "506-471-4367" for display. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const parsed = parsePhoneNumberFromString(e164, 'CA');
  if (!parsed) return e164;
  if (parsed.countryCallingCode === '1') {
    const n = parsed.nationalNumber;
    return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  }
  return parsed.formatInternational();
}

export function telHref(e164: string): string {
  return `tel:${e164}`;
}

export function whatsappHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}`;
}
