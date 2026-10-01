import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';
import { formatCAD } from '@/lib/money';
import { formatDateTime } from '@/lib/time';
import { Badge, Button, EmptyState, Label, Notice, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { getTeamMembers } from '@/app/admin/_owner/server';

export const metadata: Metadata = { title: 'Audit log' };

const ENTITY_LABELS: Record<string, string> = {
  settings: 'Settings',
  policies: 'Policies',
  payments: 'Payments',
  services: 'Services',
  packages: 'Packages',
  addons: 'Add-ons',
  mini_campaigns: 'Mini campaigns',
  service_zones: 'Travel zones',
};

const NAMED: Record<string, { table: 'services' | 'packages' | 'addons' | 'mini_campaigns' | 'service_zones'; col: 'name' }> = {
  services: { table: 'services', col: 'name' },
  packages: { table: 'packages', col: 'name' },
  addons: { table: 'addons', col: 'name' },
  mini_campaigns: { table: 'mini_campaigns', col: 'name' },
  service_zones: { table: 'service_zones', col: 'name' },
};

function fmtValue(key: string, v: Json | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && key.endsWith('_cents')) return formatCAD(v);
  if (typeof v === 'number' && key.endsWith('_bp')) return `${v / 100}%`;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

const SUMMARY_KEYS = ['name', 'title', 'key', 'amount_cents', 'method', 'price_cents', 'status', 'invoice_id', 'note'];

function Diff({ action, diff }: { action: string; diff: Json | null }) {
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return <span className="text-ink-soft">—</span>;
  const entries = Object.entries(diff);
  if (action === 'update') {
    return (
      <ul className="space-y-0.5">
        {entries.map(([k, ch]) => {
          const c = (ch && typeof ch === 'object' && !Array.isArray(ch) ? ch : {}) as { from?: Json; to?: Json };
          return (
            <li key={k} className="text-xs">
              <span className="font-mono text-ink-soft">{k}</span>: <span className="line-through decoration-bad/50">{fmtValue(k, c.from)}</span>{' '}
              → <strong>{fmtValue(k, c.to)}</strong>
            </li>
          );
        })}
      </ul>
    );
  }
  const summary = entries.filter(([k]) => SUMMARY_KEYS.includes(k));
  return (
    <div className="text-xs">
      {summary.length > 0 && (
        <p>
          {summary.map(([k, v]) => (
            <span key={k} className="mr-3">
              <span className="font-mono text-ink-soft">{k}</span>: {fmtValue(k, v)}
            </span>
          ))}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-rose-deep">All fields</summary>
        <pre className="mt-1 max-h-60 max-w-xl overflow-auto whitespace-pre-wrap rounded bg-cream-deep p-2 text-[11px]">
          {JSON.stringify(diff, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  await requireOwner();
  const { entity: rawEntity } = await searchParams;
  const entity = rawEntity && /^[a-z_]{1,40}$/.test(rawEntity) ? rawEntity : '';
  const sb = await createClient();
  let q = sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (entity) q = q.eq('entity_type', entity);
  const [{ data, error }, team] = await Promise.all([q, getTeamMembers()]);
  const rows = data ?? [];

  const actor = new Map(team.map((m) => [m.user_id, m.display_name || m.email || m.user_id]));

  // Resolve names for catalog rows mentioned in the log.
  const names = new Map<string, string>();
  await Promise.all(
    Object.entries(NAMED).map(async ([type, { table }]) => {
      const ids = [...new Set(rows.filter((r) => r.entity_type === type && r.entity_id).map((r) => r.entity_id!))].filter((id) =>
        /^[0-9a-f-]{36}$/i.test(id),
      );
      if (!ids.length) return;
      const { data: found } = await sb.from(table).select('id, name').in('id', ids);
      for (const f of found ?? []) names.set(`${type}:${f.id}`, f.name);
    }),
  );
  const types = [...new Set([...Object.keys(ENTITY_LABELS), ...rows.map((r) => r.entity_type)])];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Changes to prices, payments, settings and policies, whoever made them. Times are Atlantic (Moncton)." />
      {error && <Notice tone="bad" title="The audit log could not be loaded.">{error.message}</Notice>}

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter audit log">
        <div>
          <Label htmlFor="entity" className="text-xs">What changed</Label>
          <Select id="entity" name="entity" defaultValue={entity} className="w-56">
            <option value="">Everything</option>
            {types.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t] ?? t}</option>)}
          </Select>
        </div>
        <Button type="submit" variant="secondary">Filter</Button>
        <span className="ml-auto text-sm text-ink-soft">Showing the latest {rows.length} change{rows.length === 1 ? '' : 's'}</span>
      </form>

      {rows.length === 0 ? (
        <EmptyState>No changes recorded{entity ? ' for this type' : ''} yet.</EmptyState>
      ) : (
        <Table>
          <caption className="sr-only">Audit log</caption>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>What</Th>
              <Th>Change</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
                <Td className="text-xs">
                  {r.actor_id ? actor.get(r.actor_id) ?? <span className="font-mono">{r.actor_id.slice(0, 8)}…</span> : <span className="text-ink-soft">system</span>}
                </Td>
                <Td>
                  <Badge tone={r.action === 'delete' ? 'bad' : r.action === 'insert' ? 'ok' : 'neutral'}>{r.action}</Badge>
                </Td>
                <Td className="text-xs">
                  <span className="font-medium">{ENTITY_LABELS[r.entity_type] ?? r.entity_type}</span>
                  {r.entity_id && (
                    <span className="block text-ink-soft">
                      {names.get(`${r.entity_type}:${r.entity_id}`) ?? (r.entity_type === 'settings' ? '' : r.entity_id.length > 12 ? `${r.entity_id.slice(0, 8)}…` : r.entity_id)}
                    </span>
                  )}
                </Td>
                <Td>
                  <Diff action={r.action} diff={r.diff} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
