import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { asRole, connect, dbAvailable } from './helpers';

const available = await dbAvailable();
const d = available ? describe : describe.skip;

d('schema guarantees', () => {
  let c: pg.Client;
  beforeAll(async () => {
    c = await connect();
  });
  afterAll(async () => {
    await c?.end();
  });

  it('every public table has RLS enabled and a policy for each operation it allows', async () => {
    const r = await c.query(`
      select t.relname as table, t.relrowsecurity as rls,
             (select count(*) from pg_policy p where p.polrelid = t.oid) as policies
      from pg_class t join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relkind = 'r' order by 1`);
    expect(r.rows.length).toBeGreaterThan(25);
    for (const row of r.rows) {
      expect(row.rls, `${row.table} must have RLS`).toBe(true);
      expect(Number(row.policies), `${row.table} needs at least one policy`).toBeGreaterThan(0);
    }
    // No catch-all "FOR ALL" policies.
    const all = await c.query(`select polname from pg_policy where polcmd = '*'
      and polrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)`);
    expect(all.rows).toEqual([]);
  });

  it('every foreign key column is indexed', async () => {
    const r = await c.query(`
      select con.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.contype = 'f' and con.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i where i.indrelid = con.conrelid and i.indkey[0] = con.conkey[1])`);
    expect(r.rows).toEqual([]);
  });

  it('anon cannot read settings, and public_settings() never exposes the e-Transfer email', async () => {
    await c.query(`update public.settings set etransfer_email = 'pay@example.com' where id = 1`);
    await asRole(c, 'anon', {}, async () => {
      const rows = await c.query('select * from public.settings');
      expect(rows.rows).toEqual([]);
      const pub = await c.query('select * from public.public_settings()');
      expect(pub.rows).toHaveLength(1);
      expect(Object.keys(pub.rows[0])).not.toContain('etransfer_email');
      expect(JSON.stringify(pub.rows[0])).not.toContain('pay@example.com');
    });
  });

  it('refuses AI-generated media in the portfolio at the database level', async () => {
    await expect(
      c.query(`insert into public.media (storage_path, is_ai_generated, show_in_portfolio) values ('x.jpg', true, true)`),
    ).rejects.toThrow(/media_ai_never_portfolio/);
    const ok = await c.query(
      `insert into public.media (storage_path, is_ai_generated, mood_theme) values ('board.jpg', true, 'Under the Sea') returning id`,
    );
    await expect(
      c.query(`update public.media set show_in_portfolio = true where id = $1`, [ok.rows[0].id]),
    ).rejects.toThrow(/media_ai_never_portfolio/);
    await c.query('delete from public.media where id = $1', [ok.rows[0].id]);
  });

  it('anon sees only active+public catalog rows and no unpriced add-ons', async () => {
    await asRole(c, 'anon', {}, async () => {
      const svcs = await c.query('select status, is_public from public.services');
      expect(svcs.rows.length).toBeGreaterThan(0);
      expect(svcs.rows.every((s) => s.status === 'active' && s.is_public)).toBe(true);
      const addons = await c.query('select * from public.addons');
      expect(addons.rows).toEqual([]); // seeded as needs_price
      const pkgs = await c.query('select * from public.packages');
      expect(pkgs.rows).toEqual([]); // seeded as draft
      const inv = await c.query('select * from public.inventory_items');
      expect(inv.rows).toEqual([]);
    });
  });

  it('anon cannot insert inquiries or call the booking functions directly', async () => {
    await asRole(c, 'anon', {}, async () => {
      await c.query('savepoint s1');
      await expect(c.query(`select public.accept_quote('x', 'y', 'z')`)).rejects.toThrow(/permission denied/);
      await c.query('rollback to savepoint s1');
      await expect(c.query(`select public.hold_mini_slot(gen_random_uuid(), gen_random_uuid(), null)`)).rejects.toThrow(/permission denied/);
      await c.query('rollback to savepoint s1');
      await expect(
        c.query(`insert into public.clients (full_name, email) values ('x', 'x@example.com')`),
      ).rejects.toThrow(/row-level security|permission denied/);
    });
  });

  it('an active service must have a price', async () => {
    await expect(
      c.query(`update public.services set price_cents = null where slug = 'video-guestbook'`),
    ).rejects.toThrow(/services_active_needs_price/);
  });

  it('numbers documents per year and e-Transfer references globally', async () => {
    const q = await c.query(`select public.next_doc_number('quote') as n`);
    expect(q.rows[0].n).toMatch(/^FMV-Q-\d{4}-\d{4}$/);
    const i = await c.query(`select public.next_doc_number('invoice') as n`);
    expect(i.rows[0].n).toMatch(/^FMV-\d{4}-\d{4}$/);
    const r = await c.query(`select public.next_doc_number('etransfer') as n`);
    expect(r.rows[0].n).toMatch(/^FMV\d{4,}$/);
  });

  it('policy edits bump the version', async () => {
    const before = await c.query(`select version from public.policies where key = 'weather'`);
    await c.query(`update public.policies set body_md = body_md || ' ' where key = 'weather'`);
    const after = await c.query(`select version from public.policies where key = 'weather'`);
    expect(after.rows[0].version).toBe(before.rows[0].version + 1);
  });

  it('owner powers require an MFA (aal2) session', async () => {
    const u = await c.query(`insert into auth.users (email) values ('owner-test@example.com') returning id`);
    const uid = u.rows[0].id;
    await c.query(`insert into public.user_roles (user_id, role) values ($1, 'owner')`, [uid]);
    await asRole(c, 'authenticated', { sub: uid, aal: 'aal1' }, async () => {
      const r = await c.query('select public.auth_role() as r');
      expect(r.rows[0].r).toBe('client');
      expect((await c.query('select * from public.settings')).rows).toEqual([]);
    });
    await asRole(c, 'authenticated', { sub: uid, aal: 'aal2' }, async () => {
      const r = await c.query('select public.auth_role() as r');
      expect(r.rows[0].r).toBe('owner');
      expect((await c.query('select * from public.settings')).rows).toHaveLength(1);
    });
  });

  it('staff cannot read payments, invoices or settings', async () => {
    const u = await c.query(`insert into auth.users (email) values ('staff-test@example.com') returning id`);
    const uid = u.rows[0].id;
    await c.query(`insert into public.user_roles (user_id, role) values ($1, 'staff')`, [uid]);
    await asRole(c, 'authenticated', { sub: uid, aal: 'aal2' }, async () => {
      expect((await c.query('select public.auth_role() as r')).rows[0].r).toBe('staff');
      expect((await c.query('select * from public.settings')).rows).toEqual([]);
      expect((await c.query('select * from public.invoices')).rows).toEqual([]);
      expect((await c.query('select * from public.payments')).rows).toEqual([]);
      // ...but can see inventory for the calendar
      expect((await c.query('select * from public.inventory_items')).rows.length).toBeGreaterThan(0);
    });
  });
});
