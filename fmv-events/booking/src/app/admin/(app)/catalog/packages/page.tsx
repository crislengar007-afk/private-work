import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { centsToDollarString, formatCAD } from '@/lib/money';
import { alaCarteValue, type CatalogService, type PriceMode } from '@/lib/estimate';
import { EVENT_TYPES, eventTypeLabels } from '@/lib/schemas';
import { Badge, Card, EmptyState, Input, Notice, Select, StatusBadge, Textarea } from '@/components/ui';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { MEDIA_OPTION_COLUMNS, MediaSelect, SectionTitle, type MediaOption } from '@/app/admin/_owner/ui';
import { PACKAGE_STATUSES, priceSuffix } from '@/app/admin/_owner/labels';
import { createPackage, deletePackage, removePackageItem, setPackageItem, updatePackage } from './actions';

export const metadata: Metadata = { title: 'Packages · Catalog' };

export default async function PackagesPage() {
  await requireOwner();
  const sb = await createClient();
  const [pkgs, svcs, media] = await Promise.all([
    sb.from('packages').select('*, package_items(service_id, qty)').order('sort'),
    sb.from('services').select('id, slug, name, category_id, price_cents, price_mode, min_hours, included_hours, status').order('sort'),
    sb.from('media').select(MEDIA_OPTION_COLUMNS).eq('kind', 'photo').eq('is_ai_generated', false).order('created_at', { ascending: false }).limit(500),
  ]);
  const error = pkgs.error || svcs.error || media.error;
  const services = svcs.data ?? [];
  const catalogServices: CatalogService[] = services.map((s) => ({ ...s, price_mode: s.price_mode as PriceMode }));
  const svcById = new Map(services.map((s) => [s.id, s]));
  const mediaOptions = (media.data ?? []) as MediaOption[];
  const packages = pkgs.data ?? [];

  return (
    <div className="space-y-6">
      {error && <Notice tone="bad" title="Some data could not be loaded.">{error.message}</Notice>}
      <Notice tone="gold">
        Packages show on the website only when <strong>active</strong>, and a package needs a bundle price before it can go
        active. The <strong>à la carte value</strong> is worked out automatically from the included services’ current prices.
      </Notice>

      {packages.length === 0 && <EmptyState>No packages yet.</EmptyState>}

      {packages.map((p) => {
        const items = (p.package_items ?? []).map((i) => ({ service_id: i.service_id, qty: Number(i.qty) }));
        const value = alaCarteValue({ items }, catalogServices);
        const saving = p.price_cents !== null ? value.cents - p.price_cents : null;
        const notInPackage = services.filter((s) => !items.some((i) => i.service_id === s.id) && s.status !== 'archived');
        return (
          <Card key={p.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-lg font-semibold text-ink">
                {p.name} <span className="text-sm font-normal text-ink-soft">/{p.slug}</span>
              </h3>
              <StatusBadge status={p.status} />
              {p.price_cents === null && <Badge tone="warn">needs a bundle price</Badge>}
            </div>

            <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-cream-deep/50 p-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-soft">Bundle price</dt>
                <dd className="font-semibold tabular-nums">{p.price_cents === null ? 'Not set' : formatCAD(p.price_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">À la carte value</dt>
                <dd className="font-semibold tabular-nums">
                  {items.length === 0 ? '—' : `${value.isFrom ? 'from ' : ''}${formatCAD(value.cents)}`}
                </dd>
                {!value.complete && <dd className="text-xs text-warn">Some included services have no price yet.</dd>}
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Client saving</dt>
                <dd className={saving !== null && saving < 0 ? 'font-semibold text-bad' : 'font-semibold text-ok'}>
                  {saving === null || items.length === 0
                    ? '—'
                    : saving > 0
                      ? `${formatCAD(saving)} (${Math.round((saving / Math.max(value.cents, 1)) * 100)}%)`
                      : saving === 0
                        ? 'No saving'
                        : `${formatCAD(-saving)} more than à la carte`}
                </dd>
              </div>
            </dl>

            {p.status !== 'active' && p.price_cents === null && (
              <Notice tone="warn" className="mb-3">
                This package is a draft without a price. Set the bundle price, then change the status to Active to publish it.
              </Notice>
            )}

            <ActionForm action={updatePackage.bind(null, p.id)} aria-label={`Edit ${p.name}`} className="grid gap-3 sm:grid-cols-3">
              <Fld label="Name" htmlFor={`pn-${p.id}`} name="name" className="sm:col-span-2">
                <Input id={`pn-${p.id}`} name="name" required defaultValue={p.name} />
              </Fld>
              <Fld label="Slug" htmlFor={`ps-${p.id}`} name="slug">
                <Input id={`ps-${p.id}`} name="slug" required defaultValue={p.slug} />
              </Fld>
              <Fld label="Bundle price (CAD)" htmlFor={`pp-${p.id}`} name="price" hint="Blank = no price yet.">
                <Input id={`pp-${p.id}`} name="price" inputMode="decimal" placeholder="No price" defaultValue={centsToDollarString(p.price_cents)} />
              </Fld>
              <Fld label="Status" htmlFor={`pst-${p.id}`} name="status">
                <Select id={`pst-${p.id}`} name="status" defaultValue={p.status}>
                  {PACKAGE_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </Select>
              </Fld>
              <Fld label="Event type" htmlFor={`pe-${p.id}`} name="event_type">
                <Select id={`pe-${p.id}`} name="event_type" defaultValue={p.event_type}>
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{eventTypeLabels[t]}</option>)}
                </Select>
              </Fld>
              <Fld label="Description (markdown)" htmlFor={`pd-${p.id}`} name="description_md" className="sm:col-span-3">
                <Textarea id={`pd-${p.id}`} name="description_md" rows={3} defaultValue={p.description_md ?? ''} />
              </Fld>
              <Fld label="Cover image" htmlFor={`pc-${p.id}`} name="cover_media_id" className="sm:col-span-2">
                <MediaSelect id={`pc-${p.id}`} media={mediaOptions} defaultValue={p.cover_media_id} />
              </Fld>
              <Fld label="Sort" htmlFor={`pso-${p.id}`} name="sort">
                <Input id={`pso-${p.id}`} name="sort" inputMode="numeric" required defaultValue={p.sort} />
              </Fld>
              <div className="sm:col-span-3">
                <Save>Save package</Save>
              </div>
            </ActionForm>

            <div className="mt-4 border-t border-line/70 pt-3">
              <h4 className="text-sm font-semibold text-ink">Included services</h4>
              {items.length === 0 && <p className="text-xs text-ink-soft">Nothing included yet.</p>}
              <ul className="mt-2 space-y-2">
                {items.map((i) => {
                  const s = svcById.get(i.service_id);
                  return (
                    <li key={i.service_id} className="flex flex-wrap items-end gap-2">
                      <ActionForm action={setPackageItem.bind(null, p.id)} aria-label={`Quantity of ${s?.name}`} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="service_id" value={i.service_id} />
                        <span className="min-w-48 pb-2 text-sm">
                          {s?.name ?? 'Unknown service'}{' '}
                          <span className="text-xs text-ink-soft">
                            {s?.price_cents == null ? '(no price)' : `(${formatCAD(s.price_cents)}${priceSuffix(s.price_mode)})`}
                          </span>
                        </span>
                        <Fld label={s?.price_mode === 'per_hour' ? 'Hours' : 'Qty'} htmlFor={`pq-${p.id}-${i.service_id}`} name="qty" className="w-20">
                          <Input id={`pq-${p.id}-${i.service_id}`} name="qty" inputMode="decimal" defaultValue={i.qty} />
                        </Fld>
                        <Save variant="secondary">Update</Save>
                      </ActionForm>
                      <ActionForm action={removePackageItem.bind(null, p.id, i.service_id)} aria-label="Remove service">
                        <Save variant="ghost" pendingText="Removing…">Remove</Save>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
              {notInPackage.length > 0 && (
                <ActionForm action={setPackageItem.bind(null, p.id)} resetOnSuccess aria-label={`Add a service to ${p.name}`} className="mt-3 flex flex-wrap items-end gap-2">
                  <Fld label="Add service" htmlFor={`pa-${p.id}`} name="service_id" className="w-64">
                    <Select id={`pa-${p.id}`} name="service_id" defaultValue="">
                      <option value="" disabled>Choose…</option>
                      {notInPackage.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Fld>
                  <Fld label="Qty / hours" htmlFor={`paq-${p.id}`} name="qty" className="w-24">
                    <Input id={`paq-${p.id}`} name="qty" inputMode="decimal" defaultValue={1} />
                  </Fld>
                  <Save variant="secondary">Add</Save>
                </ActionForm>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <ActionForm action={deletePackage.bind(null, p.id)} confirm={`Delete the package “${p.name}”? This can’t be undone.`} aria-label="Delete package">
                <Save variant="ghost" pendingText="Deleting…" className="text-bad">Delete package</Save>
              </ActionForm>
            </div>
          </Card>
        );
      })}

      <section aria-labelledby="new-package">
        <SectionTitle id="new-package">Add a package</SectionTitle>
        <Card>
          <ActionForm action={createPackage} resetOnSuccess aria-label="New package" className="grid gap-3 sm:grid-cols-3">
            <Fld label="Name" htmlFor="np-name" name="name">
              <Input id="np-name" name="name" required />
            </Fld>
            <Fld label="Slug (optional)" htmlFor="np-slug" name="slug" hint="Made from the name if blank.">
              <Input id="np-slug" name="slug" />
            </Fld>
            <Fld label="Event type" htmlFor="np-type" name="event_type">
              <Select id="np-type" name="event_type" defaultValue="wedding">
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{eventTypeLabels[t]}</option>)}
              </Select>
            </Fld>
            <div className="sm:col-span-3">
              <Save size="md">Add package (as draft)</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
