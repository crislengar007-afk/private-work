import { PHASE_LABEL, type DrawPhase } from '../domain/draw-phase.js';
import { fmtManila, fmtManilaShort } from '../lib/format.js';
import { type SafeHtml, html, raw } from '../lib/html.js';

// ---- icons (inline SVG, decorative; text always accompanies them) -----------

const PATHS: Record<string, string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  minus: '<path d="M5 12h14"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 0 0-4V4H3z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/>',
};

export function icon(name: keyof typeof PATHS | string, label?: string): SafeHtml {
  const p = PATHS[name] ?? PATHS.info;
  return raw(
    `<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"'}>${p}</svg>`,
  );
}

// ---- badges: every status shows text, never colour alone ---------------------

type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'info' | 'accent';

export function badge(text: string, tone: Tone, ic: string): SafeHtml {
  return html`<span class="badge badge--${tone}">${icon(ic)}<span>${text}</span></span>`;
}

const ENTRY: Record<string, [string, Tone, string]> = {
  awaiting_payment: ['Awaiting payment', 'warn', 'hourglass'],
  pending_verification: ['Pending verification', 'info', 'clock'],
  approved: ['Approved', 'ok', 'check'],
  rejected: ['Rejected', 'bad', 'x'],
  expired: ['Expired', 'muted', 'ban'],
  voided: ['Voided', 'muted', 'ban'],
};
export const entryStatusLabel = (s: string) => ENTRY[s]?.[0] ?? s;
export const entryBadge = (s: string) => badge(...(ENTRY[s] ?? [s, 'muted', 'info']));

const PAYMENT: Record<string, [string, Tone, string]> = {
  unpaid: ['Unpaid', 'warn', 'hourglass'],
  submitted: ['Submitted', 'info', 'clock'],
  verified: ['Verified', 'ok', 'check'],
  rejected: ['Rejected', 'bad', 'x'],
};
export const paymentBadge = (s: string) => badge(...(PAYMENT[s] ?? [s, 'muted', 'info']));

/** Outcome is separate from eligibility (SPEC §9). */
export function outcomeBadge(eligibility: string, outcome: string | null | undefined, published: boolean): SafeHtml {
  if (eligibility !== 'approved') return badge('Not eligible', 'muted', 'minus');
  if (!published || !outcome) return badge('Pending result', 'muted', 'clock');
  return outcome === 'won' ? badge('Won', 'accent', 'trophy') : badge('Lost', 'muted', 'x');
}

const REFUND: Record<string, [string, Tone, string]> = {
  required: ['Refund required', 'warn', 'alert'],
  processing: ['Processing', 'info', 'clock'],
  completed: ['Refunded (simulated)', 'ok', 'check'],
  failed: ['Failed', 'bad', 'x'],
};
export const refundBadge = (s: string) => badge(...(REFUND[s] ?? [s, 'muted', 'info']));

const PAYOUT: Record<string, [string, Tone, string]> = {
  approved: ['Payout approved', 'info', 'clock'],
  completed: ['Paid (simulated)', 'ok', 'check'],
  cancelled: ['Cancelled', 'muted', 'ban'],
};
export const payoutBadge = (s: string | null) => (s ? badge(...(PAYOUT[s] ?? [s, 'muted', 'info'])) : badge('Not started', 'warn', 'hourglass'));

const PHASE_TONE: Record<DrawPhase, [Tone, string]> = {
  draft: ['muted', 'info'],
  scheduled: ['info', 'clock'],
  open: ['ok', 'check'],
  submission_closed: ['warn', 'lock'],
  verification_closed: ['warn', 'lock'],
  awaiting_result: ['info', 'hourglass'],
  result_review: ['info', 'eye'],
  published: ['accent', 'check'],
  cancelled: ['bad', 'ban'],
};
export const phaseBadge = (p: DrawPhase) => badge(PHASE_LABEL[p], ...PHASE_TONE[p]);

