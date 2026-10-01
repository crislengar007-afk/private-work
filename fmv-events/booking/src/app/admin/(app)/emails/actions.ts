'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { mergeTags } from '@/lib/email';
import { renderMarkdown } from '@/lib/markdown';
import { appUrl } from '@/lib/request';
import { dbFail, formFields, invalid, refresh, reqText } from '@/app/admin/_owner/server';
import { tagsFor } from './merge-tags';

type R = ActionResult<unknown>;
const keySchema = z.string().regex(/^[a-z0-9_]{1,64}$/);

const templateSchema = z.object({
  subject: reqText('Subject', 200),
  body_md: reqText('Body', 20000),
});

export async function saveTemplate(key: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!keySchema.safeParse(key).success) return fail('Unknown template.');
  const p = templateSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { data, error } = await sb.from('email_templates').update(p.data).eq('key', key).select('key');
  if (error) return dbFail(error);
  if (!data?.length) return fail('Unknown template.');
  refresh(['/admin/emails', '/admin/emails/[key]']);
  return ok(null, 'Template saved ✓ New emails use it right away.');
}

/** Renders a subject/body with sample values, exactly as sendTemplatedEmail merges them. */
export async function previewTemplate(input: { key: string; subject: string; body_md: string }): Promise<
  ActionResult<{ subject: string; html: string }>
> {
  await assertOwner();
  const p = z
    .object({ key: keySchema, subject: z.string().max(200), body_md: z.string().max(20000) })
    .safeParse(input);
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { data: s } = await sb.from('settings').select('business_name, owner_name').eq('id', 1).single();
  const vars: Record<string, string> = {};
  for (const t of tagsFor(p.data.key)) vars[t.tag] = t.sample.startsWith('/') ? appUrl(t.sample) : t.sample;
  vars.business_name = s?.business_name ?? '';
  vars.owner_name = s?.owner_name ?? '';
  return ok({
    subject: mergeTags(p.data.subject, vars),
    html: renderMarkdown(mergeTags(p.data.body_md, vars, true)),
  });
}
