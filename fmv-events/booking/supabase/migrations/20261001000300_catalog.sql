-- Catalog: categories, media, services, packages, add-ons, inventory, zones, blackouts.
-- Intentionally public (anon select): active+public services, active packages and
-- their items, active add-ons, zones, categories, portfolio/cover/mood-board media.

do $$ begin
  create type public.inventory_kind as enum ('mirror_booth', 'booth_360', 'video_guestbook', 'arch', 'table_set', 'staff', 'other');
  create type public.media_kind as enum ('photo', 'video');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- categories
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort int not null default 0
);
alter table public.service_categories enable row level security;
create policy service_categories_select on public.service_categories for select to anon, authenticated using (true);
create policy service_categories_insert on public.service_categories for insert to authenticated with check (public.is_owner());
create policy service_categories_update on public.service_categories for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy service_categories_delete on public.service_categories for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- media
-- Hard rule: AI-generated media can never be shown as portfolio (real work only).
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  kind public.media_kind not null default 'photo',
  alt_text text not null default '',
  width int,
  height int,
  category_id uuid references public.service_categories (id) on delete set null,
  event_type public.event_type,
  caption text,
  taken_on date,
  is_ai_generated boolean not null default false,
  show_in_portfolio boolean not null default false,
  mood_theme text,            -- set only on AI concept boards ("Concept inspiration, not a past FMV event")
  is_before_after_pair_id uuid,
  before_after_role text check (before_after_role in ('before', 'after')),
  featured boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint media_ai_never_portfolio check (not (is_ai_generated and show_in_portfolio)),
  constraint media_ai_never_featured check (not (is_ai_generated and featured)),
  constraint media_mood_board_is_ai check (mood_theme is null or is_ai_generated)
);
alter table public.media enable row level security;
create index if not exists media_category_id_idx on public.media (category_id);
create index if not exists media_portfolio_idx on public.media (show_in_portfolio, featured, sort) where show_in_portfolio;
create index if not exists media_pair_idx on public.media (is_before_after_pair_id);

-- ---------------------------------------------------------------- services
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id),
  slug text not null unique,
  name text not null,
  short_desc text,
  long_desc_md text,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  price_mode public.price_mode not null default 'flat',
  min_hours numeric(5,2),
  included_hours numeric(5,2),
  status public.catalog_status not null default 'draft',
  is_public boolean not null default true,
  sort int not null default 0,
  cover_media_id uuid references public.media (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- An active service must have a price, so nothing "active" ever shows without one.
  constraint services_active_needs_price check (status <> 'active' or price_cents is not null)
);
alter table public.services enable row level security;
create index if not exists services_category_id_idx on public.services (category_id);
create index if not exists services_cover_media_id_idx on public.services (cover_media_id);
create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();

create policy services_select on public.services for select to anon, authenticated
  using ((status = 'active' and is_public) or public.is_team());
create policy services_insert on public.services for insert to authenticated with check (public.is_owner());
create policy services_update on public.services for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy services_delete on public.services for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- packages
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  event_type public.event_type not null default 'other',
  description_md text,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  status public.package_status not null default 'draft',
  sort int not null default 0,
  cover_media_id uuid references public.media (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint packages_active_needs_price check (status <> 'active' or price_cents is not null)
);
alter table public.packages enable row level security;
create index if not exists packages_cover_media_id_idx on public.packages (cover_media_id);
create trigger packages_updated_at before update on public.packages for each row execute function public.set_updated_at();

create policy packages_select on public.packages for select to anon, authenticated
  using (status = 'active' or public.is_team());
create policy packages_insert on public.packages for insert to authenticated with check (public.is_owner());
create policy packages_update on public.packages for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy packages_delete on public.packages for delete to authenticated using (public.is_owner());

