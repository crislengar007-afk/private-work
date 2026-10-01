import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeam } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatDateTime, formatShortDate, formatTime } from '@/lib/time';
import { formatPhone, telHref } from '@/lib/phone';
import { ButtonLink, EmptyState, Input, Label, Money, Notice, PageHeader, StatusBadge, Table, Td, Textarea, Th } from '@/components/ui';
import { Countdown } from '@/components/ui/client';
import { DefList, Section } from '../../../_components/bits';
import { ActionForm, FieldError, FormButton } from '../../../_components/action-form';
import { addTask, cancelBooking, removeTask, toggleTask, updateBookingDetails } from '../../../_lib/booking-actions';
import { parseTstzRange } from '../../../_lib/dates';
import { cap, eventLabel, invoiceKindLabels } from '../../../_lib/labels';

export const metadata: Metadata = { title: 'Booking' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireTeam();
  const isOwner = session.role === 'owner';
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sb = await createClient();

  const [{ data: b }, { data: tasks }, { data: reservations }, { data: roles }] = await Promise.all([
    sb.from('bookings')
      .select(`id, quote_id, title, status, event_type, event_date, period, hold_expires_at, venue_name, venue_address,
        gallery_url, internal_notes, cancel_reason, created_at,
        client:clients(full_name, email, phone_e164), zone:service_zones(name)`)
      .eq('id', id)
      .maybeSingle(),
    sb.from('booking_tasks').select('id, label, done, done_by, done_at, sort').eq('booking_id', id).order('sort'),
    sb.from('inventory_reservations').select('id, unit_no, period, active, item:inventory_items(name, kind)').eq('booking_id', id),
    sb.from('user_roles').select('user_id, display_name, role'),
  ]);
  if (!b) notFound();

  const { data: invoices } = isOwner
    ? await sb.from('invoices').select('id, number, kind, status, amount_cents, due_at, etransfer_reference, public_token, payments(amount_cents, received_at, method)').eq('booking_id', id).order('created_at')
    : { data: null };

  const client = b.client as { full_name: string; email: string; phone_e164: string | null } | null;
  const zone = b.zone as { name: string } | null;
  const period = parseTstzRange(b.period);
  const who = (uid: string | null) => {
    if (!uid) return null;
    if (uid === session.userId) return 'you';
    const r = (roles ?? []).find((x) => x.user_id === uid);
    return r?.display_name || (r ? r.role : 'a team member');
  };
  const open = b.status === 'held' || b.status === 'confirmed';
  const sortedRes = [...(reservations ?? [])].sort((x, y) => {
    const a = (x.item as { name: string } | null)?.name ?? '';
    const c = (y.item as { name: string } | null)?.name ?? '';
    return a.localeCompare(c) || x.unit_no - y.unit_no;
  });

  return (
    <>
      <PageHeader
        title={b.title}
        description={
          <>
            {client?.full_name ?? 'Client'} · {formatDate(b.event_date)} <StatusBadge status={b.status} className="ml-1 align-middle" />
          </>
        }
        actions={
          <>
            {isOwner && <ButtonLink href={`/admin/quotes/${b.quote_id}`} variant="secondary" size="sm">Quote</ButtonLink>}
            <ButtonLink href={`/admin/calendar?view=day&date=${b.event_date}`} variant="secondary" size="sm">Calendar</ButtonLink>
            <ButtonLink href="/admin/bookings" variant="secondary" size="sm">All bookings</ButtonLink>
          </>
        }
      />

      {b.status === 'held' && b.hold_expires_at && (
        <Notice tone="warn" className="mb-6" title="Held, waiting on the deposit">
          The hold expires {formatDateTime(b.hold_expires_at)} (<Countdown to={b.hold_expires_at} />). Recording the deposit confirms the booking.
        </Notice>
      )}
      {b.status === 'cancelled' && (
        <Notice tone="bad" className="mb-6" title="Cancelled">
          {b.cancel_reason ? cap(b.cancel_reason) : 'This booking was cancelled.'} Its inventory has been released.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Event">
            <DefList
              items={[
                ['Event', eventLabel(b.event_type)],
                ['Date', formatDate(b.event_date)],
                ['Time', period ? `${formatTime(period.start)} – ${formatTime(period.end)}` : null],
                ['Venue', [b.venue_name, b.venue_address].filter(Boolean).join(', ')],
                ['Zone', zone?.name],
                ['Gallery', b.gallery_url ? <a key="g" href={b.gallery_url} target="_blank" rel="noreferrer" className="text-rose-deep underline">{b.gallery_url}</a> : null],
                ['Internal notes', b.internal_notes ? <span key="n" className="whitespace-pre-wrap">{b.internal_notes}</span> : null],
                ['Booked', formatDateTime(b.created_at)],
              ]}
            />
          </Section>

          <Section title="Checklist">
            {(tasks ?? []).length === 0 ? (
              <EmptyState>No checklist items.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {(tasks ?? []).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <ActionForm action={toggleTask} className="flex min-w-0 flex-1 flex-wrap items-center gap-3" statusClassName="basis-full empty:hidden">
                      <input type="hidden" name="task_id" value={t.id} />
                      <input type="hidden" name="done" value={t.done ? 'false' : 'true'} />
                      <FormButton
                        variant="ghost"
                        pendingText="…"
                        role="checkbox"
                        aria-checked={t.done}
                        aria-label={t.label}
                        className={`h-7 w-7 shrink-0 rounded-md border px-0 ${t.done ? 'border-ok bg-ok-soft text-ok' : 'border-ink/30 bg-white'}`}
                      >
                        {t.done ? '✓' : ''}
                      </FormButton>
                      <span className={`min-w-0 ${t.done ? 'text-ink-soft line-through' : ''}`}>
                        {t.label}
                        {t.done && t.done_at && (
                          <span className="block text-xs no-underline">Done {formatDateTime(t.done_at)}{who(t.done_by) ? ` by ${who(t.done_by)}` : ''}</span>
                        )}
                      </span>
                    </ActionForm>
                    {isOwner && (
                      <ActionForm action={removeTask} confirm={`Remove “${t.label}”?`}>
                        <input type="hidden" name="task_id" value={t.id} />
                        <FormButton variant="ghost" pendingText="…" className="text-xs text-bad" aria-label={`Remove task ${t.label}`}>Remove</FormButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isOwner && (
              <ActionForm action={addTask} resetOnSuccess className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <input type="hidden" name="booking_id" value={b.id} />
                <div className="min-w-0 flex-1">
                  <Label htmlFor="new-task">New task</Label>
                  <Input id="new-task" name="label" maxLength={200} required placeholder="e.g. Confirm arch colours with client" />
                </div>
                <FormButton size="md" variant="secondary" pendingText="Adding…">Add</FormButton>
              </ActionForm>
            )}
          </Section>

          <Section title="Inventory reserved">
            {sortedRes.length === 0 ? (
              <EmptyState>This booking doesn’t reserve any inventory.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr><Th>Item</Th><Th>Unit</Th><Th>Reserved (incl. setup/teardown)</Th><Th>Active</Th></tr>
                </thead>
                <tbody>
                  {sortedRes.map((r) => {
                    const item = r.item as { name: string; kind: string } | null;
                    const p = parseTstzRange(r.period);
                    return (
                      <tr key={r.id}>
                        <Td>{item?.name ?? '—'}</Td>
                        <Td className="tabular-nums">#{r.unit_no}</Td>
                        <Td className="text-xs sm:text-sm">{p ? `${formatDateTime(p.start)} → ${formatTime(p.end)}${formatShortDate(p.end) !== formatShortDate(p.start) ? ` (${formatShortDate(p.end)})` : ''}` : r.period}</Td>
                        <Td>{r.active ? 'Yes' : <span className="text-ink-soft">Released</span>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Client">
            {client ? (
              <DefList
                items={[
                  ['Name', client.full_name],
                  ['Email', <a key="e" href={`mailto:${client.email}`} className="text-rose-deep underline">{client.email}</a>],
                  ['Phone', client.phone_e164 ? <a key="p" href={telHref(client.phone_e164)} className="text-rose-deep underline">{formatPhone(client.phone_e164)}</a> : null],
                ]}
              />
            ) : (
              <EmptyState>Client record missing.</EmptyState>
            )}
          </Section>

          {isOwner && (
            <Section title="Invoices">
              {(invoices ?? []).length === 0 ? (
                <EmptyState>No invoices.</EmptyState>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {(invoices ?? []).map((inv) => {
                    const paid = (inv.payments ?? []).reduce((a, p) => a + Number(p.amount_cents), 0);
                    const unpaid = inv.status === 'unpaid' || inv.status === 'reported';
                    return (
                      <li key={inv.id} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{inv.number} · {invoiceKindLabels[inv.kind]}</span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-xs text-ink-soft">
                          <Money cents={inv.amount_cents} /> · paid <Money cents={paid} /> · due {formatShortDate(inv.due_at)} · ref <span className="font-mono">{inv.etransfer_reference}</span>
                        </p>
                        <p className="mt-1 flex flex-wrap gap-3 text-xs">
                          <a href={`/admin/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className="text-rose-deep underline">PDF</a>
                          <a href={`/pay/${inv.public_token}`} target="_blank" rel="noreferrer" className="text-rose-deep underline">Pay page</a>
                          {unpaid && <Link href={`/admin/payments?ref=${encodeURIComponent(inv.etransfer_reference)}`} className="text-rose-deep underline">Record payment</Link>}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )}

          {isOwner && (
            <Section title="Gallery & notes">
              <ActionForm action={updateBookingDetails} className="space-y-3">
                <input type="hidden" name="booking_id" value={b.id} />
                <div>
                  <Label htmlFor="gallery">Gallery link</Label>
                  <Input id="gallery" name="gallery_url" type="url" inputMode="url" defaultValue={b.gallery_url ?? ''} placeholder="https://…" aria-describedby="gallery-err" />
                  <FieldError name="gallery_url" id="gallery-err" />
                  <p className="mt-1 text-xs text-ink-soft">Sent in the thank-you email after the event and shown in the client portal.</p>
                </div>
                <div>
                  <Label htmlFor="notes">Internal notes</Label>
                  <Textarea id="notes" name="internal_notes" rows={4} maxLength={5000} defaultValue={b.internal_notes ?? ''} />
                  <p className="mt-1 text-xs text-ink-soft">Visible to you and staff, never to the client.</p>
                </div>
                <FormButton>Save</FormButton>
              </ActionForm>
            </Section>
          )}

          {isOwner && b.status !== 'completed' && (
            <Section title="Cancel booking">
              {/* Stays mounted after cancelling so the result message remains visible. */}
              <ActionForm action={cancelBooking} confirm={`Cancel “${b.title}”? This releases the date and voids unpaid invoices. It can’t be undone.`}>
                <input type="hidden" name="booking_id" value={b.id} />
                {open ? (
                  <>
                    <p className="mb-3 text-sm text-ink-soft">Releases the date and inventory and voids unpaid invoices. Paid amounts are not refunded automatically.</p>
                    <FormButton variant="danger" pendingText="Cancelling…">Cancel booking</FormButton>
                  </>
                ) : (
                  <p className="text-sm text-ink-soft">This booking is cancelled.</p>
                )}
              </ActionForm>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
