import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, EmptyState, Input, Notice, Select } from '@/components/ui';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { INVENTORY_KINDS, inventoryKindLabels } from '@/app/admin/_owner/labels';
import { createInventoryItem, deleteInventoryItem, updateInventoryItem } from './actions';

export const metadata: Metadata = { title: 'Inventory · Catalog' };

type Item = {
  name: string;
  kind: string;
  units_owned: number;
  buffer_before_min: number;
  buffer_after_min: number;
  notes: string | null;
};

function ItemFields({ prefix, item }: { prefix: string; item?: Item }) {
  return (
    <>
      <Fld label="Name" htmlFor={`${prefix}-name`} name="name" className="sm:col-span-2">
        <Input id={`${prefix}-name`} name="name" required defaultValue={item?.name} />
      </Fld>
      <Fld label="Kind" htmlFor={`${prefix}-kind`} name="kind">
        <Select id={`${prefix}-kind`} name="kind" defaultValue={item?.kind ?? 'other'}>
          {INVENTORY_KINDS.map((k) => <option key={k} value={k}>{inventoryKindLabels[k]}</option>)}
        </Select>
      </Fld>
      <Fld label="Units owned" htmlFor={`${prefix}-units`} name="units_owned">
        <Input id={`${prefix}-units`} name="units_owned" inputMode="numeric" required defaultValue={item?.units_owned ?? 1} />
      </Fld>
      <Fld label="Buffer before (min)" htmlFor={`${prefix}-bb`} name="buffer_before_min" hint="Setup/travel time">
        <Input id={`${prefix}-bb`} name="buffer_before_min" inputMode="numeric" required defaultValue={item?.buffer_before_min ?? 90} />
      </Fld>
      <Fld label="Buffer after (min)" htmlFor={`${prefix}-ba`} name="buffer_after_min" hint="Teardown/travel time">
        <Input id={`${prefix}-ba`} name="buffer_after_min" inputMode="numeric" required defaultValue={item?.buffer_after_min ?? 60} />
      </Fld>
      <Fld label="Notes" htmlFor={`${prefix}-notes`} name="notes" className="sm:col-span-6">
        <Input id={`${prefix}-notes`} name="notes" defaultValue={item?.notes ?? ''} />
      </Fld>
    </>
  );
}

export default async function InventoryPage() {
  await requireOwner();
  const sb = await createClient();
  const { data, error } = await sb.from('inventory_items').select('*').order('kind').order('name');
  const items = data ?? [];

  return (
    <div className="space-y-6">
      {error && <Notice tone="bad" title="Inventory could not be loaded.">{error.message}</Notice>}
      <Notice tone="gold">
        Each booking reserves the items its services use, widened by the buffers, and the database refuses overlapping
        reservations. <strong>“Staff” rows model people</strong>, e.g. Marie with 1 unit, so she can’t be double-booked across
        events for coordination, photography or styling. Link items to services on the Services tab.
      </Notice>
      {items.length === 0 && <EmptyState>No inventory yet.</EmptyState>}
      <div className="space-y-3">
        {items.map((i) => (
          <Card key={i.id} className="p-4">
            <ActionForm action={updateInventoryItem.bind(null, i.id)} aria-label={`Edit ${i.name}`} className="grid gap-3 sm:grid-cols-6">
              <ItemFields prefix={`inv-${i.id}`} item={i} />
              <div className="sm:col-span-6">
                <Save>Save</Save>
              </div>
            </ActionForm>
            <div className="mt-2 flex justify-end">
              <ActionForm action={deleteInventoryItem.bind(null, i.id)} confirm={`Delete “${i.name}”?`} aria-label="Delete item">
                <Save variant="ghost" pendingText="Deleting…" className="text-bad">Delete</Save>
              </ActionForm>
            </div>
          </Card>
        ))}
      </div>
      <section aria-labelledby="new-item">
        <SectionTitle id="new-item">Add an item or person</SectionTitle>
        <Card>
          <ActionForm action={createInventoryItem} resetOnSuccess aria-label="New inventory item" className="grid gap-3 sm:grid-cols-6">
            <ItemFields prefix="new-inv" />
            <div className="sm:col-span-6">
              <Save size="md">Add</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
