import { type Request, type Response, Router } from 'express';
import { permutations, validateSelection } from '../../domain/digits.js';
import { GROSS_PAYOUT_MINOR, NET_GAIN_MINOR, STAKE_MINOR, STAKE_OPTIONS } from '../../domain/rules.js';
import { DomainError, NotFoundError } from '../../lib/errors.js';
import { durationText, peso, pesoShort } from '../../lib/format.js';
import { type SafeHtml, html, raw } from '../../lib/html.js';
import { demoPaymentRef, randomToken } from '../../lib/ids.js';
import { capacityView } from '../../services/capacity.js';
import { expireDueForCombination } from '../../services/maintenance.js';
import { type DrawRow, getDraw, listDraws, openDraws, upcomingDraws, withPhase } from '../../services/draws.js';
import { ALL_STATUSES, type EntryRow, createEntry, entryCounts, getOwnEntry, listOwnEntries } from '../../services/entries.js';
import { paymentForEntry, receiptFor, submitPayment } from '../../services/payments.js';
import { currentPublished, drawResultHistory, publishedResults } from '../../services/results.js';
import { addPlayerMessage, createTicket, getOwnTicket, listOwnTickets } from '../../services/support.js';
import { changePassword, updateProfile } from '../../services/users.js';
import { page } from '../layout.js';
import { flash, intParam, requireRoles, str } from '../middleware.js';
import {
  alert, checkbox, countdown, csrfField, dataTable, digitChips, dl, emptyState, entryBadge, errorSummary, field, filterBar, icon,
  outcomeBadge, pageHeader, passwordField, paymentBadge, phaseBadge, refundBadge, resultChips, select, stat, textarea, ticketBadge, time, timeline,
  type Step,
} from '../ui.js';

export const playerRouter = Router();
playerRouter.use(['/app', '/api'], requireRoles('player'));

const PAYOUT_LINE = '₱10 taya → ₱3,100 total kapag panalo; kasama na ang taya.';
const send = (req: Request, res: Response, title: string, body: SafeHtml, status = 200) => res.status(status).send(page(req, { title, area: 'player', body }));

// ---- dashboard -----------------------------------------------------------------

playerRouter.get('/app', (req, res) => {
  const { db, clock, actor } = req.td;
  const now = clock.now();
  const open = openDraws(db, now).map((d) => withPhase(db, d, now));
  const upcoming = open.length ? [] : upcomingDraws(db, now);
  const counts = entryCounts(db, actor!.id);
  const unpaid = db.all<EntryRow & { draw_label: string }>(
    `SELECT e.*, d.reference_label AS draw_label FROM entries e JOIN draws d ON d.id = e.draw_id WHERE e.user_id = ? AND e.eligibility_status = 'awaiting_payment' ORDER BY e.reservation_expires_at`,
    actor!.id,
  );
  const latest = publishedResults(db, 1)[0];
  const body = html`${pageHeader(`Hi, ${actor!.displayName}`, 'Your entries, active sample draws and the latest published result.', html`<a class="btn btn--primary" href="/app/entries/new">Pili ng 3 digit ${icon('arrow')}</a>`)}
  ${unpaid.map((e) =>
    alert('warn', html`Entry <strong>${e.public_ref}</strong> (${digitChips(e.selected_digits, { size: 'sm' })}) for ${e.draw_label} is reserved until ${time(e.reservation_expires_at)}. <a href="/app/entries/${e.id}/payment">Complete the simulated payment</a>.`, 'Awaiting payment.'),
  )}
  <section class="section">
    <h2>Active draw${open.length === 1 ? '' : 's'}</h2>
    ${open.length
      ? html`<div class="cards">${open.map(
          (d) => html`<article class="card draw-card">
            <div class="draw-card__head"><h3>${d.reference_label}</h3>${phaseBadge(d.phase)}</div>
            ${countdown(d.submission_closes_at, 'Submission & payment cutoff')}
            ${countdown(d.verification_closes_at, 'Verification cutoff')}
            <p class="small muted">Draw time ${time(d.scheduled_draw_at)}</p>
            <a class="btn btn--primary btn--block" href="/app/entries/new?draw=${d.id}">New entry for this draw</a>
          </article>`,
        )}</div>`
      : html`${alert('info', 'Sarado na ang submission — no draw is accepting entries right now.')}
        ${upcoming.map((d) => html`<article class="card draw-card"><div class="draw-card__head"><h3>${d.reference_label}</h3>${phaseBadge(d.phase)}</div><p class="small">Opens ${time(d.opens_at)}</p></article>`)}`}
  </section>
  <section class="section">
    <h2>Your entries</h2>
    <div class="stats">
      ${stat('Awaiting payment', String(counts.awaiting_payment))}
      ${stat('Pending verification', String(counts.pending_verification))}
      ${stat('Approved', String(counts.approved))}
      ${stat('Rejected / expired / voided', String(counts.rejected + counts.expired + counts.voided))}
    </div>
    <p><a href="/app/entries">See all entries ${icon('arrow')}</a></p>
  </section>
  <section class="section">
    <h2>Latest published result</h2>
    ${latest
      ? html`<article class="card"><h3>${latest.draw_label}</h3>${resultChips(latest.six_digit_result)}
        <p class="small muted">${latest.source_label}${latest.corrected ? html` · <strong>Corrected</strong>` : ''} · ${time(latest.published_at)}</p>
        <a href="/app/results/${latest.draw_id}">Check your entries for this draw ${icon('arrow')}</a></article>`
      : emptyState('No results yet', 'Published sample results will appear here.', undefined, { art: 'results' })}
  </section>`;
  send(req, res, 'Dashboard', body);
});

