# Assumptions and open decisions

This file records the choices the demo made where SPEC.md v1.2 left a gap. **Confirmed** items come from the owner. **Demo default** items are reversible implementation choices that need owner review. **Open** items are unresolved and block any real-money use.

## Confirmed by the owner (implemented as-is)

- Each entry has exactly three distinct digits from 0–9. Entries with repeats (112, 555, 101) are rejected on both client and server.
- An entry wins when all three of its digits appear anywhere in the six-digit result. Order, position and adjacency do not matter.
- **A result always has six different digits** (owner rule, 6 Oct 2026): a result with a repeated digit is rejected by the form, the server and the database. Every valid result therefore makes exactly 20 of the 120 combinations win.
- The stake is fixed at ₱10 (1000 centavos). A win pays **₱3,100 gross (310000 centavos), including the stake**, so the net gain is ₱3,090. No proportional payout is inferred for any other stake.
- Each unordered combination is capped at ₱500 (50000 centavos) across **all** players and teams.
- Players have their own accounts. An admin must approve payment before an entry counts. A cutoff exists. Player and admin UIs are both complete.
- The Admin → Team Leader → Agent visibility hierarchy is enforced on the server.

## Demo defaults (proposed; need owner review)

| Topic | Demo behaviour |
| --- | --- |
| Cap scope | **Documented default:** the ₱500 cap applies **per draw**, shared by all players, teams and agents. A new draw starts with fresh capacity, and draws never share a lifetime cap. |
| Cutoffs | Separate submission/payment and verification cutoffs, with `opens < submission < verification < draw`. The operation is already closed at the exact boundary. |
| Reservation | Confirming an entry reserves its stake for **5 minutes**, or until the submission cutoff if that comes sooner. A ledger receipt holds the slot until verification closes. A proof alone does not extend the reservation. Expired holds are released at request time (when anyone reads or reserves that combination, or opens that entry) as well as by the 15-second background job. |
| Paid before cutoff, approved later | Approval is allowed **after the submission cutoff and before the verification cutoff**. If the entry is not approved by the verification cutoff, it expires (no retroactive acceptance, even if it would have won) and the received ₱10 becomes a simulated refund obligation. |
| Repeat entries | One **active** entry per player + draw + unordered combination. A rejected or expired entry is never revived; a new attempt gets a fresh ID and a fresh payment. |
| Payments | One payment per entry for the exact amount. No wallet, cart or split payment. References are unique within the provider and normalised (uppercase, spaces and dashes removed). |
| Payment receipt | Receipts come from the demo ledger, timestamped with **server** time. The player's "simulate receipt" checkbox stands in for a provider callback. |
| Late or unapproved funds | A paid entry that expires or is rejected gets one refund obligation. Unpaid entries get none. A payment after the cutoff or after the reservation expired is refused, so no money moves. |
| Result entry | A result can be entered once verification has closed. It can be published only after the scheduled draw time, by a **different** staff member. Admins cannot self-publish either. |
| Self-review | A payment reviewer cannot approve their own entry or payout. |
| Cancellation | Voids all active entries (including approved ones), releases held reservations and creates one refund per received payment. Not allowed after publication; use a correction instead. |
| Corrections | A correction is a new version with a reason and a separate reviewer. The previous version becomes *superseded*, never deleted. Outcomes are recomputed once per version. A completed payout that no longer wins is **flagged**, not debited. An approved but unpaid payout is cancelled and flagged. |
| Payouts | Two steps: approve, then complete (a ledger row). At most one payout per entry, ever. |
| Teams | One leader per team and one active team per agent. Reassignment ends the old assignment. Past records stay with the former team, and the former leader immediately loses access to the agent's profile. Unassigned agents are visible only to the admin. |
| Combined roles | Granting a global staff role to a team leader or agent (or the reverse) needs an explicit confirmation checkbox, which is recorded in the role row and the audit log. |
| Support | Only the admin role handles tickets. Players see public replies; internal notes are staff-only. |
| Demo clock | Local only. Admins can move the server clock **forward** (1 minute to 7 days per step) to demonstrate cutoffs. It can never move backward, so closed windows never reopen. Disabled when `NODE_ENV=production`. |
| Sessions | 12-hour server-side sessions on real wall-clock time, independent of the demo clock. A password change or account disable ends other sessions. |
| Password reset | No email provider exists. Reset links go to `data/demo-outbox.txt`, and the page says no email was sent. |
| Proofs | Synthetic, labelled SVG placeholders served through owner- or staff-only URLs. There are no real uploads. |
| Media | Owner-approved Higgsfield assets (hero, two empty-state illustrations, silent 8-second explainer) are listed in `ASSETS.md`. They are served locally, carry no money or casino imagery, and the video never autoplays. Everything else uses CSS and inline SVG icons. |
| Timezone | All times are stored in UTC and shown as Asia/Manila (PHT, UTC+8, no DST). |

## Open before any real-money operation

Nothing in this demo may be switched to live use until each of these is resolved:

- The exact lottery product, the official result source and the draw timetable.
- Approval of the cutoff policy and the reservation window.
- Additional stake tiers, if any, and their payout rules.
- The repeat-entry policy, and whether the cap is per draw or uses another scope.
- **Funding and reserve limits.** The payout is 310× the stake. Example: one ₱10 entry on each of the 120 combinations collects ₱1,200, but a result with six distinct digits then has 20 winners owed ₱62,000. A full ₱500 combination (50 winners) owes ₱155,000. The admin screens show this exposure, and the demo does not narrow the winning rule.
- Refund policy and processing times.
- Eligibility and age rules. The 18+ notice is illustrative only.
- Operator authorization and licensing.
- Payment-provider authorization and integration.
- Privacy and data-retention policy.
- Agent powers: selling, creating players, collecting cash, commissions, player attribution and the historical visibility policy.
- Operational, security and legal review.
