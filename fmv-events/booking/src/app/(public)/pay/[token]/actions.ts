'use server';
// "I've sent it": gated by the unguessable invoice token, so rate limit only (no
// Turnstile). Marks the invoice `reported` and alerts the owner. It does NOT
// confirm the booking; only the owner recording the payment does.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isPlausibleToken } from '@/lib/tokens';
import { clientIp } from '@/lib/request';
import { reportPayment } from '@/lib/workflows';
import { rateLimitOnly } from '@/components/booking/rate-limit';

export type ReportState = { ok: true } | { ok: false; error: string } | null;

const reportSchema = z.object({ token: z.string().min(20).max(100) });

export async function reportPaymentAction(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const parsed = reportSchema.safeParse({ token: formData.get('token') });
  if (!parsed.success || !isPlausibleToken(parsed.data.token)) return { ok: false, error: 'This payment link is not valid.' };
  const { token } = parsed.data;

  const ip = await clientIp();
  const limit = await rateLimitOnly({ action: 'report', ip, max: 10 });
  if (!limit.ok) return { ok: false, error: limit.error };

  try {
    const res = await reportPayment(token);
    if (!res.ok) return { ok: false, error: res.error ?? 'We couldn’t record that. Please try again.' };
  } catch (e) {
    console.error('[pay] report failed', e);
    return { ok: false, error: 'We couldn’t record that just now. Please try again in a moment.' };
  }
  revalidatePath(`/pay/${token}`);
  revalidatePath('/admin', 'layout');
  return { ok: true };
}
