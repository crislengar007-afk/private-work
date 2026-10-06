# 3Digit: Three-Digit Entry Platform (local demo)

> **DEMO — Walang totoong bayad o cash prize.** Every payment, receipt, refund and payout here is simulated. Results are labelled samples, not official lottery draws. This is software built from [SPEC.md](SPEC.md) v1.2. It is not legal authorization, it is not ready for real money, and it must not be deployed publicly.

Players pick **three different digits** (0–9). An entry wins when **all three appear anywhere** in a six-digit result. **₱10 taya → ₱3,100 total kapag panalo; kasama na ang taya** (net ₱3,090). Each unordered combination is capped at **₱500 per draw** across all players.

The repository root holds an unrelated Astro site. This app lives entirely in `three-digit/` and shares nothing with it.

## Stack

The repository had no backend, so the app uses a plain TypeScript web stack with few moving parts:

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js **22.13+**, TypeScript (ESM) | Single language and no native build steps |
| Database | **SQLite** via Node's built-in `node:sqlite`, SQL migrations in `migrations/` | Relational, with transactions, CHECK/UNIQUE constraints and triggers. Zero install. |
| Web | **Express 5**, server-rendered HTML, plus a small vanilla JS file for progressive enhancement | Real routes, direct links, refresh and back button all work, and every action also works without JS |
| Auth | `bcryptjs` password hashes, server-side sessions (only a SHA-256 of the cookie token is stored), double-submit CSRF tokens, per-IP rate limits | Established libraries; nothing is stored in `localStorage` |
| Tests | Vitest (unit, service, HTTP and multi-process tests) and Playwright (end-to-end, Chromium) | |

The business rules live in `src/services/*` and the database enforces them a second time:
- CHECK constraints cover the digits, the cap and the money amounts.
- Partial UNIQUE indexes enforce one active entry per player per combination, one published result per draw, and unique payment references.
- Triggers block illegal state transitions and make the audit log, the ledger and outcomes append-only. They also freeze draw schedules and entry selections.

## Run it

```bash
cd three-digit
npm install
cp .env.example .env          # local-only settings, no secrets
npm run db:reset              # create data/demo.sqlite and seed sample data relative to *now*
npm run dev                   # http://127.0.0.1:3000 (auto-reload)
```

To run the production build: `npm run build && npm start`. With `NODE_ENV=production`, cookies are `Secure`, and the demo clock, the demo-account list and the reset script are disabled.

### Demo accounts (synthetic, local only)

All seeded accounts use the password **`Demo-Pass-2026`**. When `SHOW_DEMO_ACCOUNTS=true` (non-production only), `/login` also lists them. There is no one-click sign-in or impersonation.

| Email | Role | Use |
| --- | --- | --- |
| admin@demo.local | Administrator | Global view: teams, users, settings, audit, support, draws |
| payments@demo.local | Payment reviewer | Approves or rejects simulated payments; handles refunds and payouts |
| editor@demo.local | Result editor | Enters draft six-digit results |
| reviewer@demo.local | Result reviewer | Publishes results entered by someone else |
| juan@ / maria@ / pedro@demo.local | Player | Entries in every state |
| sample01–50@demo.local | Player | Fill the combination caps |
| leader.a@ / leader.b@demo.local | Team leader | See only Team Alpha / Team Bravo |
| agent.a1@, agent.a2@, agent.b1@, agent.b2@demo.local | Agent | Own dashboard only (a2 moved from Bravo to Alpha) |
| agent.free@demo.local | Agent (unassigned) | Visible only to the admin and to themselves |

### Seeded sample draws

Dates are generated **relative to the time you run the seed**:

| Draw | State | What it shows |
| --- | --- | --- |
| A — open | Open for 2 days | Combination **1-2-3 is at ₱490 (₱10 left)**. **4-5-6 is full at ₱500.** Juan has approved and pending entries; Pedro is awaiting payment; Maria has a proof-only claim with no ledger receipt. |
| B — verification only | Submission closed, verification open about 3h | Pending payments for the reviewer to approve |
| C — awaiting result | Past draw time, no result | Expired entries (one paid, so a refund is required; one unpaid, so no refund), a rejected entry (refund marked *failed*), approved entries ready for a result |
| D — published | Result `123456` | Winners and losers; one completed payout and one approved payout |
| E — published & corrected | `012349` corrected to `001234` | Version history, recomputed outcomes and a **reconciliation flag** for a payout already completed under v1 |
| F — cancelled | Cancelled | Voided entries; a completed refund, a required refund, and an unpaid entry with no refund |
| G — draft | Next week | Editable draft schedule |

## Walkthrough

