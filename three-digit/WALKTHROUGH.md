# Local demo walkthrough

> **DEMO — Walang totoong bayad o cash prize.** Everything below runs on your own computer. All payments, refunds and payouts are simulated, and the six-digit results are samples, not official draws.

Every step below is automated by `npm run docs:screenshots`. That script performs the whole walkthrough on its own fresh database (`data/walkthrough.sqlite`) and regenerates the screenshots in [`docs/screenshots/`](docs/screenshots/), at desktop 1280px and mobile 360px.

## 1. Start it

**Requirements:** **Node.js 22.13 or newer** (tested on 22.22.0; it uses the built-in `node:sqlite`) and npm 10+. No database server, Docker or API keys are needed.

```bash
git clone https://github.com/crislengar007-afk/private-work.git
cd private-work
git checkout claude/confident-feynman-v41eov
cd three-digit
npm install
cp .env.example .env     # local-only settings; contains no secrets
npm run db:reset         # creates data/demo.sqlite with sample draws dated relative to NOW
npm run dev              # → http://127.0.0.1:3000
```

- The server listens on `127.0.0.1` only. Leave `HOST` as it is; this demo is not meant to be exposed.
- Seeded times are relative to when you ran `db:reset`. Draw A stays open for about 2 days. If you come back later, run `npm run db:reset` again.
- The admin demo clock (step 11) only moves forward. To go back to real time, run `npm run db:reset`.
- Stop the server with Ctrl+C.

## 2. Demo accounts

Every seeded account uses the password **`Demo-Pass-2026`**. The accounts are synthetic and for local use only. In development, the `/login` page also lists them under "Local demo accounts".

| Email | Role | Used in steps |
| --- | --- | --- |
| `juan@demo.local` | Player | 1–6, 15–16 |
| `payments@demo.local` | Payment reviewer (also handles refunds and payouts) | 7–9, 17 |
| `admin@demo.local` | Main administrator | 10–11 |
| `editor@demo.local` | Result editor (enters results) | 12 |
| `reviewer@demo.local` | Result reviewer (publishes results) | 13–14 |
| `leader.a@demo.local` / `leader.b@demo.local` | Team leaders (Team Alpha / Team Bravo) | 18 |
| `agent.a1@`, `agent.a2@`, `agent.b1@`, `agent.b2@`, `agent.free@demo.local` | Agents | 18 |
| `maria@`, `pedro@`, `sample01…50@demo.local` | Other players | Background data |

## 3. Player → payment approval → result → winner → simulated payout

