import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { centsToDollarString, formatCAD } from '@/lib/money';
import { Badge, Card, EmptyState, Input, Notice, Select, StatusBadge, Textarea } from '@/components/ui';
import { ActionForm, Check, Fld, Save } from '@/app/admin/_owner/form';
import { MEDIA_OPTION_COLUMNS, MediaSelect, SectionTitle, type MediaOption } from '@/app/admin/_owner/ui';
import {
  CATALOG_STATUSES, PRICE_MODES, catalogStatusLabels, inventoryKindLabels, priceModeLabels, priceSuffix,
} from '@/app/admin/_owner/labels';
import {
  createService, removeServiceInventory, setServiceInventory, updateServiceDetails, updateServicePricing,
} from './service-actions';

export const metadata: Metadata = { title: 'Services · Catalog' };

export default async function ServicesPage() {
  await requireOwner();
  const sb = await createClient();
  const [cats, svcs, inv, si, media] = await Promise.all([
    sb.from('service_categories').select('id, slug, name, sort').order('sort'),
    sb.from('services').select('*').order('sort'),
    sb.from('inventory_items').select('id, name, kind, units_owned').order('name'),
    sb.from('service_inventory').select('service_id, inventory_item_id, qty'),
    sb.from('media').select(MEDIA_OPTION_COLUMNS).eq('kind', 'photo').order('created_at', { ascending: false }).limit(500),
  ]);
  const error = cats.error || svcs.error || inv.error || si.error || media.error;
  const categories = cats.data ?? [];
  const services = svcs.data ?? [];
  const items = inv.data ?? [];
  const consumption = si.data ?? [];
  const mediaOptions = (media.data ?? []) as MediaOption[];
  const itemName = new Map(items.map((i) => [i.id, i.name]));

  return (
    <div className="space-y-6">
      {error && <Notice tone="bad" title="Some catalog data could not be loaded.">{error.message}</Notice>}
      <Notice tone="gold">
        Only <strong>active + public</strong> services with a price appear on the website and in the event builder. Leave the
        price blank for “no price yet”: a service can’t be made active without one.
      </Notice>

      {categories.map((cat) => {
        const list = services.filter((s) => s.category_id === cat.id);
        return (
          <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
            <SectionTitle id={`cat-${cat.id}`}>{cat.name}</SectionTitle>
            {list.length === 0 && <EmptyState>No services in this category yet.</EmptyState>}
            <div className="space-y-3">
              {list.map((s) => {
                const used = consumption.filter((c) => c.service_id === s.id);
                return (
                  <Card key={s.id} className="p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h3 className="mr-auto text-base font-semibold text-ink">
                        {s.name} <span className="text-sm font-normal text-ink-soft">/{s.slug}</span>
                      </h3>
                      <span className="text-sm tabular-nums text-ink">
                        {s.price_cents === null ? 'No price' : `${s.price_mode === 'from' ? 'from ' : ''}${formatCAD(s.price_cents)}${priceSuffix(s.price_mode)}`}
                      </span>
                      <StatusBadge status={s.status} />
                      {!s.is_public && <Badge>not public</Badge>}
                    </div>

                    <ActionForm
                      action={updateServicePricing.bind(null, s.id)}
                      aria-label={`Price for ${s.name}`}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <Fld label="Price (CAD)" htmlFor={`price-${s.id}`} name="price" className="w-32">
                        <Input id={`price-${s.id}`} name="price" inputMode="decimal" placeholder="No price" defaultValue={centsToDollarString(s.price_cents)} />
                      </Fld>
                      <Fld label="Price mode" htmlFor={`mode-${s.id}`} name="price_mode" className="w-44">
                        <Select id={`mode-${s.id}`} name="price_mode" defaultValue={s.price_mode}>
                          {PRICE_MODES.map((m) => <option key={m} value={m}>{priceModeLabels[m]}</option>)}
                        </Select>
                      </Fld>
                      <Fld label="Status" htmlFor={`status-${s.id}`} name="status" className="w-36">
                        <Select id={`status-${s.id}`} name="status" defaultValue={s.status}>
                          {CATALOG_STATUSES.map((m) => <option key={m} value={m}>{catalogStatusLabels[m]}</option>)}
                        </Select>
                      </Fld>
                      <Check id={`public-${s.id}`} name="is_public" label="Public" defaultChecked={s.is_public} />
                      <Save />
                    </ActionForm>

                    <details className="mt-3 rounded-lg border border-line/70 bg-cream/40 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-rose-deep">
                        Edit details, cover and inventory
                        {used.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-ink-soft">
                            uses {used.map((u) => `${itemName.get(u.inventory_item_id) ?? 'item'} ×${u.qty}`).join(', ')}
                          </span>
                        )}
                      </summary>

                      <ActionForm
                        action={updateServiceDetails.bind(null, s.id)}
                        aria-label={`Details for ${s.name}`}
                        className="mt-3 grid gap-3 sm:grid-cols-2"
                      >
                        <Fld label="Name" htmlFor={`name-${s.id}`} name="name">
                          <Input id={`name-${s.id}`} name="name" required defaultValue={s.name} />
                        </Fld>
                        <Fld label="Slug" htmlFor={`slug-${s.id}`} name="slug" hint="Used in links. Changing it breaks old links.">
                          <Input id={`slug-${s.id}`} name="slug" required defaultValue={s.slug} />
                        </Fld>
                        <Fld label="Category" htmlFor={`cat-${s.id}`} name="category_id">
                          <Select id={`cat-${s.id}`} name="category_id" defaultValue={s.category_id}>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        </Fld>
                        <Fld label="Cover image" htmlFor={`cover-${s.id}`} name="cover_media_id" hint="Pick from the media library.">
                          <MediaSelect id={`cover-${s.id}`} media={mediaOptions.filter((m) => !m.is_ai_generated)} defaultValue={s.cover_media_id} />
                        </Fld>
                        <Fld label="Short description" htmlFor={`short-${s.id}`} name="short_desc" className="sm:col-span-2">
                          <Input id={`short-${s.id}`} name="short_desc" defaultValue={s.short_desc ?? ''} maxLength={500} />
                        </Fld>
                        <Fld label="Long description (markdown)" htmlFor={`long-${s.id}`} name="long_desc_md" className="sm:col-span-2">
                          <Textarea id={`long-${s.id}`} name="long_desc_md" rows={4} defaultValue={s.long_desc_md ?? ''} />
                        </Fld>
                        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                          <Fld label="Min hours" htmlFor={`min-${s.id}`} name="min_hours">
                            <Input id={`min-${s.id}`} name="min_hours" inputMode="decimal" defaultValue={s.min_hours ?? ''} />
                          </Fld>
                          <Fld label="Included hours" htmlFor={`inc-${s.id}`} name="included_hours">
                            <Input id={`inc-${s.id}`} name="included_hours" inputMode="decimal" defaultValue={s.included_hours ?? ''} />
                          </Fld>
                          <Fld label="Sort" htmlFor={`sort-${s.id}`} name="sort">
                            <Input id={`sort-${s.id}`} name="sort" inputMode="numeric" required defaultValue={s.sort} />
                          </Fld>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                          <Save>Save details</Save>
                        </div>
                      </ActionForm>

                      <div className="mt-4 border-t border-line/70 pt-3">
                        <h4 className="text-sm font-semibold text-ink">Inventory this service uses</h4>
                        <p className="mb-2 text-xs text-ink-soft">
                          Booking this service reserves these items (plus their buffers), so the same booth or person can’t be double-booked.
                        </p>
                        {used.length === 0 && <p className="mb-2 text-xs text-ink-soft">Nothing reserved.</p>}
                        <ul className="space-y-2">
                          {used.map((u) => (
                            <li key={u.inventory_item_id} className="flex flex-wrap items-end gap-2">
                              <ActionForm
                                action={setServiceInventory.bind(null, s.id)}
                                aria-label={`Quantity of ${itemName.get(u.inventory_item_id)}`}
                                className="flex flex-wrap items-end gap-2"
                              >
                                <input type="hidden" name="inventory_item_id" value={u.inventory_item_id} />
                                <span className="pb-2 text-sm text-ink">{itemName.get(u.inventory_item_id) ?? 'Unknown item'}</span>
                                <Fld label="Qty" htmlFor={`siq-${s.id}-${u.inventory_item_id}`} name="qty" className="w-20">
                                  <Input id={`siq-${s.id}-${u.inventory_item_id}`} name="qty" inputMode="numeric" defaultValue={u.qty} />
                                </Fld>
                                <Save variant="secondary">Update</Save>
                              </ActionForm>
                              <ActionForm action={removeServiceInventory.bind(null, s.id, u.inventory_item_id)} aria-label="Remove item">
                                <Save variant="ghost" pendingText="Removing…">Remove</Save>
                              </ActionForm>
                            </li>
                          ))}
                        </ul>
                        {items.length > 0 && (
                          <ActionForm
                            action={setServiceInventory.bind(null, s.id)}
                            aria-label={`Add inventory to ${s.name}`}
                            resetOnSuccess
                            className="mt-2 flex flex-wrap items-end gap-2"
                          >
                            <Fld label="Add item" htmlFor={`sia-${s.id}`} name="inventory_item_id" className="w-56">
                              <Select id={`sia-${s.id}`} name="inventory_item_id" defaultValue="">
                                <option value="" disabled>Choose…</option>
                                {items.map((i) => (
                                  <option key={i.id} value={i.id}>{i.name} ({inventoryKindLabels[i.kind]})</option>
                                ))}
                              </Select>
                            </Fld>
                            <Fld label="Qty" htmlFor={`siaq-${s.id}`} name="qty" className="w-20">
                              <Input id={`siaq-${s.id}`} name="qty" inputMode="numeric" defaultValue={1} />
                            </Fld>
                            <Save variant="secondary">Add</Save>
                          </ActionForm>
                        )}
                      </div>
                    </details>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      <section aria-labelledby="new-service">
        <SectionTitle id="new-service">Add a service</SectionTitle>
        <Card>
          <ActionForm action={createService} resetOnSuccess aria-label="New service" className="grid gap-3 sm:grid-cols-3">
            <Fld label="Name" htmlFor="new-name" name="name" className="sm:col-span-2">
              <Input id="new-name" name="name" required />
            </Fld>
            <Fld label="Slug (optional)" htmlFor="new-slug" name="slug" hint="Made from the name if blank.">
              <Input id="new-slug" name="slug" />
            </Fld>
            <Fld label="Category" htmlFor="new-cat" name="category_id">
              <Select id="new-cat" name="category_id" required defaultValue={categories[0]?.id ?? ''}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Fld>
            <Fld label="Price (CAD)" htmlFor="new-price" name="price" hint="Blank = no price yet.">
              <Input id="new-price" name="price" inputMode="decimal" />
            </Fld>
            <Fld label="Price mode" htmlFor="new-mode" name="price_mode">
              <Select id="new-mode" name="price_mode" defaultValue="flat">
                {PRICE_MODES.map((m) => <option key={m} value={m}>{priceModeLabels[m]}</option>)}
              </Select>
            </Fld>
            <Fld label="Status" htmlFor="new-status" name="status">
              <Select id="new-status" name="status" defaultValue="draft">
                {CATALOG_STATUSES.map((m) => <option key={m} value={m}>{catalogStatusLabels[m]}</option>)}
              </Select>
            </Fld>
            <div className="flex items-end sm:col-span-2">
              <Save size="md">Add service</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
