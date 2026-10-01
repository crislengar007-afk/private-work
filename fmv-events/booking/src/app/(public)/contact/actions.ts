'use server';
// General question form: Turnstile + rate limit → zod → store in `messages`
// (service role; anon has no insert policy) → alert the owner by email.

import { revalidatePath } from 'next/cache';
import { guardAnonymousWrite } from '@/lib/guard';
import { clientIp, appUrl } from '@/lib/request';
import { fieldErrors, messageSchema } from '@/lib/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerAlertEmail, sendTemplatedEmail } from '@/lib/email';
import { formatPhone } from '@/lib/phone';

export type MessageState =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      values?: { full_name: string; email: string; phone: string; body: string };
    }
  | null;

const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export async function sendMessageAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  const values = {
    full_name: text(formData.get('full_name')).slice(0, 200),
    email: text(formData.get('email')).slice(0, 200),
    phone: text(formData.get('phone')).slice(0, 40),
    body: text(formData.get('body')).slice(0, 4000),
  };
  const parsed = messageSchema.safeParse({
    ...values,
    phone: values.phone.trim() || undefined,
    turnstile_token: text(formData.get('cf-turnstile-response')) || null,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors: fieldErrors(parsed.error), values };
  }

  const ip = await clientIp();
  const guard = await guardAnonymousWrite({ action: 'message', ip, turnstileToken: parsed.data.turnstile_token });
  if (!guard.ok) return { ok: false, error: guard.error, values };

  const { full_name, email, phone, body } = parsed.data;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('messages')
      .insert({ full_name, email, phone_e164: phone, body })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'insert failed');

    const owner = await ownerAlertEmail();
    if (owner) {
      await sendTemplatedEmail({
        template: 'message_received_owner',
        to: owner,
        vars: {
          client_name: full_name,
          client_email: email,
          client_phone: phone ? formatPhone(phone) : 'no phone given',
          message: body,
          admin_url: appUrl('/admin/messages'),
        },
        entity: { type: 'message', id: data.id },
      });
    }
  } catch (e) {
    console.error('[contact] message failed', e);
    return { ok: false, error: 'We couldn’t send your question just now. Please try again in a moment.', values };
  }

  revalidatePath('/admin/messages');
  return { ok: true };
}
