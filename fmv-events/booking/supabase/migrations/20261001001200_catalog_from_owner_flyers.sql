-- Catalog, travel, delivery and contact details from FMV's own price flyers
-- (supplied by the owner on 2026-10-01). These supersede the Schedulista seed
-- where the two disagree. Everything stays editable in the admin.
--
-- Flyers used: Birthday Photography, Engagement Photography, Wedding & Engagement
-- Photography, Wedding Photography, Wedding Coordination, Mirror Photobooth,
-- Magazine Photobox, "Our offerings", Wedding Proposal Set Up.

-- ---------------------------------------------------------------- contact
-- 506-471-4367 is the number on the general "Contact us", coordination, booth and
-- proposal flyers (and the WhatsApp "Message" line); the Schedulista 506-471-6367
-- appears on none of them. Owner decision (2026-10-01): 506-471-4367 is the one
-- public number; the 506-262-0810 on the photography flyers is not shown.
update public.settings set
  phone_e164 = coalesce(phone_e164, '+15064714367'),
  whatsapp_e164 = coalesce(whatsapp_e164, '+15064714367'),
  email = coalesce(email, 'fmvphotography.2019@gmail.com'),
  facebook_url = coalesce(facebook_url, 'https://www.facebook.com/share/1Ehm1jUWz6/')
where id = 1;

-- ---------------------------------------------------------------- retire superseded seed services
-- Flyer tiers replace the hourly outdoor wedding photography ($150/hr) and the
-- single $450 mirror booth listing. Archived (not deleted): draft packages and
-- any history may still reference them.
update public.services set status = 'archived', is_public = false
 where slug in ('wedding-photography-outdoor', 'mirror-photobooth');

-- ---------------------------------------------------------------- photography tiers (Marie)
insert into public.services (category_id, slug, name, short_desc, price_cents, price_mode, included_hours, status, is_public, sort)
select c.id, v.slug, v.name, v.short_desc, v.price_cents, 'flat', v.hours, 'active', true, v.sort
from (values
  ('wedding-photo-sapphire', 'Wedding Photography: Sapphire', '2 hours coverage. Unlimited shots, edited digital photos (all the good ones, no selection round).', 40000::bigint, 2::numeric, 11),
  ('wedding-photo-garnet', 'Wedding Photography: Garnet', '3 hours coverage. Unlimited shots, edited digital photos (all the good ones, no selection round).', 70000, 3, 12),
  ('wedding-photo-emerald', 'Wedding Photography: Emerald', '5 to 6 hours coverage. Unlimited shots, edited digital photos (all the good ones, no selection round).', 100000, 6, 13),
  ('engagement-photo-sapphire', 'Engagement Photography: Sapphire', '1 hour session, 1 location, 1 dress. Unlimited shots, edited digital photos.', 30000, 1, 14),
  ('engagement-photo-garnet', 'Engagement Photography: Garnet', '2 hour session, 1 location, 2 dresses. Unlimited shots, edited digital photos.', 45000, 2, 15),
  ('engagement-photo-emerald', 'Engagement Photography: Emerald', '3 hour session, 2 locations, 3 dresses. Unlimited shots, edited digital photos.', 60000, 3, 16),
  ('birthday-photo-sapphire', 'Birthday Photography: Sapphire', '2 hours coverage. Unlimited shots, edited digital photos (all the good ones, no selection round).', 30000, 2, 17),
  ('birthday-photo-garnet', 'Birthday Photography: Garnet', '3 hours coverage. Unlimited shots, edited digital photos (all the good ones, no selection round).', 45000, 3, 18)
) as v(slug, name, short_desc, price_cents, hours, sort)
join public.service_categories c on c.slug = 'photography'
on conflict (slug) do update set
  name = excluded.name, short_desc = excluded.short_desc, price_cents = excluded.price_cents,
  price_mode = excluded.price_mode, included_hours = excluded.included_hours, status = 'active', is_public = true;

-- ---------------------------------------------------------------- coordination tiers (Marie)
update public.services set
  name = 'Wedding Coordination: Sapphire (half day)',
  short_desc = '4 hours of wedding-day support.',
  price_cents = 40000, price_mode = 'flat', included_hours = 4, status = 'active', is_public = true
where slug = 'wedding-coordination';

insert into public.services (category_id, slug, name, short_desc, price_cents, price_mode, included_hours, status, is_public, sort)
select c.id, v.slug, v.name, v.short_desc, v.price_cents, v.mode::public.price_mode, v.hours, 'active', true, v.sort
from (values
  ('wedding-coordination-garnet', 'Wedding Coordination: Garnet (full day)', 'Up to 8 hours of personalized assistance, support from start to finish.', 80000::bigint, 'flat', 8::numeric, 21),
  ('wedding-coordination-emerald', 'Wedding Coordination: Emerald', 'Coordination over the weeks or month before your wedding. Final price confirmed in your quote.', 150000, 'from', null, 22)
) as v(slug, name, short_desc, price_cents, mode, hours, sort)
join public.service_categories c on c.slug = 'coordination'
on conflict (slug) do update set
  name = excluded.name, short_desc = excluded.short_desc, price_cents = excluded.price_cents,
  price_mode = excluded.price_mode, included_hours = excluded.included_hours, status = 'active', is_public = true;

