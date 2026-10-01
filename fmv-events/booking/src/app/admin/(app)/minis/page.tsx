import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatCAD } from '@/lib/money';
import { Card, EmptyState, Input, Notice, PageHeader, Select, StatusBadge, Table, Td, Th } from '@/components/ui';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { createCampaign } from './actions';

export const metadata: Metadata = { title: 'Mini sessions' };

export default async function MinisPage() {
  await requireOwner();
  const sb = await createClient();
  const nowIso = new Date().toISOString();
  const [camps, slots, bookings] = await Promise.all([
    sb.from('mini_campaigns').select('*').order('created_at', { ascending: false }),
    sb.from('mini_slots').select('id, campaign_id, starts_at'),
    sb.from('mini_bookings').select('slot_id, status, hold_expires_at').in('status', ['held', 'confirmed']),
  ]);
  const error = camps.error || slots.error || bookings.error;
  const active = new Map<string, string>();
  for (const b of bookings.data ?? []) {
    if (b.status === 'confirmed' || (b.hold_expires_at && b.hold_expires_at > nowIso)) active.set(b.slot_id, b.status);
  }
  const stats = new Map<string, { total: number; open: number; held: number; confirmed: number; upcoming: number }>();
  for (const s of slots.data ?? []) {
    const st = stats.get(s.campaign_id) ?? { total: 0, open: 0, held: 0, confirmed: 0, upcoming: 0 };
    st.total++;
    const a = active.get(s.id);
    if (a === 'confirmed') st.confirmed++;
    else if (a === 'held') st.held++;
    else if (s.starts_at > nowIso) st.open++;
    if (s.starts_at > nowIso) st.upcoming++;
    stats.set(s.campaign_id, st);
  }
  const campaigns = camps.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Mini sessions" description="Seasonal campaigns: create slots, watch bookings come in, export the attendee list." />
      {error && <Notice tone="bad" title="Some data could not be loaded.">{error.message}</Notice>}
      {campaigns.length === 0 ? (
        <EmptyState>No campaigns yet. Create one below.</EmptyState>
      ) : (
        <Table>
          <caption className="sr-only">Mini-session campaigns</caption>
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th>Status</Th>
              <Th>Price</Th>
              <Th>Length</Th>
              <Th>Slots</Th>
              <Th>Open</Th>
              <Th>Held</Th>
              <Th>Confirmed</Th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const st = stats.get(c.id) ?? { total: 0, open: 0, held: 0, confirmed: 0, upcoming: 0 };
              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/admin/minis/${c.id}`} className="font-medium text-rose-deep underline-offset-2 hover:underline">
                      {c.name}
                    </Link>
                    {c.season && <span className="block text-xs text-ink-soft">{c.season}</span>}
                  </Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td className="tabular-nums">{c.price_cents === null ? <span className="text-warn">not set</span> : formatCAD(c.price_cents)}</Td>
                  <Td>{c.duration_min} min</Td>
                  <Td className="tabular-nums">{st.total}</Td>
                  <Td className="tabular-nums">{st.open}</Td>
                  <Td className="tabular-nums">{st.held}</Td>
                  <Td className="tabular-nums">{st.confirmed}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <section aria-labelledby="new-campaign">
        <SectionTitle id="new-campaign">New campaign</SectionTitle>
        <Card>
          <ActionForm action={createCampaign} aria-label="New campaign" className="grid gap-3 sm:grid-cols-3">
            <Fld label="Name" htmlFor="nc-name" name="name" className="sm:col-span-2">
              <Input id="nc-name" name="name" required placeholder="e.g. Christmas Mini Sessions" />
            </Fld>
            <Fld label="Slug (optional)" htmlFor="nc-slug" name="slug" hint="Link: /minis/<slug>. Made from the name if blank.">
              <Input id="nc-slug" name="slug" />
            </Fld>
            <Fld label="Season" htmlFor="nc-season" name="season">
              <Input id="nc-season" name="season" placeholder="e.g. Christmas 2026" />
            </Fld>
            <Fld label="Price (CAD)" htmlFor="nc-price" name="price" hint="Required before going live.">
              <Input id="nc-price" name="price" inputMode="decimal" />
            </Fld>
            <Fld label="Session length (min)" htmlFor="nc-dur" name="duration_min">
              <Input id="nc-dur" name="duration_min" inputMode="numeric" required defaultValue={20} />
            </Fld>
            <Fld label="Payment" htmlFor="nc-pay" name="payment_mode">
              <Select id="nc-pay" name="payment_mode" defaultValue="full">
                <option value="full">Full payment to confirm</option>
                <option value="deposit">Deposit to confirm</option>
              </Select>
            </Fld>
            <Fld label="Hold hours" htmlFor="nc-hold" name="hold_hours" hint="How long an unpaid spot is held.">
              <Input id="nc-hold" name="hold_hours" inputMode="numeric" defaultValue={24} />
            </Fld>
            <div className="flex items-end">
              <Save size="md" pendingText="Creating…">Create as draft</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
