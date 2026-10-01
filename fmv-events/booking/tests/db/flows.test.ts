import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { asRole, connect, dbAvailable, futureDate, makeSentQuote, TEST_DB_URL } from './helpers';

const available = await dbAvailable();
const d = available ? describe : describe.skip;

d('booking flows', () => {
  let c: pg.Client;
  beforeAll(async () => {
    c = await connect();
  });
  afterAll(async () => {
    await c?.end();
  });

  it('two clients accepting the same booth at the same time: exactly one wins', async () => {
    const date = futureDate(200);
    const a = await makeSentQuote(c, { email: 'race-a@example.com', date, start: '14:00', end: '18:00', serviceSlug: 'mirror-photobooth' });
    const b = await makeSentQuote(c, { email: 'race-b@example.com', date, start: '16:00', end: '20:00', serviceSlug: 'mirror-photobooth' });

    const c1 = new pg.Client({ connectionString: TEST_DB_URL });
    const c2 = new pg.Client({ connectionString: TEST_DB_URL });
    await Promise.all([c1.connect(), c2.connect()]);
    const results = await Promise.allSettled([
      c1.query(`select public.accept_quote($1, 'A', '1.1.1.1') as r`, [a.token]),
      c2.query(`select public.accept_quote($1, 'B', '2.2.2.2') as r`, [b.token]),
    ]);
    await Promise.all([c1.end(), c2.end()]);

    const wins = results.filter((r) => r.status === 'fulfilled');
    const losses = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(String(losses[0].reason.message)).toBe('item_unavailable');
    expect(String(losses[0].reason.detail)).toMatch(/no longer available for Mirror Photobooth/);

    // The losing quote is untouched and still open; no orphan booking was left behind.
    const loserToken = (results[0].status === 'rejected') ? a.token : b.token;
    const lq = await c.query('select status from public.quotes where public_token = $1', [loserToken]);
    expect(lq.rows[0].status).toBe('sent');
    const bookings = await c.query(
      `select count(*)::int as n from public.bookings b join public.quotes q on q.id = b.quote_id where q.public_token = $1`, [loserToken]);
    expect(bookings.rows[0].n).toBe(0);
  });

  it('buffers apply: a back-to-back booking inside the setup/teardown buffer is refused', async () => {
    const date = futureDate(210);
    const a = await makeSentQuote(c, { email: 'buf-a@example.com', date, start: '12:00', end: '14:00', serviceSlug: 'photobooth-360' });
    // 360 booth buffers: 60 min after + 90 min before -> next start must be >= 16:30
    const b = await makeSentQuote(c, { email: 'buf-b@example.com', date, start: '15:30', end: '17:00', serviceSlug: 'photobooth-360' });
    const cc = await makeSentQuote(c, { email: 'buf-c@example.com', date, start: '16:30', end: '18:00', serviceSlug: 'photobooth-360' });
    await c.query(`select public.accept_quote($1, 'A', 'ip')`, [a.token]);
    await expect(c.query(`select public.accept_quote($1, 'B', 'ip')`, [b.token])).rejects.toThrow('item_unavailable');
    await expect(c.query(`select public.accept_quote($1, 'C', 'ip')`, [cc.token])).resolves.toBeTruthy();
  });

  it('availability reflects reservations and never leaks client details', async () => {
    const date = futureDate(220);
    const before = await asRole(c, 'anon', {}, async () =>
      (await c.query(`select * from public.service_availability($1, '10:00', '12:00')`, [date])).rows);
    expect(before.find((r) => r.slug === 'video-guestbook')?.status).toBe('available');

    const q = await makeSentQuote(c, { email: 'avail@example.com', date, start: '10:00', end: '12:00', serviceSlug: 'video-guestbook' });
    await c.query(`select public.accept_quote($1, 'Avail', 'ip')`, [q.token]);

    const after = await asRole(c, 'anon', {}, async () =>
      (await c.query(`select * from public.service_availability($1, '11:00', '13:00')`, [date])).rows);
    const vg = after.find((r) => r.slug === 'video-guestbook');
    expect(vg?.status).toBe('unavailable');
    expect(Object.keys(vg!)).toEqual(['service_id', 'slug', 'status', 'reason']);
    expect(JSON.stringify(after)).not.toContain('avail@example.com');
    // Unrelated items stay available.
    expect(after.find((r) => r.slug === 'wedding-arch')?.status).toBe('available');
  });

  it('Marie (staff) cannot be double-booked across events, but one event can use her for several services', async () => {
    const date = futureDate(230);
    const a = await makeSentQuote(c, { email: 'marie-a@example.com', date, start: '13:00', end: '17:00', serviceSlug: 'wedding-coordination' });
    await c.query(
      `insert into public.quote_lines (quote_id, kind, ref_id, description, qty, unit_price_cents, line_total_cents)
       select $1, 'service', id, 'Photo', 2, 15000, 30000 from public.services where slug = 'wedding-photography-outdoor'`, [a.quoteId]);
    await expect(c.query(`select public.accept_quote($1, 'A', 'ip')`, [a.token])).resolves.toBeTruthy();
    const b = await makeSentQuote(c, { email: 'marie-b@example.com', date, start: '15:00', end: '19:00', serviceSlug: 'wedding-photography-outdoor' });
    await expect(c.query(`select public.accept_quote($1, 'B', 'ip')`, [b.token])).rejects.toThrow('item_unavailable');
  });

  it('reporting a payment does not confirm; recording it confirms and creates the balance invoice', async () => {
    const date = futureDate(240);
    const q = await makeSentQuote(c, { email: 'pay@example.com', date, start: '10:00', end: '12:00', serviceSlug: 'wedding-arch', totalCents: 100000 });
    const acc = await c.query(`select public.accept_quote($1, 'Payer', 'ip') as r`, [q.token]);
    const { booking_id, invoice_id, invoice_token } = acc.rows[0].r;

    const inv = await c.query('select * from public.invoices where id = $1', [invoice_id]);
    expect(inv.rows[0].kind).toBe('deposit');
    expect(Number(inv.rows[0].amount_cents)).toBe(50000);
    expect(inv.rows[0].etransfer_reference).toMatch(/^FMV\d{4,}$/);

    await c.query(`select public.report_invoice_payment($1)`, [invoice_token]);
    const afterReport = await c.query('select status from public.bookings where id = $1', [booking_id]);
    expect(afterReport.rows[0].status).toBe('held');
    expect((await c.query('select status from public.invoices where id = $1', [invoice_id])).rows[0].status).toBe('reported');

    // Partial payment: still not confirmed.
    const p1 = await c.query(`select public.record_payment($1, 'etransfer', 20000, now(), 'part', null) as r`, [invoice_id]);
    expect(p1.rows[0].r.booking_confirmed).toBe(false);
    const p2 = await c.query(`select public.record_payment($1, 'etransfer', 30000, now(), 'rest', null) as r`, [invoice_id]);
    expect(p2.rows[0].r.booking_confirmed).toBe(true);
    expect(p2.rows[0].r.balance_invoice_id).toBeTruthy();

    const bal = await c.query('select * from public.invoices where id = $1', [p2.rows[0].r.balance_invoice_id]);
    expect(bal.rows[0].kind).toBe('balance');
    expect(Number(bal.rows[0].amount_cents)).toBe(50000);
    expect((await c.query('select status from public.bookings where id = $1', [booking_id])).rows[0].status).toBe('confirmed');
  });

  it('an unpaid hold expires, voids its invoice and frees the date', async () => {
    const date = futureDate(250);
    const a = await makeSentQuote(c, { email: 'exp-a@example.com', date, start: '10:00', end: '12:00', serviceSlug: 'mirror-photobooth' });
    const acc = await c.query(`select public.accept_quote($1, 'A', 'ip') as r`, [a.token]);
    const bookingId = acc.rows[0].r.booking_id;
    await c.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [bookingId]);

    const n = await c.query('select public.expire_stale_holds() as n');
    expect(n.rows[0].n).toBeGreaterThanOrEqual(1);
    const b = await c.query('select status, cancel_reason from public.bookings where id = $1', [bookingId]);
    expect(b.rows[0]).toEqual({ status: 'cancelled', cancel_reason: 'hold_expired' });
    const inv = await c.query('select status from public.invoices where booking_id = $1', [bookingId]);
    expect(inv.rows[0].status).toBe('void');
    const res = await c.query('select bool_or(active) as any_active from public.inventory_reservations where booking_id = $1', [bookingId]);
    expect(res.rows[0].any_active).toBe(false);

    const second = await makeSentQuote(c, { email: 'exp-b@example.com', date, start: '10:00', end: '12:00', serviceSlug: 'mirror-photobooth' });
    await expect(c.query(`select public.accept_quote($1, 'B', 'ip')`, [second.token])).resolves.toBeTruthy();
  });

  it('a hold with a reported payment is not auto-expired', async () => {
    const date = futureDate(255);
    const a = await makeSentQuote(c, { email: 'rep@example.com', date, start: '10:00', end: '12:00', serviceSlug: 'wedding-arch' });
    const acc = await c.query(`select public.accept_quote($1, 'A', 'ip') as r`, [a.token]);
    await c.query(`select public.report_invoice_payment($1)`, [acc.rows[0].r.invoice_token]);
    await c.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [acc.rows[0].r.booking_id]);
    await c.query('select public.expire_stale_holds()');
    const b = await c.query('select status from public.bookings where id = $1', [acc.rows[0].r.booking_id]);
    expect(b.rows[0].status).toBe('held');
  });

  it('accepting twice is idempotent', async () => {
    const date = futureDate(260);
    const a = await makeSentQuote(c, { email: 'twice@example.com', date, start: '10:00', end: '12:00', serviceSlug: 'wedding-arch' });
    const r1 = await c.query(`select public.accept_quote($1, 'A', 'ip') as r`, [a.token]);
    const r2 = await c.query(`select public.accept_quote($1, 'A', 'ip') as r`, [a.token]);
    expect(r2.rows[0].r.already_accepted).toBe(true);
    expect(r2.rows[0].r.booking_id).toBe(r1.rows[0].r.booking_id);
  });

  it('mini slot double-click: exactly one hold, and an expired hold frees the slot', async () => {
    const camp = await c.query(
      `insert into public.mini_campaigns (slug, name, price_cents, duration_min, status, payment_mode)
       values ('test-minis-' || floor(random()*1e9)::text, 'Test Minis', 6000, 15, 'live', 'full') returning id`);
    const slot = await c.query(
      `insert into public.mini_slots (campaign_id, starts_at, ends_at)
       values ($1, now() + interval '20 days', now() + interval '20 days 15 minutes') returning id`, [camp.rows[0].id]);
    const cl1 = await c.query(`insert into public.clients (full_name, email) values ('M1', 'mini1@example.com') returning id`);
    const cl2 = await c.query(`insert into public.clients (full_name, email) values ('M2', 'mini2@example.com') returning id`);

    const c1 = new pg.Client({ connectionString: TEST_DB_URL });
    const c2 = new pg.Client({ connectionString: TEST_DB_URL });
    await Promise.all([c1.connect(), c2.connect()]);
    const results = await Promise.allSettled([
      c1.query(`select public.hold_mini_slot($1, $2, null) as r`, [slot.rows[0].id, cl1.rows[0].id]),
      c2.query(`select public.hold_mini_slot($1, $2, null) as r`, [slot.rows[0].id, cl2.rows[0].id]),
    ]);
    await Promise.all([c1.end(), c2.end()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason.message).toBe('slot_taken');

    const won = (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<pg.QueryResult>).value.rows[0].r;
    expect(won.amount_cents).toBe(6000);

    const open1 = await asRole(c, 'anon', {}, async () =>
      (await c.query('select is_open from public.mini_slot_availability($1)', [camp.rows[0].id])).rows[0].is_open);
    expect(open1).toBe(false);

    await c.query(`update public.mini_bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [won.mini_booking_id]);
    const open2 = await asRole(c, 'anon', {}, async () =>
      (await c.query('select is_open from public.mini_slot_availability($1)', [camp.rows[0].id])).rows[0].is_open);
    expect(open2).toBe(true);
    // A new hold succeeds (the stale one is expired inside the function).
    await expect(c.query(`select public.hold_mini_slot($1, $2, null)`, [slot.rows[0].id, cl2.rows[0].id])).resolves.toBeTruthy();
  });

  it('recording a mini payment confirms the mini booking', async () => {
    const camp = await c.query(
      `insert into public.mini_campaigns (slug, name, price_cents, duration_min, status)
       values ('test-minis-pay-' || floor(random()*1e9)::text, 'Pay Minis', 8000, 20, 'live') returning id`);
    const slot = await c.query(
      `insert into public.mini_slots (campaign_id, starts_at, ends_at)
       values ($1, now() + interval '30 days', now() + interval '30 days 20 minutes') returning id`, [camp.rows[0].id]);
    const cl = await c.query(`insert into public.clients (full_name, email) values ('M3', 'mini3@example.com') returning id`);
    const h = await c.query(`select public.hold_mini_slot($1, $2, null) as r`, [slot.rows[0].id, cl.rows[0].id]);
    const r = await c.query(`select public.record_payment($1, 'etransfer', 8000, now(), null, null) as r`, [h.rows[0].r.invoice_id]);
    expect(r.rows[0].r.mini_confirmed).toBe(true);
  });

  it('a client only sees their own bookings and invoices', async () => {
    const date = futureDate(270);
    const mine = await makeSentQuote(c, { email: 'portal-me@example.com', date, start: '10:00', end: '11:00', serviceSlug: 'wedding-arch' });
    await c.query(`select public.accept_quote($1, 'Me', 'ip')`, [mine.token]);
    const u = await c.query(`insert into auth.users (email) values ('portal-me@example.com') returning id`);
    await asRole(c, 'authenticated', { sub: u.rows[0].id, email: 'portal-me@example.com', aal: 'aal1' }, async () => {
      const linked = await c.query('select public.link_my_client_account() as n');
      expect(linked.rows[0].n).toBe(1);
      const bookings = await c.query('select client_id from public.bookings');
      expect(bookings.rows.length).toBe(1);
      expect(bookings.rows[0].client_id).toBe(mine.clientId);
      const invoices = await c.query('select client_id from public.invoices');
      expect(invoices.rows.every((r) => r.client_id === mine.clientId)).toBe(true);
      const clients = await c.query('select id from public.clients');
      expect(clients.rows).toEqual([{ id: mine.clientId }]);
    });
  });
});
