# SPEC.md — Three-Digit Entry Platform

Version: 1.2 · 6 October 2026
Audience: Claude Code
Delivery target: Working, multi-page, mobile-first DEMO application with player and admin workflows.

## 1. Build instructions

Implement this specification, not just a landing page or design proposal. First inspect the repository and its instructions. Reuse the existing stack, routing, components, and working features. If starting from an empty repository, choose a straightforward TypeScript web stack with server-side validation and a relational database; document the choice in README.md. Do not replace an existing stack unnecessarily.

Build locally and provide runnable code, database migrations, seed data, setup instructions, and meaningful tests. Do not deploy publicly or activate real payments as part of this task. Do not use paid media generation or Higgsfield. Use simple icons and CSS where needed.

Proceed autonomously with reversible implementation choices. Record assumptions rather than silently inventing business rules. Complete the demo with the confirmed fixed-stake payout rule below. Do not claim live readiness.

## 2. Business concept and confirmed requirements

Players create an account, select three distinct decimal digits, enter a proposed stake, submit a payment, and wait for admin verification. Each entry belongs to one specific draw. An entry is eligible only if approved under that draw's cutoff policy.

The winning reference is a six-digit lottery result. A player wins when ALL THREE selected digits appear anywhere in those six digits. Position and order do not matter; the digits need not be adjacent.

Confirmed by the owner:

- Exactly three distinct digits from 0–9 per entry.
- Confirmed combination stake cap: PHP 500 total across all players for each unordered three-digit combination. Scope this per draw as the implementation assumption; a new draw has a separate capacity bucket. All permutations share one bucket. With fixed PHP 10 entries, a bucket holds at most 50 entries.
- Repeated digits in a player's entry are forbidden: 112, 555, and 101 are invalid.
- 123, 507, and 012 are valid selections.
- 135 and 531 have identical matching meaning.
- Players have login accounts and input their own selections.
- Payment requires admin approval before the entry is accepted.
- A cutoff exists.
- Both player and admin operations need complete UI.
- Confirmed payout: a PHP 10 entry returns PHP 3,100 TOTAL when it wins, including the original PHP 10 stake. Net winnings are PHP 3,090. Do not add the stake a second time. Only PHP 10 entries are currently authorized as a product rule; do not infer proportional payouts for other stakes.

Do not reinterpret this as choosing three two-digit numbers from a six-number jackpot game. The exact external lottery product, official source, and schedule remain unconfirmed. Use clearly labeled sample six-digit results until confirmed.

## 3. Scope and pending decisions

Implement all workflows in DEMO mode using simulated transactions. Show a persistent, readable banner: “DEMO — Walang totoong bayad o cash prize.” Do not show genuine payment QR codes, recipient accounts, cash deposit instructions, or real withdrawal controls.

The following are proposed demo defaults, not owner-approved final business rules:

- Separate submission/payment and verification cutoffs, both before the draw.
- A second staff member reviews and publishes a submitted result.
- One active entry per player + draw + unordered combination. Block resubmission of the same combination in a different order. Permit different players to select the same combination. If an entry is rejected or expired, a new attempt before the cutoff requires a fresh ID and payment; never revive it silently.
- One payment per entry, exact expected amount, no wallet, pooled cart, or split payments.
- Fixed PHP 10 stake; other stake amounts disabled until the owner confirms their rules.

Pending before real-money operation: exact lottery product/source, draw timetable, cutoff policy approval, additional stake tiers if any, repeat-entry policy, funding/reserve limits, refunds and processing time, applicable eligibility/age rules, operator authorization, payment-provider authorization, privacy/retention policy, and operational review. This document is a software specification, not a legal authorization or legal conclusion.

No single “enable live” switch may bypass these unresolved items. Real integrations are out of scope; keep them unimplemented.

## 4. Matching and data representation

Store selected digits as a three-character string, preserving leading zeros. Also store a sorted canonical key for unordered comparisons. Example: selected_digits="507", canonical_key="057". Preserve the original order for the receipt.

