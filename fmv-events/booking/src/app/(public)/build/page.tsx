import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicCatalog, getPublicPolicies, getPublicSettings, mediaPublicUrl, type PublicCatalog, type PublicSettings } from '@/lib/catalog';
import { createPublicClient } from '@/lib/supabase/public';
import { renderMarkdown } from '@/lib/markdown';
import { EVENT_TYPES } from '@/lib/schemas';
import { monctonToday } from '@/lib/time';
import { formatPhone, telHref } from '@/lib/phone';
import { Notice } from '@/components/ui';
import { BuildWizard } from './_wizard/wizard';
import type { ConceptBoard, EventType, PolicyHighlight, WizardPrefill } from './_wizard/types';

export const metadata: Metadata = {
  title: 'Build your event',
  description:
    'Choose your date, services, packages and add-ons, see a live estimate, and request a personal quote for your wedding, party or corporate event.',
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

function parsePrefill(sp: SearchParams, catalog: PublicCatalog, today: string): WizardPrefill {
  const qs = new URLSearchParams();
  const et = first(sp.event_type);
  let event_type: EventType | '' = et && (EVENT_TYPES as readonly string[]).includes(et) ? (et as EventType) : '';
  if (event_type) qs.set('event_type', event_type);

  const pkgSlug = first(sp.package);
  const pkg = pkgSlug ? catalog.packages.find((p) => p.slug === pkgSlug) : undefined;
  if (pkg) {
    qs.set('package', pkg.slug);
    if (!event_type && (EVENT_TYPES as readonly string[]).includes(pkg.event_type)) event_type = pkg.event_type as EventType;
  }

  const service_ids: string[] = [];
  for (const slug of all(sp.service).slice(0, 20)) {
    const s = catalog.services.find((x) => x.slug === slug);
    if (s && !service_ids.includes(s.id)) {
      service_ids.push(s.id);
      qs.append('service', s.slug);
    }
  }

  const d = first(sp.date);
  const event_date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today ? d : '';
  if (event_date) qs.set('date', event_date);

  return { key: qs.toString(), event_type, event_date, package_id: pkg?.id ?? null, service_ids };
}

async function loadConceptBoards(): Promise<ConceptBoard[]> {
  try {
    const sb = createPublicClient();
    const { data, error } = await sb
      .from('media')
      .select('id, storage_path, alt_text, mood_theme, caption')
      .not('mood_theme', 'is', null)
      .eq('kind', 'photo')
      .order('sort')
      .limit(12);
    if (error) throw error;
    return (data ?? [])
      .map((m) => ({
        id: m.id,
        url: mediaPublicUrl(m.storage_path) ?? '',
        alt: m.alt_text,
        theme: m.mood_theme ?? '',
        caption: m.caption,
      }))
      .filter((b) => b.url);
  } catch (e) {
    console.error('[build] concept boards unavailable', e);
    return [];
  }
}

async function loadPolicyHighlights(): Promise<PolicyHighlight[]> {
  try {
    const policies = await getPublicPolicies();
    const wanted = ['deposit', 'cancellation', 'travel'];
    return wanted
      .map((k) => policies.find((p) => p.key === k))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ key: p.key, title: p.title, version: p.version, html: renderMarkdown(p.body_md) }));
  } catch (e) {
    console.error('[build] policies unavailable', e);
    return [];
  }
}

export default async function BuildPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const today = monctonToday();

  let catalog: PublicCatalog | null = null;
  let settings: PublicSettings | null = null;
  try {
    [catalog, settings] = await Promise.all([getPublicCatalog(), getPublicSettings()]);
  } catch (e) {
    console.error('[build] catalog/settings unavailable', e);
  }

  if (!catalog || !settings) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-4xl font-semibold text-ink">Build your event</h1>
        <Notice tone="warn" title="The builder is taking a break" className="mt-6">
          We couldn&rsquo;t load our services just now. Please try again in a few minutes, or{' '}
          <Link href="/contact" className="underline">send us a question</Link>
          {settings?.phone_e164 && (
            <>
              {' '}or call <a className="underline" href={telHref(settings.phone_e164)}>{formatPhone(settings.phone_e164)}</a>
            </>
          )}
          .
        </Notice>
      </div>
    );
  }

  const [conceptBoards, policies] = await Promise.all([loadConceptBoards(), loadPolicyHighlights()]);
  const packageDescriptions = Object.fromEntries(
    catalog.packages.filter((p) => p.description_md).map((p) => [p.id, renderMarkdown(p.description_md)]),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-deep">Build your event</p>
      <h1 className="sr-only">Build your event</h1>
      <p className="mb-6 mt-1 text-sm text-ink-soft">
        A few quick steps and you&rsquo;ll see a live estimate. Nothing is booked until you accept your quote.
      </p>
      <noscript>
        <Notice tone="warn">
          The builder needs JavaScript. You can also <Link href="/contact" className="underline">send us a question</Link>.
        </Notice>
      </noscript>
      <BuildWizard
        catalog={catalog}
        settings={{
          business_name: settings.business_name,
          owner_name: settings.owner_name,
          deposit_pct: settings.deposit_pct,
          hold_hours: settings.hold_hours,
          tax_enabled: settings.tax_enabled,
          tax_rate_bp: settings.tax_rate_bp,
          phone_e164: settings.phone_e164,
          email: settings.email,
        }}
        conceptBoards={conceptBoards}
        policies={policies}
        prefill={parsePrefill(sp, catalog, today)}
        packageDescriptions={packageDescriptions}
        today={today}
      />
    </div>
  );
}
