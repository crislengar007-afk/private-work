import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDate } from '@/lib/time';
import { EVENT_TYPES, eventTypeLabels } from '@/lib/schemas';
import { Badge, Card, EmptyState, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui';
import { ActionForm, Check, Fld, Save } from '@/app/admin/_owner/form';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { TESTIMONIAL_SOURCES, sourceLabels } from '@/app/admin/_owner/labels';
import { createTestimonial, deleteTestimonial, setTestimonialFlag } from './actions';

export const metadata: Metadata = { title: 'Testimonials' };

export default async function TestimonialsPage() {
  await requireOwner();
  const sb = await createClient();
  const { data, error } = await sb.from('testimonials').select('*').order('created_at', { ascending: false });
  const rows = data ?? [];
  const pending = rows.filter((t) => !t.approved);
  const live = rows.filter((t) => t.approved);

  const card = (t: (typeof rows)[number]) => (
    <Card key={t.id} className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="mr-auto font-semibold">
          {t.client_name}
          <span className="ml-2 text-xs font-normal text-ink-soft">
            {t.event_type ? `${eventTypeLabels[t.event_type]} · ` : ''}
            {sourceLabels[t.source]} · {formatShortDate(t.created_at)}
          </span>
        </p>
        {t.rating && <span aria-label={`${t.rating} out of 5 stars`} className="text-gold-deep">{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}</span>}
        {t.approved ? <Badge tone="ok">published</Badge> : <Badge>not published</Badge>}
        {t.consent_to_publish ? <Badge tone="ok">consent given</Badge> : <Badge tone="warn">no consent</Badge>}
      </div>
      <blockquote className="border-l-2 border-blush pl-3 text-sm italic text-ink">“{t.quote}”</blockquote>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {t.approved ? (
          <ActionForm action={setTestimonialFlag.bind(null, t.id, 'unapprove')} aria-label="Unpublish">
            <Save variant="secondary">Unpublish</Save>
          </ActionForm>
        ) : (
          <ActionForm action={setTestimonialFlag.bind(null, t.id, 'approve')} aria-label="Approve and publish">
            <Save disabled={!t.consent_to_publish} title={t.consent_to_publish ? undefined : 'Record the client’s consent first'}>
              Approve &amp; publish
            </Save>
          </ActionForm>
        )}
        {t.consent_to_publish ? (
          <ActionForm
            action={setTestimonialFlag.bind(null, t.id, 'revoke')}
            confirm="Mark consent as withdrawn? This also unpublishes the testimonial."
            aria-label="Withdraw consent"
          >
            <Save variant="ghost">Consent withdrawn</Save>
          </ActionForm>
        ) : (
          <ActionForm
            action={setTestimonialFlag.bind(null, t.id, 'consent')}
            confirm="Confirm the client agreed to have this quote published on the website."
            aria-label="Record consent"
          >
            <Save variant="ghost">Client gave consent</Save>
          </ActionForm>
        )}
        <ActionForm action={deleteTestimonial.bind(null, t.id)} confirm="Delete this testimonial?" aria-label="Delete" className="ml-auto">
          <Save variant="ghost" pendingText="Deleting…" className="text-bad">Delete</Save>
        </ActionForm>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Testimonials" description="Real client words only. Publishing requires the client’s consent." />
      {error && <Notice tone="bad" title="Testimonials could not be loaded.">{error.message}</Notice>}

      <section aria-labelledby="t-pending">
        <SectionTitle id="t-pending">Waiting for approval ({pending.length})</SectionTitle>
        <div className="space-y-3">{pending.length ? pending.map(card) : <EmptyState>Nothing waiting.</EmptyState>}</div>
      </section>
      <section aria-labelledby="t-live">
        <SectionTitle id="t-live">Published ({live.length})</SectionTitle>
        <div className="space-y-3">{live.length ? live.map(card) : <EmptyState>Nothing published yet.</EmptyState>}</div>
      </section>

      <section aria-labelledby="t-new">
        <SectionTitle id="t-new">Add a testimonial</SectionTitle>
        <Card>
          <ActionForm action={createTestimonial} resetOnSuccess aria-label="New testimonial" className="grid gap-3 sm:grid-cols-4">
            <Fld label="Client name" htmlFor="t-name" name="client_name" className="sm:col-span-2">
              <Input id="t-name" name="client_name" required placeholder="e.g. Jenna & Mark" />
            </Fld>
            <Fld label="Event type" htmlFor="t-type" name="event_type">
              <Select id="t-type" name="event_type" defaultValue="">
                <option value="">—</option>
                {EVENT_TYPES.map((e) => <option key={e} value={e}>{eventTypeLabels[e]}</option>)}
              </Select>
            </Fld>
            <Fld label="Source" htmlFor="t-source" name="source">
              <Select id="t-source" name="source" defaultValue="facebook">
                {TESTIMONIAL_SOURCES.map((s) => <option key={s} value={s}>{sourceLabels[s]}</option>)}
              </Select>
            </Fld>
            <Fld label="Quote" htmlFor="t-quote" name="quote" className="sm:col-span-4" hint="Paste their words exactly. Don’t edit the meaning.">
              <Textarea id="t-quote" name="quote" required rows={3} />
            </Fld>
            <Fld label="Rating" htmlFor="t-rating" name="rating">
              <Select id="t-rating" name="rating" defaultValue="5">
                <option value="">No rating</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
              </Select>
            </Fld>
            <div className="sm:col-span-3">
              <Check id="t-consent" name="consent_to_publish" label="The client agreed to have this published on the website" />
            </div>
            <div className="sm:col-span-4">
              <Save size="md">Add testimonial</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
