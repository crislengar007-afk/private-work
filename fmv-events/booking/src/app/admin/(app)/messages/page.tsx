import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import { formatPhone, telHref, whatsappHref } from '@/lib/phone';
import { Badge, EmptyState, Notice, PageHeader } from '@/components/ui';
import { FilterTabs, sp1, type SearchParams } from '../../_components/bits';
import { ActionForm, FormButton } from '../../_components/action-form';
import { setMessageHandled } from '../../_lib/message-actions';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  const sp = await searchParams;
  const view = sp1(sp.show) === 'handled' ? 'handled' : sp1(sp.show) === 'all' ? 'all' : 'inbox';
  const sb = await createClient();

  let q = sb.from('messages').select('id, full_name, email, phone_e164, body, handled, created_at').order('created_at', { ascending: false }).limit(200);
  if (view === 'inbox') q = q.eq('handled', false);
  if (view === 'handled') q = q.eq('handled', true);
  const [{ data, error }, openCount] = await Promise.all([
    q,
    sb.from('messages').select('id', { count: 'exact', head: true }).eq('handled', false),
  ]);
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Messages" description="General questions from the contact form. Reply by email or phone, then mark them handled." />
      <FilterTabs
        label="Filter messages"
        current={view}
        items={[
          { value: 'inbox', label: 'Inbox', href: '/admin/messages', count: openCount.count ?? undefined },
          { value: 'handled', label: 'Handled', href: '/admin/messages?show=handled' },
          { value: 'all', label: 'All', href: '/admin/messages?show=all' },
        ]}
      />
      {error && <Notice tone="bad" className="mb-4">Could not load messages: {error.message}</Notice>}
      {rows.length === 0 ? (
        <EmptyState>{view === 'inbox' ? 'Inbox zero. No questions waiting.' : 'No messages.'}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className={`rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-sm ${m.handled ? 'opacity-75' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {m.full_name} {m.handled && <Badge tone="ok" className="ml-1">handled</Badge>}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-sm">
                    <a href={`mailto:${m.email}`} className="text-rose-deep underline">{m.email}</a>
                    {m.phone_e164 && (
                      <>
                        <a href={telHref(m.phone_e164)} className="text-rose-deep underline">{formatPhone(m.phone_e164)}</a>
                        <a href={whatsappHref(m.phone_e164)} target="_blank" rel="noreferrer" className="text-rose-deep underline">WhatsApp</a>
                      </>
                    )}
                  </p>
                </div>
                <time dateTime={m.created_at} className="text-xs text-ink-soft">{formatDateTime(m.created_at)}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{m.body}</p>
              <ActionForm action={setMessageHandled} className="mt-3">
                <input type="hidden" name="message_id" value={m.id} />
                <input type="hidden" name="handled" value={m.handled ? 'false' : 'true'} />
                <FormButton variant={m.handled ? 'ghost' : 'secondary'} pendingText="Updating…">
                  {m.handled ? 'Move back to inbox' : 'Mark handled'}
                </FormButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