-- ---------------------------------------------------------------- styling extras
-- Proposal setups have no published price yet: kept out of public view until priced.
insert into public.services (category_id, slug, name, short_desc, price_cents, price_mode, status, is_public, sort)
select c.id, 'proposal-setup', 'Wedding Proposal Setup', 'A unique, memorable proposal setup: florals, signage, candles and balloons.', null, 'from', 'needs_price', true, 30
from public.service_categories c where c.slug = 'styling'
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- mirror photobooth tiers
insert into public.services (category_id, slug, name, short_desc, price_cents, price_mode, included_hours, status, is_public, sort)
select c.id, v.slug, v.name, v.short_desc, v.price_cents, 'flat', v.hours, 'active', true, v.sort
from (values
  ('mirror-booth-garnet', 'Mirror Photobooth: Garnet', '2 hours. Standard vinyl backdrop and props, customized template, attendant, delivery within 30 km, unlimited online printouts with GIF. Add 4x6 printouts for $100.', 35000::bigint, 2::numeric, 41),
  ('mirror-booth-sapphire', 'Mirror Photobooth: Sapphire', '2 hours. Premium backdrop and props, customized template, attendant, delivery within 30 km, unlimited online printouts with GIF. Add 4x6 printouts (max 100) for $100.', 40000, 2, 42),
  ('mirror-booth-emerald', 'Mirror Photobooth: Emerald', '3 hours. Premium backdrop and props, attendant, customized template, delivery within 30 km, unlimited online printouts with GIF, video guest book included. Add 4x6 printouts (max 100) for $100.', 60000, 3, 43)
) as v(slug, name, short_desc, price_cents, hours, sort)
join public.service_categories c on c.slug = 'rentals'
on conflict (slug) do update set
  name = excluded.name, short_desc = excluded.short_desc, price_cents = excluded.price_cents,
  price_mode = excluded.price_mode, included_hours = excluded.included_hours, status = 'active', is_public = true;

-- ---------------------------------------------------------------- magazine photobox (new, bookings from November 2026)
insert into public.inventory_items (name, kind, units_owned, notes)
select 'Magazine Photobox', 'other', 1, 'Accommodates 5 to 7 people. Owner to confirm number of units.'
where not exists (select 1 from public.inventory_items where name = 'Magazine Photobox');

insert into public.services (category_id, slug, name, short_desc, price_cents, price_mode, included_hours, status, is_public, sort)
select c.id, v.slug, v.name, v.short_desc, v.price_cents, 'flat', v.hours, 'active', true, v.sort
from (values
  ('magazine-photobox-sapphire', 'Magazine Photobox: Sapphire', 'New, bookings from November 2026. 2 hours, self-serve. Fits 5 to 7 people, 3 custom magazine-cover wordings, personalized names, basic props, pickup and return in Fredericton.', 29900::bigint, 2::numeric, 44),
  ('magazine-photobox-garnet', 'Magazine Photobox: Garnet', 'New, bookings from November 2026. 3 hours with 1 attendant, setup and teardown. Fits 5 to 7 people, 4 to 5 custom wordings, personalized names, premium props. No digital photos or printouts.', 39900, 3, 45)
) as v(slug, name, short_desc, price_cents, hours, sort)
join public.service_categories c on c.slug = 'rentals'
on conflict (slug) do update set
  name = excluded.name, short_desc = excluded.short_desc, price_cents = excluded.price_cents,
  included_hours = excluded.included_hours, status = 'active', is_public = true;

-- ---------------------------------------------------------------- inventory links
insert into public.service_inventory (service_id, inventory_item_id, qty)
select s.id, i.id, 1
from (values
  ('wedding-photo-sapphire', 'Marie'), ('wedding-photo-garnet', 'Marie'), ('wedding-photo-emerald', 'Marie'),
  ('engagement-photo-sapphire', 'Marie'), ('engagement-photo-garnet', 'Marie'), ('engagement-photo-emerald', 'Marie'),
  ('birthday-photo-sapphire', 'Marie'), ('birthday-photo-garnet', 'Marie'),
  ('wedding-coordination-garnet', 'Marie'), ('wedding-coordination-emerald', 'Marie'),
  ('proposal-setup', 'Marie'),
  ('mirror-booth-garnet', 'Mirror Photobooth'), ('mirror-booth-sapphire', 'Mirror Photobooth'), ('mirror-booth-emerald', 'Mirror Photobooth'),
  ('mirror-booth-emerald', 'Video Guestbook'),
  ('magazine-photobox-sapphire', 'Magazine Photobox'), ('magazine-photobox-garnet', 'Magazine Photobox')
) as v(service_slug, item_name)
join public.services s on s.slug = v.service_slug
join public.inventory_items i on i.name = v.item_name
on conflict do nothing;

