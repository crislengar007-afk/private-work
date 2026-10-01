# FMV Events & Photography: booking app (Part B)

The booking system for FMV Events & Photography (Fredericton, NB), built to the
project spec (`spec.md` §5). It is the **single source of truth** for prices,
packages, availability, contact details and policies. The marketing site (Part A,
on Higgsfield) reads everything from this app's public API.

- **Stack:** Next.js 16 (App Router, TypeScript strict), Tailwind v4, Supabase
  (Postgres + RLS, Auth, Storage), Resend (email), Cloudflare Turnstile, Vercel
  (hosting + cron), `@react-pdf/renderer` (quotes/invoices), `qrcode`.
- **Locale:** en-CA, CAD in integer cents, all business logic in `America/Moncton`,
  phones stored as E.164. Payments: Interac e-Transfer only (no card processing).

## What it does

| Area | Routes |
|---|---|
| Event builder (inquiry + live estimate + live availability) | `/build` |
| Client quote page (review, sign, accept) | `/q/[token]` |
| Pay page (e-Transfer email, amount, reference, QR, "I've sent it") | `/pay/[token]` |
| Mini sessions (live campaigns, slot booking) | `/minis`, `/minis/[slug]` |
| Client portal (magic link: bookings, quotes, invoices, PDFs, galleries) | `/portal` |
| Policies, contact / general question | `/policies`, `/contact` |
| Admin (owner/staff, password + authenticator app) | `/admin/**` |
| Public read-only API for Part A, `{ v: 1, data }` | `/api/public/{settings,catalog,minis,availability,portfolio,testimonials,policies}` |
| Cron: expire holds, reminders, complete events, thank-you + reviews | `/api/cron` (every 15 min) |
| PDFs (token-gated) | `/api/documents/{quote,invoice}/[token]` |

**Flow:** Build → inquiry (no date held) → owner builds and sends a quote →
client accepts (date **held** for `hold_hours`, inventory reserved, deposit
invoice issued) → client pays by e-Transfer with the reference code and taps
"I've sent it" (this does **not** confirm) → owner records the payment →
booking **confirmed**, balance invoice issued → reminders → event → completed,
thank-you + review request.

### Guarantees enforced by the database
- **No double-booking:** `inventory_reservations` has a GiST exclusion constraint
  per item/unit/time range (with setup/teardown buffers). Two clients accepting the
  same booth at the same time: exactly one wins. Marie is modelled as a `staff`
  inventory item, so she can't be at two events at once.
- **One active booking per mini slot** (partial unique index). Expired holds free
  the slot automatically.
- **AI-generated media can never be portfolio or featured** (CHECK constraints).
- **RLS on every table**, one policy per operation, role checks via
  `auth_role()`. Owner/staff powers require an MFA (aal2) session. Anonymous
  visitors can't read `settings` (the e-Transfer email only appears on the
  token-gated Pay page and invoice PDF).
- Quote totals must add up (`total = subtotal − discount + tax`); active
  services/packages/add-ons must have a price; testimonials need consent to publish.
- Every change to prices, payments, settings and policies is written to `audit_log`.

## Project layout

```
supabase/migrations/   timestamped, forward-only SQL (schema, RLS, functions, seed)
supabase/tests/        local-only shim of Supabase's auth/storage schema for tests
src/lib/               money, estimate, time, phone, schemas, workflows, email, pdf, auth, clients
src/app/(public)/      builder, quote, pay, minis, portal, policies, contact
src/app/admin/         admin (login outside the guarded (app) group)
src/app/api/           public API, documents, cron
tests/unit/            money/tax/deposit math, estimates, à la carte values, timezone, phones
tests/db/              RLS + booking transactions against real Postgres (concurrency included)
scripts/               local DB reset, type generation
docs/AGENT_BRIEF.md    architecture + conventions for contributors
```

## Setup

### 1. Supabase
1. Create a project (Canada region if available). Note the URL, anon key and service-role key.
2. Apply the migrations: `npx supabase link --project-ref <ref>` then
   `npx supabase db push` (or paste the files in order into the SQL editor).
   They create the schema, RLS, functions, storage buckets (`media` public,
   `references` and `documents` private), email templates and the seed catalog from the spec.
3. Regenerate types if you change the schema: `npm run types:supabase` (Supabase CLI)
   or `npm run types:local` (local Postgres, see Tests).
4. **Auth settings:**
   - Site URL = `APP_URL`. Add `APP_URL/auth/callback` to the redirect URLs.
   - Email provider on (magic links for clients). Turn **off** public sign-ups for
     password accounts if you like; staff are invited from the admin.
   - MFA → TOTP enabled (default).
5. **First owner account:** in Authentication → Users, add Marie's email with a
   password, then in the SQL editor:
   ```sql
   insert into public.user_roles (user_id, role, display_name)
   select id, 'owner', 'Marie' from auth.users where email = 'MARIE_EMAIL_HERE';
   ```
   Sign in at `/admin/login`; the first sign-in asks to set up an authenticator
   app (Google Authenticator, 1Password, etc.). Further staff are invited from
   **Admin → Settings → Team**.

### 2. Environment
Copy `.env.example` to `.env.local` and fill it in (see comments there). On Vercel,
set the same variables for Production.

