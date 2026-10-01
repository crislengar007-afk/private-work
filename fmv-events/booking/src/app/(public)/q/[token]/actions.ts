'use server';
// Accepting a quote is gated by the unguessable quote token, so there is no
// Turnstile here: only the per-IP rate limit, then the accept_quote transaction.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { acceptQuoteSchema, fieldErrors } from '@/lib/schemas';
import { isPlausibleToken } from '@/lib/tokens';
import { clientIp } from '@/lib/request';
import { acceptQuote } from '@/lib/workflows';
import { rateLimitOnly } from '@/components/booking/rate-limit';

export type AcceptState = {
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  /** echoed back so the typed name survives React's form reset */
  name?: string;
} | null;

export async function acceptQuoteAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const rawName = typeof formData.get('accepted_name') === 'string' ? String(formData.get('accepted_name')).slice(0, 120) : '';
  const parsed = acceptQuoteSchema.safeParse({
    token: formData.get('token'),
    accepted_name: rawName,
    agree: formData.get('agree') === 'on',
  });
  if (!parsed.success) return { error: 'Please check the highlighted fields.', fieldErrors: fieldErrors(parsed.error), name: rawName };
  const { token, accepted_name } = parsed.data;
  if (!isPlausibleToken(token)) return { error: 'This quote link is not valid.', name: rawName };

  const ip = await clientIp();
  const limit = await rateLimitOnly({ action: 'accept', ip, max: 10 });
  if (!limit.ok) return { error: limit.error, name: rawName };

  let invoiceToken: string | null = null;
  try {
    const res = await acceptQuote(token, accepted_name, ip);
    if (!res.ok) return { error: res.error, code: res.code, name: rawName };
    invoiceToken = res.invoiceToken;
  } catch (e) {
    console.error('[quote] accept failed', e);
    return { error: 'We couldn’t accept the quote just now. Please try again in a moment.', name: rawName };
  }

  revalidatePath(`/q/${token}`);
  revalidatePath('/admin', 'layout');
  if (invoiceToken) redirect(`/pay/${invoiceToken}`);
  return null;
}
