// Line items + totals block shared by the builder review (client) and the quote
// page (server). No hooks, no server-only imports.
import { formatCAD } from '@/lib/money';
import { cn } from '@/lib/cn';

export interface DisplayLine {
  description: string;
  line_total_cents: number;
  is_from?: boolean;
}

export interface TotalRow {
  label: string;
  cents: number;
  /** shows a minus sign (discounts) */
  negative?: boolean;
  strong?: boolean;
  /** "from" pricing */
  isFrom?: boolean;
}

export function LinesTable({
  lines,
  rows,
  caption,
  emptyText = 'No priced items yet.',
}: {
  lines: DisplayLine[];
  rows: TotalRow[];
  caption?: string;
  emptyText?: string;
}) {
  return (
    <table className="w-full text-sm">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead className="sr-only">
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr>
            <td colSpan={2} className="py-2 text-ink-soft">{emptyText}</td>
          </tr>
        )}
        {lines.map((l, i) => (
          <tr key={`${l.description}-${i}`} className="border-b border-line/70 align-top">
            <td className="py-2 pr-3">{l.description}</td>
            <td className="whitespace-nowrap py-2 text-right tabular-nums">
              {l.is_from && <span className="mr-1 text-xs text-ink-soft">from</span>}
              {formatCAD(l.line_total_cents)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        {rows.map((r) => (
          <tr key={r.label} className={cn(r.strong && 'text-base font-semibold')}>
            <th scope="row" className={cn('pt-2 pr-3 text-left font-normal', r.strong && 'font-semibold')}>
              {r.label}
            </th>
            <td className="whitespace-nowrap pt-2 text-right tabular-nums">
              {r.isFrom && <span className="mr-1 text-xs font-normal text-ink-soft">from</span>}
              {r.negative ? '−' : ''}
              {formatCAD(r.cents)}
            </td>
          </tr>
        ))}
      </tfoot>
    </table>
  );
}
