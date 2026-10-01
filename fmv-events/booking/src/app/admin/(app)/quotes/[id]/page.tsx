import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { centsToDollarString, formatPercentBp } from '@/lib/money';
import { renderMarkdown } from '@/lib/markdown';
import { appUrl } from '@/lib/request';
import { formatDate, formatDateTime, formatShortDate, formatWallTime } from '@/lib/time';
import { ButtonLink, EmptyState, Money, Notice, PageHeader, StatusBadge, Table, Td, Th } from '@/components/ui';
import { CopyButton } from '@/components/ui/client';
import { DefList, Section } from '../../../_components/bits';
import { invoiceKindLabels, eventLabel, lineKindLabels, priceModeLabels } from '../../../_lib/labels';
import { loadTeamCatalog } from '../../../_lib/catalog';
import { QuoteEditor, type CatalogOption, type EditLine } from './quote-editor';

export const metadata: Metadata = { title: 'Quote' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sb = await createClient();

  const [{ data: q }, { data: settings }, { data: booking }] = await Promise.all([
    sb.from('quotes')
      .select(`id, number, status, public_token, valid_until, subtotal_cents, discount_cents, tax_rate_bp, tax_cents, total_cents,
        deposit_pct, deposit_cents, notes_md, sent_at, accepted_at, accepted_name, accepted_ip, created_at, updated_at,
        client:clients(full_name, email),
        inquiry:inquiries(id, event_type, event_date, start_time, end_time, venue_name, status),
        quote_lines(id, kind, ref_id, description, qty, unit_price_cents, line_total_cents, sort)`)
      .eq('id', id)
      .maybeSingle(),
    sb.from('settings').select('tax_enabled, tax_rate_bp').eq('id', 1).single(),
    sb.from('bookings').select('id, title, status, event_date').eq('quote_id', id).maybeSingle(),
  ]);
  if (!q) notFound();

  const client = q.client as { full_name: string; email: string } | null;
  const inq = q.inquiry as { id: string; event_type: string; event_date: string; start_time: string; end_time: string; venue_name: string | null; status: string } | null;
  const lines = [...(q.quote_lines ?? [])].sort((a, b) => a.sort - b.sort);
  const editable = q.status === 'draft' || q.status === 'sent';
  const clientLink = q.status !== 'draft' ? appUrl(`/q/${q.public_token}`) : null;

  const { data: invoices } = booking
    ? await sb.from('invoices').select('id, number, kind, status, amount_cents, due_at, etransfer_reference, public_token, payments(amount_cents)').eq('booking_id', booking.id).order('created_at')
    : { data: null };

  let catalogOptions: CatalogOption[] = [];
  if (editable) {
    const catalog = await loadTeamCatalog(sb);
    if (catalog) {
      const price = (c: number | null) => (c === null ? 'no price' : `$${centsToDollarString(c)}`);
      const flag = (s: string) => (s === 'active' ? '' : ` [${s.replace('_', ' ')}]`);
      catalogOptions = [
        ...catalog.packages.filter((p) => p.status !== 'archived').map((p) => ({
          key: `package:${p.id}`, group: 'Packages', kind: 'package', ref_id: p.id,
          label: `${p.name} · ${price(p.price_cents)}${flag(p.status)}`,
          description: p.name, unit_price: centsToDollarString(p.price_cents), qty: '1',
        })),
        ...catalog.services.filter((s) => s.status !== 'archived').map((s) => ({
          key: `service:${s.id}`, group: 'Services', kind: 'service', ref_id: s.id,
          label: `${s.name} · ${price(s.price_cents)}${s.price_mode !== 'flat' ? ` ${priceModeLabels[s.price_mode]}` : ''}${flag(s.status)}`,
          description: s.name, unit_price: centsToDollarString(s.price_cents),
          qty: s.price_mode === 'per_hour' ? String(s.min_hours ?? 1) : '1',
        })),
        ...catalog.addons.filter((a) => a.status !== 'archived').map((a) => ({
          key: `addon:${a.id}`, group: 'Add-ons', kind: 'addon', ref_id: a.id,
          label: `${a.name} · ${price(a.price_cents)}${a.price_mode !== 'flat' ? ` ${priceModeLabels[a.price_mode]}` : ''}${flag(a.status)}`,
          description: a.name, unit_price: centsToDollarString(a.price_cents), qty: '1',
        })),
        ...catalog.zones.map((z) => ({
          key: `travel:${z.id}`, group: 'Travel', kind: 'travel', ref_id: z.id,
          label: `Travel: ${z.name} · ${price(z.travel_fee_cents)}`,
          description: `Travel: ${z.name}`, unit_price: centsToDollarString(z.travel_fee_cents), qty: '1',
        })),
      ];
    }
  }

  const initialLines: EditLine[] = lines.map((l) => ({
    key: l.id,
    kind: l.kind,
    ref_id: l.ref_id,
    description: l.description,
    qty: String(Number(l.qty)),
    unit_price: centsToDollarString(Number(l.unit_price_cents)),
  }));

  return (
    <>
      <PageHeader
        title={q.number ? `Quote ${q.number}` : 'Draft quote'}
        description={
          <>
            {client?.full_name ?? 'Client'}
            {inq && ` · ${eventLabel(inq.event_type)} · ${formatDate(inq.event_date)}, ${formatWallTime(inq.start_time)} – ${formatWallTime(inq.end_time)}`}{' '}
            <StatusBadge status={q.status} className="ml-1 align-middle" />
          </>
        }
        actions={
          <>
            {inq && <ButtonLink href={`/admin/inquiries/${inq.id}`} variant="secondary" size="sm">Inquiry</ButtonLink>}
            <ButtonLink href="/admin/quotes" variant="secondary" size="sm">All quotes</ButtonLink>
          </>
        }
      />

      {clientLink && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <span className="font-medium">Client link</span>
          <code className="min-w-0 flex-1 truncate rounded bg-cream-deep px-2 py-1 text-xs">{clientLink}</code>
          <CopyButton value={clientLink} label="Copy link" />
          {q.sent_at && <span className="text-xs text-ink-soft">Sent {formatDateTime(q.sent_at)}</span>}
        </div>
      )}

      {editable ? (
        <QuoteEditor
          quoteId={q.id}
          status={q.status as 'draft' | 'sent'}
          taxEnabled={settings?.tax_enabled ?? false}
          taxRateBp={settings?.tax_rate_bp ?? 0}
          catalog={catalogOptions}
          initial={{
            lines: initialLines,
            discount: q.discount_cents > 0 ? centsToDollarString(Number(q.discount_cents)) : '',
            valid_until: q.valid_until ?? '',
            deposit_pct: String(q.deposit_pct),
            notes_md: q.notes_md ?? '',
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Section title="Lines" actions={<a href={`/admin/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer" className="text-sm text-rose-deep underline">PDF</a>}>
              <Table>
                <thead>
                  <tr><Th>Description</Th><Th className="hidden sm:table-cell">Kind</Th><Th className="text-right">Qty</Th><Th className="text-right">Unit</Th><Th className="text-right">Total</Th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.description}</Td>
                      <Td className="hidden sm:table-cell">{lineKindLabels[l.kind]}</Td>
                      <Td className="text-right tabular-nums">{Number(l.qty)}</Td>
                      <Td className="text-right"><Money cents={Number(l.unit_price_cents)} /></Td>
                      <Td className="text-right"><Money cents={Number(l.line_total_cents)} /></Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><Td colSpan={4} className="text-right">Subtotal</Td><Td className="text-right"><Money cents={q.subtotal_cents} /></Td></tr>
                  {q.discount_cents > 0 && <tr><Td colSpan={4} className="text-right">Discount</Td><Td className="text-right">−<Money cents={q.discount_cents} /></Td></tr>}
                  {q.tax_cents > 0 && <tr><Td colSpan={4} className="text-right">HST ({formatPercentBp(q.tax_rate_bp)})</Td><Td className="text-right"><Money cents={q.tax_cents} /></Td></tr>}
                  <tr><Td colSpan={4} className="text-right font-semibold">Total</Td><Td className="text-right font-semibold"><Money cents={q.total_cents} /></Td></tr>
                  <tr><Td colSpan={4} className="text-right">Deposit ({q.deposit_pct}%)</Td><Td className="text-right"><Money cents={q.deposit_cents} /></Td></tr>
                </tfoot>
              </Table>
              {q.notes_md && <div className="prose-fmv mt-4 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(q.notes_md) }} />}
            </Section>
          </div>
          <div className="space-y-6">
            <Section title="Status">
              <DefList
                items={[
                  ['Status', <StatusBadge key="s" status={q.status} />],
                  ['Created', formatDateTime(q.created_at)],
                  ['Sent', q.sent_at ? formatDateTime(q.sent_at) : null],
                  ['Valid until', q.valid_until ? formatShortDate(q.valid_until) : null],
                  ...(q.accepted_at
                    ? ([
                        ['Accepted', formatDateTime(q.accepted_at)],
                        ['Signed as', q.accepted_name],
                        ['From IP', q.accepted_ip],
                      ] as [string, string | null][])
                    : []),
                ]}
              />
              {q.status === 'expired' && <Notice tone="neutral" className="mt-3">This quote expired. Create a new quote from the inquiry to re-quote.</Notice>}
              {q.status === 'superseded' && <Notice tone="neutral" className="mt-3">Another quote for this inquiry replaced this one.</Notice>}
            </Section>
            <Section title="Booking">
              {booking ? (
                <p className="text-sm">
                  <Link href={`/admin/bookings/${booking.id}`} className="font-medium text-rose-deep underline">{booking.title}</Link>{' '}
                  <StatusBadge status={booking.status} />
                </p>
              ) : (
                <EmptyState>No booking for this quote.</EmptyState>
              )}
              {invoices && invoices.length > 0 && (
                <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
                  {invoices.map((inv) => {
                    const paid = (inv.payments ?? []).reduce((a, p) => a + Number(p.amount_cents), 0);
                    return (
                      <li key={inv.id} className="py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{inv.number} · {invoiceKindLabels[inv.kind]}</span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-xs text-ink-soft">
                          <Money cents={inv.amount_cents} /> · paid <Money cents={paid} /> · ref {inv.etransfer_reference} · due {formatShortDate(inv.due_at)}
                        </p>
                        <p className="mt-1 flex gap-3 text-xs">
                          <a href={`/admin/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className="text-rose-deep underline">PDF</a>
                          <Link href={`/pay/${inv.public_token}`} target="_blank" className="text-rose-deep underline">Pay page</Link>
                          {inv.status !== 'paid' && inv.status !== 'void' && (
                            <Link href={`/admin/payments?ref=${encodeURIComponent(inv.etransfer_reference)}`} className="text-rose-deep underline">Record payment</Link>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
