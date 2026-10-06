import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../demo-accounts.js';
import { GROSS_PAYOUT_MINOR, NET_GAIN_MINOR, STAKE_MINOR } from '../../domain/rules.js';
import { pesoShort } from '../../lib/format.js';
import { html } from '../../lib/html.js';
import { upcomingDraws } from '../../services/draws.js';
import { proofAccess } from '../../services/payments.js';
import { publishedResults } from '../../services/results.js';
import { authenticate, completePasswordReset, createPasswordReset, createSession, destroySession, register } from '../../services/users.js';
import { landingFor, page } from '../layout.js';
import { CSRF_COOKIE, SESSION_COOKIE, cookieOptions, str } from '../middleware.js';
import { alert, checkbox, countdown, csrfField, dataTable, errorSummary, field, icon, pageHeader, passwordField, phaseBadge, resultChips, time } from '../ui.js';

export const publicRouter = Router();

const PAYOUT_LINE = `₱10 taya → ₱3,100 total kapag panalo; kasama na ang taya.`;

function safeNext(v: unknown): string | null {
  const s = str(v);
  return /^\/(app|admin|team|agent)(\/[A-Za-z0-9/_?=&.-]*)?$/.test(s) ? s : null;
}

publicRouter.get('/', (req, res) => {
  const now = req.td.clock.now();
  const draws = upcomingDraws(req.td.db, now);
  const latest = publishedResults(req.td.db, 1)[0];
  const body = html`
  <section class="hero">
    <div>
      <p class="eyebrow">Local demo · simulated payments</p>
      <h1>Pili ng 3 magkakaibang digit. Panalo kapag lahat ng tatlo ay nasa six-digit result.</h1>
      <p class="lead">Choose three different digits (0–9). If all three appear anywhere in the six-digit sample result — any order, any position — the entry wins.</p>
      <p class="payout-line">${icon('trophy')} <strong>${PAYOUT_LINE}</strong></p>
      <div class="actions">
        ${req.td.actor
          ? html`<a class="btn btn--primary" href="${landingFor(req.td.actor.roles)}">Go to your dashboard ${icon('arrow')}</a>`
          : html`<a class="btn btn--primary" href="/register">Create a demo account</a><a class="btn btn--secondary" href="/login">Log in</a>`}
        <a class="btn btn--ghost" href="/rules">Read the rules</a>
      </div>
    </div>
    <figure class="hero__art">
      <img src="/static/media/hero.webp" width="1168" height="880" alt="Three tiles showing the digits 0, 4 and 7" fetchpriority="high">
    </figure>
  </section>

  <section class="section how">
    <div>
    <h2>How it works</h2>
    <ol class="steps">
      <li><strong>Create an account</strong><span>Players have their own login. Staff accounts are created by the administrator.</span></li>
      <li><strong>Pick 3 different digits</strong><span>123, 507 and 012 are valid. 112, 555 and 101 are not. 135 and 531 mean the same thing.</span></li>
      <li><strong>Simulate a ₱10 payment</strong><span>Your combination slot is reserved for 5 minutes while you pay (demo ledger only).</span></li>
      <li><strong>Wait for verification</strong><span>A payment reviewer approves it before the verification cutoff. Only approved entries can win.</span></li>
      <li><strong>Result is reviewed &amp; published</strong><span>One staff member enters the sample result, a different one publishes it. Outcomes are computed automatically.</span></li>
    </ol>
    </div>
    <div>
      <figure class="how__video">
        <video controls muted playsinline preload="none" poster="/static/media/how-it-works-poster.webp" width="1112" height="834" aria-describedby="how-video-desc">
          <source src="/static/media/how-it-works.mp4" type='video/mp4; codecs="avc1.640020"'>
          <source src="/static/media/how-it-works.webm" type='video/webm; codecs="vp9"'>
          <p>Your browser cannot play this video. It shows the digits 0, 4 and 7 matching the sample result 047123.</p>
        </video>
        <figcaption id="how-video-desc" class="small muted">8-second silent animation: you pick 0, 4 and 7; the six-digit sample result 047123 appears and the three matching digits light up. All three are present, so the entry wins.</figcaption>
      </figure>
      <div class="card hero__example" aria-label="Matching example">
        <p class="eyebrow">Example</p>
        <p>Entry <strong>135</strong> vs sample result</p>
        ${resultChips('123456', '135')}
        <p class="muted small">1, 3 and 5 all appear → <strong>Won</strong>. Entry 531 is the same combination and also wins. Entry 789 → Lost.</p>
      </div>
    </div>
  </section>

  <section class="section grid-2">
    <div>
      <h2>Upcoming sample draws</h2>
      ${draws.length
        ? draws.slice(0, 3).map(
            (d) => html`<article class="card draw-card">
              <div class="draw-card__head"><h3>${d.reference_label}</h3>${phaseBadge(d.phase)}</div>
              ${countdown(d.submission_closes_at, 'Submission & payment cutoff')}
              ${countdown(d.verification_closes_at, 'Verification cutoff')}
              <p class="muted small">Draw time: ${time(d.scheduled_draw_at)}</p>
            </article>`,
          )
        : html`<p class="muted">No sample draws are scheduled right now.</p>`}
    </div>
    <div>
      <h2>Latest published sample result</h2>
      ${latest
        ? html`<article class="card"><h3>${latest.draw_label}</h3>${resultChips(latest.six_digit_result)}
            <p class="muted small">${latest.source_label}${latest.corrected ? ' · Corrected' : ''} · published ${time(latest.published_at)}</p></article>`
        : html`<p class="muted">No results have been published yet.</p>`}
    </div>
  </section>`;
  res.send(page(req, { title: 'Home', area: 'public', body }));
});

