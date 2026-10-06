import crypto from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32, no I/L/O/U

export function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export const entryRef = () => `TD-${randomCode(4)}-${randomCode(4)}`;
export const demoPaymentRef = () => `DEMO${randomCode(10)}`;
export const refundRef = () => `RFNDDEMO${randomCode(8)}`;
export const payoutRef = () => `PAYOUTDEMO${randomCode(8)}`;
export const receiptLedgerRef = () => `RCPTDEMO${randomCode(8)}`;
