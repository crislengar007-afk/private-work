'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { guardAnonymousWrite } from '@/lib/guard';
import { clientIp } from '@/lib/request';
import { fieldErrors, miniHoldSchema } from '@/lib/schemas';
import { holdMiniSlot } from '@/lib/workflows';

export type MiniHoldState = {
  ok: false;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

/**
 * Anonymous mini-session hold. Reachable by direct POST, so it validates
 * everything itself: zod, then Turnstile + per-IP rate limit, then the DB
 * function (which enforces one active booking per slot).
 */
export async function holdMiniAction(slug: string, _prev: MiniHoldState, formData: FormData): Promise<MiniHoldState> {
  const parsed = miniHoldSchema.safeParse({
    slot_id: str(formData, 'slot_id'),
    contact: {
      full_name: str(formData, 'full_name'),
      email: str(formData, 'email'),
      phone: str(formData, 'phone'),
    },
    notes: str(formData, 'notes'),
    turnstile_token: str(formData, 'cf-turnstile-response') || null,
  });
  if (!parsed.success) {
    const errs = fieldErrors(parsed.error);
    const msg = errs.slot_id ? 'Please pick an open time.' : 'Please check the highlighted fields.';
    return { ok: false, error: msg, fieldErrors: errs };
  }

  const guard = await guardAnonymousWrite({
    action: 'mini',
    ip: await clientIp(),
    turnstileToken: parsed.data.turnstile_token,
  });
  if (!guard.ok) return { ok: false, error: guard.error, code: 'guard' };

  let invoiceToken: string;
  try {
    const result = await holdMiniSlot({
      slotId: parsed.data.slot_id,
      contact: parsed.data.contact,
      notes: parsed.data.notes,
    });
    if (!result.ok) {
      const error = result.code === 'slot_taken' ? 'Sorry, someone just booked that time. Please pick another one.' : result.error;
      return { ok: false, error, code: result.code };
    }
    invoiceToken = result.invoiceToken;
  } catch (e) {
    console.error('[minis] hold failed', e instanceof Error ? e.message : e);
    return { ok: false, error: 'Something went wrong while holding your spot. Please try again.' };
  }

  if (/^[a-z0-9][a-z0-9-]{0,79}$/i.test(slug)) revalidatePath(`/minis/${slug}`);
  revalidatePath('/minis');
  redirect(`/pay/${invoiceToken}`);
}
