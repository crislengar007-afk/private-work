import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTeam } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatTime, monctonDateOf, monctonToday, monctonToUtc } from '@/lib/time';
import { cn } from '@/lib/cn';
import { Badge, Notice, PageHeader, buttonClass } from '@/components/ui';
import { FilterTabs, Section, hrefWith, sp1, type SearchParams } from '../../_components/bits';
import {
  addDaysIso, addMonths, dayLabel, dayNumber, dayOfWeek, dayStartUtc, isIsoDate, isIsoMonth, monthGrid, monthLabel, monthOf, nowMs,
  parseTstzRange, startOfWeekIso, tstzRangeLiteral,
} from '../../_lib/dates';
import { InventoryLanes, type LaneReservation } from './lanes';
import { STATUS_STYLES } from './styles';

export const metadata: Metadata = { title: 'Calendar' };

type View = 'month' | 'week' | 'day';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalBooking {
  id: string;
  title: string;
  status: string;
  event_date: string;
  start: Date | null;
  end: Date | null;
  client: string | null;
  venue: string | null;
}
interface MiniDay {
  campaign: string;
  total: number;
  booked: number;
  held: number;
}

function BookingChip({ b, withTime = false }: { b: CalBooking; withTime?: boolean }) {
  return (
    <Link
      href={`/admin/bookings/${b.id}`}
      className={cn('block truncate rounded-md border px-1.5 py-0.5 text-xs hover:ring-2 hover:ring-rose/40', STATUS_STYLES[b.status])}
      title={`${b.title}${b.client ? ` · ${b.client}` : ''} (${b.status})`}
    >
      {withTime && b.start && <span className="font-semibold">{formatTime(b.start)} </span>}
      {b.title}
      <span className="sr-only"> ({b.status})</span>
    </Link>
  );
}