-- ---------------------------------------------------------------- wedding + engagement bundles
insert into public.packages (slug, name, event_type, description_md, price_cents, status, sort) values
  ('wedding-engagement-sapphire', 'Wedding & Engagement: Sapphire', 'wedding',
   'Perfect for intimate moments. 2 hours of wedding coverage plus a 1 hour engagement session (1 location, 2 dresses). Unlimited shots and edited digital photos.', 65000, 'active', 11),
  ('wedding-engagement-garnet', 'Wedding & Engagement: Garnet', 'wedding',
   'The perfect balance. 3 hours of wedding coverage plus a 1 hour engagement session (1 location, 2 dresses). Unlimited shots and edited digital photos.', 95000, 'active', 12),
  ('wedding-engagement-emerald', 'Wedding & Engagement: Emerald', 'wedding',
   'Complete coverage, every moment. 5 hours of wedding coverage plus a 1 hour engagement session (1 location, 2 dresses). Unlimited shots and edited digital photos.', 125000, 'active', 13)
on conflict (slug) do nothing;

insert into public.package_items (package_id, service_id, qty)
select p.id, s.id, 1
from (values
  ('wedding-engagement-sapphire', 'wedding-photo-sapphire'), ('wedding-engagement-sapphire', 'engagement-photo-sapphire'),
  ('wedding-engagement-garnet', 'wedding-photo-garnet'), ('wedding-engagement-garnet', 'engagement-photo-sapphire'),
  ('wedding-engagement-emerald', 'wedding-photo-emerald'), ('wedding-engagement-emerald', 'engagement-photo-sapphire')
) as v(pkg, svc)
join public.packages p on p.slug = v.pkg
join public.services s on s.slug = v.svc
on conflict do nothing;

-- ---------------------------------------------------------------- add-ons with published prices
update public.addons set price_cents = 10000, price_mode = 'flat', status = 'active',
  description = '4x6 prints from the mirror photobooth (max 100 prints).'
where slug = 'booth-printouts';

insert into public.addons (slug, name, description, price_cents, price_mode, status, applies_to_category_ids, sort)
select v.slug, v.name, v.description, v.price_cents, v.mode::public.price_mode, 'active',
       coalesce((select array_agg(c.id) from public.service_categories c where c.slug = any (v.cats)), '{}'), v.sort
from (values
  ('save-the-date-video', 'Save-the-date video (3 min)', 'A 3 minute save-the-date video, added to an engagement or wedding package.', 30000::bigint, 'flat', array['photography'], 10),
  ('luxury-backdrop', 'Luxury backdrop upgrade', 'Upgrade to a flower wall or themed drape curtains.', 7500, 'flat', array['rentals', 'styling'], 11),
  ('video-guestbook-with-booth', 'Video guest book (with a photobooth)', 'Add the video guest book to a photobooth rental.', 7500, 'flat', array['rentals'], 12),
  ('extra-hour-mirror-booth', 'Extra hour: Mirror Photobooth', 'Each additional hour of mirror photobooth time.', 9000, 'per_hour', array['rentals'], 13),
  ('extra-hour-magazine-photobox', 'Extra hour: Magazine Photobox', 'Each additional hour of Magazine Photobox time.', 7500, 'per_hour', array['rentals'], 14)
) as v(slug, name, description, price_cents, mode, cats, sort)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- travel
update public.service_zones set
  description = '$0.50 per km outside Fredericton (photo booths: delivery within 30 km included). Confirmed in your quote.'
where name = 'Outside Fredericton';

-- ---------------------------------------------------------------- policies (bumps their versions)
update public.policies set body_md =
  'Your edited digital photos are delivered through an online gallery and are included: we deliver all the good ones, so there is no selection round. Delivery is 2 to 3 weeks after your event (wedding photography: 3 weeks; birthdays: 2 weeks). Printed photos and albums are available as add-ons.' || E'\n\n' ||
  'With your permission we may share a small selection (about 5 to 20 photos) on the FMV Facebook page. This is optional: just tell us if you would rather we did not.'
where key = 'prints';

update public.policies set body_md =
  'Travel is included within Fredericton. Outside Fredericton a travel charge of $0.50 per km applies. Photo booth rentals include delivery within 30 km. Any travel charge is shown in your quote.'
where key = 'travel';
