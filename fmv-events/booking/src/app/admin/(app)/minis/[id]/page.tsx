import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { centsToDollarString, formatCAD } from '@/lib/money';
import { formatDate, formatDateTime, formatTime, monctonDateOf, monctonToday } from '@/lib/time';
import { formatPhone, telHref } from '@/lib/phone';
import {
  Badge, ButtonLink, Card, EmptyState, Input, Notice, PageHeader, Select, StatusBadge, Table, Td, Textarea, Th,
} from '@/components/ui';
import { Countdown } from '@/components/ui/client';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { MEDIA_OPTION_COLUMNS, MediaSelect, SectionTitle, type MediaOption } from '@/app/admin/_owner/ui';
import { CAMPAIGN_STATUSES } from '@/app/admin/_owner/labels';
import { deleteOpenSlotsOnDate, deleteSlot, generateCampaignSlots, setMiniBookingStatus, updateCampaign } from '../actions';
import { SlotGeneratorFields } from './slot-generator';

export const metadata: Metadata = { title: 'Mini-session campaign' };

type SlotState = 'open' | 'held' | 'expired_hold' | 'confirmed' | 'no_show' | 'past';

const stateBadge: Record<SlotState, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'rose' }> = {
  open: { label: 'open', tone: 'rose' },
  held: { label: 'held', tone: 'warn' },
  expired_hold: { label: 'hold expired', tone: 'neutral' },
  confirmed: { label: 'confirmed', tone: 'ok' },
  no_show: { label: 'no-show', tone: 'bad' },
  past: { label: 'past, unbooked', tone: 'neutral' },
};

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await createClient();
  const { data: c } = await sb.from('mini_campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();

  const [slotsRes, bookingsRes, mediaRes] = await Promise.all([
    sb.from('mini_slots').select('id, starts_at, ends_at').eq('campaign_id', id).order('starts_at'),
    sb
      .from('mini_bookings')
      .select(
        'id, slot_id, status, hold_expires_at, notes, created_at, client:clients(full_name, email, phone_e164), invoices(number, etransfer_reference, status, amount_cents), slot:mini_slots!inner(campaign_id)',
      )
      .eq('slot.campaign_id', id)
      .order('created_at', { ascending: false }),
    sb.from('media').select(MEDIA_OPTION_COLUMNS).eq('kind', 'photo').eq('is_ai_generated', false).order('created_at', { ascending: false }).limit(500),
  ]);
  const error = slotsRes.error || bookingsRes.error || mediaRes.error;
  const slots = slotsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const mediaOptions = (mediaRes.data ?? []) as MediaOption[];
  const now = new Date();
  const nowIso = now.toISOString();
  const today = monctonToday(now);

  // Current booking per slot: the active one, else the latest no-show / expired hold.
  const bySlot = new Map<string, (typeof bookings)[number]>();
  const rank = (b: (typeof bookings)[number]) =>
    b.status === 'confirmed' ? 4 : b.status === 'held' && b.hold_expires_at && b.hold_expires_at > nowIso ? 3 : b.status === 'no_show' ? 2 : b.status === 'held' ? 1 : 0;
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const cur = bySlot.get(b.slot_id);
    if (!cur || rank(b) > rank(cur)) bySlot.set(b.slot_id, b);
  }
  const cancelledCount = new Map<string, number>();
  for (const b of bookings) if (b.status === 'cancelled') cancelledCount.set(b.slot_id, (cancelledCount.get(b.slot_id) ?? 0) + 1);

  const rows = slots.map((s) => {
    const b = bySlot.get(s.id);
    let state: SlotState;
    if (!b) state = s.starts_at < nowIso ? 'past' : 'open';
    else if (b.status === 'confirmed') state = 'confirmed';
    else if (b.status === 'no_show') state = 'no_show';
    else state = b.hold_expires_at && b.hold_expires_at > nowIso ? 'held' : 'expired_hold';
    return { slot: s, booking: b, state, date: monctonDateOf(s.starts_at), everBooked: bookings.some((x) => x.slot_id === s.id) };
  });
  const counts = { open: 0, held: 0, confirmed: 0 };
  for (const r of rows) {
    if (r.state === 'open') counts.open++;
    if (r.state === 'held') counts.held++;
    if (r.state === 'confirmed') counts.confirmed++;
  }
  const dates = [...new Set(rows.map((r) => r.date))];
  const upcomingDates = dates.filter((d) => d >= today);
  const pastDates = dates.filter((d) => d < today).reverse();

  const renderDate = (date: string) => {
    const dayRows = rows.filter((r) => r.date === date);
    const openHere = dayRows.filter((r) => !r.everBooked).length;
    return (
      <section key={date} aria-labelledby={`d-${date}`} className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id={`d-${date}`} className="mr-auto text-base font-semibold text-ink">
            {formatDate(date)}
            <span className="ml-2 text-xs font-normal text-ink-soft">
              {dayRows.length} slots · {dayRows.filter((r) => r.state === 'confirmed').length} confirmed ·{' '}
              {dayRows.filter((r) => r.state === 'held').length} held · {dayRows.filter((r) => r.state === 'open').length} open
            </span>
          </h3>
          {openHere > 0 && (
            <ActionForm
              action={deleteOpenSlotsOnDate.bind(null, c.id, date)}
              confirm={`Delete all ${openHere} never-booked slots on ${formatDate(date)}?`}
              aria-label={`Delete open slots on ${date}`}
              className="flex flex-wrap items-center gap-2"
            >
              <Save variant="ghost" pendingText="Deleting…" className="text-bad">Delete open slots this day</Save>
            </ActionForm>
          )}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Status</Th>
              <Th>Client</Th>
              <Th>Invoice</Th>
              <Th>Notes</Th>
              <Th><span className="sr-only">Actions</span></Th>
            </tr>
          </thead>
          <tbody>
            {dayRows.map(({ slot, booking: b, state, everBooked }) => {
              const client = b?.client as { full_name: string; email: string; phone_e164: string | null } | null | undefined;
              const inv = (b?.invoices ?? []).find((i) => i.status !== 'void') ?? b?.invoices?.[0];
              const badge = stateBadge[state];
              return (
                <tr key={slot.id}>
                  <Td className="whitespace-nowrap tabular-nums">
                    {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}
                  </Td>
                  <Td>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    {state === 'held' && b?.hold_expires_at && (
                      <span className="mt-1 block text-xs">
                        until {formatDateTime(b.hold_expires_at)} · <Countdown to={b.hold_expires_at} />
                      </span>
                    )}
                    {(cancelledCount.get(slot.id) ?? 0) > 0 && (
                      <span className="mt-1 block text-xs text-ink-soft">{cancelledCount.get(slot.id)} cancelled before</span>
                    )}
                  </Td>
                  <Td>
                    {client ? (
                      <div className="space-y-0.5">
                        <p className="font-medium">{client.full_name}</p>
                        <p className="text-xs"><a href={`mailto:${client.email}`} className="underline">{client.email}</a></p>
                        {client.phone_e164 && (
                          <p className="text-xs"><a href={telHref(client.phone_e164)} className="underline">{formatPhone(client.phone_e164)}</a></p>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </Td>
                  <Td>
                    {inv ? (
                      <div className="space-y-0.5 text-xs">
                        <p className="font-mono">{inv.etransfer_reference}</p>
                        <p>{formatCAD(inv.amount_cents)} <StatusBadge status={inv.status} /></p>
                        {(inv.status === 'unpaid' || inv.status === 'reported') && (state === 'held' || state === 'expired_hold') && (
                          <Link href={`/admin/payments?ref=${encodeURIComponent(inv.etransfer_reference)}`} className="text-rose-deep underline">
                            Record payment
                          </Link>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </Td>
                  <Td className="max-w-56 text-xs">{b?.notes || <span className="text-ink-soft">—</span>}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      {!everBooked && (
                        <ActionForm action={deleteSlot.bind(null, c.id, slot.id)} aria-label="Delete slot">
                          <Save variant="ghost" pendingText="Deleting…">Delete</Save>
                        </ActionForm>
                      )}
                      {b && (b.status === 'held' || b.status === 'confirmed') && (
                        <ActionForm
                          action={setMiniBookingStatus.bind(null, b.id, 'cancelled')}
                          confirm={`Cancel ${client?.full_name ?? 'this'}’s booking and reopen the slot?${b.status === 'confirmed' ? ' Any refund is handled by you, outside the app.' : ''}`}
                          aria-label="Cancel booking"
                        >
                          <Save variant="ghost" pendingText="Cancelling…" className="text-bad">Cancel booking</Save>
                        </ActionForm>
                      )}
                      {b && b.status === 'confirmed' && slot.starts_at < nowIso && (
                        <ActionForm action={setMiniBookingStatus.bind(null, b.id, 'no_show')} aria-label="Mark no-show">
                          <Save variant="ghost" pendingText="Saving…">Mark no-show</Save>
                        </ActionForm>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        description={
          <>
            <Link href="/admin/minis" className="underline">All campaigns</Link> · {c.season || 'No season set'} · {c.duration_min} min ·{' '}
            {c.price_cents === null ? 'no price yet' : formatCAD(c.price_cents)}
          </>
        }
        actions={
          <>
            {c.status === 'live' && (
              <ButtonLink href={`/minis/${c.slug}`} variant="secondary" target="_blank" rel="noopener">
                View booking page
              </ButtonLink>
            )}
            <a href={`/admin/minis/${c.id}/attendees`} className="inline-flex h-10 items-center rounded-full bg-rose-deep px-5 text-sm font-medium text-white hover:bg-ink" download>
              Export attendees (CSV)
            </a>
          </>
        }
      />
      {error && <Notice tone="bad" title="Some data could not be loaded.">{error.message}</Notice>}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Status', <StatusBadge key="s" status={c.status} />],
          ['Open', counts.open],
          ['Held', counts.held],
          ['Confirmed', counts.confirmed],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-line bg-white px-4 py-3">
            <dt className="text-xs text-ink-soft">{k}</dt>
            <dd className="font-display text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      {c.status === 'draft' && (
        <Notice tone="gold">
          This campaign is a <strong>draft</strong>: clients can’t see it yet. Set a price, generate slots, then change the status
          to Live. Closing it stops new bookings but keeps existing ones.
        </Notice>
      )}

      <details className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-sm" open={c.status === 'draft'}>
        <summary className="cursor-pointer font-display text-2xl font-semibold text-ink">Campaign details</summary>
        <ActionForm action={updateCampaign.bind(null, c.id)} aria-label="Campaign details" className="mt-4 grid gap-3 sm:grid-cols-3">
          <Fld label="Name" htmlFor="c-name" name="name" className="sm:col-span-2">
            <Input id="c-name" name="name" required defaultValue={c.name} />
          </Fld>
          <Fld label="Slug" htmlFor="c-slug" name="slug" hint={`Booking link: /minis/${c.slug}`}>
            <Input id="c-slug" name="slug" required defaultValue={c.slug} />
          </Fld>
          <Fld label="Season" htmlFor="c-season" name="season">
            <Input id="c-season" name="season" defaultValue={c.season ?? ''} />
          </Fld>
          <Fld label="Price (CAD)" htmlFor="c-price" name="price" hint="Required before going live.">
            <Input id="c-price" name="price" inputMode="decimal" placeholder="No price" defaultValue={centsToDollarString(c.price_cents)} />
          </Fld>
          <Fld label="Session length (min)" htmlFor="c-dur" name="duration_min" hint="Used for new slots.">
            <Input id="c-dur" name="duration_min" inputMode="numeric" required defaultValue={c.duration_min} />
          </Fld>
          <Fld label="Payment" htmlFor="c-pay" name="payment_mode">
            <Select id="c-pay" name="payment_mode" defaultValue={c.payment_mode}>
              <option value="full">Full payment to confirm</option>
              <option value="deposit">Deposit to confirm</option>
            </Select>
          </Fld>
          <Fld label="Hold hours" htmlFor="c-hold" name="hold_hours" hint="Unpaid spots are released after this.">
            <Input id="c-hold" name="hold_hours" inputMode="numeric" required defaultValue={c.hold_hours} />
          </Fld>
          <Fld label="Status" htmlFor="c-status" name="status">
            <Select id="c-status" name="status" defaultValue={c.status}>
              {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </Fld>
          <Fld label="Location name" htmlFor="c-loc" name="location_name">
            <Input id="c-loc" name="location_name" defaultValue={c.location_name ?? ''} />
          </Fld>
          <Fld label="Location address" htmlFor="c-addr" name="location_address" className="sm:col-span-2">
            <Input id="c-addr" name="location_address" defaultValue={c.location_address ?? ''} />
          </Fld>
          <Fld label="Description (markdown)" htmlFor="c-desc" name="description_md" className="sm:col-span-3">
            <Textarea id="c-desc" name="description_md" rows={5} defaultValue={c.description_md ?? ''} />
          </Fld>
          <Fld label="Cover image" htmlFor="c-cover" name="cover_media_id" className="sm:col-span-2">
            <MediaSelect id="c-cover" media={mediaOptions} defaultValue={c.cover_media_id} />
          </Fld>
          <div className="flex items-end">
            <Save size="md">Save campaign</Save>
          </div>
        </ActionForm>
      </details>

      <Card>
        <h2 className="mb-1 font-display text-2xl font-semibold">Generate slots</h2>
        <p className="mb-4 text-sm text-ink-soft">Pick the session days and the time window; slots are created every interval.</p>
        <ActionForm action={generateCampaignSlots.bind(null, c.id)} aria-label="Generate slots">
          <SlotGeneratorFields durationMin={c.duration_min} minDate={today} />
        </ActionForm>
      </Card>

      <section aria-labelledby="slots" className="space-y-6">
        <SectionTitle id="slots">Slots and bookings</SectionTitle>
        {slots.length === 0 && <EmptyState>No slots yet. Generate some above.</EmptyState>}
        {upcomingDates.map(renderDate)}
        {pastDates.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-rose-deep">Past dates ({pastDates.length})</summary>
            <div className="mt-4 space-y-6">{pastDates.map(renderDate)}</div>
          </details>
        )}
      </section>
    </div>
  );
}
