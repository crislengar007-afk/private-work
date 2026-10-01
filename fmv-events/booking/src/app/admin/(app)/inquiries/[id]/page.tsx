import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { computeTotals } from '@/lib/money';
import { formatDate, formatDateTime, formatShortDate, formatWallTime } from '@/lib/time';
import { formatPhone, telHref, whatsappHref } from '@/lib/phone';
import { Badge, ButtonLink, EmptyState, Money, Notice, PageHeader, Select, StatusBadge, Table, Td, Th } from '@/components/ui';
import { DefList, Section } from '../../../_components/bits';
import { ActionForm, FormButton } from '../../../_components/action-form';
import { createQuoteFromInquiry, setInquiryStatus } from '../../../_lib/inquiry-actions';
import { buildQuoteLinesFromInquiry, loadTeamCatalog, parseSelection } from '../../../_lib/catalog';
import { INQUIRY_STATUSES, cap, eventLabel, lineKindLabels, priceModeLabels } from '../../../_lib/labels';

export const metadata: Metadata = { title: 'Inquiry' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sb = await createClient();

  const [{ data: inq }, catalog, { data: settings }] = await Promise.all([
    sb.from('inquiries')
      .select(`id, status, event_type, event_date, start_time, end_time, venue_name, venue_address, zone_id, guest_count, theme, notes,
        selection, reference_paths, estimated_total_cents, source, created_at,
        client:clients(id, full_name, email, phone_e164, notes),
        zone:service_zones(name, travel_fee_cents),
        quotes(id, number, status, total_cents, created_at, valid_until)`)
      .eq('id', id)
      .maybeSingle(),
    loadTeamCatalog(sb),
    sb.from('settings').select('tax_enabled, tax_rate_bp, deposit_pct').eq('id', 1).single(),
  ]);
  if (!inq) notFound();

  const client = inq.client as { id: string; full_name: string; email: string; phone_e164: string | null; notes: string | null } | null;
  const zone = inq.zone as { name: string; travel_fee_cents: number | null } | null;
  const quotes = [...(inq.quotes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const draft = quotes.find((q) => q.status === 'draft');
  const selection = parseSelection(inq.selection);

  // Signed links to the client's reference photos (private bucket, 10 minutes).
  const refs = await Promise.all(
    (inq.reference_paths ?? []).map(async (path) => {
      const { data } = await sb.storage.from('references').createSignedUrl(path, 600);
      return { path, url: data?.signedUrl ?? null };
    }),
  );

  const tax = settings ?? { tax_enabled: false, tax_rate_bp: 0, deposit_pct: 50 };
  const lines = catalog ? buildQuoteLinesFromInquiry(selection, inq.zone_id, catalog, tax) : [];
  const totals = computeTotals({
    lineTotalsCents: lines.map((l) => l.line_total_cents),
    taxEnabled: tax.tax_enabled,
    taxRateBp: tax.tax_rate_bp,
    depositPct: tax.deposit_pct,
  });

  const pkg = selection.package_id ? catalog?.packages.find((p) => p.id === selection.package_id) : undefined;
  const statusOf = (kind: string, refId: string | null): string | null => {
    if (!catalog || !refId) return null;
    const row =
      kind === 'package' ? catalog.packages.find((p) => p.id === refId)
      : kind === 'service' ? catalog.services.find((s) => s.id === refId)
      : kind === 'addon' ? catalog.addons.find((a) => a.id === refId)
      : null;
    return row && row.status !== 'active' ? row.status : null;
  };
  const modeOf = (kind: string, refId: string | null): string | null => {
    if (!catalog || !refId) return null;
    const row = kind === 'service' ? catalog.services.find((s) => s.id === refId) : kind === 'addon' ? catalog.addons.find((a) => a.id === refId) : null;
    return row ? priceModeLabels[row.price_mode] : null;
  };
  const missing = [
    ...(selection.package_id && !pkg ? ['a package'] : []),
    ...selection.service_ids.filter((sid) => !catalog?.services.some((s) => s.id === sid)).map(() => 'a service'),
    ...selection.addon_ids.filter((aid) => !catalog?.addons.some((a) => a.id === aid)).map(() => 'an add-on'),
  ];

  return (
    <>
      <PageHeader
        title={client?.full_name ?? 'Inquiry'}
        description={
          <>
            {eventLabel(inq.event_type)} · {formatDate(inq.event_date)} · received {formatDateTime(inq.created_at)}{' '}
            <StatusBadge status={inq.status} className="ml-1 align-middle" />
          </>
        }
        actions={<ButtonLink href="/admin/inquiries" variant="secondary" size="sm">Back to pipeline</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Event">
            <DefList
              items={[
                ['Event', eventLabel(inq.event_type)],
                ['Date', formatDate(inq.event_date)],
                ['Time', `${formatWallTime(inq.start_time)} – ${formatWallTime(inq.end_time)}`],
                ['Venue', [inq.venue_name, inq.venue_address].filter(Boolean).join(', ')],
                ['Zone', zone ? `${zone.name}${zone.travel_fee_cents === null ? ' (travel fee not set)' : ''}` : null],
                ['Guests', inq.guest_count ?? null],
                ['Theme', inq.theme],
                ['Notes', inq.notes ? <span className="whitespace-pre-wrap">{inq.notes}</span> : null],
                ['Source', inq.source],
              ]}
            />
          </Section>

          <Section title="What they picked">
            {pkg && (
              <p className="mb-3 text-sm">
                Package <strong>{pkg.name}</strong>
                {pkg.items.length > 0 && (
                  <span className="text-ink-soft">
                    {' '}includes{' '}
                    {pkg.items
                      .map((i) => {
                        const s = catalog?.services.find((x) => x.id === i.service_id);
                        return `${s?.name ?? 'unknown service'}${i.qty !== 1 ? ` ×${i.qty}` : ''}`;
                      })
                      .join(', ')}
                  </span>
                )}
              </p>
            )}
            {!catalog && <Notice tone="bad" className="mb-3">Could not load the catalog.</Notice>}
            {lines.length === 0 ? (
              <EmptyState>No items selected.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th className="hidden sm:table-cell">Type</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const st = statusOf(l.kind, l.ref_id);
                    const mode = modeOf(l.kind, l.ref_id);
                    return (
                      <tr key={i}>
                        <Td>
                          {l.description}
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {l.unit_price_cents === 0 && <Badge tone="warn">no price yet</Badge>}
                            {st && <StatusBadge status={st} />}
                            {mode === 'from' && <Badge tone="gold">from price</Badge>}
                          </div>
                        </Td>
                        <Td className="hidden sm:table-cell">{lineKindLabels[l.kind]}{mode && mode !== 'flat' ? ` · ${mode}` : ''}</Td>
                        <Td className="text-right tabular-nums">{l.qty}</Td>
                        <Td className="text-right"><Money cents={l.unit_price_cents} /></Td>
                        <Td className="text-right"><Money cents={l.line_total_cents} /></Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {totals.taxCents > 0 && (
                    <tr>
                      <Td colSpan={4} className="text-right text-ink-soft">HST</Td>
                      <Td className="text-right"><Money cents={totals.taxCents} /></Td>
                    </tr>
                  )}
                  <tr>
                    <Td colSpan={4} className="text-right font-semibold">Estimate at today’s prices</Td>
                    <Td className="text-right font-semibold"><Money cents={totals.totalCents} /></Td>
                  </tr>
                  <tr>
                    <Td colSpan={4} className="text-right text-ink-soft">Estimate the client saw</Td>
                    <Td className="text-right text-ink-soft"><Money cents={inq.estimated_total_cents} /></Td>
                  </tr>
                </tfoot>
              </Table>
            )}
            {missing.length > 0 && (
              <Notice tone="warn" className="mt-3">
                The selection includes {missing.join(', ')} that is no longer in the catalog.
              </Notice>
            )}
          </Section>

          <Section title="Reference photos">
            {refs.length === 0 ? (
              <EmptyState>No reference photos uploaded.</EmptyState>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {refs.map((r, i) => (
                  <li key={r.path}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from the private bucket */}
                        <img src={r.url} alt={`Reference photo ${i + 1} from the client`} className="aspect-square w-full object-cover" loading="lazy" />
                      </a>
                    ) : (
                      <p className="rounded-xl border border-dashed border-line p-3 text-xs text-ink-soft">Photo unavailable</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {refs.length > 0 && <p className="mt-2 text-xs text-ink-soft">Links expire after 10 minutes. Reload the page for fresh ones.</p>}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Quote">
            <ActionForm action={createQuoteFromInquiry} className="space-y-2">
              <input type="hidden" name="inquiry_id" value={inq.id} />
              <FormButton size="md" className="w-full" pendingText="Creating quote…">Create quote</FormButton>
              <p className="text-xs text-ink-soft">Starts a draft with these lines, today’s tax and deposit settings, and the default validity.</p>
            </ActionForm>
            {draft && (
              <p className="mt-3 text-sm">
                A draft already exists: <Link href={`/admin/quotes/${draft.id}`} className="text-rose-deep underline">continue editing it</Link>.
              </p>
            )}
            {quotes.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {quotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/admin/quotes/${q.id}`} className="text-ink hover:text-rose-deep">
                      {q.number ?? 'Draft'} <span className="text-xs text-ink-soft">· {formatShortDate(q.created_at)}</span>
                    </Link>
                    <span className="flex items-center gap-2">
                      <Money cents={q.total_cents} />
                      <StatusBadge status={q.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Client">
            {client ? (
              <DefList
                items={[
                  ['Name', client.full_name],
                  ['Email', <a key="e" href={`mailto:${client.email}`} className="text-rose-deep underline">{client.email}</a>],
                  [
                    'Phone',
                    client.phone_e164 ? (
                      <span key="p" className="flex flex-wrap gap-3">
                        <a href={telHref(client.phone_e164)} className="text-rose-deep underline">{formatPhone(client.phone_e164)}</a>
                        <a href={whatsappHref(client.phone_e164)} target="_blank" rel="noreferrer" className="text-rose-deep underline">WhatsApp</a>
                      </span>
                    ) : null,
                  ],
                  ['Notes', client.notes],
                ]}
              />
            ) : (
              <EmptyState>Client record missing.</EmptyState>
            )}
          </Section>

          <Section title="Status">
            <ActionForm action={setInquiryStatus} className="flex items-center gap-2">
              <input type="hidden" name="inquiry_id" value={inq.id} />
              <label htmlFor="inq-status" className="sr-only">Status</label>
              <Select id="inq-status" name="status" defaultValue={inq.status}>
                {INQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>{cap(s)}</option>
                ))}
              </Select>
              <FormButton variant="secondary">Update</FormButton>
            </ActionForm>
          </Section>
        </div>
      </div>
    </>
  );
}