// ---- new entry: select -> review -> confirm --------------------------------------------

interface Draft {
  drawId: string;
  digits: string;
}

function drawOptions(draws: DrawRow[], selected: string) {
  return draws.map((d) => ({ value: String(d.id), label: `${d.reference_label} — cutoff ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d.submission_closes_at))} PHT` })).map((o) => ({ ...o, selected: o.value === selected }));
}

function newEntryPage(req: Request, draft: Draft, errors: string[] = [], lostDraw: DrawRow | null = null): SafeHtml {
  const { db, clock } = req.td;
  const open = openDraws(db, clock.now());
  if (!open.length) {
    return html`${pageHeader('New entry')}${lostDraw ? errorSummary(errors) : ''}
      ${emptyState('Sarado na ang submission', 'No sample draw is accepting entries right now. Check back when the next draw opens.', html`<a class="btn btn--secondary" href="/app">Back to dashboard</a>`)}`;
  }
  const selectedDraw = open.find((d) => String(d.id) === draft.drawId) ?? (lostDraw ? null : open[0]);
  const drawValue = selectedDraw ? String(selectedDraw.id) : '';
  return html`${pageHeader('New entry', 'Pili ng 3 magkakaibang digit. Your selection is checked again on the server.')}
  ${errorSummary(errors)}
  ${lostDraw ? alert('error', html`<strong>${lostDraw.reference_label}</strong> is no longer accepting entries. Your digits were kept, but we did not move them to another draw. Choose a draw below if you want to continue.`) : ''}
  <form method="post" action="/app/entries/review" class="entry-form" data-once novalidate>
    ${csrfField(req.td.csrf)}
    <div class="card">
      ${select('Draw', 'draw_id', [...(selectedDraw ? [] : [{ value: '', label: '— Choose a draw —' }]), ...drawOptions(open, drawValue)], { value: drawValue, required: true, attrs: 'data-draw-select' })}
      ${selectedDraw ? html`<div class="cutoffs">${countdown(selectedDraw.submission_closes_at, 'Submission & payment cutoff')}${countdown(selectedDraw.verification_closes_at, 'Verification cutoff')}</div>` : ''}
    </div>
    <fieldset class="card picker" data-digit-picker>
      <legend>Pili ng 3 magkakaibang digit</legend>
      <p class="hint" id="picker-hint">Choose three different digits from 0–9. Order does not matter for winning: 135 and 531 are the same combination.</p>
      <div class="slots" aria-hidden="true" data-slots>
        ${[0, 1, 2].map((i) => html`<div class="slot" data-slot="${i}"><span class="slot__value">${draft.digits[i] ?? ''}</span><button type="button" class="slot__remove" data-remove="${i}" tabindex="-1" hidden>Remove</button></div>`)}
      </div>
      <div class="keypad" data-keypad hidden role="group" aria-label="Digit buttons">
        ${'1234567890'.split('').map((d) => html`<button type="button" class="key" data-key="${d}" aria-pressed="false">${d}</button>`)}
        <button type="button" class="key key--wide" data-clear>Clear</button>
      </div>
      <div class="field">
        <label for="f-digits">Your 3 digits</label>
        <input id="f-digits" name="digits" value="${draft.digits}" inputmode="numeric" autocomplete="off" maxlength="3" pattern="[0-9]{3}" required aria-describedby="picker-hint picker-status" class="digits-input" data-digits-input>
      </div>
      <p class="picker__status" id="picker-status" aria-live="polite" data-picker-status></p>
      <div class="capacity" data-capacity hidden aria-live="polite"></div>
    </fieldset>
    <fieldset class="card">
      <legend>Stake</legend>
      <div class="stakes">
        ${STAKE_OPTIONS.map(
          (s) => html`<label class="stake ${s.enabled ? '' : 'stake--disabled'}"><input type="radio" name="stake_minor" value="${s.minor}" ${s.enabled ? raw('checked') : raw('disabled')}>
          <span class="stake__amount">${pesoShort(s.minor)}</span><span class="stake__note">${s.enabled ? 'Fixed demo stake' : 'Not yet authorized'}</span></label>`,
        )}
      </div>
      <p class="payout-line">${icon('trophy')} <strong>${PAYOUT_LINE}</strong></p>
      <p class="small muted">Potential payout ${peso(GROSS_PAYOUT_MINOR)} total (net gain ${peso(NET_GAIN_MINOR)}). Limit: ₱500 per combination per draw.</p>
    </fieldset>
    <div class="form__actions"><button class="btn btn--primary btn--lg" type="submit" data-continue>Review entry ${icon('arrow')}</button><a href="/app">Cancel</a></div>
  </form>`;
}

playerRouter.get('/app/entries/new', (req, res) => {
  send(req, res, 'New entry', newEntryPage(req, { drawId: str(req.query.draw), digits: str(req.query.digits).replace(/\D/g, '').slice(0, 3) }));
});