const RESULT: Record<string, [string, Tone, string]> = {
  submitted: ['Awaiting review', 'info', 'eye'],
  rejected: ['Rejected', 'bad', 'x'],
  published: ['Published', 'ok', 'check'],
  superseded: ['Superseded', 'muted', 'minus'],
};
export const resultStateBadge = (s: string) => badge(...(RESULT[s] ?? [s, 'muted', 'info']));

const TICKET: Record<string, [string, Tone, string]> = {
  open: ['Open', 'warn', 'ticket'],
  in_progress: ['In progress', 'info', 'clock'],
  resolved: ['Resolved', 'ok', 'check'],
  closed: ['Closed', 'muted', 'lock'],
};
export const ticketBadge = (s: string) => badge(...(TICKET[s] ?? [s, 'muted', 'info']));

// ---- digits ------------------------------------------------------------------

export function digitChips(digits: string, opts: { missing?: string; size?: 'sm' | 'lg' } = {}): SafeHtml {
  const missing = new Set(opts.missing ?? '');
  return html`<span class="chips chips--${opts.size ?? 'md'}" aria-label="Digits ${[...digits].join(' ')}${missing.size ? `; missing ${[...missing].join(', ')}` : ''}">${[...digits].map(
    (d) => html`<span class="chip ${missing.has(d) ? 'chip--missing' : ''}" aria-hidden="true">${d}</span>`,
  )}</span>`;
}

/** Six-digit result; digits in `highlight` are marked (with a text mark, not colour alone). */
export function resultChips(result: string, highlight: Iterable<string> = []): SafeHtml {
  const hi = new Set(highlight);
  return html`<span class="chips chips--result" aria-label="Result ${[...result].join(' ')}">${[...result].map(
    (d) => html`<span class="chip ${hi.has(d) ? 'chip--hit' : ''}" aria-hidden="true">${d}${hi.has(d) ? html`<span class="chip__mark">✓</span>` : ''}</span>`,
  )}</span>`;
}

// ---- time --------------------------------------------------------------------

export function time(iso: string | null | undefined, short = false): SafeHtml {
  if (!iso) return html`<span class="muted">—</span>`;
  return html`<time datetime="${iso}">${short ? fmtManilaShort(iso) : fmtManila(iso)}</time>`;
}

/** Browser countdown is explanatory only; the server enforces the cutoff. */
export function countdown(iso: string, label: string): SafeHtml {
  return html`<div class="countdown"><span class="countdown__label">${label}</span>
    <span class="countdown__time">${time(iso)}</span>
    <span class="countdown__left" data-countdown="${iso}" aria-live="off">—</span></div>`;
}

// ---- forms -------------------------------------------------------------------

export const csrfField = (csrf: string) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

interface FieldOpts {
  type?: string;
  value?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  autocomplete?: string;
  attrs?: string;
  id?: string;
}

export function field(label: string, name: string, o: FieldOpts = {}): SafeHtml {
  const id = o.id ?? `f-${name}`;
  const describedBy = [o.hint ? `${id}-hint` : '', o.error ? `${id}-err` : ''].filter(Boolean).join(' ');
  return html`<div class="field ${o.error ? 'field--error' : ''}">
    <label for="${id}">${label}${o.required ? html` <span class="req" aria-hidden="true">*</span>` : ''}</label>
    ${o.hint ? html`<p class="hint" id="${id}-hint">${o.hint}</p>` : ''}
    ${o.error ? html`<p class="field__error" id="${id}-err">${icon('alert')} ${o.error}</p>` : ''}
    <input id="${id}" name="${name}" type="${o.type ?? 'text'}" value="${o.value ?? ''}" ${o.required ? raw('required') : ''}
      ${o.autocomplete ? raw(`autocomplete="${o.autocomplete}"`) : ''} ${describedBy ? raw(`aria-describedby="${describedBy}"`) : ''}
      ${o.error ? raw('aria-invalid="true"') : ''} ${raw(o.attrs ?? '')}>
  </div>`;
}

