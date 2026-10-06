import { type Request, type Response, Router } from 'express';
import { PHASE_LABEL } from '../../domain/draw-phase.js';
import { COMBINATION_CAP_MINOR, GROSS_PAYOUT_MINOR, STAKE_MINOR } from '../../domain/rules.js';
import { DomainError } from '../../lib/errors.js';
import { DAY, HOUR, MINUTE } from '../../lib/clock.js';
import { durationText, fmtManila, peso, pesoShort, toManilaInput } from '../../lib/format.js';
import { type SafeHtml, html, raw } from '../../lib/html.js';
import { searchAudit } from '../../services/audit.js';
import { combinationTable } from '../../services/capacity.js';
import { type Role, ROLES, ROLE_LABEL, hasAny } from '../../services/context.js';
import { cancelDraw, createDraftDraw, getDraw, getRule, listDraws, openDraw, updateDraftDraw, withPhase } from '../../services/draws.js';
import { ALL_STATUSES, adminListEntries } from '../../services/entries.js';
import { approvePayment, paymentDetail, paymentQueue, rejectPayment } from '../../services/payments.js';
import { approvePayout, completePayout, listWinners, payoutHistory, reconciliationFlags, resolveFlag } from '../../services/payouts.js';
import { completeRefund, failRefund, listRefunds, startRefundProcessing } from '../../services/refunds.js';
import { capacityScenarios, dashboardFigures, drawHealth, drawMoney, drawStatusCounts, type DrawMoney } from '../../services/reports.js';
import { SAMPLE_SOURCE_LABEL, drawResultHistory, listResultVersions, publishResult, rejectResult, submitResult } from '../../services/results.js';
import { DRAFT_SETTINGS, LAUNCH_REQUIREMENTS, advanceDemoClock, getSetting, saveDraftSettings } from '../../services/settings.js';
import { TICKET_STATES, adminGetTicket, adminListTickets, adminUpdateTicket } from '../../services/support.js';
import { adminGetTeam, adminListAgents, adminListTeams, assignAgent, createTeam, leaderCandidates, setTeamStatus, unassignAgent } from '../../services/teams.js';
import { adminCreateUser, adminGetUser, grantRole, listUsers, revokeRole, setUserStatus } from '../../services/users.js';
import { DemoClock } from '../../lib/clock.js';
import { STAFF, adminRoles, page } from '../layout.js';
import { flash, intParam, requireRoles, str } from '../middleware.js';
import {
  alert, checkbox, countdown, csrfField, dataTable, digitChips, dl, emptyState, entryBadge, field, filterBar, icon, outcomeBadge, pageHeader,
  paymentBadge, payoutBadge, phaseBadge, refundBadge, resultChips, resultStateBadge, select, stat, textarea, ticketBadge, time,
} from '../ui.js';

export const adminRouter = Router();
adminRouter.use('/admin', requireRoles(...STAFF));

const send = (req: Request, res: Response, title: string, body: SafeHtml, status = 200) => res.status(status).send(page(req, { title, area: 'admin', body }));
const can = (req: Request, roles: Role[]) => hasAny(req.td.actor, roles);
const guard = (href: string) => requireRoles(...adminRoles(href));
const SIM = html`<span class="sim-tag">simulated</span>`;

/** POST helper: run, flash the outcome, redirect (PRG). Authorization and
 *  not-found errors fall through to the error page. */