/** Server-side review: validates everything except the final reservation. */
playerRouter.post('/app/entries/review', (req, res) => {
  const { db, clock, actor } = req.td;
  const draft: Draft = { drawId: str(req.body.draw_id), digits: str(req.body.digits).trim() };
  const errors: string[] = [];
  const sel = validateSelection(draft.digits);
  if (!sel.ok) errors.push(sel.error);
  if (str(req.body.stake_minor) !== String(STAKE_MINOR)) errors.push('Only the fixed ₱10 stake is currently authorized.');
  const draw = getDraw(db, intParam(draft.drawId));
  const now = clock.now();
  const t = now.toISOString();
  let lost: DrawRow | null = null;
  if (!draw || draw.status !== 'open' || t < draw.opens_at) errors.push('Choose a draw that is open for entries.');
  else if (t >= draw.submission_closes_at) {
    errors.push('Sarado na ang submission para sa draw na ito.');
    lost = draw;
  }
  if (errors.length) return send(req, res, 'New entry', newEntryPage(req, draft, errors, lost), 422);
  const s = sel as { digits: string; canonical: string };
  expireDueForCombination(db, t, draw!.id, s.canonical);
  const dup = db.get<{ public_ref: string }>(
    `SELECT public_ref FROM entries WHERE user_id = ? AND draw_id = ? AND canonical_key = ? AND eligibility_status IN ('awaiting_payment','pending_verification','approved')`,
    actor!.id, draw!.id, s.canonical,
  );
  const cap = capacityView(db, draw!.id, s.canonical);
  const perms = permutations(s.digits);
  const blocked = dup ? 'dup' : cap.availableMinor < STAKE_MINOR ? 'cap' : null;
  const body = html`${pageHeader('Review your entry', 'Nothing is reserved until you confirm.')}
  ${blocked === 'dup' ? alert('error', html`May active entry ka na (<strong>${dup!.public_ref}</strong>) para sa combination na ito sa draw na ito. Choose a different combination.`) : ''}
  ${blocked === 'cap' ? alert('error', html`This number combination has already reached the ₱500 limit. Please choose another combination.<br><span lang="fil">Naabot na ng combination na ito ang ₱500 limit. Pumili ng ibang combination.</span>`) : ''}
  <div class="grid-2">
    <section class="card">
      <h2 class="h3">Selection</h2>
      ${digitChips(s.digits, { size: 'lg' })}
      <p>These count as the <strong>same combination</strong> — sa anumang order: <span class="mono">${perms.join(' · ')}</span>.</p>
      <p class="small muted">Your receipt keeps the order you chose (${s.digits}). Winning only needs all three digits somewhere in the six-digit result.</p>
      ${dl([
        ['Draw', draw!.reference_label],
        ['Submission & payment cutoff', time(draw!.submission_closes_at)],
        ['Verification cutoff', time(draw!.verification_closes_at)],
        ['Stake', peso(STAKE_MINOR)],
        ['Potential payout', html`${peso(GROSS_PAYOUT_MINOR)} total, including your ${pesoShort(STAKE_MINOR)} stake (net ${peso(NET_GAIN_MINOR)})`],
      ])}
    </section>
    <section class="card">
      <h2 class="h3">Combination capacity</h2>
      ${dl([
        ['Limit', 'Limit: ₱500 per combination per draw'],
        ['Used/reserved', `Used/reserved: ${pesoShort(cap.usedMinor)}`],
        ['Available', `Available: ${pesoShort(cap.availableMinor)}`],
      ])}
      <p class="small muted">Live server values; no other player's details are shown. Another player may take the last slot before you confirm — the server re-checks when you confirm.</p>
    </section>
  </div>
  <form method="post" action="/app/entries" class="card form" data-once>
    ${csrfField(req.td.csrf)}
    <input type="hidden" name="draw_id" value="${draw!.id}"><input type="hidden" name="digits" value="${s.digits}">
    <input type="hidden" name="stake_minor" value="${STAKE_MINOR}"><input type="hidden" name="idempotency_key" value="${randomToken(18)}">
    ${checkbox(html`I understand: my slot is reserved for up to 5 minutes for a <strong>simulated</strong> payment; only entries <strong>approved before the verification cutoff</strong> can win; ${PAYOUT_LINE}`, 'ack', { required: true })}
    <div class="form__actions">
      <button class="btn btn--primary btn--lg" type="submit" ${blocked ? raw('disabled aria-disabled="true"') : ''}>Confirm &amp; reserve slot</button>
      <a class="btn btn--ghost" href="/app/entries/new?draw=${draw!.id}&amp;digits=${s.digits}">${icon('back')} Change selection</a>
    </div>
  </form>`;
  send(req, res, 'Review entry', body);
});

playerRouter.post('/app/entries', (req, res) => {
  const draft: Draft = { drawId: str(req.body.draw_id), digits: str(req.body.digits) };
  if (str(req.body.ack) !== 'on') {
    return send(req, res, 'New entry', newEntryPage(req, draft, ['Please tick the confirmation box on the review page before reserving.']), 422);
  }
  try {
    const { entry, replayed } = createEntry(req.td.ctx, {
      drawId: intParam(draft.drawId),
      digits: draft.digits,
      stakeMinor: Number(str(req.body.stake_minor)),
      idempotencyKey: str(req.body.idempotency_key),
    });
    if (!replayed) flash(req, 'success', `Slot reserved for ${entry.selected_digits} (${entry.public_ref}). Complete the simulated payment before the reservation expires.`);
    res.redirect(303, `/app/entries/${entry.id}/payment`);
  } catch (err) {
    if (!(err instanceof DomainError) || err.status === 403) throw err;
    const draw = getDraw(req.td.db, intParam(draft.drawId));
    const lost = err.code === 'SUBMISSION_CLOSED' || err.code === 'DRAW_CANCELLED' ? draw ?? null : null;
    send(req, res, 'New entry', newEntryPage(req, draft, [err.message], lost), err.status === 404 ? 404 : 409);
  }
});

