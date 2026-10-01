import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { savePolicy } from './actions';
import { POLICY_KEYS, policyKeyLabels } from './keys';
import { PolicyEditor } from './policy-editor';

export const metadata: Metadata = { title: 'Policies' };

export default async function PoliciesPage() {
  await requireOwner();
  const sb = await createClient();
  const { data, error } = await sb.from('policies').select('*').order('sort');
  const policies = data ?? [];
  const missing = POLICY_KEYS.filter((k) => !policies.some((p) => p.key === k));

  return (
    <div className="space-y-6">
      <PageHeader title="Policies" description="Deposit, cancellation, weather and the other terms shown on quotes and the website." />
      {error && <Notice tone="bad" title="Policies could not be loaded.">{error.message}</Notice>}
      <Notice tone="warn" title="Have these reviewed before publishing.">
        The starter text is a template, not legal advice. Ask a professional to review it for New Brunswick and Canadian
        privacy law (PIPEDA) before relying on it.
      </Notice>
      <Notice tone="neutral">
        Every saved change creates a new version automatically. Quotes that were already sent keep the exact version they were
        sent with; new quotes use the latest text.
      </Notice>

      <nav aria-label="Policies on this page" className="flex flex-wrap gap-2 text-sm">
        {policies.map((p) => (
          <a key={p.key} href={`#policy-${p.key}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-rose-deep">
            {p.title}
          </a>
        ))}
      </nav>

      {policies.map((p) => (
        <Card key={p.key} id={`policy-${p.key}`} className="scroll-mt-20">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-display text-2xl font-semibold">{p.title}</h2>
            <Badge tone="gold">version {p.version}</Badge>
            <span className="text-xs text-ink-soft">Updated {formatDateTime(p.updated_at)}</span>
          </div>
          <PolicyEditor id={`pol-${p.key}`} action={savePolicy.bind(null, p.key)} title={p.title} body={p.body_md} />
        </Card>
      ))}

      {missing.length > 0 && (
        <section aria-labelledby="pol-missing" className="space-y-4">
          <SectionTitle id="pol-missing">Not set up yet</SectionTitle>
          {missing.map((k) => (
            <Card key={k}>
              <h3 className="mb-3 font-semibold">{policyKeyLabels[k]}</h3>
              <PolicyEditor id={`pol-new-${k}`} action={savePolicy.bind(null, k)} title={policyKeyLabels[k]} body="" saveLabel="Add policy" />
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