Validate entries on the server and client: exactly three ASCII decimal digits and Set(digits).size === 3. A draw result must be exactly six ASCII decimal digits; repeated digits in the RESULT are allowed. The user prohibited repetition in entries, not in the result.

Matching algorithm:

```text
assert entry has exactly 3 distinct digits
assert result has exactly 6 digits
resultDigits = set(result)
won = every digit in entry is in resultDigits
```

Examples:

| Entry | Result | Outcome |
| --- | --- | --- |
| 135 | 123456 | Won |
| 531 | 123456 | Won |
| 507 | 705129 | Won |
| 012 | 001234 | Won |
| 789 | 123456 | Lost |
| 123 | 111222 | Lost: digit 3 is absent |
| 112 | Any result | Invalid entry, never accepted |

Repeated occurrences in a result do not create multiple wins for the same entry. Each eligible entry receives one Won/Lost outcome per published result version. For each approved winning PHP 10 entry, set gross payout to 310000 centavos (PHP 3,100), including the stake. Net gain is 309000 centavos (PHP 3,090). Losing approved entries have payout zero. Ineligible entries have no prize entitlement; any refund is separate. All payment and payout transactions remain simulated.

## 5. Draw timing and proposed cutoff policy

Store timestamps in UTC and display Asia/Manila, including date and timezone. Server time is authoritative; browser countdowns are explanatory only.

Each draw has opens_at, submission_closes_at, verification_closes_at, and scheduled_draw_at. Enforce:

```text
opens_at < submission_closes_at < verification_closes_at < scheduled_draw_at
```

New entries and recorded demo payments are accepted only while server_now < submission_closes_at. Approval requires a verified payment received before that deadline AND server_now < verification_closes_at. At the exact boundary, the operation is closed. Never accept a client-supplied payment time as evidence.

Before approving, check the same conditions again inside the database transaction. Close all pending entries when the verification window ends. An entry not approved by that deadline becomes Expired, regardless of its eventual matching result. If funds were actually received in the simulated ledger, create a simulated refund obligation; if no funds were received, do not create a refund.

No approvals after verification cutoff, no approvals after a result is recorded, and no retroactive acceptance because an entry won. Delayed draws do not automatically reopen betting. Cancelled draws void all eligible entries and create refund obligations for received funds. Background-job failure must not allow late actions: server request guards enforce time independently.

## 6. User roles and permissions

| Role | Capabilities |
| --- | --- |
| Player | Manage own profile, submit own entries, see own payments/results/support requests |
| Payment reviewer | Review simulated receipts, approve/reject payments with reasons |
| Result editor | Enter six-digit draft result and source metadata |
| Result reviewer | Review and publish a result submitted by another staff account |
| Administrator | Global operational visibility across all teams, agents, players and records; manage schedules, settings, assignments, staff roles, support and reporting. Preserve audit and review safeguards. |
| Team leader | See own team dashboard and own assigned agents only; no access to other leaders or their agents/records |
| Agent | Own scoped dashboard only; exact player-management and transaction powers pending, denied by default |

Enforce permissions server-side and row ownership in data access. Hiding buttons is insufficient. Never allow a public registration request to set its own admin role. For the demo, seed separate staff accounts so the review flow can be tested. No public one-click admin impersonation. Document local-only demo credentials outside production configuration.

## 7. Player routes and UI

Provide real navigable routes, direct links, refresh support, and back navigation.

| Route | Required UI |
| --- | --- |
| / | Demo introduction, mechanics, login/register, upcoming sample draw |
| /register | Registration, password validation, demo eligibility notice, terms acknowledgement |
| /login | Login, clear validation, password visibility toggle |
| /forgot-password | Reset request; if no email provider exists, use an explicitly local demo mechanism without claiming an email was sent |
| /app | Active draw card, two cutoff times/countdowns, entry summary, latest published result |
| /app/entries/new | Draw selector, digit selection, fixed PHP 10 stake, PHP 3,100 total potential payout, rules, review and confirm |
| /app/entries/:id | Immutable selection, draw, timestamps, payment timeline, receipt, outcome |
| /app/entries/:id/payment | Simulated payment instructions/action, synthetic reference, optional sample proof, pending status |
| /app/entries | Search/filter by draw and status; mobile cards and desktop table |
| /app/results | Published results only, dates, source label, detail links |
| /app/results/:id | Six-digit result, highlighted matched digits for own entries, explanation of missing digits |
| /app/account | Profile, password change, sign out |
| /app/support | Create and track own support requests tied to an entry |
| /rules | Matching, cutoff policy, demo terms, refunds, confirmed PHP 10 → PHP 3,100 total payout |