// ---- entry list & detail --------------------------------------------------------------

playerRouter.get('/app/entries', (req, res) => {
  const { db, clock } = req.td;
  const q = { drawId: intParam(req.query.draw) > 0 ? intParam(req.query.draw) : undefined, status: str(req.query.status), search: str(req.query.q).trim() };
  const rows = listOwnEntries(req.td.ctx, q);
  const draws = listDraws(db, clock.now());
  const filtered = !!(q.drawId || q.status || q.search);
  const body = html`${pageHeader('My entries', 'Each entry belongs to one draw. Status and outcome are shown separately.', html`<a class="btn btn--primary" href="/app/entries/new">New entry</a>`)}
  ${filterBar(
    '/app/entries',
    html`${select('Draw', 'draw', [{ value: '', label: 'All draws' }, ...draws.map((d) => ({ value: String(d.id), label: d.reference_label }))], { value: q.drawId ? String(q.drawId) : '' })}
    ${select('Status', 'status', [{ value: '', label: 'All statuses' }, ...ALL_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) }))], { value: q.status })}
    ${field('Search digits or reference', 'q', { value: q.search, attrs: 'inputmode="search"' })}`,
  )}
  ${dataTable(
    [
      { label: 'Reference', render: (e) => html`<a href="/app/entries/${e.id}">${e.public_ref}</a>` },
      { label: 'Digits', render: (e) => digitChips(e.selected_digits, { size: 'sm' }) },
      { label: 'Draw', render: (e) => html`${e.draw_label}<br><span class="small muted">${time(e.scheduled_draw_at, true)}</span>` },
      { label: 'Status', render: (e) => entryBadge(e.eligibility_status) },
      { label: 'Payment', render: (e) => paymentBadge(e.payment_state) },
      { label: 'Outcome', render: (e) => outcomeBadge(e.eligibility_status, e.outcome, !!e.outcome) },
      { label: 'Prize', render: (e) => (e.prize_minor_units === null ? html`<span class="muted">—</span>` : peso(e.prize_minor_units)) },
    ],
    rows,
    {
      caption: 'Your entries',
      empty: filtered
        ? emptyState('No matching entries', 'Try different filters.', html`<a class="btn btn--ghost" href="/app/entries">Reset filters</a>`)
        : emptyState('No entries yet', 'Pick three different digits to create your first entry.', html`<a class="btn btn--primary" href="/app/entries/new">New entry</a>`, { art: 'entries' }),
    },
  )}`;
  send(req, res, 'My entries', body);
});

function entryOutcome(req: Request, e: EntryRow) {
  const { db } = req.td;
  const pub = currentPublished(db, e.draw_id);
  const out = pub
    ? db.get<{ outcome: 'won' | 'lost'; prize_minor_units: number; matched_digits: string; missing_digits: string }>('SELECT * FROM outcomes WHERE entry_id = ? AND result_version_id = ?', e.id, pub.id)
    : undefined;
  const history = db.all<{ version: number; six_digit_result: string; outcome: string; prize_minor_units: number; state: string }>(
    `SELECT rv.version, rv.six_digit_result, rv.state, o.outcome, o.prize_minor_units FROM outcomes o JOIN result_versions rv ON rv.id = o.result_version_id WHERE o.entry_id = ? AND rv.state = 'superseded' ORDER BY rv.version`,
    e.id,
  );
  return { pub, out, history };
}