publicRouter.get('/rules', (req, res) => {
  const examples: [string, string, string][] = [
    ['135', '123456', 'Won'],
    ['531', '123456', 'Won'],
    ['507', '705129', 'Won'],
    ['012', '001234', 'Won'],
    ['789', '123456', 'Lost'],
    ['123', '111222', 'Lost: digit 3 is absent'],
    ['112', 'Any result', 'Invalid entry, never accepted'],
  ];
  const body = html`${pageHeader('Rules & demo terms', 'Everything here describes a software demo. No real money, no official lottery.')}
  <div class="prose">
    <h2 id="matching">Matching</h2>
    <p>Each entry is exactly <strong>three different digits</strong> from 0–9. The winning reference is a <strong>six-digit result</strong>. An entry wins when <strong>all three</strong> of its digits appear <strong>anywhere</strong> in those six digits. Position and order do not matter and the digits need not be adjacent. Repeated digits in the result are allowed and never create more than one win for the same entry.</p>
    ${dataTable(
      [
        { label: 'Entry', render: (r: [string, string, string]) => html`<strong class="mono">${r[0]}</strong>` },
        { label: 'Result', render: (r) => html`<span class="mono">${r[1]}</span>` },
        { label: 'Outcome', render: (r) => r[2] },
      ],
      examples,
      { caption: 'Matching examples' },
    )}
    <h2 id="payout">Payout (confirmed rule)</h2>
    <p class="payout-line"><strong>${PAYOUT_LINE}</strong></p>
    <ul>
      <li>Only the fixed <strong>${pesoShort(STAKE_MINOR)}</strong> stake is currently authorized. Other amounts are disabled.</li>
      <li>A winning ${pesoShort(STAKE_MINOR)} entry returns <strong>${pesoShort(GROSS_PAYOUT_MINOR)} total</strong>, which already includes the ${pesoShort(STAKE_MINOR)} stake. Net winnings are <strong>${pesoShort(NET_GAIN_MINOR)}</strong>. The stake is not added a second time.</li>
      <li>Losing approved entries pay ₱0. Entries that were never approved are <em>not eligible</em> for any prize.</li>
    </ul>
    <h2 id="cap">Combination limit</h2>
    <p><strong>Limit: ₱500 per combination per draw</strong>, across all players. All orders of the same digits (123, 132, 213, 231, 312, 321) share one limit. At ₱10 per entry, a combination holds at most 50 entries. You can hold one active entry per combination per draw.</p>
    <h2 id="cutoffs">Cutoffs</h2>
    <ul>
      <li><strong>Submission &amp; payment cutoff:</strong> new entries and demo payments are accepted only before this time.</li>
      <li><strong>Reservation:</strong> confirming an entry reserves its slot for up to 5 minutes (or until the submission cutoff, if sooner). Pay within that window.</li>
      <li><strong>Verification cutoff:</strong> a reviewer may approve a payment you made before the submission cutoff at any time up to this cutoff. Entries not approved by then become <em>Expired</em> — even if their digits would have matched — and a paid entry gets a simulated refund.</li>
      <li>At the exact cutoff time, the operation is already closed. The server clock decides; your device clock and the countdowns are for information only.</li>
      <li>Delayed draws do not reopen entries.</li>
    </ul>
    <h2 id="refunds">Refunds (simulated)</h2>
    <p>If the demo ledger shows your payment was received but the entry was rejected, expired or the draw was cancelled, a simulated refund obligation is created. It shows as <em>Refunded</em> only after the simulated refund transaction is recorded. Entries that were never paid create no refund. Refunds are never counted as prizes.</p>
    <h2 id="terms">Demo terms</h2>
    <ul>
      <li>This is a software demonstration. There are no real payments, cash prizes, payment accounts or withdrawal controls.</li>
      <li>Sample results are labelled as such and are not attributed to any official lottery draw.</li>
      <li>Use synthetic information only. The demo eligibility notice (18+) is illustrative; real eligibility rules are not yet defined.</li>
    </ul>
    <h2 id="pending">Not yet decided by the owner</h2>
    <p class="muted">Exact lottery product and source, draw timetable, cutoff policy approval, extra stake tiers, repeat-entry policy, funding/reserve limits, refund timing, eligibility rules, operator and payment-provider authorization, privacy policy and operational review. This demo is not ready for real-money use.</p>
  </div>`;
  res.send(page(req, { title: 'Rules', area: 'public', body }));
});

