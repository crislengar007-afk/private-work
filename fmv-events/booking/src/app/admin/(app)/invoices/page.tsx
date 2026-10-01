import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatShortDate } from '@/lib/time';
import { Badge, EmptyState, Money, Notice, PageHeader, StatusBadge, Table, Td, Th } from '@/components/ui';
import { FilterTabs, hrefWith, sp1, type SearchParams } from '../../_components/bits';
import { ActionForm, FormButton } from '../../_components/action-form';
import { resendInvoiceEmail, voidInvoice } from '../../_lib/invoice-actions';
import { nowMs } from '../../_lib/dates';
import { INVOICE_KINDS, INVOICE_STATUSES, cap, invoiceKindLabels } from '../../_lib/labels';

export const metadata: Metadata = { title: 'Invoices' };

type InvStatus = (typeof INVOICE_STATUSES)[number];
type InvKind = (typeof INVOICE_KINDS)[number];

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  const sp = await searchParams;
  const rawStatus = sp1(sp.status) ?? 'all';
  const rawKind = sp1(sp.kind) ?? 'all';
  const status = rawStatus === 'open' || (INVOICE_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : 'all';
  const kind = (INVOICE_KINDS as readonly string[]).includes(rawKind) ? (rawKind as InvKind) : 'all';
  const current = { status: status === 'all' ? undefined : status, kind: kind === 'all' ? undefined : kind };

  const sb = await createClient();
  let q = sb
    .from('invoices')
    .select(`id, number, kind, status, amount_cents, tax_cents, due_at, etransfer_reference, public_token, created_at, reported_at, paid_at,
      client:clients(full_name, email), payments(amount_cents),
      booking:bookings(id, title, event_date),
      mini:mini_bookings(id, slot:mini_slots(starts_at, campaign:mini_campaigns(name)))`)
    .order('created_at', { ascending: false })
    .limit(300);
  if (status === 'open') q = q.in('status', ['unpaid', 'reported']);
  else if (status !== 'all') q = q.eq('status', status as InvStatus);
  if (kind !== 'all') q = q.eq('kind', kind);
  const { data, error } = await q;
  const rows = data ?? [];
  const now = nowMs();

  return (
    <>
      <PageHeader title="Invoices" description="Deposit, balance and mini-session invoices. Payments are recorded on the Payments page." />
      <FilterTabs
        label="Filter by status"
        current={status}
        items={[
          { value: 'all', label: 'All', href: hrefWith('/admin/invoices', current, { status: undefined }) },
          { value: 'open', label: 'Open', href: hrefWith('/admin/invoices', current, { status: 'open' }) },
          ...INVOICE_STATUSES.map((s) => ({ value: s, label: cap(s), href: hrefWith('/admin/invoices', current, { status: s }) })),
        ]}
      />
      <FilterTabs
        label="Filter by kind"
        current={kind}
        items={[
          { value: 'all', label: 'All kinds', href: hrefWith('/admin/invoices', current, { kind: undefined }) },
          ...INVOICE_KINDS.map((k) => ({ value: k, label: invoiceKindLabels[k], href: hrefWith('/admin/invoices', current, { kind: k }) })),
        ]}
      />
      {error && <Notice tone="bad" className="mb-4">Could not load invoices: {error.message}</Notice>}

      {rows.length === 0 ? (
        <EmptyState>No invoices match these filters.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Client</Th>
              <Th className="hidden lg:table-cell">For</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Paid</Th>
              <Th className="hidden md:table-cell">Due</Th>
              <Th>Status</Th>
              <Th>Reference</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const client = r.client as { full_name: string; email: string } | null;
              const booking = r.booking as { id: string; title: string; event_date: string } | null;
              const mini = r.mini as { id: string; slot: { starts_at: string; campaign: { name: string } | null } | null } | null;
              const paid = (r.payments ?? []).reduce((a, p) => a + Number(p.amount_cents), 0);
              const open = r.status === 'unpaid' || r.status === 'reported';
              const overdue = open && new Date(r.due_at).getTime() < now;
              return (
                <tr key={r.id} className="align-top">
                  <Td>
                    <span className="font-medium">{r.number}</span>
                    <div className="text-xs text-ink-soft">{invoiceKindLabels[r.kind]}</div>
                  </Td>
                  <Td>{client?.full_name ?? '—'}</Td>
                  <Td className="hidden lg:table-cell">
                    {booking ? (
                      <Link href={`/admin/bookings/${booking.id}`} className="hover:text-rose-deep">{booking.title}</Link>
                    ) : mini?.slot ? (
                      <span>{mini.slot.campaign?.name ?? 'Mini session'} · {formatDateTime(mini.slot.starts_at)}</span>
                    ) : '—'}
                  </Td>
                  <Td className="text-right"><Money cents={r.amount_cents} /></Td>
                  <Td className="text-right"><Money cents={paid} /></Td>
                  <Td className="hidden md:table-cell">
                    {formatShortDate(r.due_at)}
                    {overdue && <Badge tone="bad" className="ml-1">overdue</Badge>}
                  </Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="font-mono text-xs">{r.etransfer_reference}</Td>
                  <Td>
                    <div className="flex min-w-[11rem] flex-col gap-1 text-xs">
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        <a href={`/admin/invoices/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-rose-deep underline">PDF</a>
                        <a href={`/pay/${r.public_token}`} target="_blank" rel="noreferrer" className="text-rose-deep underline">Pay page</a>
                        {open && (
                          <Link href={`/admin/payments?ref=${encodeURIComponent(r.etransfer_reference)}`} className="text-rose-deep underline">Record payment</Link>
                        )}
                      </span>
                      {open && (
                        <span className="flex flex-wrap gap-2">
                          <ActionForm action={resendInvoiceEmail}>
                            <input type="hidden" name="invoice_id" value={r.id} />
                            <FormButton variant="secondary" pendingText="Sending…" className="h-7 px-2 text-xs">Resend email</FormButton>
                          </ActionForm>
                          <ActionForm action={voidInvoice} confirm={`Void invoice ${r.number}? The client will no longer be able to pay it.`}>
                            <input type="hidden" name="invoice_id" value={r.id} />
                            <FormButton variant="ghost" pendingText="Voiding…" className="h-7 px-2 text-xs text-bad">Void</FormButton>
                          </ActionForm>
                        </span>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
