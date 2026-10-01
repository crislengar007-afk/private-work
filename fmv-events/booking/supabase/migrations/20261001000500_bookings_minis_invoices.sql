-- Bookings + inventory reservations (database-level double-booking guard),
-- mini-session campaigns/slots/bookings, invoices and payments.

do $$ begin
  create type public.booking_status as enum ('held', 'confirmed', 'completed', 'cancelled');
  create type public.campaign_status as enum ('draft', 'live', 'closed');
  create type public.mini_payment_mode as enum ('deposit', 'full');
  create type public.mini_booking_status as enum ('held', 'confirmed', 'cancelled', 'no_show');
  create type public.invoice_kind as enum ('deposit', 'balance', 'full', 'mini');
  create type public.invoice_status as enum ('unpaid', 'reported', 'paid', 'void');
  create type public.payment_method as enum ('etransfer', 'cash', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- bookings
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  event_type public.event_type not null,
  title text not null,
  event_date date not null,
  period tstzrange not null,  -- event start->end (America/Moncton wall time, stored as UTC)
  status public.booking_status not null default 'held',
  hold_expires_at timestamptz,
  venue_name text,
  venue_address text,
  zone_id uuid references public.service_zones (id) on delete set null,
  gallery_url text,
  internal_notes text,
  thank_you_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_period_not_empty check (not isempty(period)),
  constraint bookings_hold_has_expiry check (status <> 'held' or hold_expires_at is not null)
);
alter table public.bookings enable row level security;
create index if not exists bookings_client_id_idx on public.bookings (client_id);
create index if not exists bookings_zone_id_idx on public.bookings (zone_id);
create index if not exists bookings_status_idx on public.bookings (status, event_date);
create index if not exists bookings_hold_idx on public.bookings (hold_expires_at) where status = 'held';
create index if not exists bookings_period_idx on public.bookings using gist (period);
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();

create policy bookings_select on public.bookings for select to authenticated
  using (public.is_team() or client_id in (select public.my_client_ids()));
create policy bookings_insert on public.bookings for insert to authenticated with check (public.is_owner());
create policy bookings_update on public.bookings for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy bookings_delete on public.bookings for delete to authenticated using (public.is_owner());

-- Per-event checklist that staff can tick off.
create table if not exists public.booking_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  label text not null,
  done boolean not null default false,
  done_by uuid references auth.users (id) on delete set null,
  done_at timestamptz,
  sort int not null default 0
);
alter table public.booking_tasks enable row level security;
create index if not exists booking_tasks_booking_id_idx on public.booking_tasks (booking_id, sort);
create index if not exists booking_tasks_done_by_idx on public.booking_tasks (done_by);
create policy booking_tasks_select on public.booking_tasks for select to authenticated using (public.is_team());
create policy booking_tasks_insert on public.booking_tasks for insert to authenticated with check (public.is_owner());
create policy booking_tasks_update on public.booking_tasks for update to authenticated using (public.is_team()) with check (public.is_team());
create policy booking_tasks_delete on public.booking_tasks for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- inventory reservations
create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  unit_no int not null check (unit_no >= 1),
  period tstzrange not null,  -- event period widened by the item's buffers
  active boolean not null default true,
  -- The database itself refuses to double-book a booth, arch or person.
  constraint inventory_reservations_no_overlap
    exclude using gist (inventory_item_id with =, unit_no with =, period with &&) where (active)
);
alter table public.inventory_reservations enable row level security;
create index if not exists inventory_reservations_booking_id_idx on public.inventory_reservations (booking_id);
create index if not exists inventory_reservations_item_idx on public.inventory_reservations (inventory_item_id);

create policy inventory_reservations_select on public.inventory_reservations for select to authenticated using (public.is_team());
create policy inventory_reservations_insert on public.inventory_reservations for insert to authenticated with check (public.is_owner());
create policy inventory_reservations_update on public.inventory_reservations for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy inventory_reservations_delete on public.inventory_reservations for delete to authenticated using (public.is_owner());

