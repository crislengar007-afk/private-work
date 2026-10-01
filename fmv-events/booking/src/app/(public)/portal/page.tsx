import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { appUrl } from '@/lib/request';
import { createClient } from '@/lib/supabase/server';
import { Card, Notice, PageHeader, buttonClass } from '@/components/ui';
import { PortalSignInForm } from '@/components/portal/sign-in-form';
import {
  BookingsSection,
  InvoicesSection,
  MinisSection,
  QuotesSection,
  type PortalBooking,
  type PortalInvoice,
  type PortalMini,
  type PortalQuote,
} from '@/components/portal/sections';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My bookings',
  description: 'See your FMV bookings, quotes, invoices and photo galleries.',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ error?: string | string[] }> };

export default async function PortalPage({ searchParams }: Props) {
  const sp = await searchParams;
  const session = await getSession();

  if (!session.userId) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <PageHeader
          title="My bookings"
          description="Sign in with your email to see your bookings, quotes, invoices and photo galleries. No password needed."
        />
        {sp.error && (
          <Notice tone="bad" className="mb-4" title="That sign-in link didn’t work.">
            It may have expired or already been used. Request a new one below.
          </Notice>
        )}
        <Card>
          <PortalSignInForm redirectTo={appUrl('/auth/callback?next=/portal')} />
        </Card>
      </div>
    );
  }

  const sb = await createClient();
  // Attach any client records with this verified email (idempotent).
  const { error: linkError } = await sb.rpc('link_my_client_account');
  if (linkError) console.warn('[portal] link_my_client_account failed:', linkError.message);

  // Only this user's own client rows. Owners can read everything through RLS,
  // so every query below is also scoped to these ids explicitly.
  const { data: clientRows, error: clientError } = await sb.from('clients').select('id').eq('user_id', session.userId);
  const clientIds = (clientRows ?? []).map((c) => c.id);

  let bookings: PortalBooking[] = [];
  let quotes: PortalQuote[] = [];
  let invoices: PortalInvoice[] = [];
  let minis: PortalMini[] = [];
  let loadFailed = Boolean(clientError);

  if (clientIds.length > 0) {
    const [b, q, i, m] = await Promise.all([
      sb.from('bookings')
        .select('id, title, event_date, status, venue_name, venue_address, gallery_url, hold_expires_at')
        .in('client_id', clientIds)
        .order('event_date', { ascending: false }),
      sb.from('quotes')
        .select('id, number, status, total_cents, valid_until, public_token, created_at')
        .in('client_id', clientIds)
        .neq('status', 'draft')
        .order('created_at', { ascending: false }),
      sb.from('invoices')
        .select('id, number, kind, amount_cents, status, due_at, public_token, created_at')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false }),
      sb.from('mini_bookings')
        .select('id, status, hold_expires_at, created_at, slot:mini_slots(starts_at, campaign:mini_campaigns(name, location_name))')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false }),
    ]);
    for (const r of [b, q, i, m]) {
      if (r.error) {
        loadFailed = true;
        console.error('[portal] load failed:', r.error.message);
      }
    }
    bookings = b.data ?? [];
    quotes = q.data ?? [];
    invoices = i.data ?? [];
    minis = (m.data ?? []).map((row) => {
      const slot = row.slot as unknown as { starts_at: string; campaign: { name: string; location_name: string | null } | null } | null;
      return {
        id: row.id,
        status: row.status,
        hold_expires_at: row.hold_expires_at,
        starts_at: slot?.starts_at ?? null,
        campaign_name: slot?.campaign?.name ?? null,
        location_name: slot?.campaign?.location_name ?? null,
      };
    });
  }

  const isTeam = session.storedRole === 'owner' || session.storedRole === 'staff';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        title="My bookings"
        description={session.email ? `Signed in as ${session.email}` : undefined}
        actions={
          <form action="/auth/signout" method="post">
            <button type="submit" className={buttonClass('secondary', 'sm')}>Sign out</button>
          </form>
        }
      />

      {isTeam && (
        <Notice tone="gold" className="mb-6" title="You’re signed in with a team account.">
          This page is for clients.{' '}
          <Link href="/admin" className="font-medium underline">Go to the admin</Link>
        </Notice>
      )}

      {loadFailed && (
        <Notice tone="bad" className="mb-6" title="Some of your information couldn’t be loaded.">
          Please refresh the page in a moment.
        </Notice>
      )}

      {clientIds.length === 0 && !clientError ? (
        <Card className="space-y-3">
          <p className="text-ink">
            We couldn’t find any bookings or quotes for <strong>{session.email}</strong>.
          </p>
          <p className="text-sm text-ink-soft">
            If you booked with a different email, sign out and sign in with that one. Ready to plan something?
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/build" className={buttonClass('primary', 'sm')}>Build your event</Link>
            <Link href="/minis" className={buttonClass('secondary', 'sm')}>Mini sessions</Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-10">
          <BookingsSection bookings={bookings} />
          <MinisSection minis={minis} />
          <QuotesSection quotes={quotes} />
          <InvoicesSection invoices={invoices} />
        </div>
      )}
    </div>
  );
}
