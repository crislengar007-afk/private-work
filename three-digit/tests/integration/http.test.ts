import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csvCell } from '../../src/web/routes/admin.js';
import { Client, type TestServer, startSeededServer } from '../helpers/http.js';

let srv: TestServer;
const id = (sql: string, ...p: (string | number)[]) => srv.db.get<{ id: number }>(sql, ...p)!.id;
const userId = (email: string) => id('SELECT id FROM users WHERE email = ?', email);
const drawId = (like: string) => id('SELECT id FROM draws WHERE reference_label LIKE ?', `%${like}%`);

beforeAll(async () => {
  srv = await startSeededServer();
});
afterAll(async () => {
  await srv.close();
});

async function as(email: string) {
  const c = new Client(srv.base);
  await c.login(email);
  return c;
}

describe('routes render and survive a direct refresh (acceptance 16, 36)', () => {
  it('public pages', async () => {
    const c = new Client(srv.base);
    for (const p of ['/', '/rules', '/login', '/register', '/forgot-password', '/healthz']) {
      const r = await c.get(p);
      expect(r.status, p).toBe(200);
    }
    const home = await c.get('/');
    expect(home.text).toContain('DEMO — Walang totoong bayad o cash prize.');
    expect(home.text).toContain('₱10 taya → ₱3,100 total kapag panalo; kasama na ang taya.');
  });

  it('player pages', async () => {
    const c = await as('juan@demo.local');
    const entry = id(`SELECT e.id FROM entries e JOIN users u ON u.id = e.user_id WHERE u.email = 'juan@demo.local' ORDER BY e.id LIMIT 1`);
    const ticket = id(`SELECT t.id FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE u.email = 'juan@demo.local'`);
    const pages = ['/app', '/app/entries', '/app/entries/new', `/app/entries/${entry}`, `/app/entries/${entry}/payment`, '/app/results', `/app/results/${drawId('Draw D')}`, `/app/results/${drawId('Draw E')}`, '/app/account', '/app/support', `/app/support/${ticket}`, '/app/entries?status=approved', '/rules'];
    for (const p of pages) {
      const r = await c.get(p);
      expect(r.status, p).toBe(200);
      expect(r.text, p).toContain('DEMO — Walang totoong bayad');
    }
    const corrected = await c.get(`/app/results/${drawId('Draw E')}`);
    expect(corrected.text).toContain('corrected');
  });

  it('admin pages', async () => {
    const c = await as('admin@demo.local');
    const payment = id(`SELECT p.id FROM payments p JOIN entries e ON e.id = p.entry_id WHERE e.eligibility_status = 'pending_verification' LIMIT 1`);
    const team = id(`SELECT id FROM teams WHERE name = 'Team Alpha'`);
    const ticket = id('SELECT id FROM support_tickets LIMIT 1');
    const pages = ['/admin', '/admin/draws', `/admin/draws/${drawId('Draw A')}`, `/admin/draws/${drawId('Draw G')}`, `/admin/draws/${drawId('Draw E')}`, '/admin/payments', '/admin/payments?view=claims', `/admin/payments/${payment}`, '/admin/entries', '/admin/entries?combination=321', '/admin/results', '/admin/refunds', '/admin/payouts', '/admin/users', `/admin/users/${userId('juan@demo.local')}`, '/admin/settings', '/admin/audit', '/admin/audit?q=payment', '/admin/support', `/admin/support/${ticket}`, '/admin/teams', `/admin/teams/${team}`, '/admin/agents', '/admin/entries.csv'];
    for (const p of pages) {
      const r = await c.get(p);
      expect(r.status, p).toBe(200);
    }
    const draw = await c.get(`/admin/draws/${drawId('Draw A')}`);
    expect(draw.text).toContain('Worst case, approved entries');
    expect(draw.text).toContain('Full');
  });

  it('team and agent pages', async () => {
    const lead = await as('leader.a@demo.local');
    for (const p of ['/team', '/team/agents', `/team/agents/${userId('agent.a1@demo.local')}`, '/team/reports']) expect((await lead.get(p)).status, p).toBe(200);
    const agent = await as('agent.a1@demo.local');
    expect((await agent.get('/agent')).status).toBe(200);
  });

  it('unknown routes return a friendly 404', async () => {
    const r = await new Client(srv.base).get('/nope');
    expect(r.status).toBe(404);
    expect(r.text).toContain('Not found');
  });
});

