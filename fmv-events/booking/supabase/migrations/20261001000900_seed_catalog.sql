-- Seed data from the live Schedulista page as checked 2026-10-02 (spec §3, §7).
-- Prices in CAD cents. The owner edits everything here from the admin afterwards.
-- Nothing here invents a business fact: unknown prices stay NULL (needs_price),
-- packages stay draft until the owner sets a bundle price, contact details stay
-- empty until confirmed.

-- ---------------------------------------------------------------- categories
insert into public.service_categories (slug, name, sort) values
  ('photography', 'Photography', 1),
  ('minis', 'Mini Sessions', 2),
  ('coordination', 'Coordination', 3),
  ('styling', 'Décor & Styling', 4),
  ('rentals', 'Photo Booths & Rentals', 5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- services
insert into public.services (category_id, slug, name, short_desc, price_cents, price_mode, min_hours, included_hours, status, sort)
select c.id, v.slug, v.name, v.short_desc, v.price_cents, v.price_mode::public.price_mode, v.min_hours, v.included_hours, 'active', v.sort
from (values
  ('photography', 'wedding-photography-outdoor', 'Wedding Photography (Outdoor)',
     'Outdoor wedding coverage, booked by the hour (1 hour minimum). Digital photos included via an online gallery.',
     15000::bigint, 'per_hour', 1::numeric, null::numeric, 1),
  ('minis', 'mini-session', 'Mini Session',
     'A short, relaxed photo session. Digital photos included via an online gallery.',
     5000, 'flat', null, null, 2),
  ('coordination', 'wedding-coordination', 'Wedding Coordination',
     'Timeline management and vendor coordination so you can enjoy the day.',
     40000, 'flat', null, null, 3),
  ('styling', 'wedding-setup-styling', 'Wedding Setup & Styling',
     'Ceremony backdrops and arches, florals, table styling and décor, including setup and teardown.',
     50000, 'flat', null, null, 4),
  ('styling', 'balloon-decor', 'Balloon Décor Setup',
     'Themed balloon décor for birthdays, showers and celebrations. Final price depends on size and design.',
     18000, 'from', null, null, 5),
  ('rentals', 'mirror-photobooth', 'Mirror Photobooth',
     'Mirror photo booth, 2-hour rental.',
     45000, 'flat', null, 2, 6),
  ('rentals', 'photobooth-360', '360 Photobooth',
     '360 video booth, 2-hour rental. Digital video delivery.',
     40000, 'flat', null, 2, 7),
  ('rentals', 'video-guestbook', 'Video Guestbook',
     'Guests record video messages for you to keep.',
     10000, 'flat', null, null, 8),
  ('rentals', 'wedding-arch', 'Wedding Arch',
     'Wedding arch rental.',
     15000, 'flat', null, null, 9),
  ('rentals', 'event-table-setup', 'Event Table Setup',
     'Priced per item. Tell us which table rentals you need.',
     1500, 'per_item', null, null, 10)
) as v(cat, slug, name, short_desc, price_cents, price_mode, min_hours, included_hours, sort)
join public.service_categories c on c.slug = v.cat
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- add-ons (unpriced: hidden until the owner prices them)
insert into public.addons (slug, name, description, price_cents, price_mode, status, applies_to_category_ids, sort)
select v.slug, v.name, v.description, null, v.price_mode::public.price_mode, 'needs_price',
       coalesce((select array_agg(c.id) from public.service_categories c where c.slug = any (v.cats)), '{}'), v.sort
from (values
  ('printed-photos', 'Printed photos (hard copies)', 'Professional prints of your favourite images.', 'per_item', array['photography', 'minis'], 1),
  ('photo-album', 'Photo album', 'A printed album of your event.', 'flat', array['photography'], 2),
  ('extra-photography-hour', 'Extra photography hour', 'Add more coverage time.', 'per_hour', array['photography'], 3),
  ('extra-booth-hour', 'Extra booth hour', 'Keep the booth running longer.', 'per_hour', array['rentals'], 4),
  ('booth-printouts', 'Booth printouts', 'Instant prints from the photo booth.', 'flat', array['rentals'], 5),
  ('custom-backdrop-signage', 'Custom backdrop / signage', 'Personalised backdrop or signage for your event or brand.', 'flat', array['rentals', 'styling'], 6),
  ('balloon-garland-upgrade', 'Balloon garland upgrade', 'A fuller or longer balloon garland.', 'flat', array['styling'], 7),
  ('rush-delivery', 'Rush photo delivery', 'Get your gallery sooner.', 'flat', array['photography', 'minis'], 8)
) as v(slug, name, description, price_mode, cats, sort)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- inventory  [OWNER TO CONFIRM unit counts & buffers]
insert into public.inventory_items (name, kind, units_owned, notes)
select v.name, v.kind::public.inventory_kind, 1, v.notes
from (values
  ('Mirror Photobooth', 'mirror_booth', 'Owner to confirm number of units.'),
  ('360 Photobooth', 'booth_360', 'Owner to confirm number of units.'),
  ('Video Guestbook', 'video_guestbook', 'Owner to confirm number of units.'),
  ('Wedding Arch', 'arch', 'Owner to confirm number of units.'),
  ('Marie', 'staff', 'Lead photographer / coordinator / stylist. One event at a time.')
) as v(name, kind, notes)
where not exists (select 1 from public.inventory_items i where i.name = v.name);

insert into public.service_inventory (service_id, inventory_item_id, qty)
select s.id, i.id, 1
from (values
  ('wedding-photography-outdoor', 'Marie'),
  ('wedding-coordination', 'Marie'),
  ('wedding-setup-styling', 'Marie'),
  ('balloon-decor', 'Marie'),
  ('mirror-photobooth', 'Mirror Photobooth'),
  ('photobooth-360', '360 Photobooth'),
  ('video-guestbook', 'Video Guestbook'),
  ('wedding-arch', 'Wedding Arch')
) as v(service_slug, item_name)
join public.services s on s.slug = v.service_slug
join public.inventory_items i on i.name = v.item_name
on conflict do nothing;

-- ---------------------------------------------------------------- packages (draft until the owner sets a bundle price)
insert into public.packages (slug, name, event_type, description_md, price_cents, status, sort) values
  ('wedding-essentials', 'Wedding Essentials', 'wedding',
   'Outdoor wedding photography (2 hours) and the wedding arch.', null, 'draft', 1),
  ('wedding-styled', 'Wedding Styled', 'wedding',
   'Setup & styling, outdoor wedding photography (2 hours) and a video guestbook.', null, 'draft', 2),
  ('wedding-full-service', 'Wedding Full Service', 'wedding',
   'Coordination, setup & styling, outdoor wedding photography (2 hours) and the mirror photobooth (2 hours).', null, 'draft', 3),
  ('celebration', 'Celebration', 'birthday',
   'For birthdays and showers: balloon décor setup and the 360 photobooth (2 hours).', null, 'draft', 4),
  ('corporate-booth', 'Corporate Booth', 'corporate',
   'A mirror or 360 photobooth with custom backdrop / branding (add-on).', null, 'draft', 5)
on conflict (slug) do nothing;

insert into public.package_items (package_id, service_id, qty)
select p.id, s.id, v.qty
from (values
  ('wedding-essentials', 'wedding-photography-outdoor', 2::numeric),
  ('wedding-essentials', 'wedding-arch', 1),
  ('wedding-styled', 'wedding-setup-styling', 1),
  ('wedding-styled', 'wedding-photography-outdoor', 2),
  ('wedding-styled', 'video-guestbook', 1),
  ('wedding-full-service', 'wedding-coordination', 1),
  ('wedding-full-service', 'wedding-setup-styling', 1),
  ('wedding-full-service', 'wedding-photography-outdoor', 2),
  ('wedding-full-service', 'mirror-photobooth', 1),
  ('celebration', 'balloon-decor', 1),
  ('celebration', 'photobooth-360', 1),
  ('corporate-booth', 'mirror-photobooth', 1)
) as v(pkg, svc, qty)
join public.packages p on p.slug = v.pkg
join public.services s on s.slug = v.svc
on conflict do nothing;

-- ---------------------------------------------------------------- zones  [OWNER TO CONFIRM]
insert into public.service_zones (name, description, travel_fee_cents, sort)
select v.name, v.description, v.fee, v.sort
from (values
  ('Fredericton', 'Travel included within Fredericton.', 0::bigint, 1),
  ('Outside Fredericton', 'Travel fee confirmed in your quote.', null, 2)
) as v(name, description, fee, sort)
where not exists (select 1 from public.service_zones z where z.name = v.name);

-- ---------------------------------------------------------------- mini campaigns (draft; owner sets real dates & slots)
insert into public.mini_campaigns (slug, name, season, description_md, price_cents, duration_min, payment_mode, status) values
  ('fall-minis-2026', 'Fall Mini Sessions', 'Fall 2026', '20-minute outdoor fall mini session. Digital photos included.', 8000, 20, 'full', 'draft'),
  ('christmas-minis-2026', 'Christmas Mini Sessions', 'Christmas 2026', '15-minute Christmas mini session. Digital photos included.', 6000, 15, 'full', 'draft')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- policies (starter text, all OWNER TO CONFIRM)
insert into public.policies (key, title, body_md, sort) values
  ('deposit', 'Deposit',
   'A non-refundable deposit of 50% of your quote total confirms your date. After you accept a quote, your date is held for 48 hours; holds without a deposit are released automatically.', 1),
  ('balance', 'Balance',
   'The remaining balance is due 7 days before your event, by Interac e-Transfer.', 2),
  ('cancellation', 'Cancellation',
   'Your deposit is non-refundable. Cancellation terms closer to the event date will be confirmed in your quote.', 3),
  ('reschedule', 'Rescheduling',
   'One free reschedule within 12 months, subject to availability.', 4),
  ('weather', 'Weather (outdoor sessions & minis)',
   'If we cancel an outdoor session or mini session because of weather, we will reschedule at no cost.', 5),
  ('damage', 'Damage & rental care',
   'You are responsible for damage to rented items beyond normal wear and tear.', 6),
  ('prints', 'Prints & deliverables',
   'Your digital photos are delivered through an online gallery and are included. Printed photos and albums are available as add-ons.', 7),
  ('travel', 'Travel',
   'Travel is included within Fredericton. A travel fee applies outside Fredericton and is shown in your quote.', 8),
  ('privacy', 'Privacy',
   'We collect your name, contact details and event details only to quote, book and deliver your event, and keep them for as long as needed for that and for our records. To ask for a copy or deletion of your information, contact us.', 9)
on conflict (key) do nothing;
