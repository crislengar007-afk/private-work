import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatTime } from '@/lib/time';
import { formatPhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';

/** One CSV cell: quoted, with spreadsheet formula injection neutralised. */
function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// Attendee list for a mini-session campaign (owner only).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session.role !== 'owner') return new NextResponse('Not authorized', { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });

  const sb = await createClient();
  const { data: campaign } = await sb.from('mini_campaigns').select('slug, name').eq('id', id).maybeSingle();
  if (!campaign) return new NextResponse('Not found', { status: 404 });

  const { data, error } = await sb
    .from('mini_bookings')
    .select(
      'status, hold_expires_at, notes, client:clients(full_name, email, phone_e164), invoices(etransfer_reference, status), slot:mini_slots!inner(campaign_id, starts_at, ends_at)',
    )
    .eq('slot.campaign_id', id)
    .in('status', ['held', 'confirmed', 'no_show']);
  if (error) return new NextResponse('Could not load attendees', { status: 500 });

  const nowIso = new Date().toISOString();
  const rows = (data ?? [])
    .map((b) => {
      const slot = b.slot as unknown as { starts_at: string; ends_at: string };
      const client = b.client as unknown as { full_name: string; email: string; phone_e164: string | null } | null;
      const invoices = (b.invoices ?? []) as { etransfer_reference: string; status: string }[];
      const inv = invoices.find((i) => i.status !== 'void') ?? invoices[0];
      const status = b.status === 'held' && (!b.hold_expires_at || b.hold_expires_at <= nowIso) ? 'hold expired' : b.status.replace('_', '-');
      return {
        starts: slot.starts_at,
        values: [
          formatDate(slot.starts_at),
          `${formatTime(slot.starts_at)} - ${formatTime(slot.ends_at)}`,
          status,
          client?.full_name ?? '',
          client?.email ?? '',
          formatPhone(client?.phone_e164),
          b.notes ?? '',
          inv?.etransfer_reference ?? '',
          inv?.status === 'paid' ? 'yes' : 'no',
        ],
      };
    })
    .sort((a, b) => a.starts.localeCompare(b.starts));

  const header = ['Date', 'Time', 'Status', 'Name', 'Email', 'Phone', 'Notes', 'Invoice reference', 'Paid'];
  const csv = [header, ...rows.map((r) => r.values)].map((r) => r.map(cell).join(',')).join('\r\n');
  return new NextResponse(`﻿${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${campaign.slug}-attendees.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
