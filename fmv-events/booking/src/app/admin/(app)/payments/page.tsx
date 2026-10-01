import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { centsToDollarString } from '@/lib/money';
import { formatDateTime, formatShortDate, monctonToday } from '@/lib/time';
import { Button, EmptyState, Input, Label, Money, Notice, PageHeader, Select, StatusBadge, Table, Td, Textarea, Th } from '@/components/ui';
import { DefList, Section, sp1, type SearchParams } from '../../_components/bits';
import { ActionForm, FieldError, FormButton } from '../../_components/action-form';
import { recordPaymentAction } from '../../_lib/payment-actions';
import { monthLabel, monthOf, monthRangeUtc } from '../../_lib/dates';
import { invoiceKindLabels, paymentMethodLabels } from '../../_lib/labels';

export const metadata: Metadata = { title: 'Payments' };

const paidOf = (p: { amount_cents: number }[] | null | undefined) => (p ?? []).reduce((a, x) => a + Number(x.amount_cents), 0);

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  const sp = await searchParams;
  const rawRef = (sp1(sp.ref) ?? '').trim();
  // References look like FMV0042; anything else can't match, and stripping keeps ILIKE wildcards out.
  const ref = rawRef.replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
  const sb = await createClient();
  const today = monctonToday();
  const month = monthOf(today);
  const { start, end } = monthRangeUtc(month);

  const invoiceSelect = `id, number, kind, status, amount_cents, tax_cents, due_at, etransfer_reference, reported_at,
    client:clients(full_name, email), payments(amount_cents, received_at, method),
    booking:bookings(id, title, event_date, status),
    mini:mini_bookings(id, status, slot:mini_slots(starts_at, campaign:mini_campaigns(name)))`;

  const [found, reportedRes, ledgerRes, monthRes] = await Promise.all([
    ref ? sb.from('invoices').select(invoiceSelect).ilike('etransfer_reference', ref).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
    sb.from('invoices')
      .select('id, number, kind, amount_cents, etransfer_reference, reported_at, client:clients(full_name), payments(amount_cents)')
      .eq('status', 'reported')
      .order('reported_at')
      .limit(100),
    sb.from('payments')
      .select('id, method, amount_cents, received_at, note, created_at, invoice:invoices(id, number, kind, etransfer_reference, client:clients(full_name))')
      .order('received_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    sb.from('payments').select('amount_cents, method').gte('received_at', start.toISOString()).lt('received_at', end.toISOString()),
  ]);

  const inv = found.data;
  const reported = reportedRes.data ?? [];
  const ledger = ledgerRes.data ?? [];
  const monthRows = monthRes.data ?? [];
  const monthTotal = monthRows.reduce((a, p) => a + Number(p.amount_cents), 0);
  const byMethod = Object.entries(
    monthRows.reduce<Record<string, number>>((acc, p) => {
      acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount_cents);
      return acc;
    }, {}),
  );

  const invPaid = inv ? paidOf(inv.payments) : 0;
  const invDue = inv ? Math.max(Number(inv.amount_cents) - invPaid, 0) : 0;
  const invClient = inv?.client as { full_name: string; email: string } | null | undefined;
  const invBooking = inv?.booking as { id: string; title: string; event_date: string; status: string } | null | undefined;
  const invMini = inv?.mini as { id: string; status: string; slot: { starts_at: string; campaign: { name: string } | null } | null } | null | undefined;

  return (
    <>
      <PageHeader title="Payments" description="Check the e-Transfer in your bank, then record it here. Recording the deposit confirms the booking." />

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Section title="Record a payment" className="lg:col-span-3">
          <form method="get" action="/admin/payments" className="mb-4 flex flex-wrap items-end gap-2" role="search">
            <div className="min-w-0 flex-1">
              <Label htmlFor="ref">Reference code</Label>
              <Input id="ref" name="ref" defaultValue={rawRef} placeholder="FMV0042" autoComplete="off" className="font-mono uppercase" />
            </div>
            <Button type="submit" variant="secondary">Find invoice</Button>
          </form>

          {ref && !inv && <Notice tone="warn">No invoice has the reference “{ref.toUpperCase()}”. Check the e-Transfer message for the code.</Notice>}

          {inv && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-cream p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-xl font-semibold">{inv.number} · {invoiceKindLabels[inv.kind]}</p>
                  <StatusBadge status={inv.status} />
                </div>
                <DefList
                  items={[
                    ['Reference', <span key="r" className="font-mono">{inv.etransfer_reference}</span>],
                    ['Client', invClient ? `${invClient.full_name} (${invClient.email})` : null],
                    [
                      'For',
                      invBooking ? (
                        <Link key="b" href={`/admin/bookings/${invBooking.id}`} className="text-rose-deep underline">{invBooking.title}</Link>
                      ) : invMini?.slot ? (
                        `${invMini.slot.campaign?.name ?? 'Mini session'} · ${formatDateTime(invMini.slot.starts_at)}`
                      ) : null,
                    ],
                    ['Invoice amount', <Money key="a" cents={inv.amount_cents} />],
                    ['Paid so far', <Money key="p" cents={invPaid} />],
                    ['Amount due', <Money key="d" cents={invDue} className="font-semibold text-rose-deep" />],
                    ['Due', formatDateTime(inv.due_at)],
                    ['Client reported sending', inv.reported_at ? formatDateTime(inv.reported_at) : null],
                  ]}
                />
              </div>

              {inv.status === 'void' ? (
                <Notice tone="bad">This invoice is void (the hold may have expired), so a payment can’t be recorded against it. Create a fresh quote for the client.</Notice>
              ) : (
                // Stays mounted when the invoice flips to paid, so the result message remains visible.
                <ActionForm action={recordPaymentAction} className="space-y-4" aria-label={`Record payment for ${inv.number}`}>
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  {inv.status === 'paid' ? (
                    <Notice tone="ok">This invoice is paid in full.</Notice>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <Label htmlFor="pay-method">Method</Label>
                          <Select id="pay-method" name="method" defaultValue="etransfer">
                            {Object.entries(paymentMethodLabels).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="pay-amount">Amount received ($)</Label>
                          <Input key={invDue} id="pay-amount" name="amount" inputMode="decimal" required defaultValue={centsToDollarString(invDue)} aria-describedby="pay-amount-err" />
                          <FieldError name="amount" id="pay-amount-err" />
                        </div>
                        <div>
                          <Label htmlFor="pay-date">Date received</Label>
                          <Input id="pay-date" name="received_on" type="date" required defaultValue={today} max={today} aria-describedby="pay-date-err" />
                          <FieldError name="received_on" id="pay-date-err" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="pay-note">Note (optional)</Label>
                        <Textarea id="pay-note" name="note" rows={2} maxLength={500} placeholder="e.g. e-Transfer from J. Smith, message FMV0042" />
                      </div>
                      <FormButton size="md" pendingText="Recording…">Record payment</FormButton>
                    </>
                  )}
                </ActionForm>
              )}
            </div>
          )}
          {!ref && <p className="text-sm text-ink-soft">Search by the reference code from the e-Transfer message, or pick one from the reported list.</p>}
        </Section>

        <Section title="Reported, to check" className="lg:col-span-2">
          {reported.length === 0 ? (
            <EmptyState>No payments waiting to be checked.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {reported.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/admin/payments?ref=${encodeURIComponent(r.etransfer_reference)}`} className="font-mono font-semibold text-rose-deep underline">
                      {r.etransfer_reference}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      {(r.client as { full_name: string } | null)?.full_name ?? '—'} · {invoiceKindLabels[r.kind]} · {r.reported_at ? formatDateTime(r.reported_at) : ''}
                    </p>
                  </div>
                  <Money cents={Number(r.amount_cents) - paidOf(r.payments)} className="text-sm font-semibold" />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Ledger"
        actions={
          <p className="text-sm text-ink-soft">
            {monthLabel(month)}: <Money cents={monthTotal} className="font-semibold text-ink" />
            {byMethod.length > 1 && (
              <span>
                {' '}({byMethod.map(([m, c], i) => (
                  <span key={m}>{i > 0 && ', '}{paymentMethodLabels[m] ?? m} <Money cents={c} /></span>
                ))})
              </span>
            )}
          </p>
        }
      >
        {ledgerRes.error && <Notice tone="bad" className="mb-3">Could not load payments: {ledgerRes.error.message}</Notice>}
        {ledger.length === 0 ? (
          <EmptyState>No payments recorded yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Received</Th>
                <Th>Client</Th>
                <Th>Invoice</Th>
                <Th className="hidden sm:table-cell">Method</Th>
                <Th className="text-right">Amount</Th>
                <Th className="hidden md:table-cell">Note</Th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((p) => {
                const pi = p.invoice as { id: string; number: string; kind: string; etransfer_reference: string; client: { full_name: string } | null } | null;
                return (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap">{formatShortDate(p.received_at)}</Td>
                    <Td>{pi?.client?.full_name ?? '—'}</Td>
                    <Td>
                      {pi ? (
                        <Link href={`/admin/payments?ref=${encodeURIComponent(pi.etransfer_reference)}`} className="hover:text-rose-deep">
                          {pi.number} <span className="text-xs text-ink-soft">· {invoiceKindLabels[pi.kind]} · {pi.etransfer_reference}</span>
                        </Link>
                      ) : '—'}
                    </Td>
                    <Td className="hidden sm:table-cell">{paymentMethodLabels[p.method] ?? p.method}</Td>
                    <Td className="text-right"><Money cents={p.amount_cents} /></Td>
                    <Td className="hidden max-w-xs truncate md:table-cell" title={p.note ?? undefined}>{p.note}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
