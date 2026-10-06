-- 001_initial.sql — Three-Digit Entry Platform (DEMO)
-- All timestamps are UTC ISO-8601 strings produced by Date#toISOString(), so
-- lexicographic comparison equals chronological comparison.
-- All money is integer centavos (minor units). No floating point.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  display_name  TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX users_email_unique ON users(email);

CREATE TABLE user_roles (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL CHECK (role IN ('player', 'payment_reviewer', 'result_editor', 'result_reviewer', 'admin', 'team_leader', 'agent')),
  granted_by INTEGER REFERENCES users(id),
  granted_at TEXT NOT NULL,
  combined_scope_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (combined_scope_confirmed IN (0, 1)),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,           -- sha256 of the cookie token; the token itself is never stored
  user_id      INTEGER NOT NULL REFERENCES users(id),
  flash_json   TEXT,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- Versioned rules. The CHECKs encode the owner-confirmed fixed-stake payout:
-- PHP 10 stake -> PHP 3,100 gross INCLUDING the stake; PHP 500 per-combination cap.
CREATE TABLE rule_versions (
  id                    INTEGER PRIMARY KEY,
  label                 TEXT NOT NULL,
  matching_definition   TEXT NOT NULL,
  cutoff_policy         TEXT NOT NULL,
  stake_minor           INTEGER NOT NULL CHECK (stake_minor = 1000),
  gross_payout_minor    INTEGER NOT NULL CHECK (gross_payout_minor = 310000),
  includes_stake        INTEGER NOT NULL CHECK (includes_stake = 1),
  combination_cap_minor INTEGER NOT NULL CHECK (combination_cap_minor = 50000),
  reservation_minutes   INTEGER NOT NULL CHECK (reservation_minutes BETWEEN 1 AND 60),
  created_at            TEXT NOT NULL
);
CREATE TRIGGER rule_versions_immutable BEFORE UPDATE ON rule_versions
BEGIN SELECT RAISE(ABORT, 'rule versions are immutable'); END;

CREATE TABLE teams (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 60),
  leader_user_id INTEGER UNIQUE REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by     INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE agent_assignments (
  id            INTEGER PRIMARY KEY,
  agent_user_id INTEGER NOT NULL REFERENCES users(id),
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  assigned_by   INTEGER NOT NULL REFERENCES users(id),
  starts_at     TEXT NOT NULL,
  ends_at       TEXT,
  ended_by      INTEGER REFERENCES users(id),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE UNIQUE INDEX agent_assignments_one_active ON agent_assignments(agent_user_id) WHERE ends_at IS NULL;
CREATE INDEX agent_assignments_team ON agent_assignments(team_id);

-- Draw lifecycle: stored status is draft | open | cancelled. Time-driven phases
-- (submission closed, verification closed, awaiting result) and result phases
-- are derived from server time and result_versions.
CREATE TABLE draws (
  id                     INTEGER PRIMARY KEY,
  reference_label        TEXT NOT NULL CHECK (length(reference_label) BETWEEN 3 AND 80),
  timezone               TEXT NOT NULL DEFAULT 'Asia/Manila' CHECK (timezone = 'Asia/Manila'),
  opens_at               TEXT NOT NULL,
  submission_closes_at   TEXT NOT NULL,
  verification_closes_at TEXT NOT NULL,
  scheduled_draw_at      TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'cancelled')),
  rule_version_id        INTEGER NOT NULL REFERENCES rule_versions(id),
  frozen_at              TEXT,
  cancelled_at           TEXT,
  cancel_reason          TEXT,
  cancelled_by           INTEGER REFERENCES users(id),
  created_by             INTEGER REFERENCES users(id),
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  CHECK (opens_at < submission_closes_at
     AND submission_closes_at < verification_closes_at
     AND verification_closes_at < scheduled_draw_at),
  CHECK (status = 'draft' OR frozen_at IS NOT NULL),
  CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL))
);
CREATE TRIGGER draws_frozen_guard
BEFORE UPDATE OF reference_label, opens_at, submission_closes_at, verification_closes_at, scheduled_draw_at, rule_version_id ON draws
WHEN OLD.frozen_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'draw schedule and rules are frozen once opened'); END;
CREATE TRIGGER draws_status_guard BEFORE UPDATE OF status ON draws
WHEN NOT (OLD.status = NEW.status
       OR (OLD.status = 'draft' AND NEW.status IN ('open', 'cancelled'))
       OR (OLD.status = 'open'  AND NEW.status = 'cancelled'))
BEGIN SELECT RAISE(ABORT, 'illegal draw status transition'); END;