// ---- registration -----------------------------------------------------------------

function registerPage(req: Parameters<typeof page>[0], values: Record<string, string> = {}, errors: Record<string, string> = {}) {
  return page(req, {
    title: 'Register',
    area: 'public',
    body: html`<div class="narrow">${pageHeader('Create a player account', 'Demo accounts only. Use synthetic details.')}
    ${errorSummary(errors)}
    ${alert('info', 'Demo eligibility notice: real-money play would require eligibility and age checks (18+) that are not yet defined. This demo moves no money.')}
    <form method="post" action="/register" class="card form" data-once novalidate>
      ${csrfField(req.td.csrf)}
      ${field('Display name', 'displayName', { value: values.displayName, error: errors.displayName, required: true, autocomplete: 'nickname' })}
      ${field('Email', 'email', { type: 'email', value: values.email, error: errors.email, required: true, autocomplete: 'email', hint: 'Synthetic addresses like you@example.test are fine.' })}
      ${passwordField('Password', 'password', { error: errors.password, required: true, autocomplete: 'new-password', hint: 'At least 10 characters with a letter and a number.' })}
      ${passwordField('Confirm password', 'confirm', { required: true, autocomplete: 'new-password', id: 'f-confirm' })}
      ${checkbox('I confirm I am 18 or older for this demo and understand no real money is involved.', 'ageAck', { checked: values.ageAck === 'on', error: errors.ageAck })}
      ${checkbox(html`I have read the <a href="/rules#terms">demo terms and rules</a>.`, 'termsAck', { checked: values.termsAck === 'on', error: errors.termsAck })}
      <div class="form__actions"><button class="btn btn--primary" type="submit">Create account</button><a href="/login">I already have an account</a></div>
    </form></div>`,
  });
}

