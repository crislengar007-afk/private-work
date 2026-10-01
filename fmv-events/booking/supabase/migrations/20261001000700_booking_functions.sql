-- Business transactions. Each runs as one database transaction so the steps
-- either all happen or none do. Only the server (service role) may call the
-- write functions; the two read helpers for public availability are granted to anon.

alter table public.bookings add column if not exists cancel_reason text;
alter table public.bookings add column if not exists expiry_notified_at timestamptz;
alter table public.mini_bookings add column if not exists cancel_reason text;
alter table public.mini_bookings add column if not exists expiry_notified_at timestamptz;

-- ---------------------------------------------------------------- helpers
create or replace function public.random_token()
returns text language sql volatile set search_path = '' as $$
  select replace(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=', '')
$$;

-- Event wall-clock times in America/Moncton -> UTC range. An end at or before the
-- start means the event runs past midnight.
create or replace function public.event_period(p_date date, p_start time, p_end time)
returns tstzrange language sql stable set search_path = '' as $$
  select tstzrange(
    (p_date + p_start) at time zone 'America/Moncton',
    ((p_date + case when p_end <= p_start then 1 else 0 end) + p_end) at time zone 'America/Moncton',
    '[)')
$$;

create or replace function public.moncton_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Moncton')::date
$$;

-- What a quote needs from inventory. Physical items add up across services;
-- a person ('staff') is needed once per event however many services they cover.
create or replace function public.quote_inventory_needs(p_quote_id uuid)
returns table (inventory_item_id uuid, item_name text, qty int)
language sql stable security definer set search_path = '' as $$
  with svc_qty as (
    select ql.ref_id as service_id,
           case when s.price_mode = 'per_item' then ceil(ql.qty)::int else 1 end as mult
      from public.quote_lines ql
      join public.services s on s.id = ql.ref_id
     where ql.quote_id = p_quote_id and ql.kind = 'service'
    union all
    select pi.service_id,
           case when s.price_mode = 'per_item' then ceil(pi.qty)::int else 1 end
      from public.quote_lines ql
      join public.package_items pi on pi.package_id = ql.ref_id
      join public.services s on s.id = pi.service_id
     where ql.quote_id = p_quote_id and ql.kind = 'package'
  )
  select si.inventory_item_id, i.name,
         (case when i.kind = 'staff' then max(si.qty * sq.mult) else sum(si.qty * sq.mult) end)::int
    from svc_qty sq
    join public.service_inventory si on si.service_id = sq.service_id
    join public.inventory_items i on i.id = si.inventory_item_id
   group by si.inventory_item_id, i.name, i.kind
$$;

-- ---------------------------------------------------------------- availability (public)
-- Per public service: available | limited | unavailable. Never exposes who booked.
create or replace function public.service_availability(p_date date, p_start time, p_end time)
returns table (service_id uuid, slug text, status text, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  ev tstzrange := public.event_period(p_date, p_start, p_end);
  is_blackout boolean := exists (select 1 from public.blackout_dates b where b.date = p_date);
  is_past boolean := p_date < public.moncton_today();
begin
  return query
  with svc as (
    select s.id, s.slug from public.services s where s.status = 'active' and s.is_public
  ),
  need as (
    select si.service_id, si.inventory_item_id, si.qty, i.units_owned,
           tstzrange(lower(ev) - make_interval(mins => i.buffer_before_min),
                     upper(ev) + make_interval(mins => i.buffer_after_min)) as win
      from public.service_inventory si
      join public.inventory_items i on i.id = si.inventory_item_id
     where si.service_id in (select id from svc)
  ),
  usage as (
    select n.service_id, n.qty, n.units_owned,
           (select count(distinct r.unit_no)
              from public.inventory_reservations r
              join public.bookings b on b.id = r.booking_id
             where r.inventory_item_id = n.inventory_item_id
               and r.active
               and r.period && n.win
               and (b.status <> 'held' or b.hold_expires_at > now()))::int as used
      from need n
  ),
  agg as (
    select u.service_id,
           bool_or(u.units_owned - u.used < u.qty) as blocked,
           bool_or(u.used > 0) as partly
      from usage u group by u.service_id
  )
  select svc.id, svc.slug,
         case when is_past or is_blackout or coalesce(a.blocked, false) then 'unavailable'
              when coalesce(a.partly, false) then 'limited'
              else 'available' end,
         case when is_past then 'This date has passed'
              when is_blackout then 'Not available on this date'
              when coalesce(a.blocked, false) then 'Already booked at this time'
              when coalesce(a.partly, false) then 'Limited availability at this time'
              else null end
    from svc left join agg a on a.service_id = svc.id;
end $$;
grant execute on function public.service_availability(date, time, time) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- hold expiry
-- Releases unpaid holds. A deposit the client has reported (but the owner hasn't
-- recorded yet) keeps the hold until the owner checks it.
create or replace function public.expire_stale_holds()
returns int language plpgsql security definer set search_path = '' as $$
declare n1 int; n2 int;
begin
  with expired as (
    update public.bookings b
       set status = 'cancelled', cancel_reason = 'hold_expired'
     where b.status = 'held' and b.hold_expires_at < now()
       and not exists (select 1 from public.invoices i where i.booking_id = b.id and i.status in ('reported', 'paid'))
    returning b.id
  ), voided as (
    update public.invoices i set status = 'void'
      from expired e where i.booking_id = e.id and i.status = 'unpaid'
    returning i.id
  )
  select count(*) into n1 from expired;

  with expired as (
    update public.mini_bookings m
       set status = 'cancelled', cancel_reason = 'hold_expired'
     where m.status = 'held' and m.hold_expires_at < now()
       and not exists (select 1 from public.invoices i where i.mini_booking_id = m.id and i.status in ('reported', 'paid'))
    returning m.id
  ), voided as (
    update public.invoices i set status = 'void'
      from expired e where i.mini_booking_id = e.id and i.status = 'unpaid'
    returning i.id
  )
  select count(*) into n2 from expired;
  return n1 + n2;
end $$;

-- ---------------------------------------------------------------- accept quote
-- Accept -> booking (held) + inventory reservations + deposit invoice, atomically.
-- Errors (message = code, detail = friendly text):
--   quote_not_found | quote_not_open | quote_expired | date_unavailable | item_unavailable
create or replace function public.accept_quote(p_token text, p_name text, p_ip text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  inq public.inquiries%rowtype;
  st public.settings%rowtype;
  v_booking_id uuid;
  v_period tstzrange;
  v_invoice_id uuid;
  v_invoice_token text;
  v_kind public.invoice_kind;
  need record;
  item record;
  i int;
  u int;
  placed boolean;
begin
  select * into q from public.quotes where public_token = p_token for update;
  if not found then
    raise exception 'quote_not_found' using detail = 'We could not find this quote.';
  end if;
  if q.status = 'accepted' then
    select b.id into v_booking_id from public.bookings b where b.quote_id = q.id;
    select inv.id, inv.public_token into v_invoice_id, v_invoice_token
      from public.invoices inv where inv.booking_id = v_booking_id and inv.kind in ('deposit', 'full', 'balance')
      order by inv.created_at limit 1;
    return jsonb_build_object('booking_id', v_booking_id, 'invoice_id', v_invoice_id,
                              'invoice_token', v_invoice_token, 'already_accepted', true);
  end if;
  if q.status <> 'sent' then
    raise exception 'quote_not_open' using detail = 'This quote is no longer open. Please contact us for an updated quote.';
  end if;
  if q.valid_until is not null and q.valid_until < public.moncton_today() then
    raise exception 'quote_expired' using detail = 'This quote has expired. Please contact us for an updated quote.';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'name_required' using detail = 'Please type your full name to accept.';
  end if;

  select * into inq from public.inquiries where id = q.inquiry_id;
  select * into st from public.settings where id = 1;

  if exists (select 1 from public.blackout_dates b where b.date = inq.event_date)
     or inq.event_date < public.moncton_today() then
    raise exception 'date_unavailable' using detail = 'That date is no longer available.';
  end if;

  perform public.expire_stale_holds();

  v_period := public.event_period(inq.event_date, inq.start_time, inq.end_time);

  insert into public.bookings (quote_id, client_id, event_type, title, event_date, period, status,
                               hold_expires_at, venue_name, venue_address, zone_id)
  values (q.id, q.client_id, inq.event_type,
          initcap(replace(inq.event_type::text, '_', ' ')) || ' · ' || to_char(inq.event_date, 'Mon DD, YYYY'),
          inq.event_date, v_period, 'held', now() + make_interval(hours => st.hold_hours),
          inq.venue_name, inq.venue_address, inq.zone_id)
  returning id into v_booking_id;

  -- Reserve each unit; the exclusion constraint is the real guard against races.
  for need in select * from public.quote_inventory_needs(q.id) loop
    select * into item from public.inventory_items where id = need.inventory_item_id;
    for i in 1 .. need.qty loop
      placed := false;
      for u in 1 .. greatest(item.units_owned, 0) loop
        begin
          insert into public.inventory_reservations (booking_id, inventory_item_id, unit_no, period)
          values (v_booking_id, item.id, u,
                  tstzrange(lower(v_period) - make_interval(mins => item.buffer_before_min),
                            upper(v_period) + make_interval(mins => item.buffer_after_min), '[)'));
          placed := true;
          exit;
        exception when exclusion_violation or unique_violation then
          -- this unit is taken (or already used by this booking); try the next
        end;
      end loop;
      if not placed then
        raise exception 'item_unavailable'
          using detail = format('That date/time is no longer available for %s.', item.name);
      end if;
    end loop;
  end loop;

  update public.quotes
     set status = 'accepted', accepted_at = now(), accepted_ip = p_ip, accepted_name = btrim(p_name)
   where id = q.id;
  update public.quotes set status = 'superseded'
   where inquiry_id = q.inquiry_id and id <> q.id and status in ('draft', 'sent');
  update public.inquiries set status = 'won' where id = q.inquiry_id;

  insert into public.booking_tasks (booking_id, label, sort) values
    (v_booking_id, 'Confirm timeline & final details with client', 1),
    (v_booking_id, 'Pack and test equipment / décor', 2),
    (v_booking_id, 'Setup at venue', 3),
    (v_booking_id, 'Teardown & inventory check', 4);

  if q.deposit_cents > 0 then
    v_kind := case when q.deposit_cents >= q.total_cents then 'full' else 'deposit' end;
    insert into public.invoices (number, booking_id, client_id, kind, amount_cents, tax_cents, due_at,
                                 etransfer_reference, public_token)
    values (public.next_doc_number('invoice'), v_booking_id, q.client_id, v_kind, q.deposit_cents,
            case when q.total_cents > 0 then round(q.tax_cents::numeric * q.deposit_cents / q.total_cents)::bigint else 0 end,
            now() + make_interval(hours => st.hold_hours),
            public.next_doc_number('etransfer'), public.random_token())
    returning id, public_token into v_invoice_id, v_invoice_token;
  else
    -- No deposit required: confirm now and bill the full amount as the balance.
    update public.bookings set status = 'confirmed', hold_expires_at = null where id = v_booking_id;
    v_invoice_id := public.create_balance_invoice(v_booking_id);
    select public_token into v_invoice_token from public.invoices where id = v_invoice_id;
  end if;

  return jsonb_build_object('booking_id', v_booking_id, 'invoice_id', v_invoice_id,
                            'invoice_token', v_invoice_token, 'already_accepted', false);
end $$;

-- ---------------------------------------------------------------- balance invoice
create or replace function public.create_balance_invoice(p_booking_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  q public.quotes%rowtype;
  st public.settings%rowtype;
  billed bigint;
  billed_tax bigint;
  v_due timestamptz;
  v_id uuid;
begin
  select * into b from public.bookings where id = p_booking_id;
  select * into q from public.quotes where id = b.quote_id;
  select * into st from public.settings where id = 1;
  select coalesce(sum(amount_cents), 0), coalesce(sum(tax_cents), 0) into billed, billed_tax
    from public.invoices where booking_id = p_booking_id and status <> 'void';
  if q.total_cents - billed <= 0 then
    return null;
  end if;
  v_due := greatest(now(),
    ((b.event_date - st.balance_due_days_before_event) + time '23:59') at time zone 'America/Moncton');
  insert into public.invoices (number, booking_id, client_id, kind, amount_cents, tax_cents, due_at,
                               etransfer_reference, public_token)
  values (public.next_doc_number('invoice'), p_booking_id, b.client_id, 'balance',
          q.total_cents - billed, greatest(q.tax_cents - billed_tax, 0), v_due,
          public.next_doc_number('etransfer'), public.random_token())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- record payment
-- Only the owner's recorded payment confirms anything ("I've sent it" never does).
create or replace function public.record_payment(
  p_invoice_id uuid, p_method public.payment_method, p_amount_cents bigint,
  p_received_at timestamptz, p_note text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  inv public.invoices%rowtype;
  v_payment_id uuid;
  v_paid bigint;
  v_booking_confirmed boolean := false;
  v_mini_confirmed boolean := false;
  v_balance_id uuid;
  v_booking_status public.booking_status;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice_not_found' using detail = 'Invoice not found.';
  end if;
  if inv.status = 'void' then
    raise exception 'invoice_void' using detail = 'This invoice is void (the hold may have expired). Create a fresh quote for the client.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount' using detail = 'Amount must be greater than zero.';
  end if;

  insert into public.payments (invoice_id, method, amount_cents, received_at, note, recorded_by)
  values (inv.id, p_method, p_amount_cents, coalesce(p_received_at, now()), p_note, p_actor)
  returning id into v_payment_id;

  select coalesce(sum(amount_cents), 0) into v_paid from public.payments where invoice_id = inv.id;

  if v_paid >= inv.amount_cents and inv.status <> 'paid' then
    update public.invoices set status = 'paid', paid_at = now() where id = inv.id;

    if inv.booking_id is not null and inv.kind in ('deposit', 'full') then
      select status into v_booking_status from public.bookings where id = inv.booking_id for update;
      if v_booking_status = 'held' then
        update public.bookings set status = 'confirmed', hold_expires_at = null where id = inv.booking_id;
        v_booking_confirmed := true;
      elsif v_booking_status = 'cancelled' then
        raise exception 'booking_cancelled' using detail = 'This booking was cancelled; the payment was not recorded.';
      end if;
      if inv.kind = 'deposit' then
        v_balance_id := public.create_balance_invoice(inv.booking_id);
      end if;
    end if;

    if inv.mini_booking_id is not null then
      update public.mini_bookings set status = 'confirmed', hold_expires_at = null
       where id = inv.mini_booking_id and status = 'held';
      v_mini_confirmed := found;
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'paid_cents', v_paid,
    'invoice_paid', v_paid >= inv.amount_cents,
    'booking_confirmed', v_booking_confirmed,
    'mini_confirmed', v_mini_confirmed,
    'balance_invoice_id', v_balance_id);
end $$;

-- ---------------------------------------------------------------- report payment ("I've sent it")
create or replace function public.report_invoice_payment(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv public.invoices%rowtype;
begin
  select * into inv from public.invoices where public_token = p_token for update;
  if not found then
    raise exception 'invoice_not_found' using detail = 'We could not find this invoice.';
  end if;
  if inv.status = 'unpaid' then
    update public.invoices set status = 'reported', reported_at = now() where id = inv.id;
    return jsonb_build_object('invoice_id', inv.id, 'changed', true);
  end if;
  return jsonb_build_object('invoice_id', inv.id, 'changed', false, 'status', inv.status);
end $$;

-- ---------------------------------------------------------------- mini-session hold
-- Errors: slot_not_found | campaign_closed | slot_past | slot_taken
create or replace function public.hold_mini_slot(p_slot_id uuid, p_client_id uuid, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.mini_slots%rowtype;
  c public.mini_campaigns%rowtype;
  st public.settings%rowtype;
  v_mini_id uuid;
  v_hold timestamptz;
  v_tax bigint := 0;
  v_total bigint;
  v_amount bigint;
  v_invoice_id uuid;
  v_token text;
begin
  select * into s from public.mini_slots where id = p_slot_id;
  if not found then
    raise exception 'slot_not_found' using detail = 'That time slot does not exist.';
  end if;
  select * into c from public.mini_campaigns where id = s.campaign_id;
  if c.status <> 'live' then
    raise exception 'campaign_closed' using detail = 'Booking for these mini sessions is closed.';
  end if;
  if s.starts_at <= now() then
    raise exception 'slot_past' using detail = 'That time slot has already passed.';
  end if;
  select * into st from public.settings where id = 1;

  perform public.expire_stale_holds();

  v_hold := least(now() + make_interval(hours => c.hold_hours), s.starts_at);
  begin
    insert into public.mini_bookings (slot_id, client_id, status, hold_expires_at, notes)
    values (s.id, p_client_id, 'held', v_hold, p_notes)
    returning id into v_mini_id;
  exception when unique_violation then
    raise exception 'slot_taken' using detail = 'Sorry, someone just booked that time. Please pick another slot.';
  end;

  if st.tax_enabled then
    v_tax := round(c.price_cents::numeric * st.tax_rate_bp / 10000)::bigint;
  end if;
  v_total := c.price_cents + v_tax;
  v_amount := case when c.payment_mode = 'full' then v_total
                   else round(v_total::numeric * st.deposit_pct / 100)::bigint end;

  insert into public.invoices (number, mini_booking_id, client_id, kind, amount_cents, tax_cents, due_at,
                               etransfer_reference, public_token)
  values (public.next_doc_number('invoice'), v_mini_id, p_client_id, 'mini', v_amount,
          case when v_total > 0 then round(v_tax::numeric * v_amount / v_total)::bigint else 0 end,
          v_hold, public.next_doc_number('etransfer'), public.random_token())
  returning id, public_token into v_invoice_id, v_token;

  return jsonb_build_object('mini_booking_id', v_mini_id, 'invoice_id', v_invoice_id,
                            'invoice_token', v_token, 'hold_expires_at', v_hold,
                            'amount_cents', v_amount, 'total_cents', v_total);
end $$;

-- ---------------------------------------------------------------- complete past events
create or replace function public.complete_past_bookings()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.bookings set status = 'completed'
   where status = 'confirmed' and upper(period) < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.random_token() from public, anon, authenticated;
revoke execute on function public.quote_inventory_needs(uuid) from public, anon, authenticated;
revoke execute on function public.expire_stale_holds() from public, anon, authenticated;
revoke execute on function public.accept_quote(text, text, text) from public, anon, authenticated;
revoke execute on function public.create_balance_invoice(uuid) from public, anon, authenticated;
revoke execute on function public.record_payment(uuid, public.payment_method, bigint, timestamptz, text, uuid) from public, anon, authenticated;
revoke execute on function public.report_invoice_payment(text) from public, anon, authenticated;
revoke execute on function public.hold_mini_slot(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.complete_past_bookings() from public, anon, authenticated;

grant execute on function public.random_token(), public.quote_inventory_needs(uuid), public.expire_stale_holds(),
  public.accept_quote(text, text, text), public.create_balance_invoice(uuid),
  public.record_payment(uuid, public.payment_method, bigint, timestamptz, text, uuid),
  public.report_invoice_payment(text), public.hold_mini_slot(uuid, uuid, text),
  public.complete_past_bookings() to service_role;
grant execute on function public.event_period(date, time, time), public.moncton_today() to anon, authenticated, service_role;