Digit picker: three selection slots and large 0–9 buttons. Disable digits already selected; allow removing a selection before submitting. Also support accessible keyboard entry with the same validation. Explain equivalent unordered combinations before confirmation. Preserve a draft after recoverable errors; never silently change its draw if the cutoff passes.

Player labels should use clear Taglish: “Pili ng 3 magkakaibang digit,” “Pending verification,” “Approved,” “Sarado na ang submission,” and “₱10 taya → ₱3,100 total kapag panalo; kasama na ang taya.” All status indicators need text, not color alone.

## 8. Admin routes and UI

| Route | Required UI |
| --- | --- |
| /admin | Pending queue, approved entry count, simulated receipts/refunds, draw health |
| /admin/draws | Draw list, create draft, schedules, lifecycle and cancellation controls |
| /admin/draws/:id | Entry snapshot, deadlines, locked rules, result workflow |
| /admin/payments | Filterable payment review queue with cutoff urgency |
| /admin/payments/:id | Linked entry, expected vs received amount, reference, proof preview, verify/approve/reject |
| /admin/entries | Filters by player, draw, canonical combination and status; read-only accepted selections |
| /admin/results | Draft results, review queue, source details and publication confirmation |
| /admin/refunds | Refund obligations, pending/completed/failed states, synthetic transaction reference |
| /admin/payouts | Winners, PHP 3,100 gross payout per winner, simulated payout review/history; real cash controls disabled |
| /admin/users | Users and role management restricted to authorized staff |
| /admin/settings | Frozen confirmed payout rule, draft demo configuration and unresolved launch requirements |
| /admin/audit | Searchable immutable activity history |
| /admin/support | Tickets, status and internal resolution notes |

Show calculated figures labeled simulated: received stakes, approved stakes, refunds, and published prize obligations. Prize obligation = eligible winner count × PHP 3,100. For pre-draw maximum prize exposure, evaluate each possible set of up to six distinct result digits against the approved entries and take the largest aggregate payout; a conservative bound is approved entry count × PHP 3,100, clearly labeled as an upper bound. Do not call receipts profit or suggest the payout is financially sustainable. Reserve thresholds remain unconfirmed; flag this in the admin demo. Distinguish refunds, gross prize payments and stake receipts.

Draft draw rules can be edited. Once a draw opens, freeze its schedule and rules snapshot. Corrections use a documented cancellation or versioned review process, never silent overwrites. CSV export, if provided, must obey permissions and escape spreadsheet formula prefixes.

## 9. State machines and transaction integrity

Keep entry eligibility, payment state, result outcome, and refund state separate.

- Entry: Awaiting Payment → Pending Verification → Approved OR Rejected OR Expired. Cancellation of an accepted draw/entry yields Voided through an audited operation.
- Payment: Unpaid → Submitted → Verified OR Rejected. A proof upload is not proof of receipt; use the demo ledger as the simulated source of truth.
- Outcome: Pending Result → Won OR Lost only for Approved entries with a published result. Ineligible entries show Not Eligible.
- Refund: Not Required OR Required → Processing → Completed OR Failed. Never label Refunded until the simulated refund transaction is confirmed.
- Draw: Draft → Open → Submission Closed → Verification Closed → Awaiting Result → Result Review → Published; allow audited cancellation before publication. Publication must wait until scheduled draw time and verification closure.