| # | Who | Do this | You should see | Screenshots |
| --- | --- | --- | --- | --- |
| 1 | anyone | Open http://127.0.0.1:3000 | The demo banner, how it works, upcoming sample draws, and "₱10 taya → ₱3,100 total kapag panalo; kasama na ang taya." | [desktop](docs/screenshots/01-home-desktop.jpg) · [mobile](docs/screenshots/01-home-mobile.jpg) · [login](docs/screenshots/02-login-desktop.jpg) |
| 2 | `juan@` | Log in | Dashboard: active Draw A with **two countdowns** (submission/payment cutoff and verification cutoff), entry counts, latest published result | [desktop](docs/screenshots/03-player-dashboard-desktop.jpg) · [mobile](docs/screenshots/03-player-dashboard-mobile.jpg) |
| 3 | `juan@` | **New entry** → Draw A → tap **0**, **4**, **7** (or type `047`) | Used digits are disabled. Live capacity reads "Limit: ₱500 per combination per draw · Used/reserved: ₱0 · Available: ₱500". Try `6 5 4`: that combination is **full**, the limit message appears in English and Taglish, and *Review* is disabled. Try `321`: "Available: ₱10". | [desktop](docs/screenshots/04-pick-digits-desktop.jpg) · [mobile](docs/screenshots/04-pick-digits-mobile.jpg) · [full combination](docs/screenshots/04-pick-digits-full-combination-mobile.jpg) |
| 4 | `juan@` | **Review entry** | Same combination in any order: `047 · 074 · 407 · 470 · 704 · 740`. Cutoffs, ₱10 stake, ₱3,100 total including stake (net ₱3,090), and server capacity figures | [desktop](docs/screenshots/05-review-desktop.jpg) · [mobile](docs/screenshots/05-review-mobile.jpg) |
| 5 | `juan@` | Tick the acknowledgement → **Confirm & reserve slot** | Payment page: slot reserved for **5 minutes** (countdown), exact amount ₱10.00, "DEMO MERCHANT — simulated provider (no real account)" | [desktop](docs/screenshots/06-payment-desktop.jpg) · [mobile](docs/screenshots/06-payment-mobile.jpg) |
| 6 | `juan@` | Leave "Simulate that the demo provider received ₱10.00" ticked → **Submit simulated payment** | Entry is **Pending verification**. The timeline shows the demo-ledger receipt; the slot is now held until the verification cutoff. *(If you untick it, only a reference is recorded. That is not a payment, and the slot still expires after 5 minutes.)* | [desktop](docs/screenshots/07-pending-verification-desktop.jpg) · [mobile](docs/screenshots/07-pending-verification-mobile.jpg) |
| 7 | `payments@` | Log in → **Payments** (Needs review, most urgent first) → open Juan's entry reference | Server-side checklist (ledger receipt, exact amount, received before cutoff, before verification cutoff, no result yet, reservation held, reviewer ≠ owner) and a synthetic proof preview | [queue desktop](docs/screenshots/08-payment-queue-desktop.jpg) · [queue mobile](docs/screenshots/08-payment-queue-mobile.jpg) · [detail desktop](docs/screenshots/09-payment-review-desktop.jpg) · [detail mobile](docs/screenshots/09-payment-review-mobile.jpg) |
| 8 | `payments@` | Tick "I verified the ledger receipt" → **Approve entry** | "Payment verified and entry approved." The reserved ₱10 moves to *approved* without being counted twice | [desktop](docs/screenshots/10-payment-approved-desktop.jpg) |
| 9 | `admin@` | **Draws → Sample Draw A** | **Money & prize exposure** in four parts: collected payments, reserved capacity, potential payout (worst case over every valid result), and hypothetical funding shortfall. Below it, the per-combination cap table (1-2-3 at ₱490, 4-5-6 **Full**) | [desktop](docs/screenshots/11-draw-money-and-capacity-desktop.jpg) · [mobile](docs/screenshots/11-draw-money-and-capacity-mobile.jpg) |
| 10 | `admin@` | **Overview** | Pending queue, simulated money totals, draw health (collected / approved / reserved / worst case / shortfall), and illustrative scenarios (₱1,200 → ₱62,000; ₱60,000 → ₱3,100,000) | [desktop](docs/screenshots/12-admin-overview-desktop.jpg) · [mobile](docs/screenshots/12-admin-overview-mobile.jpg) |
| 11 | `admin@` | **Settings → Demo clock** → enter `4320` minutes (3 days) → **Advance** | Server time moves past Draw A's draw time. Forward only, and audited | [desktop](docs/screenshots/13-demo-clock-desktop.jpg) |
| 12 | `editor@` | **Results → Enter a result** → Draw A → `047123` → **Submit for review** | "You entered this result, so you cannot review it." There is no Publish button for the editor | [desktop](docs/screenshots/14-editor-submitted-desktop.jpg) |
| 13 | `reviewer@` | **Results** → review queue | The submitted result with its source and the editor's name | [desktop](docs/screenshots/15-reviewer-queue-desktop.jpg) · [mobile](docs/screenshots/15-reviewer-queue-mobile.jpg) |
| 14 | `reviewer@` | Tick "I independently checked 047123…" → **Publish result** | "Result published. Outcomes were computed for approved entries." | — |
| 15 | `juan@` | **My entries** → the 047 entry | Status **Approved**, outcome **Won**. Result `047123` with 0, 4 and 7 marked ✓. "Gross payout ₱3,100.00 (includes your ₱10 stake; net ₱3,090.00)." | [desktop](docs/screenshots/16-winner-entry-desktop.jpg) · [mobile](docs/screenshots/16-winner-entry-mobile.jpg) |
| 16 | `juan@` | **Results → Sample Draw A** | Every entry Juan has in the draw: 047 **Won**; 135 **Lost** with "missing 5"; 246 **Not eligible** (never approved) | [desktop](docs/screenshots/17-result-explained-desktop.jpg) · [mobile](docs/screenshots/17-result-explained-mobile.jpg) |
| 17 | `payments@` | **Payouts** → Juan's row → **Approve payout** → **Complete (simulated)** | **Paid (simulated)** with a unique `PAYOUTDEMO…` reference and one ledger row. A second payout for the same entry is impossible. "Send real payout" stays disabled | [desktop](docs/screenshots/18-payout-completed-desktop.jpg) · [mobile](docs/screenshots/18-payout-completed-mobile.jpg) |
| 18 | `leader.a@` | **My agents** | Only Team Alpha's agents. Team Bravo, its leader and the unassigned agent never appear. Guessed URLs return 404. Log in as `leader.b@` to see the reverse | [desktop](docs/screenshots/19-team-leader-desktop.jpg) · [mobile](docs/screenshots/19-team-leader-mobile.jpg) |

### Optional extras to try

- **Cap at ₱490 → ₱500:** as `pedro@`, enter `321` in Draw A, review and confirm. That takes the last ₱10. Any other player who now tries 123, 132, 213, 231, 312 or 321 gets "This number combination has already reached the ₱500 limit… / Naabot na ng combination na ito ang ₱500 limit."
- **Unpaid hold expires:** confirm an entry and don't pay. After 5 minutes the slot is released, even if the background job has not run yet. The payment page then says the reservation expired, and a late payment is refused.
- **Late approval:** Draw B's submission cutoff has already passed but its verification window is open, so `payments@` can still approve its pending entries. Once the verification cutoff passes (move the demo clock 3h+), approval is refused, the entries become **Expired**, and each paid one gets a simulated **refund obligation** under **Refunds**.
- **Corrected result:** Sample Draw E was corrected from `012349` to `001234`. Maria's 349 had already been paid under v1, so **Payouts → Reconciliation** shows a flag. Nothing is re-paid or debited automatically.
- **Cancelled draw:** Sample Draw F shows voided entries and refunds in the *completed*, *required* and *not required* (unpaid) states.

## 4. Checks

```bash
npm run typecheck
npm test               # Vitest: unit, service, HTTP and multi-process tests
npm run test:e2e       # Playwright: 360px/keyboard checks and the full flow (uses data/e2e.sqlite)
npm run docs:screenshots   # this walkthrough, regenerating docs/screenshots (uses data/walkthrough.sqlite)
```

If Playwright reports a missing browser, run `npx playwright install chromium` once.
