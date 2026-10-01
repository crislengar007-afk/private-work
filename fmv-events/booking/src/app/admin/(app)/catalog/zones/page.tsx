import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { centsToDollarString, formatCAD } from '@/lib/money';
import { Badge, Card, EmptyState, Input, Notice } from '@/components/ui';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { createZone, deleteZone, updateZone } from './actions';

export const metadata: Metadata = { title: 'Travel zones · Catalog' };

type Zone = { name: string; description: string | null; travel_fee_cents: number | null; sort: number };

function ZoneFields({ prefix, z }: { prefix: string; z?: Zone }) {
  return (
    <>
      <Fld label="Name" htmlFor={`${prefix}-name`} name="name" className="sm:col-span-2">
        <Input id={`${prefix}-name`} name="name" required defaultValue={z?.name} />
      </Fld>
      <Fld label="Travel fee (CAD)" htmlFor={`${prefix}-fee`} name="travel_fee" hint="Blank = “confirmed in quote”. 0 = included.">
        <Input id={`${prefix}-fee`} name="travel_fee" inputMode="decimal" placeholder="Confirmed in quote" defaultValue={centsToDollarString(z?.travel_fee_cents ?? null)} />
      </Fld>
      <Fld label="Sort" htmlFor={`${prefix}-sort`} name="sort">
        <Input id={`${prefix}-sort`} name="sort" inputMode="numeric" required defaultValue={z?.sort ?? 0} />
      </Fld>
      <Fld label="Description" htmlFor={`${prefix}-desc`} name="description" className="sm:col-span-4">
        <Input id={`${prefix}-desc`} name="description" defaultValue={z?.description ?? ''} />
      </Fld>
    </>
  );
}

export default async function ZonesPage() {
  await requireOwner();
  const sb = await createClient();
  const { data, error } = await sb.from('service_zones').select('*').order('sort');
  const zones = data ?? [];
  return (
    <div className="space-y-6">
      {error && <Notice tone="bad" title="Zones could not be loaded.">{error.message}</Notice>}
      <Notice tone="warn" title="[OWNER TO CONFIRM] Zones and travel fees">
        Confirm the zones and fees before launch. A zone without a fee shows clients “travel confirmed in your quote”.
      </Notice>
      {zones.length === 0 && <EmptyState>No zones yet.</EmptyState>}
      <div className="space-y-3">
        {zones.map((z) => (
          <Card key={z.id} className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="mr-auto font-semibold">{z.name}</h3>
              {z.travel_fee_cents === null ? <Badge tone="warn">confirmed in quote</Badge> : <Badge>{z.travel_fee_cents === 0 ? 'included' : formatCAD(z.travel_fee_cents)}</Badge>}
            </div>
            <ActionForm action={updateZone.bind(null, z.id)} aria-label={`Edit ${z.name}`} className="grid gap-3 sm:grid-cols-4">
              <ZoneFields prefix={`z-${z.id}`} z={z} />
              <div className="sm:col-span-4">
                <Save>Save</Save>
              </div>
            </ActionForm>
            <div className="mt-2 flex justify-end">
              <ActionForm action={deleteZone.bind(null, z.id)} confirm={`Delete the zone “${z.name}”?`} aria-label="Delete zone">
                <Save variant="ghost" pendingText="Deleting…" className="text-bad">Delete</Save>
              </ActionForm>
            </div>
          </Card>
        ))}
      </div>
      <section aria-labelledby="new-zone">
        <SectionTitle id="new-zone">Add a zone</SectionTitle>
        <Card>
          <ActionForm action={createZone} resetOnSuccess aria-label="New zone" className="grid gap-3 sm:grid-cols-4">
            <ZoneFields prefix="new-zone" />
            <div className="sm:col-span-4">
              <Save size="md">Add zone</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