-- Keeps reservations.active in sync with the booking (a generated column can't read another table).
create or replace function public.sync_reservations_active()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.inventory_reservations
       set active = (new.status in ('held', 'confirmed', 'completed'))
     where booking_id = new.id;
  end if;
  return new;
end $$;
create trigger bookings_sync_reservations after update of status on public.bookings
  for each row execute function public.sync_reservations_active();

-- ---------------------------------------------------------------- mini sessions
create table if not exists public.mini_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  season text,
  description_md text,
  location_name text,
  location_address text,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  duration_min int not null default 20 check (duration_min > 0),
  payment_mode public.mini_payment_mode not null default 'full',
  hold_hours int not null default 24 check (hold_hours between 1 and 168),
  status public.campaign_status not null default 'draft',
  cover_media_id uuid references public.media (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mini_campaigns_live_needs_price check (status <> 'live' or price_cents is not null)
);
alter table public.mini_campaigns enable row level security;
create index if not exists mini_campaigns_cover_media_id_idx on public.mini_campaigns (cover_media_id);
create policy mini_campaigns_select on public.mini_campaigns for select to anon, authenticated
  using (status = 'live' or public.is_team());
create policy mini_campaigns_insert on public.mini_campaigns for insert to authenticated with check (public.is_owner());
create policy mini_campaigns_update on public.mini_campaigns for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy mini_campaigns_delete on public.mini_campaigns for delete to authenticated using (public.is_owner());

create table if not exists public.mini_slots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mini_campaigns (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unique (campaign_id, starts_at),
  constraint mini_slots_order check (ends_at > starts_at)
);
alter table public.mini_slots enable row level security;
create index if not exists mini_slots_starts_idx on public.mini_slots (starts_at);
create policy mini_slots_select on public.mini_slots for select to anon, authenticated using (
  public.is_team() or exists (select 1 from public.mini_campaigns c where c.id = campaign_id and c.status = 'live'));
create policy mini_slots_insert on public.mini_slots for insert to authenticated with check (public.is_owner());
create policy mini_slots_update on public.mini_slots for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy mini_slots_delete on public.mini_slots for delete to authenticated using (public.is_owner());

create table if not exists public.mini_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.mini_slots (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  status public.mini_booking_status not null default 'held',
  hold_expires_at timestamptz,
  notes text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.mini_bookings enable row level security;
-- Exactly one active (held/confirmed) booking per slot.
create unique index if not exists one_active_per_slot on public.mini_bookings (slot_id) where status in ('held', 'confirmed');
create index if not exists mini_bookings_slot_id_idx on public.mini_bookings (slot_id);
create index if not exists mini_bookings_client_id_idx on public.mini_bookings (client_id);
create index if not exists mini_bookings_hold_idx on public.mini_bookings (hold_expires_at) where status = 'held';

create policy mini_bookings_select on public.mini_bookings for select to authenticated
  using (public.is_team() or client_id in (select public.my_client_ids()));
create policy mini_bookings_insert on public.mini_bookings for insert to authenticated with check (public.is_owner());
create policy mini_bookings_update on public.mini_bookings for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy mini_bookings_delete on public.mini_bookings for delete to authenticated using (public.is_owner());

-- Public slot availability without exposing who booked: open = no active booking.
create or replace function public.mini_slot_availability(p_campaign_id uuid)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz, is_open boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, s.ends_at,
         not exists (
           select 1 from public.mini_bookings b
            where b.slot_id = s.id
              and (b.status = 'confirmed' or (b.status = 'held' and b.hold_expires_at > now())))
  from public.mini_slots s
  join public.mini_campaigns c on c.id = s.campaign_id
  where s.campaign_id = p_campaign_id and (c.status = 'live' or public.is_team())
  order by s.starts_at
$$;
grant execute on function public.mini_slot_availability(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- invoices & payments
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                -- FMV-2026-0001
  booking_id uuid references public.bookings (id) on delete restrict,
  mini_booking_id uuid references public.mini_bookings (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  kind public.invoice_kind not null,
  amount_cents bigint not null check (amount_cents >= 0), -- total due, tax included
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  due_at timestamptz not null,
  status public.invoice_status not null default 'unpaid',
  etransfer_reference text not null unique,   -- FMV0042, shown on the Pay page
  public_token text not null unique,
  pdf_path text,
  reported_at timestamptz,
  paid_at timestamptz,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoices_one_parent check ((booking_id is null) <> (mini_booking_id is null))
);
alter table public.invoices enable row level security;
create index if not exists invoices_booking_id_idx on public.invoices (booking_id);
create index if not exists invoices_mini_booking_id_idx on public.invoices (mini_booking_id);
create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoices_status_idx on public.invoices (status, due_at);

create policy invoices_select on public.invoices for select to authenticated
  using (public.is_owner() or client_id in (select public.my_client_ids()));
create policy invoices_insert on public.invoices for insert to authenticated with check (public.is_owner());
create policy invoices_update on public.invoices for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy invoices_delete on public.invoices for delete to authenticated using (public.is_owner());

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  method public.payment_method not null default 'etransfer',
  amount_cents bigint not null check (amount_cents > 0),
  received_at timestamptz not null default now(),
  note text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create index if not exists payments_invoice_id_idx on public.payments (invoice_id);
create index if not exists payments_recorded_by_idx on public.payments (recorded_by);
create index if not exists payments_received_at_idx on public.payments (received_at);

create policy payments_select on public.payments for select to authenticated using (
  public.is_owner() or exists (select 1 from public.invoices i where i.id = invoice_id and i.client_id in (select public.my_client_ids())));
create policy payments_insert on public.payments for insert to authenticated with check (public.is_owner());
create policy payments_update on public.payments for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy payments_delete on public.payments for delete to authenticated using (public.is_owner());

-- Mini-campaign covers are public too.
drop policy if exists media_select on public.media;
create policy media_select on public.media for select to anon, authenticated using (
  show_in_portfolio
  or mood_theme is not null
  or exists (select 1 from public.services s where s.cover_media_id = media.id)
  or exists (select 1 from public.packages p where p.cover_media_id = media.id)
  or exists (select 1 from public.mini_campaigns m where m.cover_media_id = media.id and m.status = 'live')
  or public.is_team()
);