Verify receipt, consume the payment reference, approve the entry, and append the audit event atomically. A competing approval or duplicate browser retry must not create additional entries or financial records. Use idempotency keys and database constraints, not just disabled buttons.

After publication, a result correction requires a new version, reason, separate review, a visible corrected label, and idempotent recomputation. Preserve the prior result and outcomes in history. Never delete evidence of a correction.

## 10. Minimum data model

Use migrations and explicit foreign keys/constraints. Suggested entities:

- users: id, profile, auth identity, status, timestamps.
- user_roles: user_id, role, granted_by, timestamp.
- teams: id, leader_user_id, status, timestamps.
- agent_assignments: agent_user_id, team_id, assigned_by, starts_at, ends_at; at most one active assignment per agent.
- Optional operational attribution: team_id/agent_id on an entry, only if a later confirmed agent workflow requires it; never infer assignments from client input.
- draws: id, reference label, timezone, schedule timestamps, status, frozen_rules_version.
- rule_versions: id, matching definition, cutoff policy, fixed demo stake, versioned payout configuration: stake_minor=1000, gross_payout_minor=310000, includes_stake=true.
- entries: id, user_id, draw_id, selected_digits, canonical_key, stake_minor_units, eligibility_status, rules_version, submitted_at, approved_at, reviewer_id.
- payments: id, entry_id, provider="demo", reference, expected/received_minor_units, trusted_received_at, state, proof_object_key, verification metadata.
- demo_ledger: immutable simulated receipt/refund transactions linked to payment IDs.
- result_versions: id, draw_id, six_digit_result, source_label, source_url nullable, entered_by, reviewed_by, state, version, correction_reason, timestamps.
- outcomes: entry_id, result_version_id, Won/Lost, nullable prize_minor_units; unique per entry/result version.
- refunds: id, payment_id, amount_minor_units, reason, status, reference, timestamps.
- support_tickets: id, user_id, entry_id nullable, subject, body, state, timestamps.
- audit_events: actor, action, entity ID/type, safe before/after fields, UTC timestamp, request ID.

Store currency as integer minor units, never floating point. Use unique normalized payment references within provider scope. Add an active-entry uniqueness constraint on user/draw/canonical combination, consistent with the proposed retry policy. Prize amounts remain NULL before settlement or for ineligible entries; approved settled wins use 310000 and losses use 0. A NULL amount never means a settled loss.

## 11. Backend operations

Use REST endpoints or typed server actions with equivalent behavior:

- Create entry: validate auth, eligibility, draw/time, rules, amount, uniqueness and idempotency; atomically reserve capacity under the PHP 500 combination cap (section 17).
- Submit simulated payment: bind to exact entry and amount; enforce submission deadline.
- Approve/reject payment: enforce reviewer role, authoritative receipt, cutoff, atomic updates and reason.
- Create/update/open draft draw: validate timing and freeze its rules at opening.
- Expire entries: idempotent scheduled processing plus request-time guards.
- Submit/review/publish result: validate six digits, source, timing, separate reviewer and result version.
- Match eligible entries: transactional or resumable idempotent job with visible processing state.
- Cancel draw/create refunds: audited, idempotent and traceable.
- Complete simulated refund: ledger-confirmed transition.

All mutations reject unauthorized access and stale state. Return actionable validation errors without leaking another player's records or account existence.

## 12. Security, accessibility and reliability

Use established authentication/session tooling; no homemade password hashing. Keep secrets server-side and supply .env.example without real secrets. Apply CSRF protection where relevant, rate limits, secure cookies in production-capable code, and server-side authorization for every operation. Never store authentication secrets in localStorage.

Proof uploads, if included, accept only constrained image/PDF types and sizes, use private access-controlled storage, random file keys and safe rendering. Do not log credentials, full payment proofs, or unnecessary personal data. Demo testers should use synthetic information.

Support keyboard navigation, labeled inputs, visible focus, readable contrast, reduced motion, accessible dialogs and responsive layouts down to 360px. Avoid horizontal overflow and flashy casino effects. Use a clean neutral design with one accent color, large digit buttons, readable countdowns and clear status timelines.

