'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { dbFail, formFields, intField, invalid, optText, refresh, reqText, uuidField } from '@/app/admin/_owner/server';
import { INVENTORY_KINDS } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = '/admin/catalog/inventory';

const itemSchema = z.object({
  name: reqText('Name'),
  kind: z.enum(INVENTORY_KINDS),
  units_owned: intField('Units owned', 0, 100),
  buffer_before_min: intField('Buffer before', 0, 1440),
  buffer_after_min: intField('Buffer after', 0, 1440),
  notes: optText(1000),
});

export async function updateInventoryItem(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown item.');
  const p = itemSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb.from('inventory_items').update(p.data).eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH);
  return ok(null);
}

export async function createInventoryItem(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = itemSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb.from('inventory_items').insert(p.data);
  if (error) return dbFail(error);
  refresh(PATH);
  return ok(null, 'Item added ✓');
}

export async function deleteInventoryItem(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown item.');
  const sb = await createClient();
  const { error } = await sb.from('inventory_items').delete().eq('id', id);
  if (error) {
    return dbFail(error, {
      inUse: 'This item has bookings reserved against it, so it can’t be deleted. Set units owned to 0 to stop new bookings.',
    });
  }
  refresh(PATH);
  return ok(null, 'Deleted');
}
