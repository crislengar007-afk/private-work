# FMV Events & Photography: marketing site (Part A)

**Live:** https://fmv-events.higgsfield.app (Higgsfield website `fmv-events`,
id `8143551c-2380-4df6-96f5-f6ec90f62f2a`, not listed on the Higgsfield community feed).

This folder is a **reference snapshot** of the files written for the site. The
source of truth is the site's own repository on Higgsfield (edit it through the
Higgsfield website builder). The snapshot leaves out the Higgsfield template
(scroll-scrub engine, vendored packages, build config), the generated route
tree, and the binary media (hero film, posters, atmosphere plates, cover/OG),
which live in that repo under `app/public/assets/`.

## How it works

- React 19 + TanStack Start, server-rendered on a Cloudflare Worker, built on
  Higgsfield's animated **scroll-scrub** template: scrolling the home page plays a
  single 15 s film (blush chiffon → florals → a vintage camera's shutter closing →
  bokeh settling on cream paper), followed by the FMV monogram on the same cream.
  `prefers-reduced-motion` shows the still poster instead.
- **No business facts are hard-coded.** Prices, packages, add-ons, zones, mini
  sessions, contact details, policies, portfolio and testimonials all come from the
  booking app's public API (`/api/public/*`, `{ v: 1, data }`), fetched server-side
  and cached for 5 minutes (`src/fmv/api.server.ts`). The only browser call is the
  read-only "Check a date" widget (`/api/public/availability`).
- **Real work only.** The portfolio, before/after slider, booth reels and
  testimonials render nothing but API items (`show_in_portfolio`, approved +
  consented). Generated imagery is atmosphere only: the hero film, section plates,
  cover and OG image. None of it shows people, a venue or a finished event.
- No forms that write data, no booking logic, no runtime AI. Every call to action
  deep-links into the booking app (`/build`, `/build?package=…`, `/build?service=…`,
  `/build?event_type=wedding`, minis `book_url`, `/contact`).

Template files changed besides the ones in this folder: `src/styles.css` imports
`./fmv/fmv.css`, and `src/lib/security-headers.server.ts` allows `blob:` in
`media-src` (required by the scroll-scrub engine) and the OpenStreetMap embed in
`frame-src`.

## Pages

Home · Weddings · Events & Décor · Photo Booths · Photography · Packages & Pricing ·
Portfolio · Service Area (zones + OpenStreetMap embed, no Google key) · FAQ & Policies ·
About · Contact, plus `sitemap.xml`, `robots.txt`, LocalBusiness JSON-LD (built from the
API; omitted until the API answers), per-page titles/descriptions, OG image and favicon.

## Turning on live data (owner / Len)

Until these are set the site shows intentional "being finalized / opens soon" states
instead of prices, and every "Build your event" button points to the Contact page's
"booking opens soon" panel.

1. Deploy the booking app (`../booking`, see its README).
2. In the Higgsfield website settings for `fmv-events`, add the secrets:
   - `BOOKING_API_URL` = the booking app origin, e.g. `https://book.<domain>`
   - `BOOKING_APP_URL` = same origin (optional; defaults to `BOOKING_API_URL`)
3. In the booking app (Vercel), set `PUBLIC_SITE_ORIGIN=https://fmv-events.higgsfield.app`
   (or the custom domain) so the "Check a date" widget is allowed by CORS.
4. Redeploy the Higgsfield site (secrets take effect on the next deploy).

## Verified

- Typecheck, the template's UI contract check and a production build pass.
- Rendered all 11 pages in a local dev server in both states: no booking API (every
  page 200, fallback panels shown) and a mock booking API with sample data (package
  price + à la carte value, service prices, mini-session banner, testimonials,
  phone, JSON-LD and booking links all render from the API).
- The deployed site itself could not be fetched from this build environment
  (outbound access to `*.higgsfield.app` is blocked here), so give it a visual check
  on a phone and a desktop.

## Open items

- **Custom domain:** the Higgsfield tools available here expose no custom-domain
  setting, so whether `<domain>` can point at this site is still open (spec §4,
  options 1 or 2).
- Real portfolio photos, booth reels, before/after pairs and the FMV logo (the header
  uses a text monogram until the logo file is supplied).
- Marie's About text and photo; FAQ answers beyond the booking basics.
