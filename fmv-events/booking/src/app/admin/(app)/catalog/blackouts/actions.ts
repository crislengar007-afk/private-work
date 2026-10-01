'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { dbFail, formFields, invalid, isoDate, optText, refresh, uuidField } from '@/app/admin/_owner/server';

type R = ActionResult<unknown>;
const PATH = '/admin/catalog/blackouts';

const schema = z.object({ date: isoDate, reason: optText(300) });

export async function addBlackout(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = schema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb.from('blackout_dates').insert(p.data);
  if (error) return dbFail(error, { duplicate: 'That date is already blocked.' });
  refresh(PATH, { public: true });
  return ok(null, 'Date blocked ✓');
}

export async function removeBlackout(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown date.');
  const sb = await createClient();
  const { error } = await sb.from('blackout_dates').delete().eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Removed');
}