playerRouter.get('/app/entries/:id', (req, res) => {
  const e = getOwnEntry(req.td.ctx, intParam(req.params.id));
  const { db, clock } = req.td;
  const draw = withPhase(db, getDraw(db, e.draw_id)!, clock.now());
  const p = paymentForEntry(req.td.ctx, e.id);
  const receipt = receiptFor(req.td.ctx, p.id);
  const refund = db.get<{ status: string; reference: string | null; amount_minor_units: number; reason: string }>('SELECT * FROM refunds WHERE payment_id = ?', p.id);
  const payout = db.get<{ state: string; reference: string; completed_at: string | null }>('SELECT * FROM payouts WHERE entry_id = ?', e.id);
  const { pub, out, history } = entryOutcome(req, e);
  const terminalBad = ['rejected', 'expired', 'voided'].includes(e.eligibility_status);
  const steps: Step[] = [
    { label: 'Entry created & capacity reserved', at: e.submitted_at, state: 'done' },
    { label: 'Payment submitted (simulated)', at: p.submitted_at, state: p.submitted_at ? 'done' : e.eligibility_status === 'awaiting_payment' ? 'current' : 'todo' },
    { label: 'Funds received in demo ledger', at: p.trusted_received_at, state: p.trusted_received_at ? 'done' : 'todo', note: p.submitted_at && !p.trusted_received_at ? 'A reference or proof alone is not a receipt.' : undefined },
    e.eligibility_status === 'approved' || e.approved_at
      ? { label: 'Approved by payment reviewer', at: e.approved_at, state: 'done' }
      : terminalBad
        ? { label: e.eligibility_status === 'rejected' ? `Rejected: ${e.rejection_reason ?? ''}` : e.eligibility_status === 'expired' ? 'Expired — not approved before the cutoff' : `Voided: ${e.void_reason ?? ''}`, at: e.rejected_at ?? e.expired_at ?? e.voided_at, state: 'bad' }
        : { label: 'Waiting for verification', state: e.eligibility_status === 'pending_verification' ? 'current' : 'todo', note: `Must be approved before ${new Date(draw.verification_closes_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT` },
    { label: pub ? `Result published${pub.correction_reason ? ' (corrected)' : ''}` : 'Result published', at: pub?.published_at, state: pub ? 'done' : 'todo' },
  ];
  const body = html`${pageHeader(`Entry ${e.public_ref}`, html`${draw.reference_label} · ${phaseBadge(draw.phase)}`, html`<a class="btn btn--ghost" href="/app/entries">${icon('back')} All entries</a>`)}
  ${e.eligibility_status === 'awaiting_payment' ? alert('warn', html`Your slot is reserved until ${time(e.reservation_expires_at)}. <a href="/app/entries/${e.id}/payment">Go to simulated payment</a>.`) : ''}
  <div class="grid-2">
    <section class="card receipt" aria-labelledby="receipt-h">
      <h2 class="h3" id="receipt-h">Receipt (demo)</h2>
      ${digitChips(e.selected_digits, { size: 'lg' })}
      <p class="small muted">Selection is locked and cannot be edited. Same combination as ${permutations(e.selected_digits).filter((x) => x !== e.selected_digits).join(', ')}.</p>
      ${dl([
        ['Reference', html`<span class="mono">${e.public_ref}</span>`],
        ['Status', entryBadge(e.eligibility_status)],
        ['Outcome', outcomeBadge(e.eligibility_status, out?.outcome, !!pub)],
        ['Stake', peso(e.stake_minor_units)],
        ['Payout if won', `${peso(GROSS_PAYOUT_MINOR)} total incl. stake`],
        ['Draw time', time(draw.scheduled_draw_at)],
        ['Created', time(e.created_at)],
      ])}
    </section>
    <section class="card">
      <h2 class="h3">Timeline</h2>
      ${timeline(steps)}
    </section>
  </div>
  <div class="grid-2">
    <section class="card">
      <h2 class="h3">Payment (simulated)</h2>
      ${dl([
        ['State', paymentBadge(p.state)],
        ['Expected', peso(p.expected_minor_units)],
        ['Received (ledger)', p.received_minor_units ? peso(p.received_minor_units) : 'Not received'],
        ['Reference', p.reference ? html`<span class="mono">${p.reference}</span>` : '—'],
        ['Ledger receipt', receipt ? html`<span class="mono">${receipt.reference}</span> · ${time(receipt.created_at, true)}` : '—'],
        ['Sample proof', p.proof_object_key ? html`<a href="/proofs/${p.proof_object_key}">View sample proof</a>` : 'None'],
        ...(refund ? ([['Refund', html`${refundBadge(refund.status)} ${peso(refund.amount_minor_units)}${refund.reference ? html` · <span class="mono">${refund.reference}</span>` : ''}`]] as [string, unknown][]) : []),
      ])}
    </section>
    <section class="card">
      <h2 class="h3">Outcome</h2>
      ${!pub
        ? html`<p>${outcomeBadge(e.eligibility_status, null, false)}</p><p class="small muted">${e.eligibility_status === 'approved' ? 'Waiting for the result to be reviewed and published.' : 'Only approved entries can win. This entry is not eligible for any prize.'}</p>`
        : html`<p>Result${pub.correction_reason ? html` <strong>(corrected)</strong>` : ''}: </p>${resultChips(pub.six_digit_result, out ? out.matched_digits : '')}
          <p>${outcomeBadge(e.eligibility_status, out?.outcome, true)}</p>
          ${out
            ? out.outcome === 'won'
              ? html`<p>All three digits appear in the result. Gross payout <strong>${peso(out.prize_minor_units)}</strong> (includes your ${pesoShort(e.stake_minor_units)} stake; net ${peso(NET_GAIN_MINOR)}).</p>
                ${payout ? html`<p class="small">Simulated payout: <strong>${payout.state}</strong> · <span class="mono">${payout.reference}</span></p>` : html`<p class="small muted">Simulated payout pending staff review.</p>`}`
              : html`<p>Missing digit${out.missing_digits.length > 1 ? 's' : ''}: <strong>${out.missing_digits.split('').join(', ')}</strong> ${out.missing_digits.length > 1 ? 'are' : 'is'} not in the result. Prize ₱0.</p>`
            : html`<p class="small muted">Not eligible — this entry was ${e.eligibility_status} and never competed.</p>`}
          ${history.length ? html`<p class="small muted">Earlier result versions: ${history.map((h) => html`v${h.version} ${h.six_digit_result} → ${h.outcome}; `)}</p>` : ''}`}
    </section>
  </div>
  <p><a href="/app/support?entry=${e.id}">${icon('ticket')} Ask support about this entry</a></p>`;
  send(req, res, `Entry ${e.public_ref}`, body);
});

// ---- simulated payment ------------------------------------------------------------------