Every data screen needs loading, empty, validation, error and retry states. Disable duplicate submission while a request is pending without relying on that for integrity. Persist demo data across refresh using the database. Provide migrations, backup/restore notes, and safe local seed/reset commands that cannot target production accidentally.

## 13. Acceptance tests

Write meaningful unit/integration tests for business invariants and at least one end-to-end player/admin flow:

1. Accept 012; preserve its leading zero. Reject 112, 555, 101, letters and incorrect lengths on both client and server.
2. 135 and 531 both match 123456; 789 does not. 123 does not match 111222.
3. Reordering the same combination cannot bypass the active-entry duplicate rule; another player can choose it.
4. Submission/payment at the exact submission cutoff is rejected. Approval at the exact verification cutoff is rejected.
5. Payment received before cutoff and approved before verification closure yields Approved; a late approval attempt cannot revive an expired entry.
6. Unverified proof cannot approve an entry. Reusing a payment reference across entries fails.
7. Duplicate clicks, retries and concurrent reviewers produce only one valid approval and ledger effect.
8. Player A cannot read or change player B's entry, proof or support ticket; players cannot call admin operations.
9. An editor cannot self-publish their own result. A result cannot be published before the permitted draw time.
10. Pending, Rejected, Expired and Voided entries never receive winning eligibility.
11. A winning PHP 10 entry pays PHP 3,100 total, not PHP 3,110. Net gain is PHP 3,090. Reject unsupported stake amounts server-side. Losing entries have zero prize, pending amounts remain NULL, and refunds never count as prizes.
12. A cancelled paid draw creates one refund obligation per received payment; unpaid entries create none.
13. A corrected result preserves history and recomputes outcomes once per version.
14. The matching job can safely resume after interruption without duplicating outcomes.
15. Changing the browser clock or preventing the scheduler from running does not bypass cutoff enforcement.
16. Direct-route refresh works, core controls work at mobile width, and essential actions are keyboard accessible.

## 14. Seed scenarios and implementation order

Seed clearly labeled sample draws covering Open, Verification Only, Awaiting Result, Published and Cancelled states. Generate dates relative to seed execution time, not hardcoded past dates. Seed synthetic players and separate staff reviewers. Include pending, approved, rejected, expired, winning and losing entries, and refund examples. Use results such as 123456 and 001234. Do not attribute sample results to a real official draw.

Implementation order:

1. Repository inspection, architecture choice and assumption log.
2. Database/auth/roles and matching/time invariant tests.
3. Player routes, selection, review and simulated payment.
4. Admin verification and automatic expiry.
5. Result review/publication, matching, history and simulated refunds.
6. Responsive polish, accessibility and failure states.
7. Run relevant tests, type checks and build; fix confirmed failures.

## 15. Definition of done and handoff

Deliver the functioning local demo, migrations, seeds, .env.example, README.md, test results and an assumptions/open-decisions list. The full flow must work: player login → three unique digits → simulated payment → admin approval before cutoff → separately reviewed sample result → automatic Won/Lost outcome → player receipt/history.

README must include install/run commands, local demo accounts, how to seed relative-time draws, how to simulate payments, staff review steps, how to run tests, and limitations. Report what was implemented, what was actually tested, and what remains unimplemented. Include simulated payout approval/completion with a unique reference, atomic/idempotent ledger records, and no duplicate payout for the same entry. Result corrections after a simulated payout must flag reconciliation for review rather than silently paying again or debiting a player. A polished mockup alone is insufficient, and passing demo tests is not evidence of real-money operational readiness.

## 16. Payout risk to review before launch

The confirmed gross payout is 310 times the PHP 10 stake. With the broad any-position/any-order matching rule, this may create prize obligations far above collected stakes. Do not present this as a validated business model. For example, when a result has six distinct digits, it contains 20 distinct three-digit combinations. If all 120 possible distinct three-digit selections have one approved PHP 10 entry each, receipts are PHP 1,200 and that result produces 20 winners owing PHP 62,000 total. This is a deterministic scenario, not an assumed draw probability. The demo must retain the owner’s requested payout while making this exposure visible to administrators. Do not silently narrow the winning rule to improve the economics. Require a separate funding and risk review before real-money launch.

