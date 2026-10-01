'use client';
// Per-item media editor. Turning on "AI-generated" forces the portfolio and
// featured toggles off (the database enforces the same rule) and reveals the
// mood-theme field with the fixed concept-board caption.
import * as React from 'react';
import { Input, Select } from '@/components/ui';
import { ActionForm, Fld, Save, type FormAction } from '@/app/admin/_owner/form';
import { AI_CAPTION } from '@/app/admin/_owner/labels';

export interface EditableMedia {
  id: string;
  alt_text: string;
  caption: string | null;
  category_id: string | null;
  event_type: string | null;
  taken_on: string | null;
  featured: boolean;
  sort: number;
  show_in_portfolio: boolean;
  is_ai_generated: boolean;
  mood_theme: string | null;
}

function Toggle({
  id,
  name,
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-rose-deep"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <label htmlFor={id} className={disabled ? 'text-sm text-ink-soft' : 'text-sm text-ink'}>
        {label}
        {hint && (
          <span id={`${id}-hint`} className="block text-xs text-ink-soft">
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}

export function MediaEditForm({
  media: m,
  action,
  categories,
  eventTypes,
}: {
  media: EditableMedia;
  action: FormAction;
  categories: { id: string; name: string }[];
  eventTypes: { value: string; label: string }[];
}) {
  const p = `m-${m.id}`;
  const [ai, setAi] = React.useState(m.is_ai_generated);
  const [portfolio, setPortfolio] = React.useState(m.show_in_portfolio && !m.is_ai_generated);
  const [featured, setFeatured] = React.useState(m.featured && !m.is_ai_generated);

  return (
    <ActionForm action={action} aria-label="Edit media" className="grid gap-2 sm:grid-cols-2">
      <Fld label={portfolio ? 'Alt text (required)' : 'Alt text'} htmlFor={`${p}-alt`} name="alt_text" className="sm:col-span-2">
        <Input id={`${p}-alt`} name="alt_text" defaultValue={m.alt_text} required={portfolio} placeholder="What’s in the picture" />
      </Fld>
      {ai ? (
        <>
          <Fld label="Mood theme" htmlFor={`${p}-mood`} name="mood_theme" hint="e.g. Under the Sea, Rustic Fall">
            <Input id={`${p}-mood`} name="mood_theme" defaultValue={m.mood_theme ?? ''} />
          </Fld>
          <div className="text-xs">
            <p className="mb-1 font-medium text-ink">Caption</p>
            <p className="rounded-lg bg-warn-soft px-2 py-1.5 text-warn">“{AI_CAPTION}”</p>
            <p className="mt-1 text-ink-soft">Always shown with AI concept boards.</p>
          </div>
        </>
      ) : (
        <Fld label="Caption" htmlFor={`${p}-cap`} name="caption" className="sm:col-span-2">
          <Input id={`${p}-cap`} name="caption" defaultValue={m.caption ?? ''} />
        </Fld>
      )}
      <Fld label="Category" htmlFor={`${p}-cat`} name="category_id">
        <Select id={`${p}-cat`} name="category_id" defaultValue={m.category_id ?? ''}>
          <option value="">— None —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Fld>
      <Fld label="Event type" htmlFor={`${p}-ev`} name="event_type">
        <Select id={`${p}-ev`} name="event_type" defaultValue={m.event_type ?? ''}>
          <option value="">— None —</option>
          {eventTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Fld>
      <Fld label="Taken on" htmlFor={`${p}-date`} name="taken_on">
        <Input id={`${p}-date`} name="taken_on" type="date" defaultValue={m.taken_on ?? ''} />
      </Fld>
      <Fld label="Sort" htmlFor={`${p}-sort`} name="sort">
        <Input id={`${p}-sort`} name="sort" inputMode="numeric" required defaultValue={m.sort} />
      </Fld>
      <div className="space-y-1.5 sm:col-span-2">
        <Toggle
          id={`${p}-ai`}
          name="is_ai_generated"
          label="AI-generated"
          checked={ai}
          onChange={(v) => {
            setAi(v);
            if (v) {
              setPortfolio(false);
              setFeatured(false);
            }
          }}
          hint="Atmosphere and concept boards only: never portfolio or testimonials."
        />
        <Toggle
          id={`${p}-pf`}
          name="show_in_portfolio"
          label="Show in portfolio"
          checked={portfolio}
          onChange={setPortfolio}
          disabled={ai}
          hint={ai ? 'Locked off: AI-generated media can never be shown in the portfolio.' : 'Real FMV work only.'}
        />
        <Toggle id={`${p}-ft`} name="featured" label="Featured" checked={featured} onChange={setFeatured} disabled={ai} />
      </div>
      <div className="sm:col-span-2">
        <Save>Save</Save>
      </div>
    </ActionForm>
  );
}
