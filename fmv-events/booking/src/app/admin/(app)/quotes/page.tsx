import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDate, monctonToday } from '@/lib/time';
import { Badge, EmptyState, Money, Notice, PageHeader, StatusBadge, Table, Td, Th } from '@/components/ui';
import { FilterTabs, sp1, type SearchParams } from '../../_components/bits';
import { QUOTE_STATUSES, cap, eventLabel } from '../../_lib/labels';

export const metadata: Metadata = { title: 'Quotes' };

type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export default async function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  const sp = await searchParams;
  const raw = sp1(sp.status);
  const status = (QUOTE_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as QuoteStatus) : 'all';
  const sb = await createClient();

  let q = sb
    .from('quotes')
    .select('id, number, status, total_cents, deposit_cents, valid_until, created_at, sent_at, accepted_at, client:clients(full_name), inquiry:inquiries(id, event_type, event_date)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  const rows = data ?? [];
  const today = monctonToday();

  return (
    <>
      <PageHeader title="Quotes" description="Create a quote from an inquiry, then edit, preview and send it here." />
      <FilterTabs
        label="Filter quotes by status"
        current={status}
        items={[
          { value: 'all', label: 'All', href: '/admin/quotes' },
          ...QUOTE_STATUSES.map((s) => ({ value: s, label: cap(s), href: `/admin/quotes?status=${s}` })),
        ]}
      />
      {error && <Notice tone="bad" className="mb-4">Could not load quotes: {error.message}</Notice>}
      {rows.length === 0 ? (
        <EmptyState>No quotes{status !== 'all' ? ` with status “${status}”` : ''} yet. Start one from an inquiry.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Quote</Th>
              <Th>Client</Th>
              <Th className="hidden md:table-cell">Event</Th>
              <Th>Status</Th>
              <Th className="text-right">Total</Th>
              <Th className="hidden lg:table-cell">Valid until</Th>
              <Th className="hidden lg:table-cell">Created</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const client = r.client as { full_name: string } | null;
              const inq = r.inquiry as { id: string; event_type: string; event_date: string } | null;
              const lapsed = r.status === 'sent' && r.valid_until !== null && r.valid_until < today;
              return (
                <tr key={r.id} className="hover:bg-blush-soft/40">
                  <Td>
                    <Link href={`/admin/quotes/${r.id}`} className="font-medium text-rose-deep underline">{r.number ?? 'Draft'}</Link>
                  </Td>
                  <Td>{client?.full_name ?? '—'}</Td>
                  <Td className="hidden md:table-cell">
                    {inq ? (
                      <Link href={`/admin/inquiries/${inq.id}`} className="hover:text-rose-deep">
                        {eventLabel(inq.event_type)} · {formatShortDate(inq.event_date)}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                    {lapsed && <Badge tone="bad" className="ml-1">past validity</Badge>}
                  </Td>
                  <Td className="text-right"><Money cents={r.total_cents} /></Td>
                  <Td className="hidden lg:table-cell">{r.valid_until ? formatShortDate(r.valid_until) : '—'}</Td>
                  <Td className="hidden lg:table-cell">{formatShortDate(r.created_at)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