playerRouter.get('/app/entries/:id/payment', (req, res) => {
  const e = getOwnEntry(req.td.ctx, intParam(req.params.id));
  const draw = getDraw(req.td.db, e.draw_id)!;
  const p = paymentForEntry(req.td.ctx, e.id);
  let body: SafeHtml;
  if (e.eligibility_status === 'awaiting_payment' && e.reservation_state === 'held') {
    const claimOnly = p.state === 'submitted' && !p.trusted_received_at;
    body = html`${pageHeader('Simulated payment', html`Entry <strong>${e.public_ref}</strong> · ${draw.reference_label}`)}
    ${alert('warn', html`<strong>Demo only.</strong> There is no real payee, account number or QR code. Nothing you do here moves money.`)}
    <div class="grid-2">
      <section class="card">
        <h2 class="h3">Your reservation</h2>
        ${digitChips(e.selected_digits, { size: 'lg' })}
        ${countdown(e.reservation_expires_at!, 'Reserved until')}
        <p class="small muted">The server decides when the reservation ends. If it expires, the slot is released and a late payment cannot restore it.</p>
        ${dl([
          ['Amount due (exact)', html`<strong>${peso(p.expected_minor_units)}</strong>`],
          ['Pay to', 'DEMO MERCHANT — simulated provider (no real account)'],
          ['Submission cutoff', time(draw.submission_closes_at)],
        ])}
      </section>
      <form method="post" action="/app/entries/${e.id}/payment" class="card form" data-once>
        ${csrfField(req.td.csrf)}
        <h2 class="h3">${claimOnly ? 'Record the simulated receipt' : 'Submit simulated payment'}</h2>
        ${claimOnly
          ? html`${alert('info', html`Reference <span class="mono">${p.reference}</span> is recorded, but the demo ledger has <strong>no receipt</strong>. A proof or reference alone is not evidence of payment and does not extend your reservation.`)}<input type="hidden" name="reference" value="${p.reference}">`
          : field('Synthetic payment reference', 'reference', { value: demoPaymentRef(), required: true, hint: 'Pre-filled synthetic reference. 6–24 letters/digits. Each reference can be used once.', attrs: 'maxlength="30" spellcheck="false"' })}
        ${claimOnly ? '' : checkbox('Attach a synthetic sample proof image', 'sampleProof', { hint: 'Generates a labelled placeholder. Real uploads are not part of this demo.' })}
        ${checkbox(html`Simulate that the demo provider <strong>received ${peso(p.expected_minor_units)}</strong> now`, 'simulateReceipt', { checked: true, hint: 'Untick to see what happens when only a proof is sent without funds.' })}
        <div class="form__actions"><button class="btn btn--primary btn--lg" type="submit">${claimOnly ? 'Record receipt' : 'Submit simulated payment'}</button></div>
      </form>
    </div>`;
  } else {
    body = html`${pageHeader('Simulated payment', html`Entry <strong>${e.public_ref}</strong>`)}
    ${e.eligibility_status === 'pending_verification'
      ? alert('success', html`<strong>Pending verification.</strong> The demo ledger recorded your ${peso(p.received_minor_units)} at ${time(p.trusted_received_at)}. A payment reviewer must approve it before ${time(draw.verification_closes_at)}.`)
      : alert('info', html`This entry is <strong>${e.eligibility_status.replace('_', ' ')}</strong>; payment is not accepted here anymore.`)}
    <p><a class="btn btn--secondary" href="/app/entries/${e.id}">View entry ${icon('arrow')}</a></p>`;
  }
  send(req, res, 'Simulated payment', body);
});

playerRouter.post('/app/entries/:id/payment', (req, res) => {
  const id = intParam(req.params.id);
  try {
    const r = submitPayment(req.td.ctx, id, { reference: str(req.body.reference), sampleProof: str(req.body.sampleProof), simulateReceipt: str(req.body.simulateReceipt) });
    if (r.received) {
      flash(req, 'success', 'Pending verification: the simulated receipt was recorded. A reviewer will verify it before the verification cutoff.');
      return res.redirect(303, `/app/entries/${id}`);
    }
    flash(req, 'info', 'Reference recorded without a ledger receipt. Your reservation still expires at the original time.');
    res.redirect(303, `/app/entries/${id}/payment`);
  } catch (err) {
    if (!(err instanceof DomainError) || err.status === 404 || err.status === 403) throw err;
    flash(req, 'error', err.message);
    res.redirect(303, `/app/entries/${id}/payment`);
  }
});

// ---- results ------------------------------------------------------------------------------

playerRouter.get('/app/results', (req, res) => {
  const rows = publishedResults(req.td.db);
  const body = html`${pageHeader('Published results', 'Sample six-digit results only — not official lottery draws.')}
  ${dataTable(
    [
      { label: 'Draw', render: (r) => html`<a href="/app/results/${r.draw_id}">${r.draw_label}</a>` },
      { label: 'Result', render: (r) => resultChips(r.six_digit_result) },
      { label: 'Draw time', render: (r) => time(r.scheduled_draw_at, true) },
      { label: 'Source', render: (r) => html`${r.source_label}${r.corrected ? html` <span class="badge badge--warn">Corrected v${r.version}</span>` : ''}` },
    ],
    rows,
    { caption: 'Published results', empty: emptyState('No published results yet', 'Results appear here after a second staff member reviews and publishes them.', undefined, { art: 'results' }) },
  )}`;
  send(req, res, 'Results', body);
});