describe('authentication and authorization (acceptance 8, 31)', () => {
  it('redirects anonymous users to login', async () => {
    const r = await new Client(srv.base).get('/app/entries');
    expect(r.status).toBe(303);
    expect(r.location).toBe('/login?next=%2Fapp%2Fentries');
  });

  it('players cannot reach admin pages or operations', async () => {
    const c = await as('juan@demo.local');
    expect((await c.get('/admin')).status).toBe(403);
    expect((await c.get('/admin/payments')).status).toBe(403);
    const payment = id(`SELECT p.id FROM payments p JOIN entries e ON e.id = p.entry_id WHERE e.eligibility_status = 'pending_verification' LIMIT 1`);
    expect((await c.post(`/admin/payments/${payment}/approve`, { confirm: 'on' })).status).toBe(403);
    expect((await c.post('/admin/results', { draw_id: String(drawId('Draw C')), result: '123456' })).status).toBe(403);
  });

  it("player A cannot read player B's entry, proof or ticket", async () => {
    const c = await as('juan@demo.local');
    const mariaEntry = id(`SELECT e.id FROM entries e JOIN users u ON u.id = e.user_id WHERE u.email = 'maria@demo.local' LIMIT 1`);
    const mariaProof = srv.db.get<{ k: string }>(`SELECT p.proof_object_key AS k FROM payments p JOIN entries e ON e.id = p.entry_id JOIN users u ON u.id = e.user_id WHERE u.email = 'maria@demo.local' AND p.proof_object_key IS NOT NULL LIMIT 1`)!.k;
    const mariaTicket = id(`SELECT t.id FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE u.email = 'maria@demo.local'`);
    expect((await c.get(`/app/entries/${mariaEntry}`)).status).toBe(404);
    expect((await c.get(`/app/entries/${mariaEntry}/payment`)).status).toBe(404);
    expect((await c.post(`/app/entries/${mariaEntry}/payment`, { reference: 'STEALREF01', simulateReceipt: 'on' })).status).toBe(404);
    expect((await c.get(`/proofs/${mariaProof}`)).status).toBe(404);
    expect((await c.get(`/app/support/${mariaTicket}`)).status).toBe(404);
    expect((await c.post(`/app/support/${mariaTicket}/messages`, { body: 'hi' })).status).toBe(404);
    const maria = await as('maria@demo.local');
    expect((await maria.get(`/proofs/${mariaProof}`)).status).toBe(200);
  });

  it('staff see only the console pages their role allows', async () => {
    const pay = await as('payments@demo.local');
    expect((await pay.get('/admin/payments')).status).toBe(200);
    expect((await pay.get('/admin/users')).status).toBe(403);
    expect((await pay.get('/admin/entries.csv')).status).toBe(403);
    const editor = await as('editor@demo.local');
    expect((await editor.get('/admin/results')).status).toBe(200);
    expect((await editor.get('/admin/payments')).status).toBe(403);
    expect((await editor.get('/admin/entries')).status).toBe(403);
  });

  it('public registration cannot grant privileged roles', async () => {
    const c = new Client(srv.base);
    await c.get('/register');
    const r = await c.post('/register', { displayName: 'Sneaky', email: 'sneaky@example.test', password: 'Password1234', confirm: 'Password1234', ageAck: 'on', termsAck: 'on', role: 'admin', roles: ['admin', 'team_leader'] });
    expect(r.status).toBe(303);
    const roles = srv.db.all<{ role: string }>(`SELECT r.role FROM user_roles r JOIN users u ON u.id = r.user_id WHERE u.email = 'sneaky@example.test'`);
    expect(roles).toEqual([{ role: 'player' }]);
    expect((await c.get('/admin')).status).toBe(403);
    // Profile updates cannot set roles either.
    await c.post('/app/account/profile', { displayName: 'Sneaky Two', role: 'admin' });
    expect(srv.db.all(`SELECT r.role FROM user_roles r JOIN users u ON u.id = r.user_id WHERE u.email = 'sneaky@example.test'`)).toEqual([{ role: 'player' }]);
  });

  it('registration validates passwords and does not reveal existing accounts', async () => {
    const c = new Client(srv.base);
    await c.get('/register');
    const weak = await c.post('/register', { displayName: 'X Y', email: 'weak@example.test', password: 'short', confirm: 'short', ageAck: 'on', termsAck: 'on' });
    expect(weak.status).toBe(422);
    expect(weak.text).toContain('at least 10 characters');
    const dup = await c.post('/register', { displayName: 'Dup', email: 'juan@demo.local', password: 'Password1234', confirm: 'Password1234', ageAck: 'on', termsAck: 'on' });
    expect(dup.status).toBe(422);
    expect(dup.text).not.toContain('already exists');
  });

  it('rejects POSTs without a valid CSRF token', async () => {
    const c = await as('juan@demo.local');
    const r = await c.post('/app/account/profile', { displayName: 'CSRF Test' }, { csrf: false });
    expect(r.status).toBe(403);
  });

  it('login failure does not reveal whether the email exists', async () => {
    const c = new Client(srv.base);
    await c.get('/login');
    const a = await c.post('/login', { email: 'juan@demo.local', password: 'wrong-password-1' });
    const b = await c.post('/login', { email: 'nobody@demo.local', password: 'wrong-password-1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.text).toContain('Email or password is incorrect.');
    expect(b.text).toContain('Email or password is incorrect.');
  });
});

describe('team hierarchy isolation (acceptance 27–33)', () => {
  it('admin sees both teams and all agents without switching accounts', async () => {
    const c = await as('admin@demo.local');
    const teams = await c.get('/admin/teams');
    expect(teams.text).toContain('Team Alpha');
    expect(teams.text).toContain('Team Bravo');
    const agents = await c.get('/admin/agents');
    for (const a of ['Andy Agent A1', 'Bert Agent B1', 'Una Unassigned Agent']) expect(agents.text).toContain(a);
  });

  it('leader A sees only Team Alpha; Team Bravo and unassigned agents are invisible', async () => {
    const c = await as('leader.a@demo.local');
    const list = await c.get('/team/agents');
    expect(list.text).toContain('Andy Agent A1');
    expect(list.text).toContain('Abby Agent A2');
    for (const leak of ['Bert Agent B1', 'Bea Agent B2', 'Una Unassigned', 'Team Bravo', 'Ben Team-B Leader']) expect(list.text).not.toContain(leak);
    const dash = await c.get('/team');
    expect(dash.text).not.toContain('Team Bravo');
    expect(dash.text).not.toContain('Bert');
    // Guessed IDs, other teams' agents and unassigned agents: identical 404.
    const b1 = await c.get(`/team/agents/${userId('agent.b1@demo.local')}`);
    const free = await c.get(`/team/agents/${userId('agent.free@demo.local')}`);
    const nobody = await c.get('/team/agents/999999');
    expect([b1.status, free.status, nobody.status]).toEqual([404, 404, 404]);
    expect(b1.text).not.toContain('Bert');
    // Forged team_id parameters are ignored.
    const forged = await c.get(`/team/agents?team_id=${id(`SELECT id FROM teams WHERE name = 'Team Bravo'`)}`);
    expect(forged.text).not.toContain('Bert Agent B1');
    // No admin access.
    expect((await c.get('/admin/teams')).status).toBe(403);
    expect((await c.get(`/admin/teams/${id(`SELECT id FROM teams WHERE name = 'Team Bravo'`)}`)).status).toBe(403);
    expect((await c.get('/admin/entries.csv')).status).toBe(403);
  });

  it('leader B has reciprocal isolation', async () => {
    const c = await as('leader.b@demo.local');
    const list = await c.get('/team/agents');
    expect(list.text).toContain('Bert Agent B1');
    expect(list.text).not.toContain('Andy Agent A1');
    expect(list.text).not.toContain('Team Alpha');
    expect((await c.get(`/team/agents/${userId('agent.a1@demo.local')}`)).status).toBe(404);
    // A2 used to be in Bravo; history stays, but the profile is no longer accessible.
    expect((await c.get(`/team/agents/${userId('agent.a2@demo.local')}`)).status).toBe(404);
  });

  it('agents see only their own dashboard', async () => {
    const c = await as('agent.a1@demo.local');
    const me = await c.get('/agent');
    expect(me.text).toContain('Team Alpha');
    expect(me.text).not.toContain('Abby');
    expect((await c.get('/team')).status).toBe(403);
    expect((await c.get('/team/reports')).status).toBe(403);
    expect((await c.get('/admin')).status).toBe(403);
  });

  it('assignment changes and role revocation apply on the next request', async () => {
    const leaderA = await as('leader.a@demo.local');
    const a1 = userId('agent.a1@demo.local');
    expect((await leaderA.get(`/team/agents/${a1}`)).status).toBe(200);
    const admin = await as('admin@demo.local');
    const bravo = id(`SELECT id FROM teams WHERE name = 'Team Bravo'`);
    expect((await admin.post(`/admin/agents/${a1}/assign`, { team_id: String(bravo) })).status).toBe(303);
    expect((await leaderA.get(`/team/agents/${a1}`)).status).toBe(404);
    const leaderB = await as('leader.b@demo.local');
    expect((await leaderB.get(`/team/agents/${a1}`)).status).toBe(200);
    // Move back.
    await admin.post(`/admin/agents/${a1}/assign`, { team_id: String(id(`SELECT id FROM teams WHERE name = 'Team Alpha'`)) });
    // Revoke the reviewer role: the existing session loses access immediately.
    const pay = await as('payments@demo.local');
    expect((await pay.get('/admin/payments')).status).toBe(200);
    await admin.post(`/admin/users/${userId('payments@demo.local')}/roles/revoke`, { role: 'payment_reviewer' });
    expect((await pay.get('/admin/payments')).status).toBe(403);
    await admin.post(`/admin/users/${userId('payments@demo.local')}/roles`, { role: 'payment_reviewer' });
  });

  it('combining a team-scoped role with a global staff role needs explicit confirmation', async () => {
    const admin = await as('admin@demo.local');
    const lead = userId('leader.a@demo.local');
    await admin.post(`/admin/users/${lead}/roles`, { role: 'payment_reviewer' });
    expect(srv.db.get(`SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'payment_reviewer'`, lead)).toBeUndefined();
    await admin.post(`/admin/users/${lead}/roles`, { role: 'payment_reviewer', confirmScope: 'on' });
    expect(srv.db.get(`SELECT combined_scope_confirmed AS c FROM user_roles WHERE user_id = ? AND role = 'payment_reviewer'`, lead)).toEqual({ c: 1 });
    await admin.post(`/admin/users/${lead}/roles/revoke`, { role: 'payment_reviewer' });
  });
});

describe('player → admin flow over HTTP', () => {
  it('select digits, review, reserve, pay, get approved', async () => {
    const juan = await as('juan@demo.local');
    const A = drawId('Draw A');
    // Server-side validation of bad digits.
    const bad = await juan.post('/app/entries/review', { draw_id: String(A), digits: '112', stake_minor: '1000' });
    expect(bad.status).toBe(422);
    expect(bad.text).toContain('Bawal ang umuulit na digit');
    expect(bad.text).toContain('value="112"'); // draft preserved
    // Unsupported stake.
    const stake = await juan.post('/app/entries/review', { draw_id: String(A), digits: '579', stake_minor: '2000' });
    expect(stake.status).toBe(422);
    const review = await juan.post('/app/entries/review', { draw_id: String(A), digits: '579', stake_minor: '1000' });
    expect(review.status).toBe(200);
    expect(review.text).toContain('579 · 597 · 759 · 795 · 957 · 975');
    expect(review.text).toContain('Available: ₱500');
    const key = /name="idempotency_key" value="([^"]+)"/.exec(review.text)![1];
    const form = { draw_id: String(A), digits: '579', stake_minor: '1000', idempotency_key: key, ack: 'on' };
    const confirm = await juan.post('/app/entries', form);
    expect(confirm.status).toBe(303);
    const again = await juan.post('/app/entries', form); // double submit
    expect(again.location).toBe(confirm.location);
    const entryId = Number(/\/app\/entries\/(\d+)\/payment/.exec(confirm.location!)![1]);
    expect(srv.db.get<{ n: number }>(`SELECT count(*) AS n FROM entries WHERE user_id = ? AND canonical_key = '579' AND draw_id = ?`, userId('juan@demo.local'), A)!.n).toBe(1);
    const payPage = await juan.get(`/app/entries/${entryId}/payment`);
    expect(payPage.text).toContain('DEMO MERCHANT');
    const paid = await juan.post(`/app/entries/${entryId}/payment`, { reference: 'HTTPFLOW001', simulateReceipt: 'on', sampleProof: 'on' });
    expect(paid.status).toBe(303);
    expect(srv.db.get('SELECT eligibility_status AS s FROM entries WHERE id = ?', entryId)).toEqual({ s: 'pending_verification' });
    const reviewer = await as('payments@demo.local');
    const pid = id('SELECT id FROM payments WHERE entry_id = ?', entryId);
    const detail = await reviewer.get(`/admin/payments/${pid}`);
    expect(detail.text).toContain('Ledger-confirmed receipt exists');
    await reviewer.post(`/admin/payments/${pid}/approve`, { confirm: 'on' });
    expect(srv.db.get('SELECT eligibility_status AS s FROM entries WHERE id = ?', entryId)).toEqual({ s: 'approved' });
    const view = await juan.get(`/app/entries/${entryId}`);
    expect(view.text).toContain('Approved');
    expect(view.text).toContain('Pending result');
  });

  it('capacity API reports ₱490 used / ₱10 available, and ₱500 full', async () => {
    const c = await as('pedro@demo.local');
    const A = drawId('Draw A');
    const r = await c.get(`/api/capacity?draw_id=${A}&digits=321`);
    const j = JSON.parse(r.text);
    expect(j).toMatchObject({ ok: true, canonical: '123', usedText: 'Used/reserved: ₱490', availableText: 'Available: ₱10', full: false });
    const full = JSON.parse((await c.get(`/api/capacity?draw_id=${A}&digits=654`)).text);
    expect(full).toMatchObject({ full: true, availableMinor: 0 });
    const review = await c.post('/app/entries/review', { draw_id: String(A), digits: '546', stake_minor: '1000' });
    expect(review.text).toContain('already reached the ₱500 limit');
    expect(review.text).toMatch(/Confirm &amp; reserve slot|Confirm & reserve slot/);
    expect(review.text).toMatch(/disabled aria-disabled="true">Confirm/);
  });

  it('editor cannot self-publish over HTTP; second reviewer publishes', async () => {
    const editor = await as('editor@demo.local');
    const C = drawId('Draw C');
    await editor.post('/admin/results', { draw_id: String(C), result: '123456', source_label: 'SAMPLE — demo', source_url: '', correction_reason: '' });
    const v = id(`SELECT id FROM result_versions WHERE draw_id = ? AND state = 'submitted'`, C);
    expect((await editor.post(`/admin/results/${v}/publish`, { confirm: 'on' })).status).toBe(403);
    const reviewer = await as('reviewer@demo.local');
    await reviewer.post(`/admin/results/${v}/publish`, { confirm: 'on' });
    expect(srv.db.get('SELECT state, matching_state FROM result_versions WHERE id = ?', v)).toEqual({ state: 'published', matching_state: 'complete' });
    const juan = await as('juan@demo.local');
    const res = await juan.get(`/app/results/${C}`);
    expect(res.text).toContain('Won');
    expect(res.text).toContain('Not eligible');
  });
});