function MiniLine({ m }: { m: MiniDay }) {
  const open = m.total - m.booked - m.held;
  return (
    <p className="truncate text-[11px] text-gold-deep" title={`${m.campaign}: ${m.booked} booked, ${m.held} held, ${open} open`}>
      {m.campaign}: {m.booked} booked · {m.held} held · {open} open
    </p>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  await requireTeam();
  const sp = await searchParams;
  const today = monctonToday();
  const rawView = sp1(sp.view);
  const view: View = rawView === 'week' || rawView === 'day' ? rawView : 'month';
  const showCancelled = sp1(sp.cancelled) === '1';
  const spDate = sp1(sp.date);
  const spMonth = sp1(sp.month);
  const anchor = isIsoDate(spDate) ? spDate : today;

  // ---- range for the view (Moncton calendar dates)
  let days: string[];
  let title: string;
  let prev: Record<string, string | undefined>;
  let next: Record<string, string | undefined>;
  let month = monthOf(anchor);
  if (view === 'month') {
    month = isIsoMonth(spMonth) ? spMonth : monthOf(anchor);
    days = monthGrid(month);
    title = monthLabel(month);
    prev = { view: undefined, month: addMonths(month, -1), date: undefined };
    next = { view: undefined, month: addMonths(month, 1), date: undefined };
  } else if (view === 'week') {
    const start = startOfWeekIso(anchor);
    days = Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
    title = `Week of ${dayLabel(start)}`;
    prev = { view, date: addDaysIso(start, -7), month: undefined };
    next = { view, date: addDaysIso(start, 7), month: undefined };
  } else {
    days = [anchor];
    title = dayLabel(anchor);
    prev = { view, date: addDaysIso(anchor, -1), month: undefined };
    next = { view, date: addDaysIso(anchor, 1), month: undefined };
  }
  const firstDay = days[0];
  const endDay = addDaysIso(days[days.length - 1], 1); // exclusive
  const startUtc = dayStartUtc(firstDay);
  const endUtc = dayStartUtc(endDay);
  const base = { view: view === 'month' ? undefined : view, date: view === 'month' ? undefined : anchor, month: view === 'month' ? month : undefined, cancelled: showCancelled ? '1' : undefined };
  const keep = { cancelled: base.cancelled };

  // ---- data
  const sb = await createClient();
  let bq = sb
    .from('bookings')
    .select('id, title, status, event_date, period, venue_name, client:clients(full_name)')
    .gte('event_date', firstDay)
    .lt('event_date', endDay)
    .order('event_date')
    .limit(500);
  if (!showCancelled) bq = bq.neq('status', 'cancelled');
  const wantLanes = view !== 'month';

  const [bookingsRes, slotsRes, miniBookingsRes, blackoutsRes, itemsRes, resRes] = await Promise.all([
    bq,
    sb.from('mini_slots')
      .select('id, starts_at, campaign:mini_campaigns(name, status)')
      .gte('starts_at', startUtc.toISOString())
      .lt('starts_at', endUtc.toISOString())
      .limit(2000),
    sb.from('mini_bookings')
      .select('slot_id, status, hold_expires_at, slot:mini_slots!inner(starts_at)')
      .in('status', ['held', 'confirmed'])
      .gte('slot.starts_at', startUtc.toISOString())
      .lt('slot.starts_at', endUtc.toISOString())
      .limit(2000),
    sb.from('blackout_dates').select('id, date, reason').gte('date', firstDay).lt('date', endDay),
    wantLanes ? sb.from('inventory_items').select('id, name, kind, units_owned').order('name') : Promise.resolve({ data: null, error: null }),
    wantLanes
      ? sb.from('inventory_reservations')
          .select('id, inventory_item_id, unit_no, period, booking:bookings(id, title, status, client:clients(full_name))')
          .eq('active', true)
          .overlaps('period', tstzRangeLiteral(startUtc, endUtc))
          .limit(2000)
      : Promise.resolve({ data: null, error: null }),
  ]);
  const loadError = [bookingsRes, slotsRes, miniBookingsRes, blackoutsRes].find((r) => r.error)?.error;

  const bookingsByDay = new Map<string, CalBooking[]>();
  for (const b of bookingsRes.data ?? []) {
    const r = parseTstzRange(b.period);
    const list = bookingsByDay.get(b.event_date) ?? [];
    list.push({
      id: b.id, title: b.title, status: b.status, event_date: b.event_date,
      start: r?.start ?? null, end: r?.end ?? null,
      client: (b.client as { full_name: string } | null)?.full_name ?? null, venue: b.venue_name,
    });
    bookingsByDay.set(b.event_date, list);
  }
  for (const list of bookingsByDay.values()) list.sort((a, c) => (a.start?.getTime() ?? 0) - (c.start?.getTime() ?? 0));

  const now = nowMs();
  const activeBySlot = new Map<string, 'booked' | 'held'>();
  for (const m of miniBookingsRes.data ?? []) {
    if (m.status === 'confirmed') activeBySlot.set(m.slot_id, 'booked');
    else if (m.hold_expires_at && new Date(m.hold_expires_at).getTime() > now) activeBySlot.set(m.slot_id, 'held');
  }
  const minisByDay = new Map<string, MiniDay[]>();
  for (const s of slotsRes.data ?? []) {
    const day = monctonDateOf(s.starts_at);
    const campaign = (s.campaign as { name: string; status: string } | null)?.name ?? 'Mini session';
    const list = minisByDay.get(day) ?? [];
    let entry = list.find((e) => e.campaign === campaign);
    if (!entry) {
      entry = { campaign, total: 0, booked: 0, held: 0 };
      list.push(entry);
    }
    entry.total++;
    const st = activeBySlot.get(s.id);
    if (st === 'booked') entry.booked++;
    if (st === 'held') entry.held++;
    minisByDay.set(day, list);
  }
  const blackoutByDay = new Map((blackoutsRes.data ?? []).map((b) => [b.date, b.reason]));

  const laneReservations: LaneReservation[] = (resRes.data ?? []).flatMap((r) => {
    const p = parseTstzRange(r.period);
    if (!p) return [];
    const bk = r.booking as { id: string; title: string; status: string; client: { full_name: string } | null } | null;
    return [{
      id: r.id, itemId: r.inventory_item_id, unitNo: r.unit_no, start: p.start, end: p.end,
      booking: bk ? { id: bk.id, title: bk.title, status: bk.status, client: bk.client?.full_name ?? null } : null,
    }];
  });
  const ticks =
    view === 'day'
      ? [0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
          const at = monctonToUtc(anchor, `${String(h).padStart(2, '0')}:00`);
          return { at, label: formatTime(at).replace(':00', '') };
        })
      : days.map((d) => ({ at: dayStartUtc(d), label: dayLabel(d) }));

  return (
    <>
      <PageHeader title="Calendar" description="All dates and times are Atlantic Time (Moncton)." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={hrefWith('/admin/calendar', keep, prev)} className={buttonClass('secondary', 'sm')} aria-label="Previous">← Prev</Link>
          <Link href={hrefWith('/admin/calendar', keep, view === 'month' ? { month: monthOf(today) } : { view, date: today })} className={buttonClass('secondary', 'sm')}>Today</Link>
          <Link href={hrefWith('/admin/calendar', keep, next)} className={buttonClass('secondary', 'sm')} aria-label="Next">Next →</Link>
          <h2 className="ml-2 font-display text-2xl font-semibold" aria-live="polite">{title}</h2>
        </div>
        <Link
          href={hrefWith('/admin/calendar', base, { cancelled: showCancelled ? undefined : '1' })}
          className="text-sm text-rose-deep underline"
        >
          {showCancelled ? 'Hide cancelled' : 'Show cancelled'}
        </Link>
      </div>
      <FilterTabs
        label="Calendar view"
        current={view}
        items={[
          { value: 'month', label: 'Month', href: hrefWith('/admin/calendar', keep, { month: monthOf(anchor) }) },
          { value: 'week', label: 'Week', href: hrefWith('/admin/calendar', keep, { view: 'week', date: view === 'month' && !isIsoDate(spDate) ? (monthOf(today) === month ? today : `${month}-01`) : anchor }) },
          { value: 'day', label: 'Day', href: hrefWith('/admin/calendar', keep, { view: 'day', date: view === 'month' && !isIsoDate(spDate) ? (monthOf(today) === month ? today : `${month}-01`) : anchor }) },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs" aria-label="Legend">
        {['held', 'confirmed', 'completed', ...(showCancelled ? ['cancelled'] : [])].map((s) => (
          <span key={s} className={cn('rounded-md border px-2 py-0.5 capitalize', STATUS_STYLES[s])}>{s}</span>
        ))}
        <span className="rounded-md border border-line bg-white px-2 py-0.5 text-gold-deep">Mini sessions</span>
        <span className="rounded-md border border-line bg-ink/80 px-2 py-0.5 text-white">Blackout</span>
      </div>

      {loadError && <Notice tone="bad" className="mb-4">Some calendar data could not be loaded: {loadError.message}</Notice>}

      {view === 'month' && (
        <>
          {/* Month grid (tablet and up) */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-white md:block">
            <div className="grid grid-cols-7 border-b border-line bg-cream-deep/60 text-center text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const inMonth = monthOf(d) === month;
                const list = bookingsByDay.get(d) ?? [];
                const minis = minisByDay.get(d) ?? [];
                const blackout = blackoutByDay.get(d);
                const isBlackout = blackoutByDay.has(d);
                return (
                  <div
                    key={d}
                    className={cn(
                      'min-h-28 border-b border-r border-line/70 p-1.5 [&:nth-child(7n)]:border-r-0',
                      !inMonth && 'bg-cream/60 text-ink-soft',
                      isBlackout && 'bg-ink/5',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Link
                        href={`/admin/calendar?view=day&date=${d}${showCancelled ? '&cancelled=1' : ''}`}
                        className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-blush', d === today && 'bg-rose-deep font-semibold text-white hover:bg-rose-deep')}
                        aria-label={`${dayLabel(d)}${d === today ? ' (today)' : ''}`}
                      >
                        {dayNumber(d)}
                      </Link>
                      {isBlackout && <span className="rounded bg-ink/80 px-1 text-[10px] text-white" title={blackout ?? 'Blackout date'}>Blackout</span>}
                    </div>
                    <div className="space-y-0.5">
                      {list.slice(0, 3).map((b) => (
                        <BookingChip key={b.id} b={b} />
                      ))}
                      {list.length > 3 && (
                        <Link href={`/admin/calendar?view=day&date=${d}`} className="block text-[11px] text-rose-deep underline">+{list.length - 3} more</Link>
                      )}
                      {minis.map((m) => (
                        <MiniLine key={m.campaign} m={m} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agenda list (phones) */}
          <ol className="space-y-2 md:hidden">
            {days.filter((d) => monthOf(d) === month).map((d) => {
              const list = bookingsByDay.get(d) ?? [];
              const minis = minisByDay.get(d) ?? [];
              const isBlackout = blackoutByDay.has(d);
              if (!list.length && !minis.length && !isBlackout && d !== today) return null;
              return (
                <li key={d} className="rounded-xl border border-line bg-white p-3">
                  <Link href={`/admin/calendar?view=day&date=${d}`} className={cn('mb-1 block text-sm font-semibold', d === today && 'text-rose-deep')}>
                    {dayLabel(d)}{d === today ? ' · today' : ''}
                  </Link>
                  {isBlackout && <p className="text-xs text-ink-soft">Blackout{blackoutByDay.get(d) ? `: ${blackoutByDay.get(d)}` : ''}</p>}
                  <div className="space-y-1">
                    {list.map((b) => (
                      <BookingChip key={b.id} b={b} withTime />
                    ))}
                    {minis.map((m) => (
                      <MiniLine key={m.campaign} m={m} />
                    ))}
                  </div>
                  {!list.length && !minis.length && !isBlackout && <p className="text-xs text-ink-soft">Nothing scheduled.</p>}
                </li>
              );
            })}
          </ol>

          <p className="mt-4 text-sm text-ink-soft">
            Open a week or day to see the <Link href={hrefWith('/admin/calendar', keep, { view: 'week', date: monthOf(today) === month ? today : `${month}-01` })} className="text-rose-deep underline">inventory lanes</Link> (which booth, arch or person is where).
          </p>
        </>
      )}

      {view !== 'month' && (
        <div className="space-y-6">
          <div className={cn('grid gap-3', view === 'week' ? 'sm:grid-cols-2 lg:grid-cols-7' : '')}>
            {days.map((d) => {
              const list = bookingsByDay.get(d) ?? [];
              const minis = minisByDay.get(d) ?? [];
              const isBlackout = blackoutByDay.has(d);
              return (
                <section key={d} aria-label={dayLabel(d)} className={cn('min-w-0 rounded-xl border border-line bg-white p-3', isBlackout && 'bg-ink/5', d === today && 'ring-2 ring-rose/40')}>
                  <h3 className="mb-2 text-sm font-semibold">
                    {view === 'week' ? (
                      <Link href={`/admin/calendar?view=day&date=${d}${showCancelled ? '&cancelled=1' : ''}`} className="hover:text-rose-deep">
                        {WEEKDAYS[dayOfWeek(d)]} {dayNumber(d)}
                      </Link>
                    ) : (
                      dayLabel(d)
                    )}
                    {d === today && <Badge tone="rose" className="ml-1">today</Badge>}
                  </h3>
                  {isBlackout && <p className="mb-1 rounded bg-ink/80 px-1.5 py-0.5 text-xs text-white">Blackout{blackoutByDay.get(d) ? `: ${blackoutByDay.get(d)}` : ''}</p>}
                  <div className="space-y-1">
                    {list.map((b) =>
                      view === 'day' ? (
                        <Link key={b.id} href={`/admin/bookings/${b.id}`} className={cn('block rounded-md border px-2 py-1.5 text-sm hover:ring-2 hover:ring-rose/40', STATUS_STYLES[b.status])}>
                          <span className="font-semibold">{b.start && b.end ? `${formatTime(b.start)}–${formatTime(b.end)}` : ''}</span> {b.title}
                          <span className="block text-xs opacity-80">{[b.client, b.venue].filter(Boolean).join(' · ')} · {b.status}</span>
                        </Link>
                      ) : (
                        <BookingChip key={b.id} b={b} withTime />
                      ),
                    )}
                    {minis.map((m) => (
                      <MiniLine key={m.campaign} m={m} />
                    ))}
                    {!list.length && !minis.length && <p className="text-xs text-ink-soft">Free</p>}
                  </div>
                </section>
              );
            })}
          </div>

          <Section title="Inventory lanes">
            <p className="mb-3 text-sm text-ink-soft">Each bar is a reservation including setup and teardown buffers. Select one to open the booking.</p>
            {itemsRes.error || resRes.error ? (
              <Notice tone="bad">Could not load inventory.</Notice>
            ) : (
              <InventoryLanes items={itemsRes.data ?? []} reservations={laneReservations} rangeStart={startUtc} rangeEnd={endUtc} ticks={ticks} />
            )}
          </Section>
        </div>
      )}
    </>
  );
}
