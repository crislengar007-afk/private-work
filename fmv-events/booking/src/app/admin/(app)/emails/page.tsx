import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import { Badge, EmptyState, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { SectionTitle } from '@/app/admin/_owner/ui';

export const metadata: Metadata = { title: 'Email templates' };

const statusTone = { sent: 'ok', failed: 'bad', skipped: 'warn' } as const;

export default async function EmailsPage() {
  await requireOwner();
  const sb = await createClient();
  const [tpls, log] = await Promise.all([
    sb.from('email_templates').select('key, description, subject, updated_at').order('key'),
    sb.from('email_log').select('id, to_email, template, status, error, created_at').order('created_at', { ascending: false }).limit(50),
  ]);
  const error = tpls.error || log.error;
  const templates = tpls.data ?? [];
  const rows = log.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Email templates" description="The automatic emails clients and you receive. Edit the wording; merge tags fill in the details." />
      {error && <Notice tone="bad" title="Some data could not be loaded.">{error.message}</Notice>}

      <Table>
        <caption className="sr-only">Email templates</caption>
        <thead>
          <tr>
            <Th>Template</Th>
            <Th>When it’s sent</Th>
            <Th>Subject</Th>
            <Th>Last saved</Th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.key}>
              <Td>
                <Link href={`/admin/emails/${t.key}`} className="font-mono text-rose-deep underline-offset-2 hover:underline">
                  {t.key}
                </Link>
              </Td>
              <Td>{t.description}</Td>
              <Td className="text-ink-soft">{t.subject}</Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(t.updated_at)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <section aria-labelledby="log">
        <SectionTitle id="log">Recently sent</SectionTitle>
        <p className="mb-3 text-sm text-ink-soft">
          The last 50 emails. “Skipped” means email sending isn’t configured yet (no Resend key), so nothing left the app.
        </p>
        {rows.length === 0 ? (
          <EmptyState>No emails yet.</EmptyState>
        ) : (
          <Table>
            <caption className="sr-only">Email log</caption>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>To</Th>
                <Th>Template</Th>
                <Th>Status</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
                  <Td className="break-all">{r.to_email}</Td>
                  <Td className="font-mono text-xs">{r.template}</Td>
                  <Td>
                    <Badge tone={statusTone[r.status as keyof typeof statusTone] ?? 'neutral'}>{r.status}</Badge>
                  </Td>
                  <Td className="max-w-72 text-xs text-bad">{r.error}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
