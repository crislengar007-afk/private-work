'use client';
// Fields for the bulk slot generator: a list of date pickers you can add to or
// remove from, an optional paste box (one YYYY-MM-DD per line), the time window
// and the interval, with a live count of how many slots that makes.
import * as React from 'react';
import { Input, Textarea, buttonClass } from '@/components/ui';
import { Fld, Save } from '@/app/admin/_owner/form';

function toMin(t: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function SlotGeneratorFields({ durationMin, minDate }: { durationMin: number; minDate: string }) {
  const nextKey = React.useRef(1);
  const [dates, setDates] = React.useState<{ key: number; value: string }[]>([{ key: 0, value: '' }]);
  const [text, setText] = React.useState('');
  const [start, setStart] = React.useState('10:00');
  const [end, setEnd] = React.useState('14:00');
  const [interval, setIntervalMin] = React.useState(String(durationMin));

  const allDates = new Set([
    ...dates.map((d) => d.value).filter(Boolean),
    ...text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
  ]);
  const s = toMin(start);
  const e = toMin(end);
  const step = Number(interval);
  let perDay = 0;
  if (s !== null && e !== null && step > 0) {
    for (let t = s; t + durationMin <= e; t += step) perDay++;
  }
  const overlap = step > 0 && step < durationMin;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-ink">Dates</legend>
        {dates.map((d, i) => (
          <div key={d.key} className="flex items-center gap-2">
            <label htmlFor={`gen-date-${d.key}`} className="sr-only">
              Date {i + 1}
            </label>
            <Input
              id={`gen-date-${d.key}`}
              type="date"
              name="dates"
              min={minDate}
              value={d.value}
              onChange={(ev) => setDates((prev) => prev.map((x) => (x.key === d.key ? { ...x, value: ev.target.value } : x)))}
              className="w-48"
            />
            {dates.length > 1 && (
              <button
                type="button"
                className={buttonClass('ghost', 'sm')}
                onClick={() => setDates((prev) => prev.filter((x) => x.key !== d.key))}
                aria-label={`Remove date ${i + 1}`}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => setDates((prev) => [...prev, { key: nextKey.current++, value: '' }])}
        >
          + Add another date
        </button>
        <Fld label="…or paste dates (one YYYY-MM-DD per line)" htmlFor="gen-dates-text" name="dates_text">
          <Textarea
            id="gen-dates-text"
            name="dates_text"
            rows={3}
            className="min-h-0 font-mono"
            placeholder={'2026-12-05\n2026-12-06'}
            value={text}
            onChange={(ev) => setText(ev.target.value)}
          />
        </Fld>
      </fieldset>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Fld label="From" htmlFor="gen-start" name="window_start">
            <Input id="gen-start" name="window_start" type="time" required value={start} onChange={(ev) => setStart(ev.target.value)} />
          </Fld>
          <Fld label="Until" htmlFor="gen-end" name="window_end" hint="Last session ends by this time.">
            <Input id="gen-end" name="window_end" type="time" required value={end} onChange={(ev) => setEnd(ev.target.value)} />
          </Fld>
          <Fld label="Every (min)" htmlFor="gen-interval" name="interval_min">
            <Input id="gen-interval" name="interval_min" inputMode="numeric" required value={interval} onChange={(ev) => setIntervalMin(ev.target.value)} />
          </Fld>
        </div>
        <p className="rounded-lg bg-cream-deep/60 px-3 py-2 text-sm" aria-live="polite">
          Each session is <strong>{durationMin} min</strong>.{' '}
          {perDay > 0 ? (
            <>
              That makes <strong>{perDay}</strong> slot{perDay === 1 ? '' : 's'} per day
              {allDates.size > 0 && (
                <>
                  {' '}× {allDates.size} date{allDates.size === 1 ? '' : 's'} = <strong>{perDay * allDates.size}</strong> slots
                </>
              )}
              .
            </>
          ) : (
            'No sessions fit in that window.'
          )}
          {overlap && <span className="block text-warn">The interval is shorter than a session, so sessions would overlap.</span>}
        </p>
        <p className="text-xs text-ink-soft">Times are Atlantic (Moncton). Slots that already exist are skipped, so it’s safe to run again.</p>
        <Save size="md" pendingText="Generating…" disabled={perDay === 0 || allDates.size === 0}>
          Generate slots
        </Save>
      </div>
    </div>
  );
}