describe('CSV export', () => {
  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('012')).toBe('012');
  });
});

describe('simultaneous submissions over HTTP (₱490 → one winner)', () => {
  it('four players confirming the last ₱10 at once: exactly one reservation', async () => {
    const A = drawId('Draw A');
    const before = srv.db.get<{ r: number; a: number }>(`SELECT reserved_minor AS r, approved_minor AS a FROM combination_capacity WHERE draw_id = ? AND canonical_key = '123'`, A)!;
    expect(before.r + before.a).toBe(49000);
    const players = ['sample50@demo.local', 'juan@demo.local', 'maria@demo.local', 'pedro@demo.local'];
    const clients = await Promise.all(players.map((e) => as(e)));
    const reviews = await Promise.all(clients.map((c, i) => c.post('/app/entries/review', { draw_id: String(A), digits: ['123', '231', '312', '321'][i], stake_minor: '1000' })));
    // Everyone was shown ₱10 available (stale by the time they confirm).
    for (const r of reviews) expect(r.text).toContain('Available: ₱10');
    const keys = reviews.map((r) => /name="idempotency_key" value="([^"]+)"/.exec(r.text)![1]);
    const results = await Promise.all(
      clients.map((c, i) => c.post('/app/entries', { draw_id: String(A), digits: ['123', '231', '312', '321'][i], stake_minor: '1000', idempotency_key: keys[i], ack: 'on' })),
    );
    const ok = results.filter((r) => r.status === 303);
    const full = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(full).toHaveLength(3);
    for (const r of full) expect(r.text).toContain('already reached the ₱500 limit');
    const after = srv.db.get<{ r: number; a: number }>(`SELECT reserved_minor AS r, approved_minor AS a FROM combination_capacity WHERE draw_id = ? AND canonical_key = '123'`, A)!;
    expect(after.r + after.a).toBe(50000);
  });
});

