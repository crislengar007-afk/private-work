'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { EVENT_TYPES } from '@/lib/schemas';
import {
  dbFail, dollars, formFields, intField, invalid, optDecimal, optText, optUuid, refresh, reqText, slugField, slugify, uuidField,
} from '@/app/admin/_owner/server';
import { PACKAGE_STATUSES } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = '/admin/catalog/packages';
const NEEDS_PRICE = 'Set a bundle price before making this package active.';

const packageSchema = z
  .object({
    name: reqText('Name'),
    slug: slugField,
    event_type: z.enum(EVENT_TYPES),
    description_md: optText(10000),
    price: dollars,
    status: z.enum(PACKAGE_STATUSES),
    sort: intField('Sort', -1000, 100000),
    cover_media_id: optUuid,
  })
  .superRefine((v, ctx) => {
    if (v.status === 'active' && v.price === null) ctx.addIssue({ code: 'custom', path: ['price'], message: NEEDS_PRICE });
  });

export async function updatePackage(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown package.');
  const p = packageSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const { price, ...rest } = p.data;
  const sb = await createClient();
  if (rest.status === 'active') {
    const { count } = await sb.from('package_items').select('service_id', { count: 'exact', head: true }).eq('package_id', id);
    if (!count) return fail('Add at least one included service before making this package active.');
  }
  const { error } = await sb.from('packages').update({ ...rest, price_cents: price }).eq('id', id);
  if (error) return dbFail(error, { duplicate: 'Another package already uses that slug.' });
  refresh(PATH, { public: true });
  return ok(null);
}

const createSchema = z.object({
  name: reqText('Name'),
  slug: z.string().trim().optional(),
  event_type: z.enum(EVENT_TYPES),
});

export async function createPackage(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = createSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const slug = slugify(p.data.slug || p.data.name);
  if (!slugField.safeParse(slug).success) return fail('Enter a slug.', { slug: ['Enter a slug (letters, numbers, dashes)'] });
  const sb = await createClient();
  const { data: last } = await sb.from('packages').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const { error } = await sb
    .from('packages')
    .insert({ name: p.data.name, slug, event_type: p.data.event_type, status: 'draft', sort: (last?.sort ?? 0) + 1 });
  if (error) return dbFail(error, { duplicate: 'Another package already uses that slug.' });
  refresh(PATH);
  return ok(null, 'Package added as a draft ✓');
}

export async function deletePackage(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown package.');
  const sb = await createClient();
  const { error } = await sb.from('packages').delete().eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Deleted');
}

const itemSchema = z.object({
  service_id: uuidField,
  qty: optDecimal('Quantity', 100).transform((v) => v ?? 1).pipe(z.number().positive('Quantity must be more than 0')),
});

export async function setPackageItem(packageId: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(packageId).success) return fail('Unknown package.');
  const p = itemSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb
    .from('package_items')
    .upsert({ package_id: packageId, service_id: p.data.service_id, qty: p.data.qty }, { onConflict: 'package_id,service_id' });
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null);
}

export async function removePackageItem(packageId: string, serviceId: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(packageId).success || !uuidField.safeParse(serviceId).success) return fail('Unknown item.');
  const sb = await createClient();
  const { error } = await sb.from('package_items').delete().eq('package_id', packageId).eq('service_id', serviceId);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Removed');
}
