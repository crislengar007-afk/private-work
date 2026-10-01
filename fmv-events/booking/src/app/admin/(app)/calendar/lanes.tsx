// Inventory lane view: one row per inventory item × unit, with each
// reservation (event ± setup/teardown buffers) drawn across the time range.
import Link from 'next/link';
import { formatTime, formatDateTime } from '@/lib/time';
import { cn } from '@/lib/cn';
import { STATUS_STYLES } from './styles';

export interface LaneItem {
  id: string;
  name: string;
  units_owned: number;
}

export interface LaneReservation {
  id: string;
  itemId: string;
  unitNo: number;
  start: Date;
  end: Date;
  booking: { id: string; title: string; status: string; client: string | null } | null;
}

export function InventoryLanes({
  items,
  reservations,
  rangeStart,
  rangeEnd,
  ticks,
}: {
  items: LaneItem[];
  reservations: LaneReservation[];
  rangeStart: Date;
  rangeEnd: Date;
  ticks: { at: Date; label: string }[];
}) {
  const span = rangeEnd.getTime() - rangeStart.getTime();
  const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - rangeStart.getTime()) / span) * 100));

  const rows = items.flatMap((item) => {
    const seenUnits = reservations.filter((r) => r.itemId === item.id).map((r) => r.unitNo);
    const maxUnit = Math.max(item.units_owned, ...seenUnits, 0);
    return Array.from({ length: maxUnit }, (_, i) => ({
      key: `${item.id}:${i + 1}`,
      label: maxUnit > 1 ? `${item.name} #${i + 1}` : item.name,
      res: reservations.filter((r) => r.itemId === item.id && r.unitNo === i + 1),
      overUnits: i + 1 > item.units_owned,
    }));
  });

  if (rows.length === 0) return <p className="text-sm text-ink-soft">No inventory items yet. Add them in the catalog.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <div className="min-w-[760px]">
        <div className="flex border-b border-line bg-cream-deep/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <div className="w-48 shrink-0 px-3 py-2">Item</div>
          <div className="relative h-8 flex-1">
            {ticks.map((t) => (
              <span key={t.at.toISOString()} className="absolute top-2 -translate-x-0 whitespace-nowrap pl-1 normal-case" style={{ left: `${pct(t.at)}%` }}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
        <ul>
          {rows.map((row) => (
            <li key={row.key} className="flex border-b border-line/70 last:border-b-0">
              <div className="w-48 shrink-0 truncate px-3 py-2 text-sm" title={row.label}>
                {row.label}
                {row.overUnits && <span className="ml-1 text-xs text-bad">(unit no longer owned)</span>}
              </div>
              <div className="relative h-11 flex-1">
                {ticks.map((t) => (
                  <span key={t.at.toISOString()} aria-hidden className="absolute inset-y-0 border-l border-line/70" style={{ left: `${pct(t.at)}%` }} />
                ))}
                {row.res.length === 0 && <span className="sr-only">Free all period</span>}
                {row.res.map((r) => {
                  const left = pct(r.start);
                  const width = Math.max(pct(r.end) - left, 1.2);
                  const status = r.booking?.status ?? 'held';
                  const when = `${formatDateTime(r.start)} – ${formatTime(r.end)}`;
                  const title = `${r.booking?.title ?? 'Booking'}${r.booking?.client ? ` (${r.booking.client})` : ''}: ${when}, including setup/teardown`;
                  const cls = cn('absolute top-1.5 bottom-1.5 overflow-hidden rounded-md border px-1.5 text-xs leading-7 whitespace-nowrap', STATUS_STYLES[status] ?? STATUS_STYLES.held);
                  return r.booking ? (
                    <Link key={r.id} href={`/admin/bookings/${r.booking.id}`} title={title} aria-label={title} className={cn(cls, 'hover:ring-2 hover:ring-rose/40')} style={{ left: `${left}%`, width: `${width}%` }}>
                      {r.booking.title}
                    </Link>
                  ) : (
                    <span key={r.id} title={title} className={cls} style={{ left: `${left}%`, width: `${width}%` }}>
                      Reserved
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
