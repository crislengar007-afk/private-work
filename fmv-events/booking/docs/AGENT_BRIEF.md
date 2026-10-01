# Brief for agents building pages in the FMV booking app

App root: `/home/user/private-work/fmv-events/booking` (Next.js **16.3** App Router, React 19, TypeScript strict, Tailwind v4, Supabase).
Full product spec: `/root/.claude/uploads/d2aaeeaa-a5dd-5ded-83af-1cfe22a862a3/781fdb59-spec_1.md` — read §2, §5 and §8 before starting.

## Next.js 16 rules (this is NOT the Next.js in your training data)
- Read the relevant guide in `node_modules/next/dist/docs/01-app/` before writing a page/route/action type you are unsure about.
- `params`, `searchParams`, `cookies()`, `headers()` are **async** (await them). Page props: `{ params: Promise<{ token: string }> }`.
- Middleware is `src/proxy.ts` (already written). `revalidateTag(tag, 'max')` needs 2 args; prefer `revalidatePath`.
- Server actions: a file starting with `'use server'`; every action must authenticate/authorize itself (they are reachable by direct POST).
- Do not enable `cacheComponents`. Route handlers that must be dynamic: `export const dynamic = 'force-dynamic'`.

## Already built — use these, do not rewrite them
- `src/lib/database.types.ts` — generated DB types (`Tables<'services'>`, `Database`, `Constants`). Schema: `supabase/migrations/*.sql` (read them).
- Supabase clients: `@/lib/supabase/server` (`createClient()` – request-scoped, acts as the signed-in user, RLS applies), `@/lib/supabase/admin` (`createAdminClient()` – service role, BYPASSES RLS, only for anonymous token-gated pages and workflows), `@/lib/supabase/public` (`createPublicClient()` – anon, no session, for public reads), `@/lib/supabase/client` (browser).
- Auth: `@/lib/auth` → `getSession()`, `requireTeam()`, `requireOwner()` (pages: redirect), `assertOwner()`, `assertTeam()` (server actions: throw). Owner/staff powers need an MFA (aal2) session; SQL `auth_role()` enforces the same.
- Business workflows (DB transaction + emails + PDFs): `@/lib/workflows` → `createInquiry`, `sendQuote`, `acceptQuote`, `reportPayment`, `recordPayment`, `holdMiniSlot`, `runCron`, `upsertClient`, `invoicePdfAttachment`.
- Docs/PDF: `@/lib/documents` (`loadQuoteDoc({id|token})`, `loadInvoiceDoc({id|token})`), `@/lib/pdf` (`renderQuotePdf`, `renderInvoicePdf`, `invoiceQrDataUrl`).
- Catalog/settings reads: `@/lib/catalog` (`getPublicSettings`, `getPublicCatalog`, `getPublicPolicies`, `mediaPublicUrl`).
- Math/format: `@/lib/money` (`formatCAD`, `parseDollarsToCents`, `centsToDollarString`, `computeTotals`), `@/lib/estimate` (`computeEstimate`, `alaCarteValue`, `emptySelection`), `@/lib/time` (Moncton tz: `formatDate`, `formatDateTime`, `formatWallTime`, `monctonToday`, `generateSlots`, `eventPeriodUtc`), `@/lib/phone` (`normalizePhone`, `formatPhone`, `telHref`, `whatsappHref`).
- Validation: `@/lib/schemas` (zod: `inquirySchema`, `acceptQuoteSchema`, `miniHoldSchema`, `messageSchema`, `recordPaymentSchema`, `quoteDraftSchema`, `fieldErrors`, `EVENT_TYPES`, `eventTypeLabels`).
- Errors/results: `@/lib/errors` (`ActionResult`, `ok`, `fail`, `friendlyDbError`).
- Anonymous-write guard: `@/lib/guard` → `guardAnonymousWrite({action, ip, turnstileToken})` (Turnstile + 5 per IP per 10 min). IP: `clientIp()` from `@/lib/request`; `appUrl(path)` builds absolute links.
- Tokens: `@/lib/tokens` (`isPlausibleToken`). Markdown (escaped, owner-authored): `@/lib/markdown` (`renderMarkdown` → HTML string; render inside `<div className="prose-fmv" dangerouslySetInnerHTML=...>`).
- Email: `@/lib/email` (`sendTemplatedEmail`, `ownerAlertEmail`). Templates live in the `email_templates` table.
- UI: `@/components/ui` (server-safe: `Button`, `ButtonLink`, `buttonClass`, `Input`, `Textarea`, `Select`, `Label`, `Field`, `Card`, `CardTitle`, `Badge`, `StatusBadge`, `Notice`, `PageHeader`, `Table/Th/Td`, `EmptyState`, `Money`), `@/components/ui/client` (`CopyButton`, `SubmitButton`, `Countdown`, `Turnstile`). Public chrome: `@/components/site/chrome` (already used by `src/app/(public)/layout.tsx`).
- Design tokens (Tailwind classes): `bg-cream`, `bg-cream-deep`, `bg-blush`, `bg-blush-soft`, `text-rose-deep`, `text-gold-deep`, `text-ink`, `text-ink-soft`, `border-line`, `text-ok/bg-ok-soft`, `text-warn/bg-warn-soft`, `text-bad/bg-bad-soft`, `font-display` (Cormorant Garamond). Warm, romantic, editorial; mobile-first; WCAG AA; keyboard accessible; labels on every input.

## Hard rules
- **Never hard-code business facts** (prices, phone, email, policies, dates). Everything comes from the database. Locale en-CA, currency CAD (integer cents), timezone America/Moncton. No ₱/GCash/Asia/Manila anywhere.
- Never expose `settings.etransfer_email` except on the token-gated Pay page / invoice PDF. Never expose the service-role key or import `@/lib/supabase/admin` from a client component.
- AI-generated media (`media.is_ai_generated`) is never portfolio/testimonial content; concept boards are always captioned "Concept inspiration, not a past FMV event".
- Validate every server action input with zod on the server; surface `friendlyDbError` messages; `revalidatePath` after mutations.
- **Only create/edit files inside the paths assigned to you.** Do not edit `src/lib/**`, `src/components/ui/**`, `src/components/site/**`, `supabase/**`, `package.json` or other agents' paths. If you need a new shared helper, put it in your own folder. If something in a shared file is wrong or missing, describe it in your final report instead of editing it.
- Do not run `next build`, `next dev` or `npm install`, and do not commit (other agents work in the same tree). Verify with `npx tsc --noEmit -p .` (filter output to your paths: other agents' work may be mid-flight) and `npx eslint <your paths>`.

## Final report
List the files you created, how each spec requirement in your scope is met, anything you could not do, and any change you need in shared files (with the exact diff you propose).