function act(redirect: (req: Request) => string, fn: (req: Request) => string | void | Promise<string | void>) {
  return async (req: Request, res: Response) => {
    try {
      const msg = await fn(req);
      if (msg) flash(req, 'success', msg);
    } catch (err) {
      if (!(err instanceof DomainError) || err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN') throw err;
      flash(req, 'error', err.message);
    }
    res.redirect(303, redirect(req));
  };
}

const confirmBox = (name = 'confirm', text = 'I confirm this action') => checkbox(text, name, { required: true, id: `f-${name}-${Math.random().toString(36).slice(2, 7)}` });
const post = (action: string, csrf: string, inner: SafeHtml, cls = 'inline-form') => html`<form method="post" action="${action}" class="${cls}" data-once>${csrfField(csrf)}${inner}</form>`;

// ---- overview ------------------------------------------------------------------------------

adminRouter.get('/admin', (req, res) => {
  const { db, clock } = req.td;
  const now = clock.now();
  const f = dashboardFigures(db);
  const health = drawHealth(db, now);
  const queue = can(req, ['admin', 'payment_reviewer']) ? paymentQueue(req.td.ctx, { view: 'needs_review' }).slice(0, 8) : [];
  const body = html`${pageHeader('Operations overview', html`Server time ${time(now.toISOString())}. All money figures are ${SIM} demo-ledger values.`)}
  ${alert('warn', html`Payout is 310× the stake (₱10 → ₱3,100 total) with any-position matching, so prize obligations can far exceed collected stakes. <strong>Reserve thresholds are unconfirmed.</strong> Receipts are not profit and this demo does not show the payout is sustainable. A separate funding and risk review is required before any real-money launch.`, 'Payout risk.')}
  <div class="stats">
    ${stat('Pending verification', String(f.pendingReview), 'Paid, awaiting approval')}
    ${stat('Proof-only claims', String(f.pendingClaims), 'No ledger receipt')}
    ${stat('Approved entries', String(f.approvedEntries))}
    ${stat('Results awaiting review', String(f.pendingResults))}
  </div>
  <h2>Simulated money</h2>
  <div class="stats">
    ${stat('Stake receipts (simulated)', peso(f.receiptsMinor), 'All demo-ledger receipts')}
    ${stat('Approved stakes (simulated)', peso(f.approvedStakesMinor))}
    ${stat('Refunds outstanding (simulated)', peso(f.refundsOutstandingMinor), `${f.refundsOutstandingCount} obligation(s)`)}
    ${stat('Refunds completed (simulated)', peso(f.refundsCompletedMinor))}
    ${stat('Published prize obligations (simulated)', peso(f.prizeObligationsMinor), `${f.winners} winner(s) × ${pesoShort(GROSS_PAYOUT_MINOR)}`)}
    ${stat('Gross payouts completed (simulated)', peso(f.payoutsCompletedMinor))}
  </div>
  ${f.openFlags ? alert('error', html`${f.openFlags} payout reconciliation flag(s) need review. <a href="/admin/payouts#reconciliation">Open payouts</a>`) : ''}
  ${can(req, ['admin', 'payment_reviewer'])
    ? html`<section class="section"><h2>Pending queue <span class="muted small">(most urgent first)</span></h2>
      ${dataTable(
        [
          { label: 'Entry', render: (p) => html`<a href="/admin/payments/${p.id}">${p.entry_ref}</a>` },
          { label: 'Digits', render: (p) => digitChips(p.selected_digits, { size: 'sm' }) },
          { label: 'Draw', render: (p) => p.draw_label },
          { label: 'Verification closes in', render: (p) => html`<strong>${durationText(new Date(p.verification_closes_at).getTime() - now.getTime())}</strong>` },
        ],
        queue,
        { caption: 'Pending payments', empty: emptyState('Queue is empty', 'No paid entries are waiting for verification.') },
      )}<p><a href="/admin/payments">Open payment review ${icon('arrow')}</a></p></section>`
    : ''}
  <section class="section"><h2>Draw health</h2>
  ${dataTable(
    [
      { label: 'Draw', render: (h) => html`<a href="/admin/draws/${h.draw.id}">${h.draw.reference_label}</a>` },
      { label: 'Phase', render: (h) => phaseBadge(h.draw.phase) },
      { label: 'Entries', render: (h) => html`<span class="small">${Object.entries(h.counts).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join(' · ') || 'none'}</span>` },
      { label: 'Collected (sim.)', render: (h) => html`${peso(h.money.receiptsMinor)}${h.money.refundObligationsMinor ? html`<br><span class="small muted">${peso(h.money.refundObligationsMinor)} to refund</span>` : ''}` },
      { label: 'Approved stakes', render: (h) => peso(h.money.approvedStakesMinor) },
      { label: 'Reserved capacity', render: (h) => peso(h.money.heldPaidMinor + h.money.heldUnpaidMinor) },
      { label: 'Worst-case payout', render: (h) => (h.money.published ? html`${peso(h.money.published.obligationMinor)}<br><span class="small muted">actual, result ${h.money.published.result}</span>` : peso(h.money.exposure.maxPayoutMinor)) },
      { label: 'Hypothetical shortfall', render: (h) => peso(h.money.published ? h.money.published.shortfallMinor : h.money.shortfallMinor) },
    ],
    health,
    { caption: 'Draw health' },
  )}
  <p class="small muted">Collected = demo-ledger receipts (some may be owed back as refunds). Reserved = cap held by entries not yet approved. Worst-case payout = largest gross payout over every valid six-digit result for approved entries. Hypothetical shortfall = worst-case payout − approved stakes. Not forecasts or probabilities.</p></section>
  <section class="section"><h2>Illustrative scenarios ${SIM}</h2>
  ${dataTable(
    [
      { label: 'Scenario (all 120 combinations)', render: (sc) => sc.label },
      { label: 'Collected', render: (sc) => peso(sc.collectedMinor) },
      { label: 'Worst-case winners', render: (sc) => html`${sc.worst.maxWinners} <span class="small muted">(e.g. result ${sc.worst.worstDigitSet})</span>` },
      { label: 'Worst-case payout', render: (sc) => peso(sc.worst.maxPayoutMinor) },
      { label: 'Hypothetical shortfall', render: (sc) => peso(sc.shortfallMinor) },
    ],
    capacityScenarios(),
    { caption: 'Illustrative scenarios' },
  )}
  <p class="small muted">Any result with six different digits (like 123456) makes 20 of the 120 combinations win. Results with repeated digits make fewer combinations win.</p></section>`;
  send(req, res, 'Overview', body);
});

// ---- draws -----------------------------------------------------------------------------------

function drawForm(action: string, csrf: string, v: { label: string; times: [string, string, string, string] }, submit: string) {
  return post(
    action,
    csrf,
    html`${field('Reference label', 'reference_label', { value: v.label, required: true, hint: 'Clearly label sample draws, e.g. "Sample Draw — 7 Oct evening".' })}
    <div class="grid-2">
      ${field('Opens at (Asia/Manila)', 'opens_at', { type: 'datetime-local', value: toManilaInput(v.times[0]), required: true })}
      ${field('Submission & payment cutoff', 'submission_closes_at', { type: 'datetime-local', value: toManilaInput(v.times[1]), required: true })}
      ${field('Verification cutoff', 'verification_closes_at', { type: 'datetime-local', value: toManilaInput(v.times[2]), required: true })}
      ${field('Scheduled draw time', 'scheduled_draw_at', { type: 'datetime-local', value: toManilaInput(v.times[3]), required: true })}
    </div>
    <p class="hint">Must satisfy opens &lt; submission cutoff &lt; verification cutoff &lt; draw time. Times are Asia/Manila (UTC+8) and stored in UTC.</p>
    <div class="form__actions"><button class="btn btn--primary" type="submit">${submit}</button></div>`,
    'card form',
  );
}

adminRouter.get('/admin/draws', (req, res) => {
  const { db, clock } = req.td;
  const now = clock.now();
  const draws = listDraws(db, now, { includeDrafts: true });
  const t = now.getTime();
  const iso = (ms: number) => new Date(Math.ceil((t + ms) / MINUTE) * MINUTE).toISOString();
  const body = html`${pageHeader('Draws', 'Draft draws can be edited. Opening a draw freezes its schedule and rules.')}
  ${dataTable(
    [
      { label: 'Draw', render: (d) => html`<a href="/admin/draws/${d.id}">${d.reference_label}</a>` },
      { label: 'Phase', render: (d) => phaseBadge(d.phase) },
      { label: 'Submission cutoff', render: (d) => time(d.submission_closes_at, true) },
      { label: 'Verification cutoff', render: (d) => time(d.verification_closes_at, true) },
      { label: 'Draw time', render: (d) => time(d.scheduled_draw_at, true) },
      { label: 'Result', render: (d) => (d.published_result ? html`<span class="mono">${d.published_result}</span>${d.published_version! > 1 ? ' (corrected)' : ''}` : '—') },
    ],
    draws,
    { caption: 'Draws', empty: emptyState('No draws', 'Create a draft draw to begin.') },
  )}
  ${can(req, ['admin'])
    ? html`<section class="section"><h2>Create draft draw</h2>${drawForm('/admin/draws', req.td.csrf, { label: 'Sample Draw — new', times: [iso(5 * MINUTE), iso(HOUR), iso(90 * MINUTE), iso(2 * HOUR)] }, 'Create draft')}</section>`
    : ''}`;
  send(req, res, 'Draws', body);
});

const drawInput = (req: Request) => ({
  reference_label: str(req.body.reference_label),
  opens_at: str(req.body.opens_at),
  submission_closes_at: str(req.body.submission_closes_at),
  verification_closes_at: str(req.body.verification_closes_at),
  scheduled_draw_at: str(req.body.scheduled_draw_at),
});

adminRouter.post('/admin/draws', requireRoles('admin'), async (req, res) => {
  try {
    const id = createDraftDraw(req.td.ctx, drawInput(req));
    flash(req, 'success', 'Draft draw created. Review it, then open it to accept entries.');
    res.redirect(303, `/admin/draws/${id}`);
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    flash(req, 'error', err.message);
    res.redirect(303, '/admin/draws');
  }
});

adminRouter.get('/admin/draws/:id', (req, res) => {
  const { db, clock } = req.td;
  const now = clock.now();
  const raw0 = getDraw(db, intParam(req.params.id));
  if (!raw0) throw new DomainError('NOT_FOUND', 'Draw not found.', 404);
  const d = withPhase(db, raw0, now);
  const rule = getRule(db, d.rule_version_id);
  const counts = drawStatusCounts(db, d.id);
  const combos = combinationTable(db, d.id);
  const money = drawMoney(db, d.id);
  const history = drawResultHistory(db, d.id, { includeDrafts: true });
  const pending = history.find((h) => h.state === 'submitted');
  const published = history.find((h) => h.state === 'published');
  const t = now.toISOString();
  const canEnterResult = can(req, ['admin', 'result_editor']) && d.status === 'open' && t >= d.verification_closes_at && !pending;
  const body = html`${pageHeader(d.reference_label, html`${phaseBadge(d.phase)} · Rules v${rule.id}${d.frozen_at ? html` frozen ${time(d.frozen_at, true)}` : ' (draft, editable)'}`, html`<a class="btn btn--ghost" href="/admin/draws">${icon('back')} All draws</a>`)}
  ${d.status === 'cancelled' ? alert('error', html`Cancelled ${time(d.cancelled_at)} — ${d.cancel_reason}`) : ''}
  <div class="grid-2">
    <section class="card"><h2 class="h3">Deadlines (server time)</h2>
      ${dl([['Opens', time(d.opens_at)]])}
      ${countdown(d.submission_closes_at, 'Submission & payment cutoff')}
      ${countdown(d.verification_closes_at, 'Verification cutoff')}
      ${countdown(d.scheduled_draw_at, 'Scheduled draw time')}
    </section>
    <section class="card"><h2 class="h3">Locked rules snapshot</h2>
      ${dl([
        ['Matching', rule.matching_definition],
        ['Stake', `${peso(rule.stake_minor)} fixed`],
        ['Gross payout', `${peso(rule.gross_payout_minor)} total, includes stake`],
        ['Combination cap', `${peso(rule.combination_cap_minor)} per combination per draw (all players)`],
        ['Reservation', `${rule.reservation_minutes} minutes (proposed default)`],
        ['Cutoff policy', rule.cutoff_policy],
      ])}
    </section>
  </div>
  <section class="section"><h2>Entry snapshot</h2>
    <div class="stats">${ALL_STATUSES.map((s) => stat(s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()), String(counts[s] ?? 0)))}</div>
    ${can(req, ['admin', 'payment_reviewer']) ? html`<p><a href="/admin/entries?draw=${d.id}">View entries in this draw ${icon('arrow')}</a></p>` : ''}
  </section>
  ${moneySection(money)}
  <section class="section"><h2>Combination capacity</h2>
    ${dataTable(
      [
        { label: 'Combination', render: (c) => digitChips(c.canonical_key, { size: 'sm' }) },
        { label: 'Approved stake', render: (c) => peso(c.approved_minor) },
        { label: 'Reserved stake', render: (c) => peso(c.reserved_minor) },
        { label: 'Remaining', render: (c) => html`${peso(c.cap_minor - c.reserved_minor - c.approved_minor)}${c.cap_minor - c.reserved_minor - c.approved_minor === 0 ? html` <span class="badge badge--bad">${icon('lock')}<span>Full</span></span>` : ''}` },
        { label: 'Active entries', render: (c) => String(c.entry_count) },
        { label: 'Max payout (approved)', render: (c) => html`${peso(c.approved_count * GROSS_PAYOUT_MINOR)}<br><span class="small muted">at cap: ${peso((COMBINATION_CAP_MINOR / STAKE_MINOR) * GROSS_PAYOUT_MINOR)}</span>` },
      ],
      combos,
      { caption: 'Combination capacity', empty: emptyState('No combinations used yet', 'Capacity buckets appear once entries reserve stake.') },
    )}
    <p class="small muted">The ₱500 cap is global across all players, teams and agents for this draw, and cannot be raised after opening. It does not replace aggregate exposure review: 50 winners on one combination would owe ₱155,000.</p>
  </section>
  <section class="section"><h2>Result workflow</h2>
    ${dataTable(
      [
        { label: 'Version', render: (h) => `v${h.version}` },
        { label: 'Result', render: (h) => html`<span class="mono">${h.six_digit_result}</span>` },
        { label: 'State', render: (h) => resultStateBadge(h.state) },
        { label: 'Entered by', render: (h) => html`${h.entered_email}<br><span class="small muted">${time(h.entered_at, true)}</span>` },
        { label: 'Reviewed by', render: (h) => (h.reviewed_email ? html`${h.reviewed_email}<br><span class="small muted">${time(h.reviewed_at, true)}</span>` : '—') },
        { label: 'Source / reason', render: (h) => html`${h.source_label}${h.correction_reason ? html`<br><strong>Correction:</strong> ${h.correction_reason}` : ''}${h.review_note ? html`<br><span class="small">Note: ${h.review_note}</span>` : ''}` },
        { label: 'Matching', render: (h) => (h.state === 'published' || h.state === 'superseded' ? h.matching_state : '—') },
      ],
      history,
      { caption: 'Result versions', empty: emptyState('No result recorded', t < d.verification_closes_at ? 'Results can be entered after the verification cutoff.' : 'Awaiting a result editor.') },
    )}
    ${pending && can(req, ['admin', 'result_reviewer']) ? html`<p><a class="btn btn--secondary" href="/admin/results">Review pending result ${icon('arrow')}</a></p>` : ''}
    ${canEnterResult ? resultForm(req, d.id, !!published) : ''}
  </section>
  ${can(req, ['admin'])
    ? html`<section class="section"><h2>Lifecycle</h2>
      ${d.status === 'draft'
        ? html`${drawForm(`/admin/draws/${d.id}`, req.td.csrf, { label: d.reference_label, times: [d.opens_at, d.submission_closes_at, d.verification_closes_at, d.scheduled_draw_at] }, 'Save draft')}
          ${post(`/admin/draws/${d.id}/open`, req.td.csrf, html`<h3>Open this draw</h3><p>Opening freezes the schedule and rule version. It cannot be edited afterwards — only cancelled.</p>${confirmBox('confirm', 'I reviewed the schedule and rules')}<button class="btn btn--primary" type="submit">Open draw</button>`, 'card form')}`
        : ''}
      ${d.status !== 'cancelled' && !published
        ? post(`/admin/draws/${d.id}/cancel`, req.td.csrf, html`<h3>Cancel draw</h3><p>Voids all active entries, releases reservations and creates one simulated refund obligation per received payment. Audited and irreversible.</p>${textarea('Cancellation reason', 'reason', { required: true, rows: 2 })}${confirmBox('confirm', 'Cancel this draw and void its entries')}<button class="btn btn--danger" type="submit">Cancel draw</button>`, 'card form')
        : ''}
    </section>`
    : ''}`;
  send(req, res, d.reference_label, body);
});

adminRouter.post('/admin/draws/:id', requireRoles('admin'), act((r) => `/admin/draws/${intParam(r.params.id)}`, (req) => {
  updateDraftDraw(req.td.ctx, intParam(req.params.id), drawInput(req));
  return 'Draft saved.';
}));
adminRouter.post('/admin/draws/:id/open', requireRoles('admin'), act((r) => `/admin/draws/${intParam(r.params.id)}`, (req) => {
  if (str(req.body.confirm) !== 'on') throw new DomainError('CONFIRM', 'Tick the confirmation to open the draw.');
  openDraw(req.td.ctx, intParam(req.params.id));
  return 'Draw opened. Schedule and rules are now frozen.';
}));
adminRouter.post('/admin/draws/:id/cancel', requireRoles('admin'), act((r) => `/admin/draws/${intParam(r.params.id)}`, (req) => {
  if (str(req.body.confirm) !== 'on') throw new DomainError('CONFIRM', 'Tick the confirmation to cancel the draw.');
  const r = cancelDraw(req.td.ctx, intParam(req.params.id), str(req.body.reason));
  return `Draw cancelled. ${r.voided} entr${r.voided === 1 ? 'y' : 'ies'} voided, ${r.refunds} refund obligation(s) created.`;
}));

function moneySection(m: DrawMoney): SafeHtml {
  const e = m.exposure;
  const h = m.exposureIfHeldApproved;
  return html`<section class="section"><h2>Money &amp; prize exposure ${SIM}</h2>
    <h3 class="h4">1 · Collected payments</h3>
    <div class="stats">
      ${stat('Collected (demo-ledger receipts)', peso(m.receiptsMinor), 'All simulated receipts for this draw')}
      ${stat('Owed back as refunds', peso(m.refundObligationsMinor), 'Rejected, expired or cancelled — not prizes')}
      ${stat('Approved stakes', peso(m.approvedStakesMinor), `${e.approvedEntries} approved × ${pesoShort(STAKE_MINOR)} — the only entries that can win`)}
    </div>
    <h3 class="h4">2 · Reserved capacity (not yet approved)</h3>
    <div class="stats">
      ${stat('Paid, pending verification', peso(m.heldPaidMinor), 'Held until verification cutoff')}
      ${stat('Unpaid 5-minute holds', peso(m.heldUnpaidMinor), 'Released automatically when they expire')}
      ${stat('Total reserved in cap table', peso(m.reservedMinor))}
    </div>
    <h3 class="h4">3 · Potential payout (gross, stake included)</h3>
    <div class="stats">
      ${m.published ? stat(`Actual obligation — result ${m.published.result}`, peso(m.published.obligationMinor), `${m.published.winners} winning entries × ${pesoShort(GROSS_PAYOUT_MINOR)}`) : ''}
      ${stat('Worst case, approved entries', peso(e.maxPayoutMinor), e.worstDigitSet ? `${e.maxWinners} winners, e.g. result ${e.worstDigitSet} (checked over every valid result)` : 'No approved entries')}
      ${stat('Worst case if all reserved entries were approved', peso(h.maxPayoutMinor), h.worstDigitSet ? `${h.maxWinners} winners, e.g. result ${h.worstDigitSet}` : 'No active entries')}
      ${stat('Conservative upper bound', peso(e.upperBoundMinor), `every approved entry wins (${e.approvedEntries} × ${pesoShort(GROSS_PAYOUT_MINOR)})`)}
    </div>
    <h3 class="h4">4 · Hypothetical funding shortfall</h3>
    <div class="stats">
      ${stat('Worst-case payout − approved stakes', peso(m.shortfallMinor), 'Money that would have to come from reserves')}
      ${m.published ? stat(`For published result ${m.published.result}`, peso(m.published.shortfallMinor), 'Actual obligation − approved stakes') : ''}
    </div>
    <p class="small muted">These are deterministic what-if figures, not probabilities, forecasts or profit. Receipts that are refunded are not income. Reserve thresholds are unconfirmed; a funding and risk review is required before any real-money use.</p>
  </section>`;
}

function resultForm(req: Request, drawId: number, correction: boolean) {
  return post(
    '/admin/results',
    req.td.csrf,
    html`<h3>${correction ? 'Submit a correction (new version)' : 'Enter draft result'}</h3>
    <input type="hidden" name="draw_id" value="${drawId}">
    ${field('Six-digit result', 'result', { required: true, attrs: 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" class="mono"', hint: 'Exactly six digits. Repeated digits are allowed in a result (e.g. 001234).' })}
    ${field('Source label', 'source_label', { value: SAMPLE_SOURCE_LABEL, required: true, hint: 'Do not attribute sample results to a real official draw.' })}
    ${field('Source URL (optional)', 'source_url', { type: 'url' })}
    ${correction ? textarea('Correction reason', 'correction_reason', { required: true, rows: 2, hint: 'Required. The prior version and its outcomes are preserved.' }) : ''}
    <p class="small muted">A different staff member must review and publish it.</p>
    <button class="btn btn--primary" type="submit">Submit for review</button>`,
    'card form',
  );
}

// ---- payments -------------------------------------------------------------------------------

adminRouter.get('/admin/payments', guard('/admin/payments'), (req, res) => {
  const { db, clock } = req.td;
  const now = clock.now();
  const view = ['needs_review', 'claims', 'verified', 'rejected', 'all'].includes(str(req.query.view)) ? str(req.query.view) : 'needs_review';
  const drawId = intParam(req.query.draw) > 0 ? intParam(req.query.draw) : undefined;
  const rows = paymentQueue(req.td.ctx, { view, drawId });
  const tabs: [string, string][] = [['needs_review', 'Needs review'], ['claims', 'Proof-only claims'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['all', 'All']];
  const body = html`${pageHeader('Payment review', 'Approve only payments with a ledger-confirmed receipt received before the submission cutoff.')}
  <nav class="tabs" aria-label="Payment views">${tabs.map(([k, l]) => html`<a href="/admin/payments?view=${k}${drawId ? `&draw=${drawId}` : ''}" ${k === view ? raw('aria-current="page"') : ''}>${l}</a>`)}</nav>
  ${filterBar('/admin/payments', html`<input type="hidden" name="view" value="${view}">${select('Draw', 'draw', [{ value: '', label: 'All draws' }, ...listDraws(db, now).map((d) => ({ value: String(d.id), label: d.reference_label }))], { value: drawId ? String(drawId) : '' })}`)}
  ${dataTable(
    [
      { label: 'Entry', render: (p) => html`<a href="/admin/payments/${p.id}">${p.entry_ref}</a>` },
      { label: 'Player', render: (p) => p.user_email },
      { label: 'Digits', render: (p) => digitChips(p.selected_digits, { size: 'sm' }) },
      { label: 'Draw', render: (p) => p.draw_label },
      { label: 'Payment', render: (p) => html`${paymentBadge(p.state)}<br><span class="small">${p.has_receipt ? 'Ledger receipt ✓' : 'No ledger receipt'}</span>` },
      { label: 'Entry status', render: (p) => entryBadge(p.entry_status) },
      {
        label: 'Urgency',
        render: (p) => {
          const left = new Date(p.verification_closes_at).getTime() - now.getTime();
          return left <= 0 ? html`<span class="muted">Closed</span>` : html`<strong class="${left < HOUR ? 'urgent' : ''}">${left < HOUR ? '⚠ ' : ''}${durationText(left)}</strong> <span class="small muted">to verification cutoff</span>`;
        },
      },
    ],
    rows,
    { caption: 'Payments', empty: emptyState('Nothing in this view', view === 'needs_review' ? 'No paid entries are waiting. New payments appear here automatically.' : 'No payments match.') },
  )}`;
  send(req, res, 'Payments', body);
});

adminRouter.get('/admin/payments/:id', guard('/admin/payments'), (req, res) => {
  const d = paymentDetail(req.td.ctx, intParam(req.params.id));
  const { payment: p, entry: e, draw } = d;
  const now = req.td.clock.now().toISOString();
  const resultRecorded = !!req.td.db.get(`SELECT 1 FROM result_versions WHERE draw_id = ? AND state IN ('submitted','published','superseded')`, draw.id);
  const checks: [string, boolean][] = [
    ['Entry is pending verification', e.eligibility_status === 'pending_verification'],
    ['Ledger-confirmed receipt exists', !!d.receipt],
    ['Received amount equals expected amount exactly', p.received_minor_units === p.expected_minor_units],
    ['Funds received before submission cutoff', !!p.trusted_received_at && p.trusted_received_at < draw.submission_closes_at],
    ['Server time is before verification cutoff', now < draw.verification_closes_at],
    ['No result recorded for the draw', !resultRecorded],
    ['Entry still holds its capacity reservation', e.reservation_state === 'held'],
    ['Reviewer is not the entry owner', e.user_id !== req.td.actor!.id],
  ];
  const allOk = checks.every(([, ok]) => ok);
  const actionable = e.eligibility_status === 'pending_verification' || e.eligibility_status === 'awaiting_payment';
  const body = html`${pageHeader(`Payment for ${e.public_ref}`, html`${draw.reference_label} · ${entryBadge(e.eligibility_status)} ${paymentBadge(p.state)}`, html`<a class="btn btn--ghost" href="/admin/payments">${icon('back')} Queue</a>`)}
  <div class="grid-2">
    <section class="card"><h2 class="h3">Linked entry</h2>
      ${digitChips(e.selected_digits, { size: 'lg' })}
      ${dl([
        ['Player', html`${d.userName} · ${d.userEmail}`],
        ['Entry reference', html`<span class="mono">${e.public_ref}</span>`],
        ['Canonical combination', html`<span class="mono">${e.canonical_key}</span>`],
        ['Submitted', time(e.submitted_at)],
        ['Reservation', `${e.reservation_state}${e.reservation_expires_at ? ` until ${fmtManila(e.reservation_expires_at)}` : ''}`],
      ])}
      ${countdown(draw.verification_closes_at, 'Verification cutoff')}
    </section>
    <section class="card"><h2 class="h3">Payment ${SIM}</h2>
      ${dl([
        ['Expected', peso(p.expected_minor_units)],
        ['Received (ledger)', p.received_minor_units ? peso(p.received_minor_units) : html`<strong>Not received</strong>`],
        ['Trusted received at', time(p.trusted_received_at)],
        ['Reference', p.reference ? html`<span class="mono">${p.reference}</span>` : '—'],
        ['Ledger receipt', d.receipt ? html`<span class="mono">${d.receipt.reference}</span>` : 'None'],
        ['Refund', d.refund ? html`${refundBadge(d.refund.status)} ${d.refund.reference ?? ''}` : 'Not required'],
        ['Rejection reason', p.rejection_reason ?? '—'],
      ])}
      <h3 class="h4">Proof preview</h3>
      ${p.proof_object_key ? html`<img class="proof" src="/proofs/${p.proof_object_key}" alt="Synthetic sample proof for ${e.public_ref}" width="360" height="220">` : html`<p class="muted">No proof attached.</p>`}
      <p class="small muted">A proof image is never evidence of receipt. Only the demo ledger is.</p>
    </section>
  </div>
  <section class="card"><h2 class="h3">Approval checks (re-verified on the server inside the transaction)</h2>
    <ul class="checks">${checks.map(([label, ok]) => html`<li class="${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'x')} <span>${label}</span> <span class="sr-only">${ok ? 'passed' : 'failed'}</span></li>`)}</ul>
  </section>
  ${actionable
    ? html`<div class="grid-2">
      ${post(`/admin/payments/${p.id}/approve`, req.td.csrf, html`<h3>Verify &amp; approve</h3><p>Consumes the payment, approves the entry and converts its reserved stake to approved stake — atomically.</p>${confirmBox('confirm', 'I verified the ledger receipt')}<button class="btn btn--primary" type="submit" ${allOk ? '' : raw('aria-describedby="approve-note"')}>Approve entry</button>${allOk ? '' : html`<p class="small" id="approve-note">Some checks fail; the server will refuse approval.</p>`}`, 'card form')}
      ${post(`/admin/payments/${p.id}/reject`, req.td.csrf, html`<h3>Reject</h3><p>Releases the reservation. If funds were received, a simulated refund obligation is created.</p>${textarea('Reason (shown to the player)', 'reason', { required: true, rows: 2 })}<button class="btn btn--danger" type="submit">Reject payment</button>`, 'card form')}
    </div>`
    : ''}`;
  send(req, res, 'Payment review', body);
});

adminRouter.post('/admin/payments/:id/approve', guard('/admin/payments'), act((r) => `/admin/payments/${intParam(r.params.id)}`, (req) => {
  if (str(req.body.confirm) !== 'on') throw new DomainError('CONFIRM', 'Tick the confirmation to approve.');
  const r = approvePayment(req.td.ctx, intParam(req.params.id));
  return r.alreadyApproved ? 'This payment was already approved; nothing changed.' : 'Payment verified and entry approved.';
}));
adminRouter.post('/admin/payments/:id/reject', guard('/admin/payments'), act((r) => `/admin/payments/${intParam(r.params.id)}`, (req) => {
  rejectPayment(req.td.ctx, intParam(req.params.id), str(req.body.reason));
  return 'Payment rejected.';
}));

// ---- entries ----------------------------------------------------------------------------------

function entryFilters(req: Request) {
  return {
    drawId: intParam(req.query.draw) > 0 ? intParam(req.query.draw) : undefined,
    status: str(req.query.status),
    player: str(req.query.player).trim(),
    combination: str(req.query.combination).trim(),
  };
}

adminRouter.get('/admin/entries', guard('/admin/entries'), (req, res) => {
  const { db, clock } = req.td;
  const q = entryFilters(req);
  const rows = adminListEntries(req.td.ctx, q);
  const qs = new URLSearchParams(Object.entries({ draw: q.drawId ? String(q.drawId) : '', status: q.status, player: q.player, combination: q.combination }).filter(([, v]) => v)).toString();
  const body = html`${pageHeader('Entries', 'Read-only. Accepted selections can never be edited.', can(req, ['admin']) ? html`<a class="btn btn--secondary" href="/admin/entries.csv${qs ? `?${qs}` : ''}">Export CSV</a>` : undefined)}
  ${filterBar(
    '/admin/entries',
    html`${select('Draw', 'draw', [{ value: '', label: 'All draws' }, ...listDraws(db, clock.now(), { includeDrafts: true }).map((d) => ({ value: String(d.id), label: d.reference_label }))], { value: q.drawId ? String(q.drawId) : '' })}
    ${select('Status', 'status', [{ value: '', label: 'All' }, ...ALL_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))], { value: q.status })}
    ${field('Player (email or name)', 'player', { value: q.player })}
    ${field('Combination (any order)', 'combination', { value: q.combination, attrs: 'inputmode="numeric" maxlength="3"' })}`,
  )}
  <p class="small muted">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${rows.length >= 500 ? ' (first 500)' : ''}.</p>
  ${dataTable(
    [
      { label: 'Reference', render: (e) => e.public_ref },
      { label: 'Player', render: (e) => e.user_email },
      { label: 'Digits', render: (e) => html`${digitChips(e.selected_digits, { size: 'sm' })} <span class="small muted">key ${e.canonical_key}</span>` },
      { label: 'Draw', render: (e) => e.draw_label },
      { label: 'Status', render: (e) => entryBadge(e.eligibility_status) },
      { label: 'Payment', render: (e) => paymentBadge(e.payment_state) },
      { label: 'Outcome', render: (e) => outcomeBadge(e.eligibility_status, e.outcome, !!e.outcome) },
      { label: 'Created', render: (e) => time(e.created_at, true) },
    ],
    rows,
    { caption: 'Entries', empty: emptyState('No entries match', 'Try different filters.') },
  )}`;
  send(req, res, 'Entries', body);
});

/** CSV export obeys permissions and neutralizes spreadsheet formula prefixes. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

adminRouter.get('/admin/entries.csv', requireRoles('admin'), (req, res) => {
  const rows = adminListEntries(req.td.ctx, entryFilters(req));
  const header = ['reference', 'player_email', 'selected_digits', 'canonical_key', 'draw', 'status', 'payment_state', 'outcome', 'prize_centavos', 'created_at_utc'];
  const lines = [header.join(','), ...rows.map((e) => [e.public_ref, e.user_email, e.selected_digits, e.canonical_key, e.draw_label, e.eligibility_status, e.payment_state, e.outcome ?? '', e.prize_minor_units ?? '', e.created_at].map(csvCell).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="entries-demo.csv"');
  res.send('﻿' + lines.join('\r\n'));
});

// ---- results ------------------------------------------------------------------------------------

adminRouter.get('/admin/results', guard('/admin/results'), (req, res) => {
  const { db, clock, actor } = req.td;
  const now = clock.now();
  const t = now.toISOString();
  const all = listResultVersions(req.td.ctx);
  const pending = all.filter((v) => v.state === 'submitted');
  const enterable = listDraws(db, now).filter((d) => d.status === 'open' && t >= d.verification_closes_at && d.phase !== 'result_review');
  const body = html`${pageHeader('Results', 'One staff member enters a result; a different authorized reviewer publishes it.')}
  <section class="section"><h2>Review queue</h2>
  ${pending.length
    ? pending.map((v) => {
        const draw = getDraw(db, v.draw_id)!;
        const tooEarly = t < draw.scheduled_draw_at;
        const own = v.entered_by === actor!.id;
        return html`<article class="card">
          <div class="draw-card__head"><h3>${v.draw_label} · v${v.version}</h3>${resultStateBadge(v.state)}</div>
          ${resultChips(v.six_digit_result)}
          ${dl([
            ['Source', html`${v.source_label}${v.source_url ? html` · <a href="${v.source_url}" rel="noopener noreferrer nofollow" target="_blank">${v.source_url}</a>` : ''}`],
            ['Entered by', html`${v.entered_email} · ${time(v.entered_at, true)}`],
            ['Draw time', time(draw.scheduled_draw_at)],
            ...(v.correction_reason ? ([['Correction reason', v.correction_reason]] as [string, unknown][]) : []),
          ])}
          ${tooEarly ? alert('warn', html`Publication is blocked until the scheduled draw time (${time(draw.scheduled_draw_at)}).`) : ''}
          ${own ? alert('info', 'You entered this result, so you cannot review it. A second authorized reviewer is required.') : ''}
          ${can(req, ['admin', 'result_reviewer']) && !own
            ? html`<div class="grid-2">
              ${post(`/admin/results/${v.id}/publish`, req.td.csrf, html`<h4>Publish</h4>${confirmBox('confirm', `I independently checked ${v.six_digit_result} against the source`)}<button class="btn btn--primary" type="submit">Publish result</button>`, 'card form')}
              ${post(`/admin/results/${v.id}/reject`, req.td.csrf, html`<h4>Send back</h4>${textarea('Review note', 'note', { required: true, rows: 2 })}<button class="btn btn--secondary" type="submit">Reject draft</button>`, 'card form')}
            </div>`
            : ''}
        </article>`;
      })
    : emptyState('Nothing to review', 'Submitted results appear here for a second reviewer.')}
  </section>
  ${can(req, ['admin', 'result_editor'])
    ? html`<section class="section"><h2>Enter a result</h2>
      ${enterable.length
        ? post(
            '/admin/results',
            req.td.csrf,
            html`${select('Draw', 'draw_id', enterable.map((d) => ({ value: String(d.id), label: `${d.reference_label} — ${PHASE_LABEL[d.phase]}${d.published_result ? ' (correction)' : ''}` })), { required: true })}
            ${field('Six-digit result', 'result', { required: true, attrs: 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off"', hint: 'Exactly six digits; repeats allowed.' })}
            ${field('Source label', 'source_label', { value: SAMPLE_SOURCE_LABEL, required: true })}
            ${field('Source URL (optional)', 'source_url', { type: 'url' })}
            ${textarea('Correction reason (required only when correcting a published result)', 'correction_reason', { rows: 2 })}
            <button class="btn btn--primary" type="submit">Submit for review</button>`,
            'card form',
          )
        : emptyState('No draw needs a result', 'Results can be entered after a draw’s verification cutoff.')}</section>`
    : ''}
  <section class="section"><h2>All result versions</h2>
  ${dataTable(
    [
      { label: 'Draw', render: (v) => html`<a href="/admin/draws/${v.draw_id}">${v.draw_label}</a>` },
      { label: 'Version', render: (v) => `v${v.version}` },
      { label: 'Result', render: (v) => html`<span class="mono">${v.six_digit_result}</span>` },
      { label: 'State', render: (v) => resultStateBadge(v.state) },
      { label: 'Entered / reviewed', render: (v) => html`${v.entered_email}<br>${v.reviewed_email ?? '—'}` },
      { label: 'Published', render: (v) => time(v.published_at, true) },
    ],
    all,
    { caption: 'Result versions', empty: emptyState('No results yet', 'Nothing has been entered.') },
  )}</section>`;
  send(req, res, 'Results', body);
});

adminRouter.post('/admin/results', requireRoles('admin', 'result_editor'), act(() => '/admin/results', (req) => {
  submitResult(req.td.ctx, intParam(req.body.draw_id), { result: str(req.body.result), sourceLabel: str(req.body.source_label), sourceUrl: str(req.body.source_url), correctionReason: str(req.body.correction_reason) });
  return 'Result submitted. A different staff member must review and publish it.';
}));
adminRouter.post('/admin/results/:id/publish', requireRoles('admin', 'result_reviewer'), act(() => '/admin/results', (req) => {
  const r = publishResult(req.td.ctx, intParam(req.params.id), str(req.body.confirm));
  return r.alreadyPublished ? 'Already published.' : 'Result published. Outcomes were computed for approved entries.';
}));
adminRouter.post('/admin/results/:id/reject', requireRoles('admin', 'result_reviewer'), act(() => '/admin/results', (req) => {
  rejectResult(req.td.ctx, intParam(req.params.id), str(req.body.note));
  return 'Draft result sent back.';
}));

// ---- refunds -------------------------------------------------------------------------------------

adminRouter.get('/admin/refunds', guard('/admin/refunds'), (req, res) => {
  const status = str(req.query.status);
  const rows = listRefunds(req.td.ctx, { status });
  const body = html`${pageHeader('Refunds', html`Refund obligations ${SIM}. A refund is marked refunded only after its simulated ledger transaction exists. Refunds are never prizes.`)}
  ${filterBar('/admin/refunds', select('Status', 'status', [{ value: '', label: 'All' }, { value: 'required', label: 'Required' }, { value: 'processing', label: 'Processing' }, { value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' }], { value: status }))}
  ${dataTable(
    [
      { label: 'Refund', render: (r) => `#${r.id}` },
      { label: 'Entry', render: (r) => html`${r.entry_ref}<br><span class="small muted">${r.user_email}</span>` },
      { label: 'Draw', render: (r) => r.draw_label },
      { label: 'Amount', render: (r) => peso(r.amount_minor_units) },
      { label: 'Reason', render: (r) => r.reason.replace('_', ' ') },
      { label: 'Status', render: (r) => html`${refundBadge(r.status)}${r.failure_reason ? html`<br><span class="small">${r.failure_reason}</span>` : ''}` },
      { label: 'Reference', render: (r) => (r.reference ? html`<span class="mono small">${r.reference}</span>` : '—') },
      {
        label: 'Action',
        render: (r) =>
          r.status === 'required' || r.status === 'failed'
            ? post(`/admin/refunds/${r.id}/process`, req.td.csrf, html`<button class="btn btn--sm btn--secondary" type="submit">${r.status === 'failed' ? 'Retry' : 'Start processing'}</button>`)
            : r.status === 'processing'
              ? html`${post(`/admin/refunds/${r.id}/complete`, req.td.csrf, html`<button class="btn btn--sm btn--primary" type="submit">Complete (simulated)</button>`)}
                ${post(`/admin/refunds/${r.id}/fail`, req.td.csrf, html`<label class="sr-only" for="fail-${r.id}">Failure reason</label><input id="fail-${r.id}" name="reason" placeholder="Failure reason" required minlength="3" class="input-sm"><button class="btn btn--sm btn--ghost" type="submit">Mark failed</button>`)}`
              : html`<span class="muted">—</span>`,
      },
    ],
    rows,
    { caption: 'Refunds', empty: emptyState('No refund obligations', 'Rejected/expired paid entries and cancelled draws create them.') },
  )}`;
  send(req, res, 'Refunds', body);
});

adminRouter.post('/admin/refunds/:id/process', guard('/admin/refunds'), act(() => '/admin/refunds', (req) => void startRefundProcessing(req.td.ctx, intParam(req.params.id))));
adminRouter.post('/admin/refunds/:id/complete', guard('/admin/refunds'), act(() => '/admin/refunds', (req) => {
  completeRefund(req.td.ctx, intParam(req.params.id));
  return 'Simulated refund recorded in the demo ledger.';
}));
adminRouter.post('/admin/refunds/:id/fail', guard('/admin/refunds'), act(() => '/admin/refunds', (req) => void failRefund(req.td.ctx, intParam(req.params.id), str(req.body.reason))));

// ---- payouts -------------------------------------------------------------------------------------

adminRouter.get('/admin/payouts', guard('/admin/payouts'), (req, res) => {
  const winners = listWinners(req.td.ctx);
  const history = payoutHistory(req.td.ctx);
  const flags = reconciliationFlags(req.td.ctx);
  const obligation = winners.length * GROSS_PAYOUT_MINOR;
  const body = html`${pageHeader('Payouts', html`Winners under the current published result. Gross payout ${peso(GROSS_PAYOUT_MINOR)} per winning ₱10 entry (stake included) ${SIM}.`)}
  ${alert('info', html`Real cash controls are disabled in this demo. <button class="btn btn--sm btn--ghost" type="button" disabled aria-disabled="true">Send real payout — unavailable</button>`)}
  <div class="stats">${stat('Winners (current versions)', String(winners.length))}${stat('Prize obligation (simulated)', peso(obligation), `${winners.length} × ${pesoShort(GROSS_PAYOUT_MINOR)}`)}${stat('Open reconciliation flags', String(flags.filter((f) => f.status === 'open').length))}</div>
  <section class="section"><h2>Winners</h2>
  ${dataTable(
    [
      { label: 'Entry', render: (w) => html`${w.entry_ref}<br><span class="small muted">${w.user_email}</span>` },
      { label: 'Digits', render: (w) => digitChips(w.selected_digits, { size: 'sm' }) },
      { label: 'Draw / result', render: (w) => html`${w.draw_label}<br><span class="mono">${w.six_digit_result}</span> v${w.version}` },
      { label: 'Gross', render: (w) => peso(w.prize_minor_units) },
      { label: 'Payout', render: (w) => html`${payoutBadge(w.payout_state)}${w.payout_reference ? html`<br><span class="mono small">${w.payout_reference}</span>` : ''}` },
      {
        label: 'Action',
        render: (w) =>
          !w.payout_id
            ? post('/admin/payouts/approve', req.td.csrf, html`<input type="hidden" name="entry_id" value="${w.entry_id}"><button class="btn btn--sm btn--secondary" type="submit">Approve payout</button>`)
            : w.payout_state === 'approved'
              ? post(`/admin/payouts/${w.payout_id}/complete`, req.td.csrf, html`<button class="btn btn--sm btn--primary" type="submit">Complete (simulated)</button>`)
              : html`<span class="muted">—</span>`,
      },
    ],
    winners,
    { caption: 'Winners', empty: emptyState('No winners', 'Winners appear after a result is published and matching completes.') },
  )}</section>
  <section class="section" id="reconciliation"><h2>Reconciliation</h2>
  <p class="small muted">A result correction after a simulated payout never pays again or debits a player automatically. Affected payouts are flagged here for human review.</p>
  ${dataTable(
    [
      { label: 'Flag', render: (f) => `#${f.id}` },
      { label: 'Entry', render: (f) => f.entry_ref },
      { label: 'Version', render: (f) => `v${f.version}` },
      { label: 'Reason', render: (f) => f.reason },
      { label: 'Status', render: (f) => (f.status === 'open' ? html`<span class="badge badge--bad">${icon('alert')}<span>Open</span></span>` : html`<span class="badge badge--ok">${icon('check')}<span>Resolved</span></span><br><span class="small">${f.resolution_note}</span>`) },
      { label: 'Action', render: (f) => (f.status === 'open' && can(req, ['admin']) ? post(`/admin/reconciliation/${f.id}/resolve`, req.td.csrf, html`<label class="sr-only" for="res-${f.id}">Resolution note</label><input id="res-${f.id}" name="note" class="input-sm" required minlength="5" placeholder="Resolution note"><button class="btn btn--sm btn--secondary" type="submit">Resolve</button>`) : '—') },
    ],
    flags,
    { caption: 'Reconciliation flags', empty: emptyState('No reconciliation needed', 'Flags appear when a corrected result affects an existing payout.') },
  )}</section>
  <section class="section"><h2>Payout history</h2>
  ${dataTable(
    [
      { label: 'Reference', render: (p) => html`<span class="mono small">${p.reference}</span>` },
      { label: 'Entry', render: (p) => html`${p.entry_ref}<br><span class="small muted">${p.user_email}</span>` },
      { label: 'Draw', render: (p) => `${p.draw_label} (v${p.version})` },
      { label: 'Gross', render: (p) => peso(p.gross_minor_units) },
      { label: 'State', render: (p) => html`${payoutBadge(p.state)}${p.cancel_reason ? html`<br><span class="small">${p.cancel_reason}</span>` : ''}` },
      { label: 'Approved', render: (p) => time(p.approved_at, true) },
      { label: 'Completed', render: (p) => time(p.completed_at, true) },
    ],
    history,
    { caption: 'Payout history', empty: emptyState('No payouts yet', 'Approved and completed simulated payouts appear here.') },
  )}</section>`;
  send(req, res, 'Payouts', body);
});

adminRouter.post('/admin/payouts/approve', guard('/admin/payouts'), act(() => '/admin/payouts', (req) => {
  const r = approvePayout(req.td.ctx, intParam(req.body.entry_id));
  return r.existed ? 'A payout already exists for this entry; no duplicate was created.' : 'Simulated payout approved.';
}));
adminRouter.post('/admin/payouts/:id/complete', guard('/admin/payouts'), act(() => '/admin/payouts', (req) => {
  completePayout(req.td.ctx, intParam(req.params.id));
  return 'Simulated payout completed and recorded in the demo ledger.';
}));
adminRouter.post('/admin/reconciliation/:id/resolve', requireRoles('admin'), act(() => '/admin/payouts#reconciliation', (req) => {
  resolveFlag(req.td.ctx, intParam(req.params.id), str(req.body.note));
  return 'Flag resolved.';
}));

// ---- users & roles ------------------------------------------------------------------------------

adminRouter.get('/admin/users', requireRoles('admin'), (req, res) => {
  const q = { search: str(req.query.q).trim(), role: str(req.query.role) };
  const rows = listUsers(req.td.ctx, q);
  const body = html`${pageHeader('Users & roles', 'Public registration only ever creates players. Staff, leader and agent roles are granted here.')}
  ${filterBar('/admin/users', html`${field('Search', 'q', { value: q.search })}${select('Role', 'role', [{ value: '', label: 'Any role' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))], { value: q.role })}`)}
  ${dataTable(
    [
      { label: 'User', render: (u) => html`<a href="/admin/users/${u.id}">${u.display_name}</a><br><span class="small muted">${u.email}</span>` },
      { label: 'Roles', render: (u) => (u.roles ?? '').split(',').filter(Boolean).map((r) => ROLE_LABEL[r as Role] ?? r).join(', ') || '—' },
      { label: 'Status', render: (u) => (u.status === 'active' ? 'Active' : 'Disabled') },
      { label: 'Created', render: (u) => time(u.created_at, true) },
    ],
    rows,
    { caption: 'Users', empty: emptyState('No users match', 'Try another search.') },
  )}
  <section class="section"><h2>Create account</h2>
  ${post(
    '/admin/users',
    req.td.csrf,
    html`<div class="grid-2">${field('Display name', 'displayName', { required: true })}${field('Email', 'email', { type: 'email', required: true })}</div>
    ${field('Temporary password', 'password', { type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 10 characters with a letter and a number. Share it out of band.' })}
    <fieldset><legend>Roles</legend><div class="check-grid">${ROLES.map((r) => html`<div class="check"><input type="checkbox" id="role-${r}" name="roles" value="${r}"><label for="role-${r}">${ROLE_LABEL[r]}</label></div>`)}</div></fieldset>
    ${checkbox('I confirm that combining a team-scoped role (leader/agent) with a global staff role grants global visibility', 'confirmScope')}
    <button class="btn btn--primary" type="submit">Create account</button>`,
    'card form',
  )}
  </section>`;
  send(req, res, 'Users', body);
});

adminRouter.post('/admin/users', requireRoles('admin'), async (req, res) => {
  try {
    const id = await adminCreateUser(req.td.ctx, { email: str(req.body.email), displayName: str(req.body.displayName), password: str(req.body.password), roles: req.body.roles, confirmScope: str(req.body.confirmScope) });
    flash(req, 'success', 'Account created.');
    res.redirect(303, `/admin/users/${id}`);
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    flash(req, 'error', err.message);
    res.redirect(303, '/admin/users');
  }
});

adminRouter.get('/admin/users/:id', requireRoles('admin'), (req, res) => {
  const { user, roles, roleRows } = adminGetUser(req.td.ctx, intParam(req.params.id));
  const body = html`${pageHeader(user.display_name, user.email, html`<a class="btn btn--ghost" href="/admin/users">${icon('back')} Users</a>`)}
  <div class="grid-2">
    <section class="card"><h2 class="h3">Roles</h2>
    ${roleRows.length
      ? html`<ul class="list">${roleRows.map(
          (r) => html`<li class="list__item"><strong>${ROLE_LABEL[r.role]}</strong> <span class="small muted">granted ${time(r.granted_at, true)}${r.granted_by_email ? ` by ${r.granted_by_email}` : ' (self-registration)'}${r.combined_scope_confirmed ? ' · combined scope confirmed' : ''}</span>
          ${post(`/admin/users/${user.id}/roles/revoke`, req.td.csrf, html`<input type="hidden" name="role" value="${r.role}"><button class="btn btn--sm btn--ghost" type="submit">Revoke</button>`)}</li>`,
        )}</ul>`
      : html`<p class="muted">No roles.</p>`}
    ${post(
      `/admin/users/${user.id}/roles`,
      req.td.csrf,
      html`<h3 class="h4">Grant role</h3>${select('Role', 'role', ROLES.filter((r) => !roles.has(r)).map((r) => ({ value: r, label: ROLE_LABEL[r] })), { required: true })}
      ${checkbox('I explicitly authorize any resulting combined global + team scope (recorded in the audit log)', 'confirmScope')}
      <button class="btn btn--secondary" type="submit">Grant</button>`,
      'form',
    )}
    </section>
    <section class="card"><h2 class="h3">Account status</h2>
      ${dl([['Status', user.status === 'active' ? 'Active' : 'Disabled'], ['Created', time(user.created_at)]])}
      ${post(`/admin/users/${user.id}/status`, req.td.csrf, html`<input type="hidden" name="status" value="${user.status === 'active' ? 'disabled' : 'active'}"><button class="btn ${user.status === 'active' ? 'btn--danger' : 'btn--secondary'}" type="submit">${user.status === 'active' ? 'Disable account' : 'Re-enable account'}</button>`)}
      <p class="small muted">Disabling signs the user out everywhere. Passwords are never shown.</p>
    </section>
  </div>`;
  send(req, res, user.display_name, body);
});

adminRouter.post('/admin/users/:id/roles', requireRoles('admin'), act((r) => `/admin/users/${intParam(r.params.id)}`, (req) => {
  grantRole(req.td.ctx, intParam(req.params.id), str(req.body.role), str(req.body.confirmScope));
  return 'Role granted.';
}));
adminRouter.post('/admin/users/:id/roles/revoke', requireRoles('admin'), act((r) => `/admin/users/${intParam(r.params.id)}`, (req) => {
  revokeRole(req.td.ctx, intParam(req.params.id), str(req.body.role));
  return 'Role revoked. It takes effect on the user’s next request.';
}));
adminRouter.post('/admin/users/:id/status', requireRoles('admin'), act((r) => `/admin/users/${intParam(r.params.id)}`, (req) => {
  setUserStatus(req.td.ctx, intParam(req.params.id), str(req.body.status));
  return 'Status updated.';
}));

// ---- teams & agents ------------------------------------------------------------------------------

adminRouter.get('/admin/teams', requireRoles('admin'), (req, res) => {
  const teams = adminListTeams(req.td.ctx);
  const candidates = leaderCandidates(req.td.ctx);
  const body = html`${pageHeader('Teams', 'Administrator view of all teams. Each Team Leader sees only their own team.')}
  ${dataTable(
    [
      { label: 'Team', render: (t) => html`<a href="/admin/teams/${t.id}">${t.name}</a>` },
      { label: 'Leader', render: (t) => (t.leader_email ? html`${t.leader_name}<br><span class="small muted">${t.leader_email}</span>` : '—') },
      { label: 'Active agents', render: (t) => String(t.agent_count) },
      { label: 'Status', render: (t) => (t.status === 'active' ? 'Active' : 'Inactive') },
    ],
    teams,
    { caption: 'Teams', empty: emptyState('No teams', 'Create a team and assign a leader.') },
  )}
  <section class="section"><h2>Create team</h2>
  ${candidates.length
    ? post('/admin/teams', req.td.csrf, html`${field('Team name', 'name', { required: true })}${select('Team leader', 'leader_user_id', candidates.map((c) => ({ value: String(c.id), label: `${c.display_name} (${c.email})` })), { required: true, hint: 'Users with the Team leader role who do not lead a team yet.' })}<button class="btn btn--primary" type="submit">Create team</button>`, 'card form')
    : emptyState('No available leaders', 'Grant the Team leader role to a user first (Users & roles).')}
  </section>`;
  send(req, res, 'Teams', body);
});

adminRouter.post('/admin/teams', requireRoles('admin'), act(() => '/admin/teams', (req) => {
  createTeam(req.td.ctx, str(req.body.name), str(req.body.leader_user_id));
  return 'Team created.';
}));

adminRouter.get('/admin/teams/:id', requireRoles('admin'), (req, res) => {
  const { team, agents, history } = adminGetTeam(req.td.ctx, intParam(req.params.id));
  const available = adminListAgents(req.td.ctx, {}).filter((a) => a.team_id !== team.id);
  const body = html`${pageHeader(team.name, html`Leader: ${team.leader_name ?? '—'} ${team.leader_email ? `(${team.leader_email})` : ''} · ${team.status === 'active' ? 'Active' : 'Inactive'}`, html`<a class="btn btn--ghost" href="/admin/teams">${icon('back')} Teams</a>`)}
  <section class="section"><h2>Agents</h2>
  ${dataTable(
    [
      { label: 'Agent', render: (a) => html`${a.display_name}<br><span class="small muted">${a.email}</span>` },
      { label: 'Since', render: (a) => time(a.starts_at, true) },
      { label: 'Action', render: (a) => post(`/admin/agents/${a.id}/unassign`, req.td.csrf, html`<input type="hidden" name="back" value="/admin/teams/${team.id}"><button class="btn btn--sm btn--ghost" type="submit">End assignment</button>`) },
    ],
    agents,
    { caption: 'Team agents', empty: emptyState('No agents', 'Assign an agent below.') },
  )}
  ${available.length
    ? post(`/admin/agents/0/assign`, req.td.csrf, html`<input type="hidden" name="team_id" value="${team.id}"><input type="hidden" name="back" value="/admin/teams/${team.id}">${select('Assign agent', 'agent_id', available.map((a) => ({ value: String(a.id), label: `${a.display_name} — ${a.team_name ? `currently ${a.team_name}` : 'unassigned'}` })), { required: true, hint: 'Reassigning ends the previous assignment. Past team history stays with the former team.' })}<button class="btn btn--secondary" type="submit">Assign to ${team.name}</button>`, 'card form')
    : ''}
  </section>
  <section class="section"><h2>Scoped activity</h2>
  ${dataTable(
    [
      { label: 'Agent', render: (h) => h.agent_email },
      { label: 'Assigned', render: (h) => time(h.starts_at, true) },
      { label: 'Ended', render: (h) => time(h.ends_at, true) },
      { label: 'By', render: (h) => h.assigned_by_email },
    ],
    history,
    { caption: 'Assignment history', empty: emptyState('No assignment history', 'Assignments appear here.') },
  )}
  <p class="small muted">No agent selling, collection or player-attribution workflow is confirmed yet, so there are no team-attributed transactions to show.</p></section>
  ${post(`/admin/teams/${team.id}/status`, req.td.csrf, html`<input type="hidden" name="status" value="${team.status === 'active' ? 'inactive' : 'active'}"><button class="btn btn--secondary" type="submit">${team.status === 'active' ? 'Deactivate team' : 'Reactivate team'}</button>`, 'card form')}`;
  send(req, res, team.name, body);
});

adminRouter.post('/admin/teams/:id/status', requireRoles('admin'), act((r) => `/admin/teams/${intParam(r.params.id)}`, (req) => {
  setTeamStatus(req.td.ctx, intParam(req.params.id), str(req.body.status));
  return 'Team status updated.';
}));

adminRouter.get('/admin/agents', requireRoles('admin'), (req, res) => {
  const q = { search: str(req.query.q).trim(), filter: str(req.query.filter) };
  const agents = adminListAgents(req.td.ctx, q);
  const teams = adminListTeams(req.td.ctx).filter((t) => t.status === 'active');
  const body = html`${pageHeader('Agents', 'Global agent directory. Agent selling/collection powers are not yet defined and are therefore unavailable.')}
  ${filterBar('/admin/agents', html`${field('Search', 'q', { value: q.search })}${select('Assignment', 'filter', [{ value: '', label: 'All' }, { value: 'assigned', label: 'Assigned' }, { value: 'unassigned', label: 'Unassigned' }], { value: q.filter })}`)}
  ${dataTable(
    [
      { label: 'Agent', render: (a) => html`${a.display_name}<br><span class="small muted">${a.email}</span>` },
      { label: 'Team', render: (a) => (a.team_id ? html`<a href="/admin/teams/${a.team_id}">${a.team_name}</a>` : html`<span class="badge badge--warn">${icon('minus')}<span>Unassigned</span></span>`) },
      {
        label: 'Assignment',
        render: (a) => html`${post(`/admin/agents/${a.id}/assign`, req.td.csrf, html`<label class="sr-only" for="team-${a.id}">Team for ${a.display_name}</label><select id="team-${a.id}" name="team_id" class="input-sm">${teams.map((t) => html`<option value="${t.id}" ${t.id === a.team_id ? raw('selected') : ''}>${t.name}</option>`)}</select><button class="btn btn--sm btn--secondary" type="submit">${a.team_id ? 'Move' : 'Assign'}</button>`)}
          ${a.team_id ? post(`/admin/agents/${a.id}/unassign`, req.td.csrf, html`<button class="btn btn--sm btn--ghost" type="submit">Unassign</button>`) : ''}`,
      },
    ],
    agents,
    { caption: 'Agents', empty: emptyState('No agents', 'Grant the Agent role to a user first.') },
  )}`;
  send(req, res, 'Agents', body);
});

const backTo = (req: Request, fallback: string) => (/^\/admin\/(teams\/\d+|agents)$/.test(str(req.body.back)) ? str(req.body.back) : fallback);
adminRouter.post('/admin/agents/:id/assign', requireRoles('admin'), act((r) => backTo(r, '/admin/agents'), (req) => {
  const agentId = intParam(req.params.id) > 0 ? intParam(req.params.id) : intParam(req.body.agent_id);
  assignAgent(req.td.ctx, agentId, str(req.body.team_id));
  return 'Assignment saved. It applies from the next request.';
}));
adminRouter.post('/admin/agents/:id/unassign', requireRoles('admin'), act((r) => backTo(r, '/admin/agents'), (req) => {
  unassignAgent(req.td.ctx, intParam(req.params.id));
  return 'Assignment ended.';
}));

// ---- settings --------------------------------------------------------------------------------------

adminRouter.get('/admin/settings', requireRoles('admin'), (req, res) => {
  const { db, clock, config } = req.td;
  const rules = db.all<{ id: number; label: string; stake_minor: number; gross_payout_minor: number; combination_cap_minor: number; reservation_minutes: number; created_at: string }>('SELECT * FROM rule_versions ORDER BY id');
  const offset = clock instanceof DemoClock ? clock.offsetMs() : 0;
  const body = html`${pageHeader('Settings', 'Confirmed rules are frozen. Draft configuration is for owner review only.')}
  <section class="card"><h2 class="h3">${icon('lock')} Confirmed payout rule (frozen)</h2>
    <p class="payout-line"><strong>₱10 taya → ₱3,100 total kapag panalo; kasama na ang taya.</strong> Net gain ₱3,090. Only ₱10 entries are authorized; no proportional payouts are inferred.</p>
    ${dataTable(
      [
        { label: 'Version', render: (r) => `v${r.id}` },
        { label: 'Label', render: (r) => r.label },
        { label: 'Stake', render: (r) => `${r.stake_minor} centavos` },
        { label: 'Gross payout', render: (r) => `${r.gross_payout_minor} centavos (incl. stake)` },
        { label: 'Cap', render: (r) => `${r.combination_cap_minor} centavos / combination / draw` },
        { label: 'Reservation', render: (r) => `${r.reservation_minutes} min` },
      ],
      rules,
      { caption: 'Rule versions', empty: emptyState('No rule versions', 'Created with the first draw.') },
    )}
  </section>
  ${post(
    '/admin/settings',
    req.td.csrf,
    html`<h2 class="h3">Draft demo configuration</h2><p class="small muted">Saved values never change open draws or frozen rules; adopting them would need a new rule version after owner approval.</p>
    ${DRAFT_SETTINGS.map((s) => (s.type === 'text' ? textarea(s.label, s.key, { value: getSetting(db, s.key) ?? '', rows: 3 }) : field(s.label, s.key, { type: 'number', value: getSetting(db, s.key) ?? '', attrs: `min="${s.min}" max="${s.max}"` })))}
    <button class="btn btn--primary" type="submit">Save draft configuration</button>`,
    'card form',
  )}
  <section class="card"><h2 class="h3">Demo clock (local only)</h2>
    ${dl([['Server time', time(clock.now().toISOString())], ['Offset from real time', offset ? durationText(offset) : 'none']])}
    ${config.demoClockControls
      ? html`<p class="small">Moves the server clock <strong>forward only</strong> so cutoffs and draw times can be demonstrated. It can never move backward, so closed windows never reopen. Every change is audited.</p>
        <div class="button-row">${[5, 60, 6 * 60, 24 * 60].map((m) => post('/admin/settings/clock', req.td.csrf, html`<input type="hidden" name="minutes" value="${m}"><button class="btn btn--secondary" type="submit">+${durationText(m * MINUTE)}</button>`))}</div>
        ${post('/admin/settings/clock', req.td.csrf, html`<label for="f-minutes">Advance by minutes</label><input id="f-minutes" name="minutes" type="number" min="1" max="${(7 * DAY) / MINUTE}" required class="input-sm"><button class="btn btn--secondary btn--sm" type="submit">Advance</button>`)}`
      : html`<p class="muted">Disabled in this environment.</p>`}
  </section>
  <section class="card"><h2 class="h3">${icon('shield')} Live mode</h2>
    <p>There is no "enable live" switch. Real payments, payouts, provider integrations and official result sources are not implemented and remain out of scope.</p>
    <button class="btn btn--danger" type="button" disabled aria-disabled="true">Enable real-money mode — unavailable</button>
    <h3 class="h4">Unresolved launch requirements</h3>
    <ul class="checks">${LAUNCH_REQUIREMENTS.map((r) => html`<li class="bad">${icon('x')} <span>${r}</span> <span class="sr-only">unresolved</span></li>`)}</ul>
  </section>`;
  send(req, res, 'Settings', body);
});

adminRouter.post('/admin/settings', requireRoles('admin'), act(() => '/admin/settings', (req) => {
  saveDraftSettings(req.td.ctx, req.body ?? {});
  return 'Draft configuration saved.';
}));
adminRouter.post('/admin/settings/clock', requireRoles('admin'), act(() => '/admin/settings', (req) => {
  advanceDemoClock(req.td.ctx, str(req.body.minutes), req.td.config.demoClockControls);
  return `Demo clock advanced. Server time is now ${fmtManila(req.td.clock.now().toISOString())}.`;
}));

// ---- audit -----------------------------------------------------------------------------------------

adminRouter.get('/admin/audit', requireRoles('admin'), (req, res) => {
  const q = { text: str(req.query.q).trim(), entityType: str(req.query.type) };
  const rows = searchAudit(req.td.db, { ...q, limit: 300 });
  const types = req.td.db.all<{ entity_type: string }>('SELECT DISTINCT entity_type FROM audit_events ORDER BY 1');
  const body = html`${pageHeader('Audit log', 'Append-only. Entries cannot be edited or deleted, including by administrators.')}
  ${filterBar('/admin/audit', html`${field('Search action, entity id, actor or value', 'q', { value: q.text })}${select('Entity', 'type', [{ value: '', label: 'All' }, ...types.map((t) => ({ value: t.entity_type, label: t.entity_type }))], { value: q.entityType })}`)}
  ${dataTable(
    [
      { label: 'When', render: (a) => time(a.created_at, true) },
      { label: 'Actor', render: (a) => a.actor_email ?? html`<span class="muted">system</span>` },
      { label: 'Action', render: (a) => html`<code>${a.action}</code>` },
      { label: 'Entity', render: (a) => `${a.entity_type} ${a.entity_id ?? ''}` },
      { label: 'Change', render: (a) => html`<code class="small wrap">${a.before_json ? `before ${a.before_json} ` : ''}${a.after_json ? `after ${a.after_json}` : ''}</code>` },
      { label: 'Request', render: (a) => html`<span class="mono small">${a.request_id ?? '—'}</span>` },
    ],
    rows,
    { caption: 'Audit events', empty: emptyState('No events match', 'Try a different search.') },
  )}`;
  send(req, res, 'Audit log', body);
});

// ---- support ---------------------------------------------------------------------------------------

adminRouter.get('/admin/support', requireRoles('admin'), (req, res) => {
  const state = str(req.query.state);
  const rows = adminListTickets(req.td.ctx, { state });
  const body = html`${pageHeader('Support tickets')}
  ${filterBar('/admin/support', select('State', 'state', [{ value: '', label: 'All' }, ...TICKET_STATES.map((s) => ({ value: s, label: s.replace('_', ' ') }))], { value: state }))}
  ${dataTable(
    [
      { label: 'Ticket', render: (t) => html`<a href="/admin/support/${t.id}">#${t.id} ${t.subject}</a>` },
      { label: 'Player', render: (t) => t.user_email },
      { label: 'Entry', render: (t) => t.entry_ref ?? '—' },
      { label: 'State', render: (t) => ticketBadge(t.state) },
      { label: 'Updated', render: (t) => time(t.updated_at, true) },
    ],
    rows,
    { caption: 'Tickets', empty: emptyState('No tickets', 'Player support requests appear here.') },
  )}`;
  send(req, res, 'Support', body);
});

adminRouter.get('/admin/support/:id', requireRoles('admin'), (req, res) => {
  const { ticket, messages } = adminGetTicket(req.td.ctx, intParam(req.params.id));
  const body = html`${pageHeader(`#${ticket.id} ${ticket.subject}`, html`${ticketBadge(ticket.state)} · ${ticket.user_email}${ticket.entry_ref ? ` · Entry ${ticket.entry_ref}` : ''}`, html`<a class="btn btn--ghost" href="/admin/support">${icon('back')} Tickets</a>`)}
  <ol class="thread">
    <li class="card thread__msg"><p class="small muted">Player · ${time(ticket.created_at, true)}</p><p class="pre">${ticket.body}</p></li>
    ${messages.map((m) => html`<li class="card thread__msg ${m.internal ? 'thread__msg--internal' : ''}"><p class="small muted">${m.internal ? html`<strong>Internal note</strong> · ` : ''}${m.author_name} · ${time(m.created_at, true)}</p><p class="pre">${m.body}</p></li>`)}
  </ol>
  ${post(
    `/admin/support/${ticket.id}`,
    req.td.csrf,
    html`${select('State', 'state', TICKET_STATES.map((s) => ({ value: s, label: s.replace('_', ' ') })), { value: ticket.state })}
    ${textarea('Reply to player (visible to them)', 'reply', { rows: 3 })}
    ${textarea('Internal resolution note (staff only)', 'note', { rows: 2 })}
    <button class="btn btn--primary" type="submit">Update ticket</button>`,
    'card form',
  )}`;
  send(req, res, 'Support ticket', body);
});

adminRouter.post('/admin/support/:id', requireRoles('admin'), act((r) => `/admin/support/${intParam(r.params.id)}`, (req) => {
  adminUpdateTicket(req.td.ctx, intParam(req.params.id), { state: str(req.body.state), reply: str(req.body.reply), note: str(req.body.note) });
  return 'Ticket updated.';
}));
