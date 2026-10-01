'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import {
  checkbox, dbFail, dollars, formFields, intField, invalid, optDecimal, optText, optUuid,
  refresh, reqText, slugField, slugify, uuidField,
} from '@/app/admin/_owner/server';
import { CATALOG_STATUSES, PRICE_MODES } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = '/admin/catalog';
const NEEDS_PRICE = 'Set a price before making this public.';

const pricingSchema = z
  .object({
    price: dollars,
    price_mode: z.enum(PRICE_MODES),
    status: z.enum(CATALOG_STATUSES),
    is_public: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.status === 'active' && v.price === null) ctx.addIssue({ code: 'custom', path: ['price'], message: NEEDS_PRICE });
  });

export async function updateServicePricing(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown service.');
  const p = pricingSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb
    .from('services')
    .update({ price_cents: p.data.price, price_mode: p.data.price_mode, status: p.data.status, is_public: p.data.is_public })
    .eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Price saved ✓');
}

const detailsSchema = z.object({
  name: reqText('Name'),
  slug: slugField,
  category_id: uuidField,
  short_desc: optText(500),
  long_desc_md: optText(10000),
  min_hours: optDecimal('Minimum hours', 24),
  included_hours: optDecimal('Included hours', 24),
  sort: intField('Sort', -1000, 100000),
  cover_media_id: optUuid,
});

export async function updateServiceDetails(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown service.');
  const p = detailsSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb.from('services').update(p.data).eq('id', id);
  if (error) return dbFail(error, { duplicate: 'Another service already uses that slug.' });
  refresh(PATH, { public: true });
  return ok(null);
}

const createSchema = z
  .object({
    name: reqText('Name'),
    slug: z.string().trim().optional(),
    category_id: uuidField,
    price: dollars,
    price_mode: z.enum(PRICE_MODES),
    status: z.enum(CATALOG_STATUSES),
  })
  .transform((v) => ({ ...v, slug: slugify(v.slug || v.name) }))
  .superRefine((v, ctx) => {
    if (!slugField.safeParse(v.slug).success) ctx.addIssue({ code: 'custom', path: ['slug'], message: 'Enter a slug (letters, numbers, dashes)' });
    if (v.status === 'active' && v.price === null) ctx.addIssue({ code: 'custom', path: ['price'], message: NEEDS_PRICE });
  });

export async function createService(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = createSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { data: last } = await sb.from('services').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const { error } = await sb.from('services').insert({
    name: p.data.name,
    slug: p.data.slug,
    category_id: p.data.category_id,
    price_cents: p.data.price,
    price_mode: p.data.price_mode,
    status: p.data.status,
    sort: (last?.sort ?? 0) + 1,
  });
  if (error) return dbFail(error, { duplicate: 'Another service already uses that slug.' });
  refresh(PATH, { public: true });
  return ok(null, 'Service added ✓');
}

// ------------------------------------------------------------------ inventory consumption
const consumeSchema = z.object({
  inventory_item_id: uuidField,
  qty: intField('Quantity', 1, 100),
});

export async function setServiceInventory(serviceId: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(serviceId).success) return fail('Unknown service.');
  const p = consumeSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb
    .from('service_inventory')
    .upsert({ service_id: serviceId, inventory_item_id: p.data.inventory_item_id, qty: p.data.qty }, { onConflict: 'service_id,inventory_item_id' });
  if (error) return dbFail(error);
  refresh(PATH);
  return ok(null);
}

export async function removeServiceInventory(serviceId: string, itemId: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(serviceId).success || !uuidField.safeParse(itemId).success) return fail('Unknown item.');
  const sb = await createClient();
  const { error } = await sb.from('service_inventory').delete().eq('service_id', serviceId).eq('inventory_item_id', itemId);
  if (error) return dbFail(error);
  refresh(PATH);
  return ok(null, 'Removed ✓');
}