publicRouter.get('/register', (req, res) => {
  if (req.td.actor) return res.redirect(303, landingFor(req.td.actor.roles));
  res.send(registerPage(req));
});

publicRouter.post('/register', async (req, res) => {
  const b = req.body ?? {};
  // Only these fields are read; any "role" field is ignored by design.
  const values = { displayName: str(b.displayName), email: str(b.email), ageAck: str(b.ageAck), termsAck: str(b.termsAck) };
  const r = await register(req.td.ctx, { ...values, password: str(b.password), confirm: str(b.confirm) });
  if (!r.userId) return res.status(422).send(registerPage(req, values, r.errors));
  const token = createSession(req.td.db, r.userId, new Date());
  res.cookie(SESSION_COOKIE, token, cookieOptions(req.td.config, 12 * 3600_000));
  res.redirect(303, '/app');
});

// ---- login / logout -----------------------------------------------------------------

function loginPage(req: Parameters<typeof page>[0], email = '', error = '', next = '') {
  const { showDemoAccounts } = req.td.config;
  return page(req, {
    title: 'Log in',
    area: 'public',
    body: html`<div class="narrow">${pageHeader('Log in')}
    ${error ? errorSummary([error]) : ''}
    <form method="post" action="/login" class="card form" data-once novalidate>
      ${csrfField(req.td.csrf)}<input type="hidden" name="next" value="${next}">
      ${field('Email', 'email', { type: 'email', value: email, required: true, autocomplete: 'username' })}
      ${passwordField('Password', 'password', { required: true })}
      <div class="form__actions"><button class="btn btn--primary" type="submit">Log in</button><a href="/forgot-password">Forgot password?</a></div>
    </form>
    <p>New here? <a href="/register">Create a demo player account</a>.</p>
    ${showDemoAccounts
      ? html`<details class="card demo-accounts"><summary>Local demo accounts (synthetic, local only)</summary>
          <p class="small">Password for all seeded accounts: <code>${DEMO_PASSWORD}</code>. Shown only because <code>SHOW_DEMO_ACCOUNTS=true</code> in a non-production environment. There is no one-click sign-in.</p>
          ${dataTable(
            [
              { label: 'Email', render: (a: (typeof DEMO_ACCOUNTS)[number]) => html`<code>${a.email}</code>` },
              { label: 'Role', render: (a) => a.roles.join(', ') },
              { label: 'Use', render: (a) => a.note },
            ],
            [...DEMO_ACCOUNTS],
            { caption: 'Demo accounts' },
          )}</details>`
      : ''}</div>`,
  });
}

publicRouter.get('/login', (req, res) => {
  if (req.td.actor) return res.redirect(303, landingFor(req.td.actor.roles));
  res.send(loginPage(req, '', '', safeNext(req.query.next) ?? ''));
});

publicRouter.post('/login', async (req, res) => {
  const email = str(req.body?.email);
  const user = await authenticate(req.td.db, email, str(req.body?.password));
  if (!user) return res.status(401).send(loginPage(req, email, 'Email or password is incorrect.', safeNext(req.body?.next) ?? ''));
  const token = createSession(req.td.db, user.id, new Date());
  res.cookie(SESSION_COOKIE, token, cookieOptions(req.td.config, 12 * 3600_000));
  const roles = new Set(req.td.db.all<{ role: string }>('SELECT role FROM user_roles WHERE user_id = ?', user.id).map((r) => r.role)) as Set<never>;
  res.redirect(303, safeNext(req.body?.next) ?? landingFor(roles));
});

publicRouter.post('/logout', (req, res) => {
  if (req.td.session) destroySession(req.td.db, req.td.session.sessionId);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.redirect(303, '/');
});

// ---- password reset (local demo outbox; no email provider) ---------------------------

