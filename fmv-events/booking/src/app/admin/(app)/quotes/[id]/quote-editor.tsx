'use client';
// Quote editor: lines, discount, validity, deposit, notes, live totals.
// The server recomputes everything on save; these totals are only a preview.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, Label, Notice, Select, Textarea, buttonClass } from '@/components/ui';
import { computeTotals, formatCAD, formatPercentBp, lineTotal, parseDollarsToCents } from '@/lib/money';
import { renderMarkdown } from '@/lib/markdown';
import type { FormState, QuoteEditorInput } from '../../../_lib/form-state';
import { declineQuote, saveQuoteDraft, sendQuoteAction } from '../../../_lib/quote-actions';
import { lineKindLabels } from '../../../_lib/labels';

const KINDS = ['package', 'service', 'addon', 'travel', 'custom'] as const;

export interface EditLine {
  key: string;
  kind: string;
  ref_id: string | null;
  description: string;
  qty: string;
  unit_price: string;
}

export interface CatalogOption {
  key: string;
  group: string;
  kind: string;
  ref_id: string;
  label: string;
  description: string;
  unit_price: string;
  qty: string;
}

interface Draft {
  lines: EditLine[];
  discount: string;
  valid_until: string;
  deposit_pct: string;
  notes_md: string;
}

const snapshot = (d: Draft) =>
  JSON.stringify([d.discount, d.valid_until, d.deposit_pct, d.notes_md, d.lines.map((l) => [l.kind, l.ref_id, l.description, l.qty, l.unit_price])]);

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

