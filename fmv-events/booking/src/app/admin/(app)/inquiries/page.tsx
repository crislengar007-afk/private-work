import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDate } from '@/lib/time';
import { EmptyState, Money, Notice, PageHeader, Select } from '@/components/ui';
import { FilterTabs, sp1, type SearchParams } from '../../_components/bits';
import { ActionForm, FormButton } from '../../_components/action-form';
import { setInquiryStatus } from '../../_lib/inquiry-actions';
import { INQUIRY_COLUMNS, INQUIRY_STATUSES, cap, eventLabel } from '../../_lib/labels';

export const metadata: Metadata = { title: 'Inquiries' };

const COLUMN_TITLES: Record<string, string> = { new: 'New', quoted: 'Quoted', won: 'Won', lost: 'Lost', spam: 'Spam' };

export default async function InquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  const sp = await searchParams;
  const showSpam = sp1(sp.show) === 'spam';
  const sb = await createClient();

  const columns: readonly string[] = showSpam ? ['spam'] : INQUIRY_COLUMNS;
  const [{ data, error }, spamCount] = await Promise.all([
    sb.from('inquiries')
      .select('id, status, event_type, event_date, guest_count, estimated_total_cents, created_at, venue_name, client:clients(full_name, email)')
      .in('status', [...columns] as ('new' | 'quoted' | 'won' | 'lost' | 'spam')[])
      .order('created_at', { ascending: false })
      .limit(400),
    sb.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'spam'),
  ]);
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Inquiries" description="Every event request from the builder, from first contact to won or lost." />
      <FilterTabs
        label="Inquiry view"
        current={showSpam ? 'spam' : 'pipeline'}
        items={[
          { value: 'pipeline', label: 'Pipeline', href: '/admin/inquiries' },
          { value: 'spam', label: 'Spam', href: '/admin/inquiries?show=spam', count: spamCount.count ?? undefined },
        ]}
      />
      {error && <Notice tone="bad" className="mb-4">Could not load inquiries: {error.message}</Notice>}

      <div className={`grid gap-4 ${showSpam ? '' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
        {columns.map((col) => {
          const list = rows.filter((r) => r.status === col);
          return (
            <section key={col} aria-labelledby={`col-${col}`} className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-cream-deep/50 p-3">
              <h2 id={`col-${col}`} className="mb-3 flex items-center justify-between px-1 font-display text-xl font-semibold">
                {COLUMN_TITLES[col]}
                <span className="rounded-full bg-white px-2 text-sm font-normal tabular-nums text-ink-soft">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <EmptyState>Nothing here.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {list.map((r) => {
                    const client = r.client as { full_name: string; email: string } | null;
                    return (
                      <li key={r.id} className="rounded-xl border border-line bg-white p-3 shadow-sm">
                        <Link href={`/admin/inquiries/${r.id}`} className="block font-semibold text-ink hover:text-rose-deep">
                          {client?.full_name ?? 'Unknown client'}
                        </Link>
                        <p className="text-sm text-ink-soft">
                          {eventLabel(r.event_type)} · {formatShortDate(r.event_date)}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {r.venue_name ? `${r.venue_name} · ` : ''}
                          {r.guest_count ? `${r.guest_count} guests · ` : ''}received {formatShortDate(r.created_at)}
                        </p>
                        <p className="mt-1 text-sm">
                          Estimate <Money cents={r.estimated_total_cents} className="font-semibold" />
                        </p>
                        <ActionForm action={setInquiryStatus} className="mt-2 flex items-center gap-2" aria-label={`Change status for ${client?.full_name ?? 'inquiry'}`}>
                          <input type="hidden" name="inquiry_id" value={r.id} />
                          <label htmlFor={`st-${r.id}`} className="sr-only">Status</label>
                          <Select id={`st-${r.id}`} name="status" defaultValue={r.status} className="h-8 py-0 text-xs">
                            {INQUIRY_STATUSES.map((s) => (
                              <option key={s} value={s}>{cap(s)}</option>
                            ))}
                          </Select>
                          <FormButton variant="secondary" pendingText="…">Move</FormButton>
                        </ActionForm>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
