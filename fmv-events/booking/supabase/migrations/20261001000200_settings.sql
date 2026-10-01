-- Business settings: one row (id = 1). The single source of truth for contact
-- details, deposit/hold rules and tax. Anonymous visitors never read this table
-- directly; public_settings() exposes the public contact fields only.

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'FMV Events & Photography',
  owner_name text not null default 'Marie Valenciano',
  phone_e164 text,            -- [BLOCKER] owner confirms the correct number
  email text,
  reply_to_email text,
  whatsapp_e164 text,
  messenger_url text,
  facebook_url text,
  instagram_url text,
  address_line text,
  city text not null default 'Fredericton',
  province text not null default 'NB',
  postal_code text,
  hours_text text,
  timezone text not null default 'America/Moncton',
  currency text not null default 'CAD' check (currency = 'CAD'),
  etransfer_email text,       -- shown only on the token-gated Pay page
  etransfer_autodeposit boolean not null default false,
  deposit_pct int not null default 50 check (deposit_pct between 0 and 100),
  hold_hours int not null default 48 check (hold_hours between 1 and 720),
  balance_due_days_before_event int not null default 7 check (balance_due_days_before_event >= 0),
  quote_valid_days int not null default 7 check (quote_valid_days between 1 and 90),
  tax_enabled boolean not null default false,
  tax_rate_bp int not null default 1500 check (tax_rate_bp between 0 and 5000),
  hst_number text,
  google_review_url text,
  facebook_review_url text,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

create policy settings_select on public.settings
  for select to authenticated using (public.is_owner());
create policy settings_update on public.settings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
-- No insert/delete policies: the singleton row is created below and never removed.

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Public contact fields only. Never returns etransfer_email or tax internals.
create or replace function public.public_settings()
returns table (
  business_name text, owner_name text, phone_e164 text, email text,
  whatsapp_e164 text, messenger_url text, facebook_url text, instagram_url text,
  address_line text, city text, province text, postal_code text, hours_text text,
  timezone text, currency text, deposit_pct int, hold_hours int,
  balance_due_days_before_event int, tax_enabled boolean, tax_rate_bp int,
  google_review_url text, facebook_review_url text
)
language sql stable security definer set search_path = '' as $$
  select s.business_name, s.owner_name, s.phone_e164, s.email,
         s.whatsapp_e164, s.messenger_url, s.facebook_url, s.instagram_url,
         s.address_line, s.city, s.province, s.postal_code, s.hours_text,
         s.timezone, s.currency, s.deposit_pct, s.hold_hours,
         s.balance_due_days_before_event, s.tax_enabled, s.tax_rate_bp,
         s.google_review_url, s.facebook_review_url
  from public.settings s where s.id = 1
$$;
grant execute on function public.public_settings() to anon, authenticated, service_role;