playerRouter.get('/app/results/:drawId', (req, res) => {
  const { db, actor } = req.td;
  const drawId = intParam(req.params.drawId);
  const pub = currentPublished(db, drawId);
  if (!pub) throw new NotFoundError('No published result for that draw.');
  const draw = getDraw(db, drawId)!;
  const history = drawResultHistory(db, drawId, { includeDrafts: false });
  const mine = db.all<EntryRow & { outcome: string | null; prize_minor_units: number | null; matched_digits: string | null; missing_digits: string | null }>(
    `SELECT e.*, o.outcome, o.prize_minor_units, o.matched_digits, o.missing_digits FROM entries e LEFT JOIN outcomes o ON o.entry_id = e.id AND o.result_version_id = ? WHERE e.user_id = ? AND e.draw_id = ? ORDER BY e.id`,
    pub.id, actor!.id, drawId,
  );
  const body = html`${pageHeader(draw.reference_label, html`${pub.source_label} · published ${time(pub.published_at)}`, html`<a class="btn btn--ghost" href="/app/results">${icon('back')} All results</a>`)}
  ${pub.correction_reason ? alert('warn', html`This result was <strong>corrected</strong> (version ${pub.version}). Reason: ${pub.correction_reason}. Earlier versions are kept below.`) : ''}
  <section class="card center">
    <p class="eyebrow">Six-digit sample result</p>
    ${resultChips(pub.six_digit_result)}
    <p class="small muted">Draw time ${time(draw.scheduled_draw_at)}</p>
  </section>
  <section class="section">
    <h2>Your entries in this draw</h2>
    ${mine.length
      ? html`<ul class="outcome-list">${mine.map(
          (e) => html`<li class="card">
            <div class="outcome-list__head"><a href="/app/entries/${e.id}">${e.public_ref}</a>${digitChips(e.selected_digits, { missing: e.missing_digits ?? '' })}${outcomeBadge(e.eligibility_status, e.outcome, true)}</div>
            ${e.outcome ? html`<div class="outcome-list__result">${resultChips(pub.six_digit_result, e.matched_digits ?? '')}</div>` : ''}
            <p class="small">${e.outcome === 'won'
              ? html`All of ${e.selected_digits.split('').join(', ')} appear in ${pub.six_digit_result}. Payout ${peso(e.prize_minor_units)} total including stake.`
              : e.outcome === 'lost'
                ? html`Matched ${e.matched_digits ? e.matched_digits.split('').join(', ') : 'none'}; missing <strong>${(e.missing_digits ?? '').split('').join(', ')}</strong>. Prize ₱0.`
                : html`Not eligible: this entry was ${e.eligibility_status.replace('_', ' ')}, so it was not matched.`}</p>
          </li>`,
        )}</ul>`
      : emptyState('No entries in this draw', 'You did not enter this draw.')}
  </section>
  ${history.length > 1
    ? html`<section class="section"><h2>Result history</h2>${dataTable(
        [
          { label: 'Version', render: (h) => `v${h.version}` },
          { label: 'Result', render: (h) => html`<span class="mono">${h.six_digit_result}</span>` },
          { label: 'State', render: (h) => (h.state === 'published' ? 'Current' : 'Superseded') },
          { label: 'Published', render: (h) => time(h.published_at, true) },
          { label: 'Correction reason', render: (h) => h.correction_reason ?? '—' },
        ],
        history,
        { caption: 'Result versions' },
      )}</section>`
    : ''}`;
  send(req, res, 'Result', body);
});

// ---- account -------------------------------------------------------------------------------

function accountPage(req: Request, errors: { profile?: string; password?: string } = {}) {
  const a = req.td.actor!;
  return html`${pageHeader('Account')}
  <div class="grid-2">
    <form method="post" action="/app/account/profile" class="card form" data-once>
      <h2 class="h3">Profile</h2>${errors.profile ? errorSummary([errors.profile]) : ''}
      ${csrfField(req.td.csrf)}
      ${field('Display name', 'displayName', { value: a.displayName, required: true })}
      ${dl([['Email', a.email]])}
      <div class="form__actions"><button class="btn btn--primary" type="submit">Save profile</button></div>
    </form>
    <form method="post" action="/app/account/password" class="card form" data-once>
      <h2 class="h3">Change password</h2>${errors.password ? errorSummary([errors.password]) : ''}
      ${csrfField(req.td.csrf)}
      ${passwordField('Current password', 'current', { required: true, id: 'f-current' })}
      ${passwordField('New password', 'password', { required: true, autocomplete: 'new-password', hint: 'At least 10 characters with a letter and a number.' })}
      ${passwordField('Confirm new password', 'confirm', { required: true, autocomplete: 'new-password', id: 'f-confirm' })}
      <div class="form__actions"><button class="btn btn--primary" type="submit">Change password</button></div>
    </form>
  </div>
  <form method="post" action="/logout" class="card form">${csrfField(req.td.csrf)}<h2 class="h3">Sign out</h2><p>Ends this session on this device.</p><button class="btn btn--secondary" type="submit">Sign out</button></form>`;
}

playerRouter.get('/app/account', (req, res) => send(req, res, 'Account', accountPage(req)));

playerRouter.post('/app/account/profile', (req, res) => {
  try {
    updateProfile(req.td.ctx, str(req.body.displayName));
    flash(req, 'success', 'Profile saved.');
    res.redirect(303, '/app/account');
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    send(req, res, 'Account', accountPage(req, { profile: err.message }), 422);
  }
});

playerRouter.post('/app/account/password', async (req, res) => {
  try {
    await changePassword(req.td.ctx, req.td.session!.sessionId, str(req.body.current), str(req.body.password), str(req.body.confirm));
    flash(req, 'success', 'Password changed. Other sessions were signed out.');
    res.redirect(303, '/app/account');
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    send(req, res, 'Account', accountPage(req, { password: err.message }), 422);
  }
});

// ---- support ---------------------------------------------------------------------------------