export function QuoteEditor({
  quoteId,
  status,
  initial,
  taxEnabled,
  taxRateBp,
  catalog,
}: {
  quoteId: string;
  status: 'draft' | 'sent';
  initial: Draft;
  taxEnabled: boolean;
  taxRateBp: number;
  catalog: CatalogOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [saved, setSaved] = React.useState(() => snapshot(initial));
  const [result, setResult] = React.useState<FormState>(null);
  const [busy, setBusy] = React.useState<null | 'save' | 'send' | 'decline'>(null);
  const [pick, setPick] = React.useState('');
  const [showPreview, setShowPreview] = React.useState(false);

  const dirty = snapshot(draft) !== saved;

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const lineCalc = draft.lines.map((l) => {
    const qty = Number(l.qty);
    const unit = parseDollarsToCents(l.unit_price);
    const valid = Number.isFinite(qty) && qty > 0 && unit !== null;
    return { qty, unit, valid, total: valid ? lineTotal(qty, unit!) : 0 };
  });
  const discountCents = draft.discount.trim() === '' ? 0 : parseDollarsToCents(draft.discount);
  const depositPct = Number(draft.deposit_pct);
  const totals = computeTotals({
    lineTotalsCents: lineCalc.map((c) => c.total),
    discountCents: discountCents ?? 0,
    taxEnabled,
    taxRateBp,
    depositPct: Number.isFinite(depositPct) ? depositPct : 0,
  });
  const zeroLines = lineCalc.filter((c) => c.valid && c.unit === 0).length;
  const invalidLines = lineCalc.filter((c) => !c.valid).length;
  const discountTooBig = discountCents !== null && discountCents > totals.subtotalCents;

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateLine = (key: string, patch: Partial<EditLine>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const move = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = index + dir;
      if (j < 0 || j >= d.lines.length) return d;
      const lines = [...d.lines];
      [lines[index], lines[j]] = [lines[j], lines[index]];
      return { ...d, lines };
    });
  const remove = (key: string) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== key) }));
  const addCustom = () =>
    setDraft((d) => ({ ...d, lines: [...d.lines, { key: newKey(), kind: 'custom', ref_id: null, description: '', qty: '1', unit_price: '' }] }));
  const addFromCatalog = () => {
    const opt = catalog.find((o) => o.key === pick);
    if (!opt) return;
    setDraft((d) => ({
      ...d,
      lines: [...d.lines, { key: newKey(), kind: opt.kind, ref_id: opt.ref_id, description: opt.description, qty: opt.qty, unit_price: opt.unit_price }],
    }));
    setPick('');
  };

  const payload = (): QuoteEditorInput => ({
    quote_id: quoteId,
    lines: draft.lines.map((l) => ({ kind: l.kind, ref_id: l.ref_id, description: l.description, qty: l.qty, unit_price: l.unit_price })),
    discount: draft.discount,
    valid_until: draft.valid_until,
    deposit_pct: draft.deposit_pct,
    notes_md: draft.notes_md,
  });

  async function save(): Promise<boolean> {
    setBusy('save');
    const r = await saveQuoteDraft(payload());
    setBusy(null);
    setResult(r);
    if (r?.ok) {
      setSaved(snapshot(draft));
      router.refresh();
      return true;
    }
    return false;
  }

  async function send() {
    if (!window.confirm(dirty ? 'Save your changes and email this quote to the client?' : 'Email this quote to the client?')) return;
    if (dirty && !(await save())) return;
    setBusy('send');
    const r = await sendQuoteAction(quoteId);
    setBusy(null);
    setResult(r);
    if (r?.ok) router.refresh();
  }

  async function decline() {
    if (!window.confirm('Mark this quote as declined? It can no longer be accepted.')) return;
    setBusy('decline');
    const r = await declineQuote(quoteId);
    setBusy(null);
    setResult(r);
    if (r?.ok) router.refresh();
  }

  const groups = [...new Set(catalog.map((o) => o.group))];

  return (
    <div className="space-y-6">
      {status === 'sent' && (
        <Notice tone="gold" title="This quote has been sent">
          Saving changes takes it back to draft. Send it again so the client sees the new version.
        </Notice>
      )}

      <section aria-labelledby="lines-h" className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-sm sm:p-5">
        <h2 id="lines-h" className="mb-3 font-display text-2xl font-semibold">Lines</h2>
        <div className="hidden grid-cols-[7rem_1fr_5rem_7rem_7rem_7.5rem] gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft md:grid">
          <span>Kind</span><span>Description</span><span>Qty</span><span>Unit price</span><span className="text-right">Total</span><span className="sr-only">Actions</span>
        </div>
        <ol className="space-y-3 md:space-y-2">
          {draft.lines.map((l, i) => {
            const c = lineCalc[i];
            const id = `ln-${l.key}`;
            return (
              <li key={l.key} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 md:grid-cols-[7rem_1fr_5rem_7rem_7rem_7.5rem] md:items-start md:border-0 md:p-1">
                <div className="col-span-1">
                  <Label htmlFor={`${id}-kind`} className="md:sr-only">Kind</Label>
                  <Select
                    id={`${id}-kind`}
                    value={l.kind}
                    onChange={(e) => updateLine(l.key, { kind: e.target.value, ref_id: e.target.value === 'custom' ? null : l.ref_id })}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>{lineKindLabels[k]}</option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <Label htmlFor={`${id}-desc`} className="md:sr-only">Description</Label>
                  <Input
                    id={`${id}-desc`}
                    value={l.description}
                    maxLength={300}
                    onChange={(e) => updateLine(l.key, { description: e.target.value })}
                    aria-invalid={!l.description.trim() || undefined}
                    placeholder="Describe the line"
                  />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.ref_id && l.kind !== 'custom' && <Badge>from catalog</Badge>}
                    {c.valid && c.unit === 0 && <Badge tone="warn">no price</Badge>}
                  </div>
                </div>
                <div>
                  <Label htmlFor={`${id}-qty`} className="md:sr-only">Qty</Label>
                  <Input id={`${id}-qty`} inputMode="decimal" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} aria-invalid={!(c.qty > 0) || undefined} />
                </div>
                <div>
                  <Label htmlFor={`${id}-price`} className="md:sr-only">Unit price ($)</Label>
                  <Input
                    id={`${id}-price`}
                    inputMode="decimal"
                    value={l.unit_price}
                    placeholder="0.00"
                    onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                    aria-invalid={c.unit === null || undefined}
                  />
                </div>
                <p className="self-center text-right text-sm tabular-nums md:pt-2">
                  <span className="text-ink-soft md:sr-only">Total </span>
                  {c.valid ? formatCAD(c.total) : <span className="text-bad">check</span>}
                </p>
                <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
                  <button type="button" className={buttonClass('ghost', 'sm', 'px-2')} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move line ${i + 1} up`}>↑</button>
                  <button type="button" className={buttonClass('ghost', 'sm', 'px-2')} onClick={() => move(i, 1)} disabled={i === draft.lines.length - 1} aria-label={`Move line ${i + 1} down`}>↓</button>
                  <button type="button" className={buttonClass('ghost', 'sm', 'px-2 text-bad')} onClick={() => remove(l.key)} aria-label={`Remove line ${i + 1}`}>Remove</button>
                </div>
              </li>
            );
          })}
        </ol>
        {draft.lines.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">No lines yet. Add one below.</p>}

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={addCustom}>Add custom line</Button>
          {catalog.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="add-catalog" className="text-xs">Add from catalog</Label>
                <Select id="add-catalog" value={pick} onChange={(e) => setPick(e.target.value)} className="h-8 py-0 text-sm">
                  <option value="">Choose an item…</option>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {catalog.filter((o) => o.group === g).map((o) => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addFromCatalog} disabled={!pick}>Add</Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="terms-h" className="space-y-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-sm sm:p-5">
          <h2 id="terms-h" className="font-display text-2xl font-semibold">Terms</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="q-discount">Discount ($)</Label>
              <Input id="q-discount" inputMode="decimal" value={draft.discount} placeholder="0.00" onChange={(e) => update({ discount: e.target.value })} aria-invalid={discountCents === null || discountTooBig || undefined} aria-describedby="q-discount-hint" />
              <p id="q-discount-hint" className="mt-1 text-xs text-ink-soft">Before tax.</p>
            </div>
            <div>
              <Label htmlFor="q-valid">Valid until</Label>
              <Input id="q-valid" type="date" value={draft.valid_until} onChange={(e) => update({ valid_until: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="q-deposit">Deposit %</Label>
              <Input id="q-deposit" type="number" min={0} max={100} step={1} value={draft.deposit_pct} onChange={(e) => update({ deposit_pct: e.target.value })} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="q-notes">Notes for the client (markdown)</Label>
              <button type="button" className="text-xs text-rose-deep underline" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>
                {showPreview ? 'Hide preview' : 'Preview'}
              </button>
            </div>
            <Textarea id="q-notes" rows={6} maxLength={5000} value={draft.notes_md} onChange={(e) => update({ notes_md: e.target.value })} />
            {showPreview && (
              <div className="prose-fmv mt-2 rounded-lg border border-line bg-cream p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.notes_md) || '<p>(empty)</p>' }} />
            )}
          </div>
        </section>

        <section aria-labelledby="totals-h" className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-sm sm:p-5">
          <h2 id="totals-h" className="mb-3 font-display text-2xl font-semibold">Totals</h2>
          <dl className="space-y-1 text-sm" aria-live="polite">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatCAD(totals.subtotalCents)}</dd></div>
            {totals.discountCents > 0 && (
              <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">−{formatCAD(totals.discountCents)}</dd></div>
            )}
            {taxEnabled && (
              <div className="flex justify-between"><dt>HST ({formatPercentBp(taxRateBp)})</dt><dd className="tabular-nums">{formatCAD(totals.taxCents)}</dd></div>
            )}
            <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCAD(totals.totalCents)}</dd></div>
            <div className="flex justify-between text-rose-deep"><dt>Deposit ({totals.depositPct}%)</dt><dd className="tabular-nums">{formatCAD(totals.depositCents)}</dd></div>
            <div className="flex justify-between text-ink-soft"><dt>Balance</dt><dd className="tabular-nums">{formatCAD(totals.balanceCents)}</dd></div>
          </dl>
          {!taxEnabled && <p className="mt-2 text-xs text-ink-soft">HST is off in Settings, so no tax is added.</p>}
          <div className="mt-3 space-y-2">
            {invalidLines > 0 && <Notice tone="bad">{invalidLines} line{invalidLines > 1 ? 's need' : ' needs'} a valid quantity and price.</Notice>}
            {zeroLines > 0 && <Notice tone="warn">{zeroLines} line{zeroLines > 1 ? 's have' : ' has'} no price yet. Set a price or remove {zeroLines > 1 ? 'them' : 'it'} before sending.</Notice>}
            {discountTooBig && <Notice tone="bad">The discount is more than the subtotal.</Notice>}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={busy !== null || !dirty}>
            {busy === 'save' ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
          </Button>
          <a
            href={`/admin/quotes/${quoteId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('secondary')}
            title={dirty ? 'The PDF shows the last saved version' : undefined}
          >
            Preview PDF
          </a>
          <Button type="button" variant="gold" onClick={send} disabled={busy !== null || draft.lines.length === 0}>
            {busy === 'send' ? 'Sending…' : status === 'sent' ? 'Send again' : 'Send to client'}
          </Button>
          <Button type="button" variant="ghost" onClick={decline} disabled={busy !== null}>
            {busy === 'decline' ? 'Updating…' : 'Mark declined'}
          </Button>
          <div aria-live="polite" className="text-sm">
            {dirty && <span className="mr-2 text-ink-soft">Unsaved changes.</span>}
            {result && !result.ok && <span role="alert" className="text-bad">{result.error}</span>}
            {result?.ok && result.message && <span className="text-ok">{result.message}</span>}
          </div>
        </div>
        {dirty && <p className="mt-1 text-xs text-ink-soft">The PDF preview shows the last saved version.</p>}
      </div>
    </div>
  );
}