1. **Player** (`juan@demo.local`): go to **New entry**, choose Draw A, and pick digits with the keypad or by typing them. Try `112` (rejected), `321` (₱10 left) and `654` (full: Continue is disabled). Click **Review**, tick the acknowledgement and click **Confirm & reserve slot**. This reserves the slot for 5 minutes.
2. **Simulated payment**: the reference is pre-filled. Leave "Simulate that the demo provider received ₱10.00" ticked to record a demo-ledger receipt; the entry becomes *Pending verification*. If you untick it, only a proof or reference is submitted. That does **not** count as payment and does not extend the reservation.
3. **Payment reviewer** (`payments@`): **Payments → Needs review** is sorted by urgency. Open an entry, check the server-side approval checklist, then **Approve** or **Reject** with a reason. Rejecting a paid entry creates a refund obligation.
4. **Time travel (local only)**: as `admin@`, open **Settings → Demo clock** and move the server clock forward, never backward, past the draw time. Countdowns in the browser are for information only; the server decides.
5. **Result editor** (`editor@`): **Results → Enter a result**. The editor cannot publish their own result.
6. **Result reviewer** (`reviewer@`): **Results → Review queue → Publish**. Outcomes are computed automatically for *approved* entries only. Everything else shows **Not eligible**.
7. **Player**: open the entry or **Results** to see the outcome. Matched digits are highlighted (with a ✓ mark, not colour alone) and missing digits are explained.
8. **Payouts** (`payments@` or `admin@`): **Approve payout**, then **Complete (simulated)**. This writes one ledger row; a second payout for the same entry is impossible. Real cash controls are disabled.
9. **Corrections**: submit a new result with a reason for a published draw and have a second reviewer publish it. The prior version and its outcomes are kept. Any payout affected after it was paid is flagged under **Payouts → Reconciliation**; nothing is re-paid or debited automatically.
10. **Teams**: log in as `leader.a@` and then `leader.b@`. Each sees only their own agents. Guessed IDs return the same 404 as a missing record.

## Tests

```bash
npm run typecheck
npm test            # Vitest: 95 unit, service, HTTP and multi-process tests
npm run test:e2e    # Playwright: resets data/e2e.sqlite, starts a server on :3200, runs the browser flows
npm run test:all    # all of the above
```

If Playwright can't find a browser, install Chromium with `npx playwright install chromium`.

Mapping to the SPEC §13/§17/§18 acceptance tests:

| # | Where |
| --- | --- |
| 1–2 | `tests/unit/digits.test.ts`, `entries-payments.test.ts` (server), `flow.spec.ts` (client) |
| 3, 6, 7, 8 | `entries-payments.test.ts`, `http.test.ts` |
| 4, 5, 15 | `entries-payments.test.ts › cutoffs`. These use a fixed clock at the exact boundary with the scheduler **not** run; request-time guards still close the window. The browser time is never read. |
| 9–14 | `results-payouts.test.ts` |
| 16, 36 | `http.test.ts › routes render`, `tests/e2e/flow.spec.ts` (360px, keyboard, refresh) |
| 17–18, 20–26 | `capacity.test.ts` |
| 19 | `concurrency.test.ts`: six **separate processes** race for the last ₱10 on one SQLite file; exactly one succeeds |
| 27–35 | `http.test.ts › team hierarchy isolation`, `results-payouts.test.ts` (35: admin cannot self-publish; audit is immutable) |
| Full flow | `tests/e2e/flow.spec.ts`: player → payment → approval → demo clock → editor → second reviewer → Won → payout |

## Database operations

- `npm run db:migrate` applies pending migrations. They also run automatically at startup.
- `npm run db:seed` seeds an empty database. `npm run db:reset` deletes the file and re-seeds it. Both refuse `NODE_ENV=production` and any file that is not a `*.sqlite` inside `./data/`.
- **Backup:** `npm run db:backup` writes a consistent copy with `VACUUM INTO` to `data/backups/`. It is safe to run while the server is up.
- **Restore:** stop the server, copy the backup over `data/demo.sqlite`, delete any `demo.sqlite-wal` and `demo.sqlite-shm` files, then start the server again.
- Password reset has no email provider. The reset link is written to the local file `data/demo-outbox.txt`. The page says so and never claims an email was sent.

## Implemented

- Every player route in SPEC §7, every staff route in §8 and every team/agent route in §18, with role-aware navigation and landing pages.
- Entry rules:
  - Three distinct digits, with the leading zero kept.
  - The chosen order is kept for the receipt alongside a sorted canonical key.
  - Fixed ₱10 stake; other amounts are shown but disabled and rejected by the server.
- Capacity: the ₱500 per-combination cap is reserved atomically, with 5-minute reservations, an idempotency key on confirmation, and live advisory capacity in the UI.
- Payments and cutoffs:
  - The simulated payment is backed by an immutable demo ledger. A proof image is never evidence.
  - Separate submission and verification cutoffs, both enforced inside transactions.
  - Automatic expiry runs both from a periodic job and as a guard on each request.
- Results: separate-reviewer publication, a resumable and idempotent matching job, and versioned corrections with full history.
- Money (all simulated):
  - Refund workflow: required → processing → completed or failed → retry. Completion is confirmed by a ledger entry.
  - Payout approval and completion with a unique reference, at most one payout per entry, and reconciliation flags after corrections.
- Admin reporting: figures labelled as simulated, the worst-case prize exposure across all six-digit sets alongside a conservative upper bound, a per-combination capacity table, and a payout-risk warning.
- Teams: team and agent assignment with history; team scope is derived on the server on every request.
- Users and records: role management (combining roles needs explicit confirmation), an append-only searchable audit log, support tickets with internal notes, and CSV export with formula escaping.
- Accessibility: labelled inputs, visible focus, an error summary that receives focus, status shown as text plus icon, a keyboard-operable digit picker, reduced-motion support, and layout tested at 360px with no horizontal overflow.

## Not implemented (by design or pending owner decisions)

- Real payments, payment providers, QR codes, payee accounts, cash deposits and withdrawals.
- Official result sources and draw timetables.
- Email delivery.
- Real file uploads. Proofs are generated, labelled placeholder images served through access-controlled URLs.
- Agent selling, collection, player attribution and commissions. Team dashboards show empty states and never invent figures.
- Any "enable live" switch. None exists.

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for every demo default and open decision. Passing these tests is **not** evidence that the system is ready to handle real money.
