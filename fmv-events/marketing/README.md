# FMV Events & Photography: marketing site (Part A)

**Live:** https://fmv-events.higgsfield.app (Higgsfield website `fmv-events`,
id `8143551c-2380-4df6-96f5-f6ec90f62f2a`, published on the Higgsfield community feed so clients can open it without an account).

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
`media-src` (required by the scroll-scrub engine), `data:` in `font-src` (fonts the
template embeds) and the OpenStreetMap embed in `frame-src`.

## Pages (multi-page architecture)

Primary nav: **Home · Services ▾ · Packages · Portfolio · About · Contact**, with the
**Book / Get a quote** button. Services opens a dropdown on desktop (hover or click,
Escape / outside click closes) and a nested list in the mobile drawer.

| Route | What it is |
| --- | --- |
| `/` | Scroll-scrub hero film (unchanged) → value → services → featured work → packages → why FMV → testimonials → how booking works + check a date → service area → closing CTA |
| `/services` | Services landing (five service cards, why FMV, how booking works) |
| `/services/weddings` · `/services/photography` · `/services/event-decor` · `/services/photo-booths` · `/services/event-coordination` | One page per service: tier cards with inclusions, add-ons, related work, CTAs into `/book?service=…` |
| `/packages` | Tabs (`?tab=wedding|photography|coordination|booths|decor|rentals`), ARIA tablist with arrow keys, "How pricing works" |
| `/portfolio` | Featured highlights, facet filters, lightbox, before/after |
| `/about` · `/contact` · `/faq` · `/service-area` | Unchanged content, new heads and breadcrumbs |
| `/book` | Book / Get a quote funnel (below) |
| `/owner-preview` | Prototype owner inbox (`noindex`) |

Old URLs `/weddings`, `/photography`, `/events`, `/booths` answer **301** to their
`/services/...` page. Every page has its own title, description, H1, canonical and
`og:url` (`src/fmv/seo.ts`); `sitemap.xml` lists the new routes.

## Prototype preview (current state)

Until the booking app is connected the site runs as a **prototype**, so the finished
site can be previewed:

- Prices, packages, add-ons, zones, contact details and policies come from sample data
  transcribed from FMV's flyers (`src/fmv/demo/*.json`), not from the API.
- A slim ribbon at the top says "Prototype preview · forms don't send anything yet".
- `/book` is the quote funnel: 1 event type → 2 services (picture cards) →
  3 packages per service (tiers, wedding bundles, or "Help me choose") → 4 add-ons →
  5 event details (date, time, venue, area, guests, theme, notes) → 6 your info →
  7 review and **Request my quote** → confirmation with "Quote requested", "Your date is
  not booked yet", the live estimate and the step-8 deposit instructions. A status
  timeline shows Quote requested → Quote approved → 50% deposit required → Payment
  verified → Booking confirmed; only the first step is ever reached here, because
  nothing is charged or confirmed without the booking app.
- `/contact` has a question form (name, email, phone, event date, interest, message).
- `/owner-preview` shows what Marie would receive (requests and questions with the
  customer details and estimate).
- Nothing is sent anywhere: submissions stay in the visitor's own browser
  (`localStorage`). "Check a date" shows every service as available.

Set the website secret `FMV_PROTOTYPE=off` to switch the prototype off without
connecting the booking app (the site then shows "being finalized / opens soon" states).
As soon as `BOOKING_API_URL` is set, live data and the real booking links take over.

## Turning on live data (owner / Len)

1. Deploy the booking app (`../booking`, see its README).
2. In the Higgsfield website settings for `fmv-events`, add the secrets:
   - `BOOKING_API_URL` = the booking app origin, e.g. `https://book.<domain>`
   - `BOOKING_APP_URL` = same origin (optional; defaults to `BOOKING_API_URL`)
3. In the booking app (Vercel), set `PUBLIC_SITE_ORIGIN=https://fmv-events.higgsfield.app`
   (or the custom domain) so the "Check a date" widget is allowed by CORS.
4. Redeploy the Higgsfield site (secrets take effect on the next deploy).

## Verified (multi-page refactor, live site)

- Typecheck, the UI contract check and a production build pass.
- Playwright against https://fmv-events.higgsfield.app (run from the Higgsfield
  sandbox, since this environment cannot reach `*.higgsfield.app`):
  - All 15 routes at desktop 1366, tablet 820 and mobile 390: HTTP 200, exactly one
    H1, matching canonical, no horizontal overflow, no broken images, no console
    errors.
  - `/weddings`, `/photography`, `/events`, `/booths` redirect to `/services/...`.
  - Services dropdown (hover, click, Enter, Escape), mobile drawer, back/forward,
    packages tabs (click + arrow keys), package CTA into `/book?service=...`.
  - Full quote funnel on desktop and mobile: validation, tier + "Help me choose",
    estimate, consent, confirmation ("Your date is not booked yet", timeline at
    "Quote requested", deposit instructions), owner inbox shows the request.
  - Scroll-scrub hero regression: video loads as a blob, scrubs to ~13–14 s and
    progress 0.93–0.97 on desktop, tablet and mobile and after client-side
    navigation back to `/`; reduced motion shows the poster only; no errors.

## Open items

- **Custom domain:** the Higgsfield tools available here expose no custom-domain
  setting, so whether `<domain>` can point at this site is still open (spec §4,
  options 1 or 2).
- Real portfolio photos, booth reels, before/after pairs and the FMV logo (the header
  uses a text monogram until the logo file is supplied).
- Marie's About text and photo; FAQ answers beyond the booking basics.
