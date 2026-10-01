-- Foundation: extensions, shared enums, staff roles and the role helper every policy uses.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.app_role as enum ('owner', 'staff');
  create type public.event_type as enum ('wedding', 'birthday', 'baby_shower', 'corporate', 'graduation', 'other');
  create type public.price_mode as enum ('flat', 'per_hour', 'per_item', 'from');
  create type public.catalog_status as enum ('draft', 'needs_price', 'active', 'archived');
  create type public.package_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- staff roles
-- Owner and staff accounts. Anyone signed in without a row here is a client.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;

-- auth_role(): 'owner' | 'staff' | 'client' | 'anon'.
-- Owner/staff powers require an MFA-verified session (aal2); without it the
-- account is treated like a client, so a stolen password alone opens nothing.
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'anon'
    when (auth.jwt() ->> 'aal') = 'aal2' then coalesce(
      (select r.role::text from public.user_roles r where r.user_id = auth.uid()),
      'client')
    else 'client'
  end
$$;

create or replace function public.is_owner()
returns boolean language sql stable set search_path = '' as $$
  select public.auth_role() = 'owner'
$$;

create or replace function public.is_team()
returns boolean language sql stable set search_path = '' as $$
  select public.auth_role() in ('owner', 'staff')
$$;

grant execute on function public.auth_role(), public.is_owner(), public.is_team() to anon, authenticated, service_role;

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_owner());
create policy user_roles_insert on public.user_roles
  for insert to authenticated with check (public.is_owner());
create policy user_roles_update on public.user_roles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy user_roles_delete on public.user_roles
  for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- shared trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