describe('role access: searches, API, exports, proofs', () => {
  it("player search and result pages never show another player's entries", async () => {
    const c = await as('juan@demo.local');
    const mariaRef = srv.db.get<{ r: string }>(`SELECT e.public_ref AS r FROM entries e JOIN users u ON u.id = e.user_id WHERE u.email = 'maria@demo.local' LIMIT 1`)!.r;
    const mariaEntry = id(`SELECT id FROM entries WHERE public_ref = ?`, mariaRef);
    const search = await c.get(`/app/entries?q=${encodeURIComponent(mariaRef)}`);
    expect(search.status).toBe(200);
    // The query is echoed in the search box only; no result row or link leaks.
    expect(search.text.split(mariaRef)).toHaveLength(2);
    expect(search.text).toContain(`value="${mariaRef}"`);
    expect(search.text).not.toContain(`/app/entries/${mariaEntry}"`);
    expect(search.text).toContain('No matching entries');
    const result = await c.get(`/app/results/${drawId('Draw D')}`);
    expect(result.text).not.toContain(mariaRef);
  });

  it('non-player roles cannot use the player API; only admins can export', async () => {
    for (const email of ['leader.a@demo.local', 'agent.a1@demo.local']) {
      const c = await as(email);
      const api = await c.get(`/api/capacity?draw_id=${drawId('Draw A')}&digits=123`);
      expect(api.status, email).toBe(403);
      expect(JSON.parse(api.text).ok).toBe(false);
      expect((await c.get('/admin/entries.csv')).status, email).toBe(403);
    }
    const player = await as('pedro@demo.local');
    expect((await player.get('/admin/entries.csv')).status).toBe(403);
    expect((await new Client(srv.base).get('/api/capacity?draw_id=1&digits=123')).status).toBe(303);
  });

  it('team leader search cannot reach another team; agents cannot open team pages', async () => {
    const lead = await as('leader.a@demo.local');
    const r = await lead.get('/team/agents?q=Bert');
    expect(r.text).not.toContain('Bert Agent B1');
    expect(r.text).not.toContain('agent.b1@demo.local');
    expect(r.text).toContain('No matching agents');
    const proof = srv.db.get<{ k: string }>(`SELECT proof_object_key AS k FROM payments WHERE proof_object_key IS NOT NULL LIMIT 1`)!.k;
    expect((await lead.get(`/proofs/${proof}`)).status).toBe(404);
    const agent = await as('agent.a1@demo.local');
    expect((await agent.get(`/team/agents/${userId('agent.a1@demo.local')}`)).status).toBe(403);
    expect((await agent.get(`/proofs/${proof}`)).status).toBe(404);
  });

  it('result entry and publication stay with separate reviewers', async () => {
    const pay = await as('payments@demo.local');
    expect((await pay.get('/admin/results')).status).toBe(403);
    expect((await pay.post('/admin/results/1/publish', { confirm: 'on' })).status).toBe(403);
    const reviewer = await as('reviewer@demo.local');
    expect((await reviewer.post('/admin/results', { draw_id: String(drawId('Draw B')), result: '123456' })).status).toBe(403);
  });

  it('admin draw page and overview show the money breakdown and scenarios', async () => {
    const c = await as('admin@demo.local');
    const draw = await c.get(`/admin/draws/${drawId('Draw A')}`);
    for (const t of ['Collected payments', 'Reserved capacity (not yet approved)', 'Potential payout', 'Hypothetical funding shortfall', 'e.g. result 123456']) expect(draw.text).toContain(t);
    const overview = await c.get('/admin');
    for (const t of ['₱1,200.00', '₱62,000.00', '₱60,000.00', '₱3,100,000.00', 'Hypothetical shortfall']) expect(overview.text).toContain(t);
  });
});