create table if not exists public.package_items (
  package_id uuid not null references public.packages (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  qty numeric(6,2) not null default 1 check (qty > 0),
  primary key (package_id, service_id)
);
alter table public.package_items enable row level security;
create index if not exists package_items_service_id_idx on public.package_items (service_id);

create policy package_items_select on public.package_items for select to anon, authenticated
  using (exists (select 1 from public.packages p where p.id = package_id and (p.status = 'active' or public.is_team())));
create policy package_items_insert on public.package_items for insert to authenticated with check (public.is_owner());
create policy package_items_update on public.package_items for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy package_items_delete on public.package_items for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- add-ons
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  price_mode public.price_mode not null default 'flat',
  status public.catalog_status not null default 'needs_price',
  applies_to_category_ids uuid[] not null default '{}',
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  constraint addons_active_needs_price check (status <> 'active' or price_cents is not null)
);
alter table public.addons enable row level security;
create trigger addons_updated_at before update on public.addons for each row execute function public.set_updated_at();

create policy addons_select on public.addons for select to anon, authenticated
  using (status = 'active' or public.is_team());
create policy addons_insert on public.addons for insert to authenticated with check (public.is_owner());
create policy addons_update on public.addons for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy addons_delete on public.addons for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- inventory
-- 'staff' rows model people (e.g. "Marie", units_owned = 1) so she can't be
-- double-booked across events for coordination/photography/styling.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.inventory_kind not null,
  units_owned int not null default 1 check (units_owned >= 0),
  buffer_before_min int not null default 90 check (buffer_before_min >= 0),
  buffer_after_min int not null default 60 check (buffer_after_min >= 0),
  notes text
);
alter table public.inventory_items enable row level security;
create policy inventory_items_select on public.inventory_items for select to authenticated using (public.is_team());
create policy inventory_items_insert on public.inventory_items for insert to authenticated with check (public.is_owner());
create policy inventory_items_update on public.inventory_items for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy inventory_items_delete on public.inventory_items for delete to authenticated using (public.is_owner());

create table if not exists public.service_inventory (
  service_id uuid not null references public.services (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  qty int not null default 1 check (qty > 0),
  primary key (service_id, inventory_item_id)
);
alter table public.service_inventory enable row level security;
create index if not exists service_inventory_item_idx on public.service_inventory (inventory_item_id);
create policy service_inventory_select on public.service_inventory for select to authenticated using (public.is_team());
create policy service_inventory_insert on public.service_inventory for insert to authenticated with check (public.is_owner());
create policy service_inventory_update on public.service_inventory for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy service_inventory_delete on public.service_inventory for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- zones & blackouts
create table if not exists public.service_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  travel_fee_cents bigint check (travel_fee_cents is null or travel_fee_cents >= 0), -- [OWNER TO CONFIRM]
  sort int not null default 0
);
alter table public.service_zones enable row level security;
create policy service_zones_select on public.service_zones for select to anon, authenticated using (true);
create policy service_zones_insert on public.service_zones for insert to authenticated with check (public.is_owner());
create policy service_zones_update on public.service_zones for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy service_zones_delete on public.service_zones for delete to authenticated using (public.is_owner());

create table if not exists public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  reason text
);
alter table public.blackout_dates enable row level security;
create policy blackout_dates_select on public.blackout_dates for select to authenticated using (public.is_team());
create policy blackout_dates_insert on public.blackout_dates for insert to authenticated with check (public.is_owner());
create policy blackout_dates_update on public.blackout_dates for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy blackout_dates_delete on public.blackout_dates for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- media policies
-- Public: portfolio items, anything used as a cover, and labelled AI concept boards.
create policy media_select on public.media for select to anon, authenticated using (
  show_in_portfolio
  or mood_theme is not null
  or exists (select 1 from public.services s where s.cover_media_id = media.id)
  or exists (select 1 from public.packages p where p.cover_media_id = media.id)
  or public.is_team()
);
create policy media_insert on public.media for insert to authenticated with check (public.is_owner());
create policy media_update on public.media for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy media_delete on public.media for delete to authenticated using (public.is_owner());