CREATE TABLE entries (
  id                     INTEGER PRIMARY KEY,
  public_ref             TEXT NOT NULL UNIQUE,
  user_id                INTEGER NOT NULL REFERENCES users(id),
  draw_id                INTEGER NOT NULL REFERENCES draws(id),
  selected_digits        TEXT NOT NULL CHECK (
                           length(selected_digits) = 3 AND selected_digits GLOB '[0-9][0-9][0-9]'
                           AND substr(selected_digits, 1, 1) <> substr(selected_digits, 2, 1)
                           AND substr(selected_digits, 1, 1) <> substr(selected_digits, 3, 1)
                           AND substr(selected_digits, 2, 1) <> substr(selected_digits, 3, 1)),
  canonical_key          TEXT NOT NULL CHECK (
                           length(canonical_key) = 3 AND canonical_key GLOB '[0-9][0-9][0-9]'
                           AND substr(canonical_key, 1, 1) < substr(canonical_key, 2, 1)
                           AND substr(canonical_key, 2, 1) < substr(canonical_key, 3, 1)),
  stake_minor_units      INTEGER NOT NULL CHECK (stake_minor_units = 1000),
  eligibility_status     TEXT NOT NULL CHECK (eligibility_status IN
                           ('awaiting_payment', 'pending_verification', 'approved', 'rejected', 'expired', 'voided')),
  rule_version_id        INTEGER NOT NULL REFERENCES rule_versions(id),
  idempotency_key        TEXT NOT NULL,
  reservation_state      TEXT NOT NULL CHECK (reservation_state IN ('held', 'converted', 'released')),
  reservation_expires_at TEXT,
  -- Optional attribution. No confirmed workflow sets these yet; never inferred from client input.
  team_id                INTEGER REFERENCES teams(id),
  agent_id               INTEGER REFERENCES users(id),
  submitted_at           TEXT NOT NULL,
  approved_at            TEXT,
  reviewer_id            INTEGER REFERENCES users(id),
  rejected_at            TEXT,
  rejection_reason       TEXT,
  expired_at             TEXT,
  voided_at              TEXT,
  void_reason            TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  UNIQUE (user_id, idempotency_key)
);
-- One ACTIVE entry per player + draw + unordered combination (135 == 531).
CREATE UNIQUE INDEX entries_active_combination ON entries(user_id, draw_id, canonical_key)
  WHERE eligibility_status IN ('awaiting_payment', 'pending_verification', 'approved');
CREATE INDEX entries_draw_status ON entries(draw_id, eligibility_status);
CREATE INDEX entries_user ON entries(user_id, created_at);
CREATE INDEX entries_reservation_due ON entries(reservation_expires_at) WHERE eligibility_status = 'awaiting_payment';
CREATE TRIGGER entries_selection_immutable
BEFORE UPDATE OF public_ref, user_id, draw_id, selected_digits, canonical_key, stake_minor_units, rule_version_id, idempotency_key, submitted_at, created_at ON entries
BEGIN SELECT RAISE(ABORT, 'entry selection is immutable'); END;
CREATE TRIGGER entries_status_guard BEFORE UPDATE OF eligibility_status ON entries
WHEN NOT (OLD.eligibility_status = NEW.eligibility_status
       OR (OLD.eligibility_status = 'awaiting_payment'     AND NEW.eligibility_status IN ('pending_verification', 'rejected', 'expired', 'voided'))
       OR (OLD.eligibility_status = 'pending_verification' AND NEW.eligibility_status IN ('approved', 'rejected', 'expired', 'voided'))
       OR (OLD.eligibility_status = 'approved'             AND NEW.eligibility_status = 'voided'))
BEGIN SELECT RAISE(ABORT, 'illegal entry status transition'); END;
CREATE TRIGGER entries_reservation_guard BEFORE UPDATE OF reservation_state ON entries
WHEN NOT (OLD.reservation_state = NEW.reservation_state
       OR (OLD.reservation_state = 'held' AND NEW.reservation_state IN ('converted', 'released')))
BEGIN SELECT RAISE(ABORT, 'illegal reservation transition'); END;

-- Global per-draw capacity bucket per unordered combination (all permutations,
-- all players, all teams share one bucket).
CREATE TABLE combination_capacity (
  draw_id        INTEGER NOT NULL REFERENCES draws(id),
  canonical_key  TEXT NOT NULL,
  cap_minor      INTEGER NOT NULL DEFAULT 50000 CHECK (cap_minor = 50000),
  reserved_minor INTEGER NOT NULL DEFAULT 0,
  approved_minor INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (draw_id, canonical_key),
  CHECK (reserved_minor >= 0 AND approved_minor >= 0 AND reserved_minor + approved_minor <= cap_minor)
);

