'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { dbFail, dollars, formFields, intField, invalid, optText, refresh, reqText, uuidField } from '@/app/admin/_owner/server';

type R = ActionResult<unknown>;
const PATH = '/admin/catalog/zones';

const zoneSchema = z.object({
  name: reqText('Name'),
  description: optText(1000),
  travel_fee: dollars,
  sort: intField('Sort', -1000, 100000),
});

export async function updateZone(id: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown zone.');
  const p = zoneSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const { travel_fee, ...rest } = p.data;
  const sb = await createClient();
  const { error } = await sb.from('service_zones').update({ ...rest, travel_fee_cents: travel_fee }).eq('id', id);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null);
}

export async function createZone(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = zoneSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const { travel_fee, ...rest } = p.data;
  const sb = await createClient();
  const { error } = await sb.from('service_zones').insert({ ...rest, travel_fee_cents: travel_fee });
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null, 'Zone added ✓');
}

export async function deleteZone(id: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  await assertOwner();
  if (!uuidField.safeParse(id).success) return fail('Unknown zone.');
  const sb = await createClient();
  const { error } = await sb.from('service_zones').delete().eq('id', id);
  if (error) return dbFail(error, { inUse: 'Inquiries or bookings use this zone, so it can’t be deleted. Rename it instead.' });
  refresh(PATH, { public: true });
  return ok(null, 'Deleted');
}
