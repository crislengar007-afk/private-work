'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { dbFail, dollars, formFields, intField, invalid, optText, refresh, reqText, slugField, slugify, uuidField } from '@/app/admin/_owner/server';
import { CATALOG_STATUSES, PRICE_MODES } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = '/admin/catalog/addons';

const addonSchema = z
  .object({
    name: reqText('Name'),
    description: optText(1000),
    price: dollars,
    price_mode: z.enum(PRICE_MODES),
    status: z.enum(CATALOG_STATUSES),
    sort: intField('Sort', -1000, 100000),
    categories: z.array(z.string().uuid()).max(50),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'active' && v.price === null) ctx.addIssue({ code: 'custom', path: ['price'], message: 'Set a price before making this public.' });
  });

function parse(fd: FormData) {
  return addonSchema.safeParse({ ...formFields(fd), categories: fd.getAll('categories').filter((v) => typeof v === 'string') });
}

export async function updateAddon(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown add-on.');
  const p = parse(fd);
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb
    .from('addons')
    .update({
      name: p.data.name,
      description: p.data.description,
      price_cents: p.data.price,
      price_mode: p.data.price_mode,
      status: p.data.status,
      sort: p.data.sort,
      applies_to_category_ids: p.data.categories,
    })
    .eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null);
}

export async function createAddon(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = parse(fd);
  if (!p.success) return invalid(p.error);
  const slug = slugify(formFields(fd).slug || p.data.name);
  if (!slugField.safeParse(slug).success) return fail('Enter a name.', { name: ['Enter a name'] });
  const sb = await createClient();
  const { error } = await sb.from('addons').insert({
    slug,
    name: p.data.name,
    description: p.data.description,
    price_cents: p.data.price,
    price_mode: p.data.price_mode,
    status: p.data.status,
    sort: p.data.sort,
    applies_to_category_ids: p.data.categories,
  });
  if (error) return dbFail(error, { duplicate: 'An add-on with that name already exists.' });
  refresh(PATH, { public: true });
  return ok(null, 'Add-on added ✓');
}

export async function deleteAddon(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown add-on.');
  const sb = await createClient();
  const { error } = await sb.from('addons').delete().eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Deleted');
}
