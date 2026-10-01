'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { dbFail, formFields, invalid, refresh, reqText } from '@/app/admin/_owner/server';
import { POLICY_KEYS } from './keys';

type R = ActionResult<unknown>;
const PATH = '/admin/policies';

const schema = z.object({
  title: reqText('Title', 120),
  body_md: reqText('Policy text', 20000),
});

/** Saves a policy. The database bumps its version when the title or text changes. */
export async function savePolicy(key: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const k = z.enum(POLICY_KEYS).safeParse(key);
  if (!k.success) return fail('Unknown policy.');
  const p = schema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { data: existing } = await sb.from('policies').select('id').eq('key', k.data).maybeSingle();
  if (existing) {
    const { data, error } = await sb.from('policies').update(p.data).eq('key', k.data).select('version').single();
    if (error) return dbFail(error);
    refresh(PATH, { public: true });
    return ok(null, `Saved ✓ Now version ${data.version}.`);
  }
  const { data: last } = await sb.from('policies').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const { error } = await sb.from('policies').insert({ key: k.data, ...p.data, sort: (last?.sort ?? 0) + 1 });
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Policy added ✓');
}
