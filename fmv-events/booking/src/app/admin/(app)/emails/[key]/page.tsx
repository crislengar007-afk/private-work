import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import { Card, PageHeader } from '@/components/ui';
import { previewTemplate, saveTemplate } from '../actions';
import { tagsFor } from '../merge-tags';
import { TemplateEditor } from './template-editor';

export const metadata: Metadata = { title: 'Edit email template' };

export default async function EmailTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  await requireOwner();
  const { key } = await params;
  if (!/^[a-z0-9_]{1,64}$/.test(key)) notFound();
  const sb = await createClient();
  const { data: t } = await sb.from('email_templates').select('*').eq('key', key).maybeSingle();
  if (!t) notFound();
  const preview = await previewTemplate({ key, subject: t.subject, body_md: t.body_md });

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="font-mono text-2xl sm:text-3xl">{t.key}</span>}
        description={
          <>
            <Link href="/admin/emails" className="underline">All templates</Link> · {t.description} · Last saved {formatDateTime(t.updated_at)}
          </>
        }
      />
      <Card>
        <TemplateEditor
          templateKey={t.key}
          action={saveTemplate.bind(null, t.key)}
          subject={t.subject}
          body={t.body_md}
          tags={tagsFor(t.key)}
          initialPreview={preview.ok ? preview.data : { subject: t.subject, html: '' }}
        />
      </Card>
    </div>
  );
}