function supportPage(req: Request, values: { subject?: string; body?: string; entry?: string } = {}, error?: string) {
  const tickets = listOwnTickets(req.td.ctx);
  const entries = listOwnEntries(req.td.ctx, {});
  return html`${pageHeader('Support', 'Ask about one of your entries, payments or results.')}
  <div class="grid-2">
    <section>
      <h2 class="h3">Your requests</h2>
      ${tickets.length
        ? html`<ul class="list">${tickets.map((t) => html`<li class="card list__item"><a href="/app/support/${t.id}"><strong>${t.subject}</strong></a> ${ticketBadge(t.state)}<span class="small muted">${t.entry_ref ? `Entry ${t.entry_ref} · ` : ''}updated ${time(t.updated_at, true)}</span></li>`)}</ul>`
        : emptyState('No support requests', 'Create one with the form.')}
    </section>
    <form method="post" action="/app/support" class="card form" data-once>
      <h2 class="h3">New request</h2>${error ? errorSummary([error]) : ''}
      ${csrfField(req.td.csrf)}
      ${select('Related entry (optional)', 'entry_id', [{ value: '', label: 'Not about a specific entry' }, ...entries.map((e) => ({ value: String(e.id), label: `${e.public_ref} · ${e.selected_digits} · ${e.draw_label}` }))], { value: values.entry ?? '' })}
      ${field('Subject', 'subject', { value: values.subject, required: true, attrs: 'maxlength="120"' })}
      ${textarea('Message', 'body', { value: values.body, required: true, hint: 'Do not include real payment or personal details.' })}
      <div class="form__actions"><button class="btn btn--primary" type="submit">Send request</button></div>
    </form>
  </div>`;
}

playerRouter.get('/app/support', (req, res) => send(req, res, 'Support', supportPage(req, { entry: str(req.query.entry) })));

playerRouter.post('/app/support', (req, res) => {
  const values = { subject: str(req.body.subject), body: str(req.body.body), entry: str(req.body.entry_id) };
  try {
    const id = createTicket(req.td.ctx, { subject: values.subject, body: values.body, entryId: values.entry });
    flash(req, 'success', 'Support request created.');
    res.redirect(303, `/app/support/${id}`);
  } catch (err) {
    if (!(err instanceof DomainError) || err.status === 404) throw err;
    send(req, res, 'Support', supportPage(req, values, err.message), 422);
  }
});

playerRouter.get('/app/support/:id', (req, res) => {
  const { ticket, messages } = getOwnTicket(req.td.ctx, intParam(req.params.id));
  const body = html`${pageHeader(ticket.subject, html`${ticketBadge(ticket.state)} ${ticket.entry_ref ? html`· Entry <a href="/app/entries/${ticket.entry_id}">${ticket.entry_ref}</a>` : ''}`, html`<a class="btn btn--ghost" href="/app/support">${icon('back')} All requests</a>`)}
  <ol class="thread">
    <li class="card thread__msg thread__msg--mine"><p class="small muted">You · ${time(ticket.created_at, true)}</p><p class="pre">${ticket.body}</p></li>
    ${messages.map((m) => html`<li class="card thread__msg ${m.author_is_owner ? 'thread__msg--mine' : ''}"><p class="small muted">${m.author_is_owner ? 'You' : `Support (${m.author_name})`} · ${time(m.created_at, true)}</p><p class="pre">${m.body}</p></li>`)}
  </ol>
  ${ticket.state === 'closed'
    ? alert('info', 'This request is closed.')
    : html`<form method="post" action="/app/support/${ticket.id}/messages" class="card form" data-once>${csrfField(req.td.csrf)}${textarea('Add a message', 'body', { required: true, rows: 3 })}<div class="form__actions"><button class="btn btn--primary" type="submit">Send</button></div></form>`}`;
  send(req, res, 'Support request', body);
});

playerRouter.post('/app/support/:id/messages', (req, res) => {
  const id = intParam(req.params.id);
  try {
    addPlayerMessage(req.td.ctx, id, str(req.body.body));
    flash(req, 'success', 'Message sent.');
  } catch (err) {
    if (!(err instanceof DomainError) || err.status === 404) throw err;
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/app/support/${id}`);
});

// ---- JSON: live capacity (advisory; server re-checks on confirm) -----------------------------

playerRouter.get('/api/capacity', (req, res) => {
  const { db, clock } = req.td;
  const sel = validateSelection(str(req.query.digits));
  if (!sel.ok) return res.status(422).json({ ok: false, error: sel.error });
  const draw = getDraw(db, intParam(req.query.draw_id));
  const t = clock.now().toISOString();
  if (!draw || draw.status !== 'open' || t < draw.opens_at) return res.status(404).json({ ok: false, error: 'Draw not open.' });
  if (t >= draw.submission_closes_at) return res.status(409).json({ ok: false, error: 'Sarado na ang submission para sa draw na ito.' });
  expireDueForCombination(db, t, draw.id, sel.canonical);
  const cap = capacityView(db, draw.id, sel.canonical);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    canonical: sel.canonical,
    permutations: permutations(sel.digits),
    limitMinor: cap.capMinor,
    usedMinor: cap.usedMinor,
    availableMinor: cap.availableMinor,
    full: cap.availableMinor < STAKE_MINOR,
    limitText: 'Limit: ₱500 per combination per draw',
    usedText: `Used/reserved: ${pesoShort(cap.usedMinor)}`,
    availableText: `Available: ${pesoShort(cap.availableMinor)}`,
    remainingTime: durationText(new Date(draw.submission_closes_at).getTime() - clock.now().getTime()),
  });
});