### 3. Vercel
- Import the repo, root directory `fmv-events/booking`, framework Next.js.
- Domain: `book.<domain>` (see the domain decision below).
- `vercel.json` schedules `/api/cron` every 15 minutes. **Vercel Hobby only allows
  daily crons**; use Pro, or an external scheduler that calls
  `GET /api/cron` with `Authorization: Bearer $CRON_SECRET`.

### 4. Email (Resend) and Turnstile
- Verify the sending domain in Resend and set `EMAIL_FROM`
  (e.g. `bookings@<domain>`). Replies go to `settings.reply_to_email` or `settings.email`.
- Create a Turnstile widget for the booking domain; set both keys.
- Without `RESEND_API_KEY`, emails are logged as `skipped` in `email_log` (handy locally).

### 5. Owner's first hour in the admin
1. **Settings:** phone (see open item 1), email, e-Transfer email + autodeposit,
   address/hours, HST (off by default), review links.
2. **Catalog:** check seeded prices; set **bundle prices** on the packages (they are
   drafts until priced) and **prices on add-ons** (hidden until priced); confirm
   inventory unit counts and buffers; set travel zones and fees.
3. **Policies:** replace the starter text (cancellation %, damage, delivery time) and
   have them reviewed. Every edit bumps the version; sent quotes keep theirs.
4. **Mini sessions:** set the real Christmas 2026 dates, generate slots, set **Live**.
5. **Media:** upload real portfolio photos (alt text required), booth reels,
   before/after pairs. Mark anything AI-generated as such (it is locked out of the portfolio).

## Development

```bash
npm install
npm run dev            # http://localhost:3000 (needs a Supabase project in .env.local)
npm run lint
npm run typecheck
npm test               # unit + database tests
npm run test:db        # recreates a local Postgres DB, applies all migrations, runs tests/db
```

The database tests need a local Postgres 16 with a `tester` superuser
(`LOCAL_PG_URL`, default `postgresql://tester:tester@localhost:5432`).
`scripts/db-reset-local.sh` applies `supabase/tests/00_local_shim.sql` (a minimal
stand-in for Supabase's `auth`/`storage` schemas, **never run it on a real project**)
and then every migration. They cover: RLS on every table, indexed FKs, the
e-Transfer email never reaching anon, AI media refused in the portfolio, MFA-gated
owner powers, staff blind to money, concurrent quote accepts (exactly one wins),
buffers, Marie not double-booked, availability without client details, report ≠
confirm, record → confirm + balance invoice, hold expiry freeing the date,
idempotent accept, mini double-click (exactly one hold), and client-only visibility.

## Verification status

Verified here: migrations apply cleanly; 23 database tests + 23 unit tests pass;
`tsc`, ESLint and `next build` are clean. **Not verified:** the app has not been
run against a live Supabase project or clicked through in a browser (this
environment had no Supabase API/Auth server). Before launch, run the full flow on
a staging Supabase project: builder → quote → accept → pay page → record payment →
confirmed, a mini booking, the portal magic link and admin MFA enrolment.

## Decided

- **Phone:** 506-471-4367 is the single public number (phone and WhatsApp), shown on
  both sites. 506-262-0810 (photography flyers) and 506-471-6367 (Schedulista) are not used.
- **Deposit:** 50% of the quote total confirms every booking, coordination included (the
  coordination flyer's "$100 non-refundable at booking" no longer applies).

## Open items (from spec §12)

The owner's price flyers (Oct 2026) answered several of these; migration
`20261001001200_catalog_from_owner_flyers.sql` loads them. Still open:

1. **Domain:** the flyers use **fmveventsandphotography.com**, so the booking app would be
   `book.fmveventsandphotography.com` on Vercel. It's still open whether Higgsfield can
   serve the marketing site on the main domain.
2. **[BLOCKER] Real media:** ≥30 portfolio photos, booth reels, before/after pairs, logo (SVG/PNG).
   The header uses a text "FMV" monogram until the logo is supplied. Note: several flyer
   images look AI-generated (couples, proposal setups); keep those out of the portfolio.
3. e-Transfer receiving email + whether Autodeposit is on.
4. HST registered? If yes, enable tax and add the HST number.
5. Items with no price yet: proposal setups, flower-arch/table décor rentals beyond the
   arch, prints/albums, rush delivery. Inventory unit counts are seeded as 1 each.
   Conflicting flyer prices to confirm: video guest book add-on $75 (mirror flyer) vs
   +$100 combo (photobox flyer); 360 booth $400 (Schedulista) vs "booths from $350".
6. Cancellation, damage and reschedule policy text; About text; FAQ answers.
7. Real Christmas 2026 mini dates/times (the two old sources disagree).
8. Google Business Profile with the same name/address/phone.

### Owner action items (not code, spec §14)
- **Remove the Schedulista link from the Facebook About page: it contains a login
  `auth_token`.** Then change the Schedulista password / sign out of all sessions.
- Make the phone number identical on FB, Schedulista (until retired), Google, Instagram.
- Add FB categories *Event Planner*, *Party Supply/Rental*, *Wedding Planning Service*.
- Ask past clients for reviews (FB + Google).
- Retire Schedulista once mini sessions are live here.

## Known follow-ups
- Reference photos uploaded to `references/` for builder requests that are never
  submitted are not cleaned up yet (a cron step could delete unreferenced objects older than 2 days).
- Playwright end-to-end tests (spec §9) still need a staging Supabase project to run against;
  the same concurrency guarantees are covered at the database level in `tests/db`.
