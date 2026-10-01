'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { EVENT_TYPES } from '@/lib/schemas';
import { checkbox, dbFail, formFields, intField, invalid, optText, optUuid, refresh, uuidField } from '@/app/admin/_owner/server';
import { AI_CAPTION, MEDIA_KINDS } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = '/admin/media';

// ------------------------------------------------------------------ upload (file goes browser -> Storage; this records it)
const uploadSchema = z.object({
  storage_path: z.string().regex(/^uploads\/[0-9a-f-]{36}-[a-z0-9._-]{1,100}$/, 'Invalid upload path'),
  kind: z.enum(MEDIA_KINDS),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  alt_text: z.string().trim().max(300).default(''),
  category_id: z.string().uuid().nullable().default(null),
});

export async function recordUpload(input: z.input<typeof uploadSchema>): Promise<ActionResult<{ id: string }>> {
  await assertOwner();
  const p = uploadSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { data, error } = await sb.from('media').insert(p.data).select('id').single();
  if (error || !data) {
    // Don't leave an orphaned file behind.
    await sb.storage.from('media').remove([p.data.storage_path]);
    return dbFail(error);
  }
  refresh(PATH);
  return ok({ id: data.id });
}

// ------------------------------------------------------------------ edit
const editSchema = z.object({
  alt_text: z.string().trim().max(300, 'Keep alt text under 300 characters').default(''),
  caption: optText(500),
  category_id: optUuid,
  event_type: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.enum(EVENT_TYPES).nullable()),
  taken_on: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date').nullable()),
  sort: intField('Sort', -100000, 100000),
  featured: checkbox,
  show_in_portfolio: checkbox,
  is_ai_generated: checkbox,
  mood_theme: optText(80),
});

export async function updateMedia(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown media item.');
  const p = editSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const sb = await createClient();

  if (v.is_ai_generated) {
    // Hard rule: AI media is atmosphere only. Never portfolio, never featured, always labelled.
    const { data: cur } = await sb.from('media').select('is_before_after_pair_id').eq('id', id).single();
    if (cur?.is_before_after_pair_id) {
      return fail('Unpair this item first: before/after pairs are real FMV work only.');
    }
    v.show_in_portfolio = false;
    v.featured = false;
    v.caption = AI_CAPTION;
  } else {
    v.mood_theme = null;
    if (v.caption === AI_CAPTION) v.caption = null;
  }
  if (v.show_in_portfolio && !v.alt_text) {
    return fail('Alt text is required for portfolio items.', { alt_text: ['Describe the photo for screen readers (required for the portfolio)'] });
  }

  const { error } = await sb.from('media').update(v).eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null);
}

// ------------------------------------------------------------------ before/after pairing
const pairSchema = z.object({
  before_id: uuidField,
  after_id: uuidField,
});

/** Links a "before" and an "after" item with a shared pair id. */
export async function pairMedia(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = pairSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const { before_id, after_id } = p.data;
  if (before_id === after_id) return fail('Pick two different items.', { after_id: ['Pick a different item'] });
  const sb = await createClient();
  const { data: rows, error: rErr } = await sb
    .from('media')
    .select('id, is_ai_generated, is_before_after_pair_id')
    .in('id', [before_id, after_id]);
  if (rErr) return dbFail(rErr);
  if ((rows ?? []).length !== 2) return fail('One of the items no longer exists.');
  if (rows!.some((r) => r.is_ai_generated)) return fail('AI-generated media can’t be part of a before/after pair (real work only).');

  // Break any existing pairs either item belongs to.
  const oldPairs = rows!.map((r) => r.is_before_after_pair_id).filter((x): x is string => Boolean(x));
  if (oldPairs.length) {
    const { error } = await sb.from('media').update({ is_before_after_pair_id: null, before_after_role: null }).in('is_before_after_pair_id', oldPairs);
    if (error) return dbFail(error);
  }
  const pairId = crypto.randomUUID();
  const a = await sb.from('media').update({ is_before_after_pair_id: pairId, before_after_role: 'before' }).eq('id', before_id);
  if (a.error) return dbFail(a.error);
  const b = await sb.from('media').update({ is_before_after_pair_id: pairId, before_after_role: 'after' }).eq('id', after_id);
  if (b.error) return dbFail(b.error);
  refresh(PATH, { public: true });
  return ok(null, 'Paired ✓');
}

export async function unpairMedia(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown media item.');
  const sb = await createClient();
  const { data: cur } = await sb.from('media').select('is_before_after_pair_id').eq('id', id).single();
  if (!cur?.is_before_after_pair_id) return ok(null, 'Not paired');
  const { error } = await sb
    .from('media')
    .update({ is_before_after_pair_id: null, before_after_role: null })
    .eq('is_before_after_pair_id', cur.is_before_after_pair_id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Unpaired');
}

// ------------------------------------------------------------------ delete
export async function deleteMedia(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown media item.');
  const sb = await createClient();
  const { data: row, error: gErr } = await sb.from('media').select('storage_path, is_before_after_pair_id').eq('id', id).single();
  if (gErr || !row) return dbFail(gErr);
  if (row.is_before_after_pair_id) {
    await sb.from('media').update({ is_before_after_pair_id: null, before_after_role: null }).eq('is_before_after_pair_id', row.is_before_after_pair_id);
  }
  const { error } = await sb.from('media').delete().eq('id', id);
  if (error) return dbFail(error);
  if (!/^https?:\/\//.test(row.storage_path)) {
    const { error: sErr } = await sb.storage.from('media').remove([row.storage_path]);
    if (sErr) console.error('[admin] media file not removed', row.storage_path, sErr.message);
  }
  refresh(PATH, { public: true });
  return ok(null, 'Deleted');
}