export function passwordField(label: string, name: string, o: FieldOpts = {}): SafeHtml {
  const id = o.id ?? `f-${name}`;
  return html`<div class="field ${o.error ? 'field--error' : ''}">
    <label for="${id}">${label}${o.required ? html` <span class="req" aria-hidden="true">*</span>` : ''}</label>
    ${o.hint ? html`<p class="hint" id="${id}-hint">${o.hint}</p>` : ''}
    ${o.error ? html`<p class="field__error" id="${id}-err">${icon('alert')} ${o.error}</p>` : ''}
    <div class="pw">
      <input id="${id}" name="${name}" type="password" ${o.required ? raw('required') : ''} autocomplete="${o.autocomplete ?? 'current-password'}"
        ${o.hint || o.error ? raw(`aria-describedby="${[o.hint ? `${id}-hint` : '', o.error ? `${id}-err` : ''].filter(Boolean).join(' ')}"`) : ''} ${o.error ? raw('aria-invalid="true"') : ''}>
      <button type="button" class="btn btn--ghost btn--sm pw__toggle" data-toggle-password="${id}" aria-controls="${id}" aria-pressed="false">Show</button>
    </div>
  </div>`;
}

export function textarea(label: string, name: string, o: FieldOpts & { rows?: number } = {}): SafeHtml {
  const id = o.id ?? `f-${name}`;
  return html`<div class="field ${o.error ? 'field--error' : ''}">
    <label for="${id}">${label}${o.required ? html` <span class="req" aria-hidden="true">*</span>` : ''}</label>
    ${o.hint ? html`<p class="hint" id="${id}-hint">${o.hint}</p>` : ''}
    ${o.error ? html`<p class="field__error">${icon('alert')} ${o.error}</p>` : ''}
    <textarea id="${id}" name="${name}" rows="${o.rows ?? 4}" ${o.required ? raw('required') : ''} ${o.hint ? raw(`aria-describedby="${id}-hint"`) : ''} ${raw(o.attrs ?? '')}>${o.value ?? ''}</textarea>
  </div>`;
}

export function select(label: string, name: string, options: { value: string; label: string; disabled?: boolean }[], o: FieldOpts = {}): SafeHtml {
  const id = o.id ?? `f-${name}`;
  return html`<div class="field ${o.error ? 'field--error' : ''}">
    <label for="${id}">${label}${o.required ? html` <span class="req" aria-hidden="true">*</span>` : ''}</label>
    ${o.hint ? html`<p class="hint" id="${id}-hint">${o.hint}</p>` : ''}
    ${o.error ? html`<p class="field__error">${icon('alert')} ${o.error}</p>` : ''}
    <select id="${id}" name="${name}" ${o.required ? raw('required') : ''} ${raw(o.attrs ?? '')}>
      ${options.map((op) => html`<option value="${op.value}" ${op.value === o.value ? raw('selected') : ''} ${op.disabled ? raw('disabled') : ''}>${op.label}</option>`)}
    </select>
  </div>`;
}

export function checkbox(label: SafeHtml | string, name: string, o: { checked?: boolean; error?: string; required?: boolean; hint?: string; id?: string } = {}): SafeHtml {
  const id = o.id ?? `f-${name}`;
  return html`<div class="check ${o.error ? 'field--error' : ''}">
    ${o.error ? html`<p class="field__error">${icon('alert')} ${o.error}</p>` : ''}
    <input type="checkbox" id="${id}" name="${name}" ${o.checked ? raw('checked') : ''} ${o.required ? raw('required') : ''}>
    <label for="${id}">${label}${o.hint ? html`<span class="hint">${o.hint}</span>` : ''}</label>
  </div>`;
}

export function errorSummary(errors: Record<string, string> | string[] | string | null | undefined): SafeHtml {
  if (!errors) return html``;
  const list = typeof errors === 'string' ? [errors] : Array.isArray(errors) ? errors : Object.values(errors);
  if (!list.length) return html``;
  return html`<div class="alert alert--error" role="alert" tabindex="-1" data-autofocus>
    ${icon('alert')}<div><strong>Please check the following:</strong><ul>${list.map((e) => html`<li>${e}</li>`)}</ul></div></div>`;
}

