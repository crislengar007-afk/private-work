import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTeam } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDate, formatTime, monctonToday } from '@/lib/time';
import { EmptyState, Notice, PageHeader, StatusBadge, Table, Td, Th } from '@/components/ui';
import { Countdown } from '@/components/ui/client';
import { FilterTabs, sp1, type SearchParams } from '../../_components/bits';
import { parseTstzRange } from '../../_lib/dates';
import { BOOKING_STATUSES, cap, eventLabel } from '../../_lib/labels';

export const metadata: Metadata = { title: 'Bookings' };

const FILTERS = ['upcoming', ...BOOKING_STATUSES, 'all'] as const;
type Filter = (typeof FILTERS)[number];

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireTeam();
  const sp = await searchParams;
  const raw = sp1(sp.status) ?? 'upcoming';
  const filter: Filter = (FILTERS as readonly string[]).includes(raw) ? (raw as Filter) : 'upcoming';
  const today = monctonToday();
  const sb = await createClient();

  let q = sb
    .from('bookings')
    .select('id, title, status, event_type, event_date, period, hold_expires_at, venue_name, cancel_reason, client:clients(full_name)')
    .limit(300);
  if (filter === 'upcoming') q = q.in('status', ['held', 'confirmed']).gte('event_date', today).order('event_date');
  else if (filter === 'held' || filter === 'confirmed') q = q.eq('status', filter).order('event_date');
  else if (filter === 'completed' || filter === 'cancelled') q = q.eq('status', filter).order('event_date', { ascending: false });
  else q = q.order('event_date', { ascending: false });
  const { data, error } = await q;
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Bookings" description="Held dates are waiting on a deposit; confirmed dates are locked in." />
      <FilterTabs
        label="Filter bookings"
        current={filter}
        items={FILTERS.map((f) => ({ value: f, label: cap(f), href: f === 'upcoming' ? '/admin/bookings' : `/admin/bookings?status=${f}` }))}
      />
      {error && <Notice tone="bad" className="mb-4">Could not load bookings: {error.message}</Notice>}
      {rows.length === 0 ? (
        <EmptyState>No bookings here.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Event</Th>
              <Th className="hidden sm:table-cell">Client</Th>
              <Th>Status</Th>
              <Th className="hidden md:table-cell">Venue</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const r = parseTstzRange(b.period);
              return (
                <tr key={b.id} className="hover:bg-blush-soft/40">
                  <Td className="whitespace-nowrap">
                    {formatShortDate(b.event_date)}
                    {r && <div className="text-xs text-ink-soft">{formatTime(r.start)}–{formatTime(r.end)}</div>}
                  </Td>
                  <Td>
                    <Link href={`/admin/bookings/${b.id}`} className="font-medium text-rose-deep underline">{b.title}</Link>
                    <div className="text-xs text-ink-soft">{eventLabel(b.event_type)}</div>
                  </Td>
                  <Td className="hidden sm:table-cell">{(b.client as { full_name: string } | null)?.full_name ?? '—'}</Td>
                  <Td>
                    <StatusBadge status={b.status} />
                    {b.status === 'held' && b.hold_expires_at && (
                      <div className="mt-1 text-xs">
                        <Countdown to={b.hold_expires_at} />
                      </div>
                    )}
                    {b.status === 'cancelled' && b.cancel_reason && <div className="mt-1 text-xs text-ink-soft">{cap(b.cancel_reason)}</div>}
                  </Td>
                  <Td className="hidden md:table-cell">{b.venue_name ?? '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
