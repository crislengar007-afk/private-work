import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { mediaPublicUrl } from '@/lib/catalog';
import { EVENT_TYPES, eventTypeLabels } from '@/lib/schemas';
import { Badge, Card, EmptyState, Notice, PageHeader, Select } from '@/components/ui';
import { ActionForm, Fld, Save } from '@/app/admin/_owner/form';
import { mediaLabel, type MediaOption } from '@/app/admin/_owner/ui';
import { cn } from '@/lib/cn';
import { deleteMedia, pairMedia, unpairMedia, updateMedia } from './actions';
import { MediaUploader } from './uploader';
import { MediaEditForm } from './media-edit-form';

export const metadata: Metadata = { title: 'Media library' };

const PAGE_SIZE = 48;
const FILTERS = {
  all: 'All',
  portfolio: 'In portfolio',
  hidden: 'Not in portfolio',
  ai: 'AI concepts',
  needs_alt: 'Missing alt text',
} as const;
type Filter = keyof typeof FILTERS;

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ show?: string; page?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const show: Filter = sp.show && sp.show in FILTERS ? (sp.show as Filter) : 'all';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const sb = await createClient();

  let q = sb.from('media').select('*', { count: 'exact' });
  if (show === 'portfolio') q = q.eq('show_in_portfolio', true);
  if (show === 'hidden') q = q.eq('show_in_portfolio', false).eq('is_ai_generated', false);
  if (show === 'ai') q = q.eq('is_ai_generated', true);
  if (show === 'needs_alt') q = q.eq('alt_text', '');
  const [list, cats, pairable] = await Promise.all([
    q.order('sort').order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    sb.from('service_categories').select('id, name').order('sort'),
    sb
      .from('media')
      .select('id, storage_path, alt_text, caption, kind, is_ai_generated, is_before_after_pair_id, before_after_role')
      .eq('is_ai_generated', false)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);
  const error = list.error || cats.error || pairable.error;
  const items = list.data ?? [];
  const total = list.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categories = cats.data ?? [];
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const eventTypes = EVENT_TYPES.map((t) => ({ value: t, label: eventTypeLabels[t] }));
  const pairOptions = (pairable.data ?? []) as (MediaOption & { is_before_after_pair_id: string | null; before_after_role: string | null })[];
  const byId = new Map(pairOptions.map((m) => [m.id, m]));
  const partnerOf = (pairId: string, selfId: string) => pairOptions.find((m) => m.is_before_after_pair_id === pairId && m.id !== selfId);

  const href = (patch: { show?: Filter; page?: number }) => {
    const s = patch.show ?? show;
    const p = patch.page ?? 1;
    const params = new URLSearchParams();
    if (s !== 'all') params.set('show', s);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/admin/media${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Media library" description="Real FMV photos and reels for the portfolio, covers and before/after, plus labelled AI concept boards." />
      {error && <Notice tone="bad" title="Some media could not be loaded.">{error.message}</Notice>}
      <Notice tone="warn" title="The portfolio is real work only.">
        AI-generated media is for atmosphere and labelled concept boards (“Concept inspiration, not a past FMV event”). It can
        never be shown in the portfolio, featured, paired as before/after or used as a testimonial. The database refuses it too.
      </Notice>

      <Card>
        <h2 className="mb-3 font-display text-2xl font-semibold">Upload</h2>
        <MediaUploader categories={categories} />
      </Card>

      <Card>
        <h2 className="mb-1 font-display text-2xl font-semibold">Before / after pairs</h2>
        <p className="mb-3 text-sm text-ink-soft">Pick the “before” shot and the “after” shot of the same real setup. Pairing an item again replaces its old pair.</p>
        <ActionForm action={pairMedia} resetOnSuccess aria-label="Pair before and after" className="flex flex-wrap items-end gap-3">
          <Fld label="Before" htmlFor="pair-before" name="before_id" className="w-72 max-w-full">
            <Select id="pair-before" name="before_id" defaultValue="" required>
              <option value="" disabled>Choose…</option>
              {pairOptions.map((m) => <option key={m.id} value={m.id}>{mediaLabel(m)}</option>)}
            </Select>
          </Fld>
          <Fld label="After" htmlFor="pair-after" name="after_id" className="w-72 max-w-full">
            <Select id="pair-after" name="after_id" defaultValue="" required>
              <option value="" disabled>Choose…</option>
              {pairOptions.map((m) => <option key={m.id} value={m.id}>{mediaLabel(m)}</option>)}
            </Select>
          </Fld>
          <Save size="md">Pair</Save>
        </ActionForm>
      </Card>

      <nav aria-label="Filter media" className="flex flex-wrap gap-2">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link
            key={f}
            href={href({ show: f })}
            aria-current={f === show ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              f === show ? 'border-rose-deep bg-blush text-rose-deep' : 'border-line bg-white text-ink-soft hover:text-ink',
            )}
          >
            {FILTERS[f]}
          </Link>
        ))}
        <span className="ml-auto self-center text-sm text-ink-soft">{total} item{total === 1 ? '' : 's'}</span>
      </nav>

      {items.length === 0 && <EmptyState>Nothing here yet.</EmptyState>}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((m) => {
          const url = mediaPublicUrl(m.storage_path);
          const partner = m.is_before_after_pair_id ? partnerOf(m.is_before_after_pair_id, m.id) : undefined;
          return (
            <li key={m.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-cream-deep">
                  {url && m.kind === 'video' ? (
                    <video src={url} controls muted preload="metadata" className="h-full w-full object-cover" aria-label={m.alt_text || 'Video'} />
                  ) : url ? (
                    <Image src={url} alt={m.alt_text || ''} fill unoptimized sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
                  ) : null}
                  {m.is_ai_generated && (
                    <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs text-white">AI concept</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge>{m.kind}</Badge>
                  {m.width && m.height && <Badge>{m.width}×{m.height}</Badge>}
                  {m.show_in_portfolio && <Badge tone="ok">portfolio</Badge>}
                  {m.featured && <Badge tone="gold">featured</Badge>}
                  {m.is_ai_generated && <Badge tone="warn">AI-generated{m.mood_theme ? `: ${m.mood_theme}` : ''}</Badge>}
                  {m.category_id && <Badge tone="rose">{catName.get(m.category_id) ?? 'category'}</Badge>}
                  {!m.alt_text && <Badge tone="bad">no alt text</Badge>}
                </div>
                {m.is_before_after_pair_id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blush-soft px-3 py-2 text-xs">
                    <span>
                      <strong>{m.before_after_role === 'after' ? 'After' : 'Before'}</strong>
                      {partner ? <> — paired with “{mediaLabel(byId.get(partner.id) ?? partner)}”</> : ' — partner missing'}
                    </span>
                    <ActionForm action={unpairMedia.bind(null, m.id)} aria-label="Unpair" className="ml-auto">
                      <Save variant="ghost" pendingText="…">Unpair</Save>
                    </ActionForm>
                  </div>
                )}
                <MediaEditForm media={m} action={updateMedia.bind(null, m.id)} categories={categories} eventTypes={eventTypes} />
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/70 pt-2">
                  <a href={url ?? '#'} target="_blank" rel="noopener" className="truncate text-xs text-ink-soft underline">
                    {m.storage_path.split('/').pop()}
                  </a>
                  <ActionForm
                    action={deleteMedia.bind(null, m.id)}
                    confirm="Delete this file permanently? It will disappear anywhere it’s used as a cover."
                    aria-label="Delete media"
                  >
                    <Save variant="ghost" pendingText="Deleting…" className="text-bad">Delete</Save>
                  </ActionForm>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={href({ page: page - 1 })} className="underline">← Previous</Link>}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={href({ page: page + 1 })} className="underline">Next →</Link>}
        </nav>
      )}
    </div>
  );
}