describe('error pages keep the signed-in user’s own menu', () => {
  const nav = (html: string) => /<nav class="mainnav"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  const side = (html: string) => /<nav class="sidenav"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';

  it('team leader: /admin (403) and another team’s agent (404) show the Team menu', async () => {
    const c = await as('leader.a@demo.local');
    const denied = await c.get('/admin');
    expect(denied.status).toBe(403);
    expect(denied.text).toContain('<title>Access denied');
    expect(nav(denied.text)).toContain('href="/team/agents"');
    expect(nav(denied.text)).not.toContain('href="/login"');
    const missing = await c.get(`/team/agents/${userId('agent.b1@demo.local')}`);
    expect(missing.status).toBe(404);
    expect(nav(missing.text)).toContain('My agents');
    expect(missing.text).toContain('Go to your dashboard');
    expect(missing.text).toContain('href="/team"');
  });

  it('agent: /team (403) shows the Agent menu', async () => {
    const c = await as('agent.a1@demo.local');
    const r = await c.get('/team');
    expect(r.status).toBe(403);
    expect(nav(r.text)).toContain('href="/agent"');
    expect(nav(r.text)).not.toContain('href="/team/agents"');
  });

  it('player: unknown entry and unknown URL show the Player menu', async () => {
    const c = await as('juan@demo.local');
    for (const p of ['/app/entries/999999', '/no-such-page', '/admin']) {
      const r = await c.get(p);
      expect([403, 404], p).toContain(r.status);
      expect(nav(r.text), p).toContain('href="/app/entries/new"');
    }
  });

  it('staff: a page outside their role keeps their own console menu only', async () => {
    const c = await as('payments@demo.local');
    const r = await c.get('/admin/users');
    expect(r.status).toBe(403);
    expect(side(r.text)).toContain('href="/admin/payments"');
    expect(side(r.text)).not.toContain('href="/admin/users"');
  });

  it('anonymous visitors still get the public menu', async () => {
    const r = await new Client(srv.base).get('/no-such-page');
    expect(r.status).toBe(404);
    expect(nav(r.text)).toContain('href="/login"');
  });
});