publicRouter.get('/forgot-password', (req, res) => {
  res.send(
    page(req, {
      title: 'Reset password',
      area: 'public',
      body: html`<div class="narrow">${pageHeader('Reset your password')}
      ${alert('info', html`This demo has <strong>no email provider</strong>. If the address has an account, a one-time reset link is written to the local demo outbox file <code>data/demo-outbox.txt</code> on the machine running the server. No email is sent.`)}
      <form method="post" action="/forgot-password" class="card form" data-once>
        ${csrfField(req.td.csrf)}
        ${field('Email', 'email', { type: 'email', required: true, autocomplete: 'email' })}
        <div class="form__actions"><button class="btn btn--primary" type="submit">Create reset link</button><a href="/login">Back to log in</a></div>
      </form></div>`,
    }),
  );
});

publicRouter.post('/forgot-password', (req, res) => {
  const r = createPasswordReset(req.td.db, str(req.body?.email), new Date());
  if (r) {
    const file = path.resolve(req.td.config.outboxPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `[${new Date().toISOString()}] DEMO password reset for ${r.email} (valid 30 min): /reset-password?token=${r.token}\n`, { mode: 0o600 });
  }
  // Same response whether or not the account exists.
  res.send(
    page(req, {
      title: 'Reset password',
      area: 'public',
      body: html`<div class="narrow">${pageHeader('Check the local demo outbox')}
      ${alert('success', html`If an account exists for that address, a reset link was written to <code>data/demo-outbox.txt</code>. <strong>No email was sent.</strong> The link expires in 30 minutes.`)}
      <p><a href="/login">Back to log in</a></p></div>`,
    }),
  );
});

function resetPage(req: Parameters<typeof page>[0], token: string, errors: string[] = []) {
  return page(req, {
    title: 'Choose a new password',
    area: 'public',
    body: html`<div class="narrow">${pageHeader('Choose a new password')}${errorSummary(errors)}
    <form method="post" action="/reset-password" class="card form" data-once>
      ${csrfField(req.td.csrf)}<input type="hidden" name="token" value="${token}">
      ${passwordField('New password', 'password', { required: true, autocomplete: 'new-password', hint: 'At least 10 characters with a letter and a number.' })}
      ${passwordField('Confirm new password', 'confirm', { required: true, autocomplete: 'new-password', id: 'f-confirm' })}
      <div class="form__actions"><button class="btn btn--primary" type="submit">Save password</button></div>
    </form></div>`,
  });
}

publicRouter.get('/reset-password', (req, res) => res.send(resetPage(req, str(req.query.token))));

publicRouter.post('/reset-password', async (req, res) => {
  const errors = await completePasswordReset(req.td.db, str(req.body?.token), str(req.body?.password), str(req.body?.confirm));
  if (errors.length) return res.status(422).send(resetPage(req, str(req.body?.token), errors));
  res.send(page(req, { title: 'Password updated', area: 'public', body: html`<div class="narrow">${pageHeader('Password updated')}${alert('success', 'Your password was changed and other sessions were signed out.')}<p><a class="btn btn--primary" href="/login">Log in</a></p></div>` }));
});

// ---- access-controlled synthetic proof preview -------------------------------------

publicRouter.get('/proofs/:key', (req, res) => {
  const key = str(req.params.key);
  const p = proofAccess(req.td.ctx, key);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220">
<rect width="360" height="220" rx="12" fill="#f4f4f1" stroke="#9aa1a9" stroke-dasharray="6 4"/>
<text x="180" y="70" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#5b6470">SAMPLE PROOF</text>
<text x="180" y="100" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#5b6470">Synthetic placeholder — not evidence of payment</text>
<text x="180" y="140" text-anchor="middle" font-family="monospace" font-size="14" fill="#1d2125">${p.entryRef}</text>
<text x="180" y="165" text-anchor="middle" font-family="monospace" font-size="14" fill="#1d2125">${p.reference ?? ''}</text></svg>`;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(svg);
});

publicRouter.get('/healthz', (_req, res) => res.json({ ok: true, demo: true }));