## 17. Combination stake cap — owner-requested addition

Confirmed rule: reject an entry that would cause aggregate stakes for its unordered three-digit combination to exceed PHP 500. Aggregate across ALL players, not per player. The implementation scopes the cap to one draw; record that scope as an assumption for owner review. Never combine different draws into one lifetime cap.

Canonical examples: 123, 132, 213, 231, 312 and 321 all share the same bucket. 124 is a different bucket. At fixed PHP 10 per entry, 50 entries fill a bucket; reject entry 51. This cap does not itself authorize repeated entries by the same player: the separate proposed active-entry uniqueness rule remains in effect pending confirmation.

### Player UI

- Once all three digits are selected, show aggregate committed/reserved stake and remaining capacity for the selected draw; do not expose identities of other players.
- Show “Limit: ₱500 per combination per draw”, “Used/reserved: ₱490”, and “Available: ₱10”, using live backend values.
- At capacity, disable Continue/Pay and show “This number combination has already reached the ₱500 limit. Please choose another combination.”
- Equivalent Taglish message: “Naabot na ng combination na ito ang ₱500 limit. Pumili ng ibang combination.”
- At partial remaining capacity, reject any requested stake exceeding what remains. The current fixed ₱10 stake must not be silently changed or moved to another combination/draw.
- Frontend availability is advisory: handle a concurrent server rejection inline even when the previous display showed capacity. Do not open payment instructions until capacity is successfully reserved.

### Reservation policy — proposed demo default

To prevent multiple players paying for the last slot, reserve the entry's full stake atomically when the player confirms the reviewed entry. Count approved entries AND live reservations against the cap.

- An unpaid reservation lasts at most five minutes, shortened to submission cutoff if sooner. Display its expiration time. Five minutes is a proposed implementation default, not a confirmed owner rule.
- A simulated ledger-confirmed payment received before reservation expiry and submission cutoff moves the reservation to Pending Verification, retaining capacity until verification closure.
- A screenshot or client-supplied reference alone cannot extend the reservation. Late payments do not resurrect an expired reservation; route any received funds to the simulated refund process.
- Approval transfers reserved stake to approved stake without increasing the total used amount.
- An unpaid timeout or rejection releases reserved capacity once. A paid rejection also creates a refund obligation. After cutoff, released capacity must not reopen submissions.
- Expiring/rejecting an entry must never release another entry's capacity. Approved entries retain their stake allocation through settlement; prize payment does not release capacity for more entries.
- Cancelling the draw prevents new reservations and follows the existing refund workflow.

### Backend and data integrity

Add combination_capacity with a unique key (draw_id, canonical_key), cap_minor=50000, reserved_minor and approved_minor. Add reservation ID/state/expiry to the entry or a linked capacity_reservations table.

Invariant: 0 <= reserved_minor + approved_minor <= 50000. Check and increment within one transaction using row locking or equivalent atomic conditional updates. Safely handle initial bucket creation with a database unique constraint. Reservation, entry creation and idempotency registration succeed or fail together.

Do not rely on counting in the browser, read-then-write without locking, or eventually consistent counters. Refund and reservation-release retries must be idempotent. Enforce expiration at request time as well as through a periodic job. Keep audit events for reservation, release and approval. Backend approval must fail if the entry no longer has a valid held reservation.

The cap cannot be increased after the draw opens. Show administrators a per-draw combination table with approved stake, reserved stake, remaining amount, entry count and maximum payout for that combination. At 50 eligible winners on one combination, gross payout would be PHP 155,000 (50 × PHP 3,100), despite only PHP 500 in stakes. Multiple different combinations can win on the same draw. This stake cap therefore does not replace aggregate prize-exposure and reserve review.

### Additional acceptance tests

