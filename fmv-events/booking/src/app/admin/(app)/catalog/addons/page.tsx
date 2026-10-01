import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { centsToDollarString, formatCAD } from '@/lib/money';
import { Badge, Card, EmptyState, Input, Notice, Select, StatusBadge, Textarea } from '@/components/ui';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { CATALOG_STATUSES, PRICE_MODES, catalogStatusLabels, priceModeLabels, priceSuffix } from '@/app/admin/_owner/labels';
import { createAddon, deleteAddon, updateAddon } from './actions';

export const metadata: Metadata = { title: 'Add-ons · Catalog' };

type Category = { id: string; name: string };

function CategoryChecks({ prefix, categories, selected }: { prefix: string; categories: Category[]; selected: string[] }) {
  return (
    <fieldset className="sm:col-span-3">
      <legend className="mb-1 text-xs font-medium text-ink">Applies to</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((c) => (
          <label key={c.id} htmlFor={`${prefix}-${c.id}`} className="flex items-center gap-1.5 text-sm">
            <input
              id={`${prefix}-${c.id}`}
              type="checkbox"
              name="categories"
              value={c.id}
              defaultChecked={selected.includes(c.id)}
              className="h-4 w-4 accent-rose-deep"
            />
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AddonFields({
  prefix,
  categories,
  a,
}: {
  prefix: string;
  categories: Category[];
  a?: {
    name: string;
    description: string | null;
    price_cents: number | null;
    price_mode: string;
    status: string;
    sort: number;
    applies_to_category_ids: string[];
  };
}) {
  return (
    <>
      <Fld label="Name" htmlFor={`${prefix}-name`} name="name" className="sm:col-span-2">
        <Input id={`${prefix}-name`} name="name" required defaultValue={a?.name} />
      </Fld>
      <Fld label="Sort" htmlFor={`${prefix}-sort`} name="sort">
        <Input id={`${prefix}-sort`} name="sort" inputMode="numeric" required defaultValue={a?.sort ?? 0} />
      </Fld>
      <Fld label="Description" htmlFor={`${prefix}-desc`} name="description" className="sm:col-span-3">
        <Textarea id={`${prefix}-desc`} name="description" rows={2} className="min-h-0" defaultValue={a?.description ?? ''} />
      </Fld>
      <Fld label="Price (CAD)" htmlFor={`${prefix}-price`} name="price" hint="Blank = no price yet.">
        <Input id={`${prefix}-price`} name="price" inputMode="decimal" placeholder="No price" defaultValue={centsToDollarString(a?.price_cents ?? null)} />
      </Fld>
      <Fld label="Price mode" htmlFor={`${prefix}-mode`} name="price_mode">
        <Select id={`${prefix}-mode`} name="price_mode" defaultValue={a?.price_mode ?? 'flat'}>
          {PRICE_MODES.map((m) => <option key={m} value={m}>{priceModeLabels[m]}</option>)}
        </Select>
      </Fld>
      <Fld label="Status" htmlFor={`${prefix}-status`} name="status">
        <Select id={`${prefix}-status`} name="status" defaultValue={a?.status ?? 'needs_price'}>
          {CATALOG_STATUSES.map((m) => <option key={m} value={m}>{catalogStatusLabels[m]}</option>)}
        </Select>
      </Fld>
      <CategoryChecks prefix={`${prefix}-cat`} categories={categories} selected={a?.applies_to_category_ids ?? []} />
    </>
  );
}

export default async function AddonsPage() {
  await requireOwner();
  const sb = await createClient();
  const [adds, cats] = await Promise.all([
    sb.from('addons').select('*').order('sort'),
    sb.from('service_categories').select('id, name').order('sort'),
  ]);
  const error = adds.error || cats.error;
  const addons = adds.data ?? [];
  const categories = cats.data ?? [];
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      {error && <Notice tone="bad" title="Some data could not be loaded.">{error.message}</Notice>}
      <Notice tone="gold">
        Add-ons marked <strong>Needs price</strong> are hidden from clients until you price them and set them Active.
        Prints and albums are always add-ons; digital galleries are included with photography.
      </Notice>
      {addons.length === 0 && <EmptyState>No add-ons yet.</EmptyState>}
      <div className="space-y-3">
        {addons.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-base font-semibold">{a.name}</h3>
              <span className="text-sm tabular-nums">
                {a.price_cents === null ? 'No price' : `${a.price_mode === 'from' ? 'from ' : ''}${formatCAD(a.price_cents)}${priceSuffix(a.price_mode)}`}
              </span>
              <StatusBadge status={a.status} />
              {(a.status === 'needs_price' || a.price_cents === null) && <Badge tone="warn">hidden until priced</Badge>}
              {a.applies_to_category_ids.length > 0 && (
                <span className="basis-full text-xs text-ink-soft">
                  For: {a.applies_to_category_ids.map((id) => catName.get(id) ?? '?').join(', ')}
                </span>
              )}
            </div>
            <ActionForm action={updateAddon.bind(null, a.id)} aria-label={`Edit ${a.name}`} className="grid gap-3 sm:grid-cols-3">
              <AddonFields prefix={`a-${a.id}`} categories={categories} a={a} />
              <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                <Save>Save add-on</Save>
              </div>
            </ActionForm>
            <div className="mt-2 flex justify-end">
              <ActionForm action={deleteAddon.bind(null, a.id)} confirm={`Delete the add-on “${a.name}”?`} aria-label="Delete add-on">
                <Save variant="ghost" pendingText="Deleting…" className="text-bad">Delete</Save>
              </ActionForm>
            </div>
          </Card>
        ))}
      </div>

      <section aria-labelledby="new-addon">
        <SectionTitle id="new-addon">Add an add-on</SectionTitle>
        <Card>
          <ActionForm action={createAddon} resetOnSuccess aria-label="New add-on" className="grid gap-3 sm:grid-cols-3">
            <AddonFields prefix="new-addon" categories={categories} />
            <div className="sm:col-span-3">
              <Save size="md">Add add-on</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
