// Database test helpers. These tests run against a throwaway local Postgres with
// the Supabase shim + all migrations applied (see scripts/db-reset-local.sh).
import pg from 'pg';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://tester:tester@localhost:5432/fmv_test';

export async function connect(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: TEST_DB_URL });
  await c.connect();
  return c;
}

export async function dbAvailable(): Promise<boolean> {
  try {
    const c = await connect();
    await c.query('select 1 from public.settings limit 1');
    await c.end();
    return true;
  } catch {
    return false;
  }
}

/** Runs fn inside a transaction as the given API role and JWT claims, then rolls back. */
export async function asRole<T>(
  c: pg.Client,
  role: 'anon' | 'authenticated' | 'service_role',
  claims: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`set local role ${role}`);
    return await fn();
  } finally {
    await c.query('rollback');
  }
}

export async function serviceId(c: pg.Client, slug: string): Promise<string> {
  const r = await c.query('select id from public.services where slug = $1', [slug]);
  return r.rows[0].id;
}

/** Creates client + inquiry + sent quote with one service line; returns the quote token. */
export async function makeSentQuote(
  c: pg.Client,
  opts: { email: string; date: string; start: string; end: string; serviceSlug: string; totalCents?: number },
): Promise<{ quoteId: string; token: string; clientId: string }> {
  const total = opts.totalCents ?? 45000;
  const client = await c.query(
    `insert into public.clients (full_name, email) values ($1, $2)
     on conflict (email_normalized) do update set full_name = excluded.full_name returning id`,
    ['Test Client', opts.email],
  );
  const clientId = client.rows[0].id;
  const inq = await c.query(
    `insert into public.inquiries (client_id, event_type, event_date, start_time, end_time)
     values ($1, 'wedding', $2, $3, $4) returning id`,
    [clientId, opts.date, opts.start, opts.end],
  );
  const svc = await serviceId(c, opts.serviceSlug);
  const token = `tok_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const deposit = Math.round(total / 2);
  const q = await c.query(
    `insert into public.quotes (number, inquiry_id, client_id, status, public_token, valid_until,
       subtotal_cents, discount_cents, tax_rate_bp, tax_cents, total_cents, deposit_pct, deposit_cents)
     values (public.next_doc_number('quote'), $1, $2, 'sent', $3, current_date + 7, $4, 0, 0, 0, $4, 50, $5) returning id`,
    [inq.rows[0].id, clientId, token, total, deposit],
  );
  await c.query(
    `insert into public.quote_lines (quote_id, kind, ref_id, description, qty, unit_price_cents, line_total_cents)
     values ($1, 'service', $2, 'Test line', 1, $3, $3)`,
    [q.rows[0].id, svc, total],
  );
  return { quoteId: q.rows[0].id, token, clientId };
}

export function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86400_000);
  return d.toISOString().slice(0, 10);
}
