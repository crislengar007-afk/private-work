-- Clients keep seeing their own mini-session slot and campaign (time, location)
-- in the portal after the campaign closes. Security-definer helpers avoid RLS
-- recursion between mini_campaigns <-> mini_slots <-> mini_bookings.

create or replace function public.my_mini_slot_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select b.slot_id from public.mini_bookings b
   where b.client_id in (select public.my_client_ids())
$$;

create or replace function public.my_mini_campaign_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.campaign_id from public.mini_slots s
   where s.id in (select public.my_mini_slot_ids())
$$;

-- Granted to anon too: the policies reference them; they return nothing without a signed-in user.
grant execute on function public.my_mini_slot_ids(), public.my_mini_campaign_ids() to anon, authenticated, service_role;

drop policy if exists mini_slots_select on public.mini_slots;
create policy mini_slots_select on public.mini_slots for select to anon, authenticated using (
  public.is_team()
  or exists (select 1 from public.mini_campaigns c where c.id = campaign_id and c.status = 'live')
  or (auth.uid() is not null and id in (select public.my_mini_slot_ids()))
);

drop policy if exists mini_campaigns_select on public.mini_campaigns;
create policy mini_campaigns_select on public.mini_campaigns for select to anon, authenticated using (
  status = 'live'
  or public.is_team()
  or (auth.uid() is not null and id in (select public.my_mini_campaign_ids()))
);