CREATE TABLE payments (
  id                    INTEGER PRIMARY KEY,
  entry_id              INTEGER NOT NULL UNIQUE REFERENCES entries(id),
  provider              TEXT NOT NULL DEFAULT 'demo' CHECK (provider = 'demo'),
  reference             TEXT CHECK (reference IS NULL OR (reference GLOB '[A-Z0-9]*' AND length(reference) BETWEEN 6 AND 24)),
  expected_minor_units  INTEGER NOT NULL CHECK (expected_minor_units > 0),
  received_minor_units  INTEGER CHECK (received_minor_units IS NULL OR received_minor_units > 0),
  trusted_received_at   TEXT,
  state                 TEXT NOT NULL DEFAULT 'unpaid' CHECK (state IN ('unpaid', 'submitted', 'verified', 'rejected')),
  proof_object_key      TEXT UNIQUE,
  submitted_at          TEXT,
  verified_by           INTEGER REFERENCES users(id),
  verified_at           TEXT,
  rejected_by           INTEGER REFERENCES users(id),
  rejected_at           TEXT,
  rejection_reason      TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  CHECK ((received_minor_units IS NULL) = (trusted_received_at IS NULL)),
  CHECK (state <> 'verified' OR received_minor_units = expected_minor_units)
);
CREATE UNIQUE INDEX payments_reference_unique ON payments(provider, reference) WHERE reference IS NOT NULL;
CREATE INDEX payments_state ON payments(state);
CREATE TRIGGER payments_status_guard BEFORE UPDATE OF state ON payments
WHEN NOT (OLD.state = NEW.state
       OR (OLD.state = 'unpaid'    AND NEW.state IN ('submitted', 'rejected'))
       OR (OLD.state = 'submitted' AND NEW.state IN ('verified', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'illegal payment status transition'); END;
CREATE TRIGGER payments_receipt_once BEFORE UPDATE OF received_minor_units, trusted_received_at ON payments
WHEN OLD.trusted_received_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'payment receipt already recorded'); END;

CREATE TABLE refunds (
  id                 INTEGER PRIMARY KEY,
  payment_id         INTEGER NOT NULL UNIQUE REFERENCES payments(id),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  reason             TEXT NOT NULL CHECK (reason IN ('payment_rejected', 'entry_expired', 'draw_cancelled', 'entry_voided')),
  status             TEXT NOT NULL DEFAULT 'required' CHECK (status IN ('required', 'processing', 'completed', 'failed')),
  reference          TEXT UNIQUE,
  failure_reason     TEXT,
  attempts           INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  completed_at       TEXT,
  CHECK (status <> 'completed' OR (reference IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE TRIGGER refunds_status_guard BEFORE UPDATE OF status ON refunds
WHEN NOT (OLD.status = NEW.status
       OR (OLD.status = 'required'   AND NEW.status = 'processing')
       OR (OLD.status = 'processing' AND NEW.status IN ('completed', 'failed'))
       OR (OLD.status = 'failed'     AND NEW.status = 'processing'))
BEGIN SELECT RAISE(ABORT, 'illegal refund status transition'); END;

CREATE TABLE result_versions (
  id                INTEGER PRIMARY KEY,
  draw_id           INTEGER NOT NULL REFERENCES draws(id),
  version           INTEGER NOT NULL CHECK (version >= 1),
  six_digit_result  TEXT NOT NULL CHECK (length(six_digit_result) = 6 AND six_digit_result GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  source_label      TEXT NOT NULL CHECK (length(source_label) BETWEEN 3 AND 120),
  source_url        TEXT,
  entered_by        INTEGER NOT NULL REFERENCES users(id),
  entered_at        TEXT NOT NULL,
  reviewed_by       INTEGER REFERENCES users(id),
  reviewed_at       TEXT,
  review_note       TEXT,
  state             TEXT NOT NULL CHECK (state IN ('submitted', 'rejected', 'published', 'superseded')),
  correction_reason TEXT,
  matching_state    TEXT NOT NULL DEFAULT 'not_started' CHECK (matching_state IN ('not_started', 'processing', 'complete')),
  published_at      TEXT,
  UNIQUE (draw_id, version),
  CHECK (reviewed_by IS NULL OR reviewed_by <> entered_by),
  CHECK (state NOT IN ('published', 'superseded') OR (reviewed_by IS NOT NULL AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX result_versions_one_pending   ON result_versions(draw_id) WHERE state = 'submitted';
CREATE UNIQUE INDEX result_versions_one_published ON result_versions(draw_id) WHERE state = 'published';
CREATE TRIGGER result_versions_value_immutable
BEFORE UPDATE OF draw_id, version, six_digit_result, source_label, source_url, entered_by, entered_at, correction_reason ON result_versions
BEGIN SELECT RAISE(ABORT, 'result versions are immutable; submit a correction instead'); END;
CREATE TRIGGER result_versions_no_delete BEFORE DELETE ON result_versions
BEGIN SELECT RAISE(ABORT, 'result history cannot be deleted'); END;

CREATE TABLE outcomes (
  entry_id          INTEGER NOT NULL REFERENCES entries(id),
  result_version_id INTEGER NOT NULL REFERENCES result_versions(id),
  outcome           TEXT NOT NULL CHECK (outcome IN ('won', 'lost')),
  prize_minor_units INTEGER CHECK (prize_minor_units IS NULL
                      OR (outcome = 'won'  AND prize_minor_units = 310000)
                      OR (outcome = 'lost' AND prize_minor_units = 0)),
  matched_digits    TEXT NOT NULL,
  missing_digits    TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (entry_id, result_version_id)
);
CREATE TRIGGER outcomes_no_update BEFORE UPDATE ON outcomes BEGIN SELECT RAISE(ABORT, 'outcomes are immutable'); END;
CREATE TRIGGER outcomes_no_delete BEFORE DELETE ON outcomes BEGIN SELECT RAISE(ABORT, 'outcomes are immutable'); END;

CREATE TABLE payouts (
  id                INTEGER PRIMARY KEY,
  entry_id          INTEGER NOT NULL UNIQUE REFERENCES entries(id),   -- never two payouts for one entry
  result_version_id INTEGER NOT NULL REFERENCES result_versions(id),
  gross_minor_units INTEGER NOT NULL CHECK (gross_minor_units = 310000),
  state             TEXT NOT NULL CHECK (state IN ('approved', 'completed', 'cancelled')),
  reference         TEXT NOT NULL UNIQUE,
  approved_by       INTEGER NOT NULL REFERENCES users(id),
  approved_at       TEXT NOT NULL,
  completed_by      INTEGER REFERENCES users(id),
  completed_at      TEXT,
  cancelled_at      TEXT,
  cancel_reason     TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE TRIGGER payouts_status_guard BEFORE UPDATE OF state ON payouts
WHEN NOT (OLD.state = NEW.state OR (OLD.state = 'approved' AND NEW.state IN ('completed', 'cancelled')))
BEGIN SELECT RAISE(ABORT, 'illegal payout status transition'); END;

CREATE TABLE reconciliation_flags (
  id                INTEGER PRIMARY KEY,
  payout_id         INTEGER NOT NULL REFERENCES payouts(id),
  entry_id          INTEGER NOT NULL REFERENCES entries(id),
  result_version_id INTEGER NOT NULL REFERENCES result_versions(id),
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by       INTEGER REFERENCES users(id),
  resolution_note   TEXT,
  created_at        TEXT NOT NULL,
  resolved_at       TEXT,
  UNIQUE (payout_id, result_version_id)
);

-- Immutable simulated money movements. Nothing here is a real transaction.
CREATE TABLE demo_ledger (
  id                 INTEGER PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('receipt', 'refund', 'payout')),
  payment_id         INTEGER REFERENCES payments(id),
  refund_id          INTEGER REFERENCES refunds(id),
  payout_id          INTEGER REFERENCES payouts(id),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  reference          TEXT NOT NULL UNIQUE,
  idempotency_key    TEXT NOT NULL UNIQUE,
  created_by         INTEGER REFERENCES users(id),
  created_at         TEXT NOT NULL,
  CHECK ((kind = 'receipt' AND payment_id IS NOT NULL AND refund_id IS NULL AND payout_id IS NULL)
      OR (kind = 'refund'  AND payment_id IS NOT NULL AND refund_id IS NOT NULL AND payout_id IS NULL)
      OR (kind = 'payout'  AND payout_id IS NOT NULL AND payment_id IS NULL AND refund_id IS NULL))
);
CREATE TRIGGER demo_ledger_no_update BEFORE UPDATE ON demo_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER demo_ledger_no_delete BEFORE DELETE ON demo_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TABLE support_tickets (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  entry_id   INTEGER REFERENCES entries(id),
  subject    TEXT NOT NULL CHECK (length(subject) BETWEEN 3 AND 120),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 5 AND 4000),
  state      TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE support_messages (
  id         INTEGER PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES support_tickets(id),
  author_id  INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  internal   INTEGER NOT NULL DEFAULT 0 CHECK (internal IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id            INTEGER PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  before_json   TEXT,
  after_json    TEXT,
  request_id    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX audit_events_created ON audit_events(created_at);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit history is immutable'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit history is immutable'); END;
