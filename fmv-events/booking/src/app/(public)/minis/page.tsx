import type { Metadata } from 'next';
import { safePublicSettings } from '@/components/site/chrome';
import { EmptyState, Notice, PageHeader } from '@/components/ui';
import { MiniCampaignCard } from '@/components/minis/campaign-card';
import { listLiveCampaigns, type MiniCampaignSummary } from '@/components/minis/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mini sessions',
  description: 'Book a seasonal mini photo session with FMV Events & Photography. Pick an open time, hold your spot and pay by Interac e-Transfer.',
  alternates: { canonical: '/minis' },
};

export default async function MinisPage() {
  let campaigns: MiniCampaignSummary[] = [];
  let failed = false;
  try {
    campaigns = await listLiveCampaigns();
  } catch (e) {
    console.error('[minis] could not load campaigns', e instanceof Error ? e.message : e);
    failed = true;
  }
  const settings = campaigns.length === 0 ? await safePublicSettings() : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader
        title="Mini sessions"
        description="Short seasonal photo sessions. Pick an open time, hold your spot, then pay by Interac e-Transfer to confirm. Digital photos are included."
      />
      {failed ? (
        <Notice tone="bad" title="We couldn’t load mini sessions right now.">Please refresh the page in a moment.</Notice>
      ) : campaigns.length === 0 ? (
        <EmptyState>
          No mini sessions are open right now
          {settings?.facebook_url ? (
            <>
              {' '}— follow us on{' '}
              <a href={settings.facebook_url} className="font-medium text-rose-deep underline" rel="noopener noreferrer" target="_blank">
                Facebook
              </a>{' '}
              to hear when the next ones open.
            </>
          ) : (
            <> — follow us on Facebook to hear when the next ones open.</>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <MiniCampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