export function alert(kind: 'info' | 'warn' | 'error' | 'success', body: SafeHtml | string, title?: string): SafeHtml {
  const ic = kind === 'success' ? 'check' : kind === 'info' ? 'info' : 'alert';
  return html`<div class="alert alert--${kind}" ${kind === 'error' ? raw('role="alert"') : ''}>${icon(ic)}<div>${title ? html`<strong>${title}</strong> ` : ''}${body}</div></div>`;
}

// ---- layout blocks -----------------------------------------------------------

export function pageHeader(title: string, sub?: SafeHtml | string, actions?: SafeHtml): SafeHtml {
  return html`<header class="page-head"><div><h1>${title}</h1>${sub ? html`<p class="page-head__sub">${sub}</p>` : ''}</div>${actions ? html`<div class="page-head__actions">${actions}</div>` : ''}</header>`;
}

/** Optional illustration: decorative only (empty alt); the text carries the meaning. */
export function emptyState(title: string, text: string, action?: SafeHtml, opts: { art?: 'entries' | 'results' } = {}): SafeHtml {
  const art = opts.art ? html`<img class="empty__art" src="/static/media/empty-${opts.art}.webp" alt="" width="160" height="160" loading="lazy">` : icon('info');
  return html`<div class="empty">${art}<p class="empty__title">${title}</p><p>${text}</p>${action ?? ''}</div>`;
}

export function stat(label: string, value: string, note?: string): SafeHtml {
  return html`<div class="stat"><span class="stat__label">${label}</span><span class="stat__value">${value}</span>${note ? html`<span class="stat__note">${note}</span>` : ''}</div>`;
}

export interface Column<T> {
  label: string;
  render: (row: T) => unknown;
  className?: string;
}

/** One markup, two layouts: a table on desktop, stacked cards on mobile. */
export function dataTable<T>(columns: Column<T>[], rows: T[], opts: { caption: string; empty?: SafeHtml } = { caption: '' }): SafeHtml {
  if (!rows.length) return opts.empty ?? emptyState('Nothing here yet', 'No records match.');
  return html`<div class="table-wrap"><table class="rtable">
    <caption class="sr-only">${opts.caption}</caption>
    <thead><tr>${columns.map((c) => html`<th scope="col">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${columns.map((c) => html`<td data-label="${c.label}" class="${c.className ?? ''}">${c.render(r)}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

export function dl(items: [string, unknown][]): SafeHtml {
  return html`<dl class="dl">${items.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

export interface Step {
  label: string;
  at?: string | null;
  state: 'done' | 'current' | 'todo' | 'bad';
  note?: string;
}

export function timeline(steps: Step[]): SafeHtml {
  const mark = { done: ['check', 'Done'], current: ['clock', 'In progress'], todo: ['minus', 'Not yet'], bad: ['x', 'Stopped'] } as const;
  return html`<ol class="timeline">${steps.map(
    (s) => html`<li class="timeline__item timeline__item--${s.state}">
      <span class="timeline__dot">${icon(mark[s.state][0])}</span>
      <div><span class="timeline__label">${s.label}</span> <span class="sr-only">(${mark[s.state][1]})</span>
      ${s.at ? html`<span class="timeline__at">${time(s.at, true)}</span>` : ''}${s.note ? html`<span class="timeline__note">${s.note}</span>` : ''}</div>
    </li>`,
  )}</ol>`;
}

export function filterBar(action: string, inner: SafeHtml): SafeHtml {
  return html`<form class="filters" method="get" action="${action}" role="search">${inner}<div class="filters__actions"><button class="btn btn--secondary" type="submit">Apply filters</button><a class="btn btn--ghost" href="${action}">Reset</a></div></form>`;
}

export function demoNotice(): SafeHtml {
  return alert('info', 'All payments, receipts, refunds and payouts here are simulated. No real money moves and sample results are not official draws.', 'Demo only.');
}
