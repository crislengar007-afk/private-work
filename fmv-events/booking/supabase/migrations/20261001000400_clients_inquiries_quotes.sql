-- Clients, inquiries, versioned policies, quotes and quote lines.

do $$ begin
  create type public.inquiry_status as enum ('new', 'quoted', 'won', 'lost', 'spam');
  create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded');
  create type public.quote_line_kind as enum ('package', 'service', 'addon', 'travel', 'custom');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  phone_e164 text,
  user_id uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.clients enable row level security;
-- Dedupe on the normalized email, enforced by the database.
create unique index if not exists clients_email_normalized_key on public.clients (email_normalized);
create index if not exists clients_user_id_idx on public.clients (user_id);
create index if not exists clients_phone_idx on public.clients (phone_e164);

-- The client rows belonging to the signed-in user.
create or replace function public.my_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c where auth.uid() is not null and c.user_id = auth.uid()
$$;
grant execute on function public.my_client_ids() to authenticated, service_role;

-- Links the signed-in (magic-link verified) email to its client record.
create or replace function public.link_my_client_account()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null or auth.email() is null then return 0; end if;
  update public.clients set user_id = auth.uid()
   where email_normalized = lower(btrim(auth.email())) and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.link_my_client_account() from public, anon;
grant execute on function public.link_my_client_account() to authenticated, service_role;

create policy clients_select on public.clients for select to authenticated
  using (public.is_team() or user_id = auth.uid());
create policy clients_insert on public.clients for insert to authenticated with check (public.is_owner());
create policy clients_update on public.clients for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy clients_delete on public.clients for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- inquiries
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  event_type public.event_type not null,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  venue_name text,
  venue_address text,
  zone_id uuid references public.service_zones (id) on delete set null,
  guest_count int check (guest_count is null or guest_count >= 0),
  theme text,
  notes text,
  selection jsonb not null default '{}'::jsonb, -- {package_id?, service_ids[], addon_ids[], hours{}, qty{}}
  reference_paths text[] not null default '{}', -- private bucket object paths
  estimated_total_cents bigint,
  status public.inquiry_status not null default 'new',
  source text,
  created_at timestamptz not null default now()
);
alter table public.inquiries enable row level security;
create index if not exists inquiries_client_id_idx on public.inquiries (client_id);
create index if not exists inquiries_zone_id_idx on public.inquiries (zone_id);
create index if not exists inquiries_status_idx on public.inquiries (status, created_at desc);
create index if not exists inquiries_event_date_idx on public.inquiries (event_date);

create policy inquiries_select on public.inquiries for select to authenticated
  using (public.is_owner() or client_id in (select public.my_client_ids()));
-- Anonymous inquiries are created only by server actions (service role) after
-- zod + Turnstile + rate limiting. No direct anon inserts.
create policy inquiries_insert on public.inquiries for insert to authenticated with check (public.is_owner());
create policy inquiries_update on public.inquiries for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy inquiries_delete on public.inquiries for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- policies (business terms)
create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('deposit', 'balance', 'cancellation', 'reschedule', 'weather', 'damage', 'prints', 'travel', 'privacy')),
  title text not null,
  body_md text not null,
  version int not null default 1,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.policies enable row level security;

-- Every content change bumps the version; quotes keep a frozen snapshot.
create or replace function public.bump_policy_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body_md is distinct from old.body_md or new.title is distinct from old.title then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger policies_bump_version before update on public.policies
  for each row execute function public.bump_policy_version();

create policy policies_select on public.policies for select to anon, authenticated using (true);
create policy policies_insert on public.policies for insert to authenticated with check (public.is_owner());
create policy policies_update on public.policies for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy policies_delete on public.policies for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- quotes
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text unique,                         -- FMV-Q-2026-0001, assigned on send
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.quote_status not null default 'draft',
  public_token text not null unique,
  valid_until date,
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  tax_rate_bp int not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  deposit_pct int not null default 50 check (deposit_pct between 0 and 100),
  deposit_cents bigint not null default 0,
  notes_md text,
  policies_snapshot jsonb,
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_totals_consistent check (total_cents = subtotal_cents - discount_cents + tax_cents),
  constraint quotes_discount_le_subtotal check (discount_cents <= subtotal_cents)
);
alter table public.quotes enable row level security;
create index if not exists quotes_inquiry_id_idx on public.quotes (inquiry_id);
create index if not exists quotes_client_id_idx on public.quotes (client_id);
create index if not exists quotes_status_idx on public.quotes (status, created_at desc);
create trigger quotes_updated_at before update on public.quotes for each row execute function public.set_updated_at();

create policy quotes_select on public.quotes for select to authenticated
  using (public.is_owner() or (status <> 'draft' and client_id in (select public.my_client_ids())));
create policy quotes_insert on public.quotes for insert to authenticated with check (public.is_owner());
create policy quotes_update on public.quotes for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy quotes_delete on public.quotes for delete to authenticated using (public.is_owner());

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  kind public.quote_line_kind not null,
  ref_id uuid,
  description text not null,
  qty numeric(8,2) not null default 1 check (qty > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null,
  sort int not null default 0
);
alter table public.quote_lines enable row level security;
create index if not exists quote_lines_quote_id_idx on public.quote_lines (quote_id, sort);
create index if not exists quote_lines_ref_id_idx on public.quote_lines (ref_id);

create policy quote_lines_select on public.quote_lines for select to authenticated using (
  public.is_owner() or exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.status <> 'draft' and q.client_id in (select public.my_client_ids())));
create policy quote_lines_insert on public.quote_lines for insert to authenticated with check (public.is_owner());
create policy quote_lines_update on public.quote_lines for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy quote_lines_delete on public.quote_lines for delete to authenticated using (public.is_owner());
