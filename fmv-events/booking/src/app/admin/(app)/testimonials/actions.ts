'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { EVENT_TYPES } from '@/lib/schemas';
import { checkbox, dbFail, formFields, invalid, refresh, reqText, uuidField } from '@/app/admin/_owner/server';
import { TESTIMONIAL_SOURCES } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = '/admin/testimonials';

const createSchema = z.object({
  client_name: reqText('Client name', 120),
  event_type: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.enum(EVENT_TYPES).nullable()),
  quote: reqText('Quote', 2000),
  rating: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1, 'Rating is 1 to 5').max(5, 'Rating is 1 to 5').nullable()),
  source: z.enum(TESTIMONIAL_SOURCES),
  consent_to_publish: checkbox,
});

export async function createTestimonial(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = createSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb.from('testimonials').insert({ ...p.data, approved: false });
  if (error) return dbFail(error);
  refresh(PATH);
  return ok(null, 'Added ✓ Approve it to publish.');
}

const flagSchema = z.enum(['approve', 'unapprove', 'consent', 'revoke']);

/** Approve/unapprove, or record/revoke consent. Revoking consent also unpublishes. */
export async function setTestimonialFlag(id: string, flag: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  const f = flagSchema.safeParse(flag);
  if (!uuidField.safeParse(id).success || !f.success) return fail('Unknown testimonial.');
  const sb = await createClient();
  if (f.data === 'approve') {
    const { data: t } = await sb.from('testimonials').select('consent_to_publish').eq('id', id).single();
    if (!t?.consent_to_publish) return fail('A testimonial needs the client’s consent before it can be published.');
  }
  const patch =
    f.data === 'approve'
      ? { approved: true }
      : f.data === 'unapprove'
        ? { approved: false }
        : f.data === 'consent'
          ? { consent_to_publish: true }
          : { consent_to_publish: false, approved: false };
  const { error } = await sb.from('testimonials').update(patch).eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null);
}

export async function deleteTestimonial(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown testimonial.');
  const sb = await createClient();
  const { error } = await sb.from('testimonials').delete().eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Deleted');
}