17. At PHP 490 used/reserved, one PHP 10 reservation succeeds; the next fails with the limit message and no payment initiated.
18. At PHP 500, every permutation of the same combination is blocked for every player.
19. Two concurrent requests at PHP 490 yield exactly one success; totals never exceed PHP 500.
20. A different combination and the same combination in a different draw have independent capacity.
21. Retrying a reservation with the same idempotency key does not consume capacity twice.
22. Approval changes reserved to approved without double counting. Timeout/rejection releases capacity exactly once; received funds are refunded separately.
23. Fake proof cannot prolong capacity reservation. A late payment cannot restore an expired slot or bypass the cap.
24. Stale frontend availability is rejected server-side without charging/initiating payment or creating an accepted entry.
25. Capacity released after cutoff does not reopen entry submission. Settling a winning entry does not release its allocation.
26. All stored amounts use centavos: stake=1000, cap=50000, gross prize=310000.

## 18. Admin → Team Leader → Agent hierarchy — confirmed addition

This section extends the existing player and staff roles without removing any preceding requirements. The owner confirms: the main Administrator can see all teams and agents; each Team Leader can see only their own agents and cannot see other Team Leaders or their agents. This must be genuine data isolation, not merely hidden navigation.

### Visibility and authority

| Account | Visible scope | Mutation authority |
| --- | --- | --- |
| Main Administrator | All teams, leaders, agents, player/entry/payment/result/refund records, audit and global reports | Existing admin functions plus team creation and agent assignment; cannot silently change locked entries/rules or erase audit history |
| Team Leader | Own profile, own team, own assigned agent directory and team-scoped operational records where attribution exists | Read-only team oversight by default; cannot grant roles, move agents or perform payment/result approvals unless separately authorized |
| Agent | Own profile and own explicitly attributed operational records | No unconfirmed selling, player creation, entry submission on behalf of others, cash collection or approval authority |
| Player | Own account and own entries/payments/results/support | Existing player workflow unchanged |

“Admin sees everything” means authorized business records, not plaintext passwords, secrets or tokens. Global visibility does not bypass published cutoff rules, locked data, audit logging or the prohibition on self-reviewing a result. A main admin may oversee all queues but cannot self-publish a result they entered; a second authorized reviewer is still required.

A Team Leader cannot list, search, identify, count, export or open another Team Leader or their agents. Do not expose cross-team data through charts, totals, autocomplete, notifications, proof links, error messages or downloaded reports. Global public draw/results information remains available. Do not provide other-team names or identifiers as filter choices.

Agent capabilities beyond a restricted dashboard are not yet specified. Do not invent commissions, balances, downlines beyond one agent level, player ownership, agent deposits or agent cash collection. Keep unsupported actions absent or explicitly unavailable. Main Administrator assigns Team Leaders and Agents; self-registration cannot create privileged roles.

### Assignment model and proposed defaults

- One Team Leader per team and one active team assignment per Agent for the initial implementation. These cardinalities are defaults; keep documented for owner review.
- Main Administrator creates/assigns accounts and may deactivate assignments. Unassigned Agents are visible only to Admin and themselves, not every Team Leader.
- Every assignment/reassignment is audited with actor and timestamp.
- For any future team-attributed transactions, freeze originating team_id and agent_id on creation. Historical records stay scoped to their originating team; moving an Agent must not transfer prior team transaction history automatically. Mark this historical-visibility policy as a proposed default.
- Revoked/transferred access must take effect on subsequent server requests, including cached dashboards and download links. Invalidate or refresh authorization caches appropriately.
- Users must not obtain broader access by combining roles accidentally. A Team Leader/Agent account must not also receive a global payment-review or result-review role without explicit admin authorization and a clear record of the resulting scope.

### New routes and UI

| Route | Required content |
| --- | --- |
| /admin/teams | All teams/leaders, agent counts, status, create and manage assignments |
| /admin/teams/:id | Selected team's leader, agents and scoped activity; accessible to Admin only |
| /admin/agents | Global agent directory and assignment controls |
| /team | Current Team Leader's own dashboard; own agent count and scoped activity only |
| /team/agents | Own assigned agent directory; search/filter within that team only |
| /team/agents/:id | Own assigned Agent's permitted profile and attributed activity only |
| /team/reports | Own team report; display empty states if no attributed transactions exist |
| /agent | Current Agent's own dashboard/profile and own attributed records only |

