'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, friendlyDbError, ok } from '@/lib/errors';
import type { FormState } from './form-state';
import { formFields } from './form-state';
import { NOT_OWNER, invalid, ownerSession, revalidate } from './server';

export async function setMessageHandled(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await ownerSession())) return fail(NOT_OWNER);
  const parsed = z.object({ message_id: z.string().uuid(), handled: z.enum(['true', 'false']) }).safeParse(formFields(fd));
  if (!parsed.success) return invalid(parsed.error);
  const sb = await createClient();
  const { data, error } = await sb
    .from('messages')
    .update({ handled: parsed.data.handled === 'true' })
    .eq('id', parsed.data.message_id)
    .select('id');
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail('Message not found.');
  revalidate('/admin/messages', '/admin');
  return ok(undefined, parsed.data.handled === 'true' ? 'Marked as handled.' : 'Moved back to the inbox.');
}
