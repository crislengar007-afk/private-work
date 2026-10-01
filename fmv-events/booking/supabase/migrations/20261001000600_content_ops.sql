-- Testimonials, general questions, document numbering, email templates/log,
-- audit log and rate limiting.

do $$ begin
  create type public.testimonial_source as enum ('site', 'facebook', 'google');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- testimonials
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_id uuid references public.clients (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  event_type public.event_type,
  quote text not null,
  rating int check (rating between 1 and 5),
  source public.testimonial_source not null default 'site',
  consent_to_publish boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint testimonials_publish_needs_consent check (not approved or consent_to_publish)
);
alter table public.testimonials enable row level security;
create index if not exists testimonials_client_id_idx on public.testimonials (client_id);
create index if not exists testimonials_booking_id_idx on public.testimonials (booking_id);
create policy testimonials_select on public.testimonials for select to anon, authenticated
  using ((approved and consent_to_publish) or public.is_owner());
create policy testimonials_insert on public.testimonials for insert to authenticated with check (public.is_owner());
create policy testimonials_update on public.testimonials for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy testimonials_delete on public.testimonials for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- general questions (Contact)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone_e164 text,
  body text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy messages_select on public.messages for select to authenticated using (public.is_owner());
create policy messages_insert on public.messages for insert to authenticated with check (public.is_owner());
create policy messages_update on public.messages for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy messages_delete on public.messages for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- numbering
create table if not exists public.doc_sequences (
  year int not null,
  kind text not null,
  last_value int not null default 0,
  primary key (year, kind)
);
alter table public.doc_sequences enable row level security;
create policy doc_sequences_select on public.doc_sequences for select to authenticated using (public.is_owner());
-- Writes happen only inside next_doc_number() (security definer).

-- kind: 'quote' -> FMV-Q-2026-0001, 'invoice' -> FMV-2026-0001, 'etransfer' -> FMV0042 (never resets).
create or replace function public.next_doc_number(p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  y int := extract(year from (now() at time zone 'America/Moncton'))::int;
  seq_year int;
  n int;
begin
  if p_kind not in ('quote', 'invoice', 'etransfer') then
    raise exception 'unknown document kind %', p_kind;
  end if;
  seq_year := case when p_kind = 'etransfer' then 0 else y end;
  insert into public.doc_sequences as d (year, kind, last_value) values (seq_year, p_kind, 1)
  on conflict (year, kind) do update set last_value = d.last_value + 1
  returning d.last_value into n;
  return case p_kind
    when 'quote' then format('FMV-Q-%s-%s', y, lpad(n::text, 4, '0'))
    when 'invoice' then format('FMV-%s-%s', y, lpad(n::text, 4, '0'))
    else format('FMV%s', lpad(n::text, 4, '0'))
  end;
end $$;
revoke execute on function public.next_doc_number(text) from public, anon, authenticated;
grant execute on function public.next_doc_number(text) to service_role;

-- ---------------------------------------------------------------- email
create table if not exists public.email_templates (
  key text primary key,
  description text not null,
  subject text not null,
  body_md text not null,
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
create trigger email_templates_updated_at before update on public.email_templates for each row execute function public.set_updated_at();
create policy email_templates_select on public.email_templates for select to authenticated using (public.is_owner());
create policy email_templates_insert on public.email_templates for insert to authenticated with check (public.is_owner());
create policy email_templates_update on public.email_templates for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy email_templates_delete on public.email_templates for delete to authenticated using (public.is_owner());

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  entity_type text,
  entity_id uuid,
  status text not null,          -- sent | failed | skipped
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.email_log enable row level security;
create index if not exists email_log_entity_idx on public.email_log (entity_type, entity_id);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
create policy email_log_select on public.email_log for select to authenticated using (public.is_owner());
-- Inserts come from server code (service role) only.

-- ---------------------------------------------------------------- audit
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_owner());

-- Records changes to prices, payments, settings and policies, whoever makes them.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  changed jsonb := '{}'::jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k <> 'updated_at' and (old_j -> k) is distinct from (new_j -> k) then
        changed := changed || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
      end if;
    end loop;
    if changed = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    changed := new_j;
  else
    changed := old_j;
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(new_j ->> 'id', old_j ->> 'id', new_j ->> 'key', old_j ->> 'key'), changed);
  return coalesce(new, old);
end $$;

create trigger audit_settings after update on public.settings for each row execute function public.audit_row_change();
create trigger audit_policies after insert or update or delete on public.policies for each row execute function public.audit_row_change();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.audit_row_change();
create trigger audit_services_price after update of price_cents, price_mode, status on public.services for each row execute function public.audit_row_change();
create trigger audit_packages_price after update of price_cents, status on public.packages for each row execute function public.audit_row_change();
create trigger audit_addons_price after update of price_cents, price_mode, status on public.addons for each row execute function public.audit_row_change();
create trigger audit_minis_price after update of price_cents, status on public.mini_campaigns for each row execute function public.audit_row_change();
create trigger audit_zones_fee after update of travel_fee_cents on public.service_zones for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------- rate limiting
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
create policy rate_limits_select on public.rate_limits for select to authenticated using (public.is_owner());

-- Fixed-window limiter. Returns true when the call is allowed.
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return n <= p_max;
end $$;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
