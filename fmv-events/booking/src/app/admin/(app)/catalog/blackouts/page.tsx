import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, monctonToday } from '@/lib/time';
import { Card, EmptyState, Input, Notice, Table, Td, Th } from '@/components/ui';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { addBlackout, removeBlackout } from './actions';

export const metadata: Metadata = { title: 'Blackout dates · Catalog' };

export default async function BlackoutsPage() {
  await requireOwner();
  const sb = await createClient();
  const today = monctonToday();
  const { data, error } = await sb.from('blackout_dates').select('*').order('date');
  const rows = data ?? [];
  const upcoming = rows.filter((r) => r.date >= today);
  const past = rows.filter((r) => r.date < today).reverse().slice(0, 20);

  const list = (items: typeof rows) => (
    <Table>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Reason</Th>
          <Th className="w-28"><span className="sr-only">Actions</span></Th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
            <Td>{r.reason || <span className="text-ink-soft">—</span>}</Td>
            <Td>
              <ActionForm action={removeBlackout.bind(null, r.id)} aria-label={`Remove ${r.date}`}>
                <Save variant="ghost" pendingText="Removing…">Remove</Save>
              </ActionForm>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {error && <Notice tone="bad" title="Blackout dates could not be loaded.">{error.message}</Notice>}
      <p className="text-sm text-ink-soft">Blocked dates show as unavailable in the event builder and the date checker.</p>
      <Card>
        <ActionForm action={addBlackout} resetOnSuccess aria-label="Block a date" className="flex flex-wrap items-end gap-3">
          <Fld label="Date" htmlFor="bo-date" name="date">
            <Input id="bo-date" name="date" type="date" required min={today} />
          </Fld>
          <Fld label="Reason (private)" htmlFor="bo-reason" name="reason" className="min-w-56 flex-1">
            <Input id="bo-reason" name="reason" placeholder="e.g. Family vacation" />
          </Fld>
          <Save size="md">Block date</Save>
        </ActionForm>
      </Card>
      <section aria-labelledby="bo-up">
        <SectionTitle id="bo-up">Upcoming</SectionTitle>
        {upcoming.length ? list(upcoming) : <EmptyState>No upcoming blackout dates.</EmptyState>}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="bo-past">
          <SectionTitle id="bo-past">Recent past</SectionTitle>
          {list(past)}
        </section>
      )}
    </div>
  );
}