Existing admin user/role screens must include these new roles. Provide role-aware navigation and login landing routes. Shared player functions remain available only if the same account explicitly has a player role. Team dashboards must not fabricate attributed player revenue or transactions when the workflow has not yet been defined.

### Server enforcement

Derive team/agent scope from the authenticated identity and current server-side assignment, never from a client-selected team_id alone. Apply it to every database read, list, detail, aggregate, export, subscription and file access. Use row-level security where supported or a central tested authorization layer with scoped queries. Return a consistent forbidden/not-found response without revealing a cross-team record's identity or contents.

Global combination limits from section 17 stay global across ALL teams for the same draw/canonical combination. A new Team Leader or Agent must not create a separate PHP 500 capacity pool. Public capacity availability may show aggregate availability without revealing which teams or players contributed.

### Additional acceptance tests

27. Admin can inspect both Team A and Team B and their Agents without changing accounts.
28. Team Leader A can list/open Agents in Team A but cannot list/open Team B or its Agents through UI, API, guessed IDs, exports, proof URLs or live updates.
29. Team Leader B has the same reciprocal isolation; no global team names/counts leak into either leader dashboard.
30. Agent A cannot inspect another Agent's records or their Team Leader's aggregate report.
31. Direct API requests with a forged team_id cannot alter scope. Public registration and profile updates cannot grant admin/leader privileges.
32. Unassigned agents remain invisible to all Team Leaders. Assignment/deactivation changes take effect on the next authorized request.
33. Reassignment does not disclose historical records from the former team to the new leader, consistent with the proposed history policy.
34. Global combination capacity remains PHP 500 even when entries are attributed to different teams/agents.
35. Admin's broad visibility still cannot bypass cutoff, overwrite locked entries, self-review a result or erase audit events.
36. All added routes support mobile, keyboard operation, loading/empty/error states and direct-link refresh.

### Handoff requirement

Include these roles, routes, assignments and access tests in the completed demo. Seed two separate Team Leaders with at least two Agents each and one unassigned Agent so isolation can be demonstrated. Explain that agent selling/collection powers, player attribution, commissions and historical reassignment policy remain unconfirmed; this does not block implementing the confirmed visibility hierarchy.

## Owner amendment — 6 October 2026: Higgsfield media

The owner approved using Higgsfield, overriding the "Do not use paid media generation or Higgsfield" line in §1 **for these assets only**:

- one home-page hero illustration;
- two empty-state illustrations ("no entries yet", "no results yet");
- one silent 8-second "how it works" animation on the home page.

The other rules still apply. Assets must not show money, coins, prizes, casino or slot-machine imagery, or flashy effects (§12). They must not imitate any real lottery or brand. The demo banner and all simulated-payment rules are unchanged. The video never autoplays. Assets are served locally from `public/media/`, and Higgsfield's website-publishing features are not used. Each generated asset is recorded in `ASSETS.md`.

## Owner amendment — 6 October 2026: results never repeat a digit

Confirmed by the owner: **a six-digit result always has six different digits** ("walang inuulit na numero sa result"). This replaces the §4 statement that "repeated digits in the RESULT are allowed", and the §4 examples that used results with repeats (`001234`, `111222`).

- A result with any repeated digit (e.g. `001234`, `112345`) is rejected. This is enforced in the result form, in the server service and by a database trigger (`migrations/002_result_distinct_digits.sql`).
- Matching is unchanged: an entry wins when all three of its digits appear anywhere in the result.
- Payout is unchanged: ₱10 → ₱3,100 total, stake included.
- Because every valid result has six distinct digits, every result makes exactly 20 of the 120 unordered combinations win.
- Updated examples: `012` vs `301245` → Won; `123` vs `124567` → Lost (3 absent).
