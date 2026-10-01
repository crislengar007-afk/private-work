import 'server-only';
import { randomBytes } from 'node:crypto';

/** 32 random bytes, base64url: used for quote and pay links. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are long base64url strings; reject anything else before touching the DB. */
export function isPlausibleToken(t: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(t);
}
