import type { Db } from '../db/index.js';
import { COMBINATION_CAP_MINOR } from '../domain/rules.js';
import { audit } from './audit.js';

export interface CapacityRow {
  draw_id: number;
  canonical_key: string;
  cap_minor: number;
  reserved_minor: number;
  approved_minor: number;
}

export interface CapacityView {
  canonical: string;
  capMinor: number;
  reservedMinor: number;
  approvedMinor: number;
  usedMinor: number;
  availableMinor: number;
  full: boolean;
}

export function capacityView(db: Db, drawId: number, canonical: string): CapacityView {
  const row = db.get<CapacityRow>('SELECT * FROM combination_capacity WHERE draw_id = ? AND canonical_key = ?', drawId, canonical);
  const cap = row?.cap_minor ?? COMBINATION_CAP_MINOR;
  const reserved = row?.reserved_minor ?? 0;
  const approved = row?.approved_minor ?? 0;
  const used = reserved + approved;
  return { canonical, capMinor: cap, reservedMinor: reserved, approvedMinor: approved, usedMinor: used, availableMinor: Math.max(0, cap - used), full: cap - used <= 0 };
}

/** Atomic conditional increment. Must run inside a transaction. The bucket row
 *  is created idempotently (primary key), then one guarded UPDATE either takes
 *  the capacity or changes nothing. A CHECK constraint backs this up. */
export function reserveCapacity(db: Db, drawId: number, canonical: string, amount: number, at: string): boolean {
  if (!db.inTransaction) throw new Error('reserveCapacity requires a transaction');
  db.run('INSERT OR IGNORE INTO combination_capacity (draw_id, canonical_key, cap_minor, reserved_minor, approved_minor, updated_at) VALUES (?, ?, ?, 0, 0, ?)', drawId, canonical, COMBINATION_CAP_MINOR, at);
  const r = db.run(
    `UPDATE combination_capacity SET reserved_minor = reserved_minor + ?, updated_at = ?
     WHERE draw_id = ? AND canonical_key = ? AND reserved_minor + approved_minor + ? <= cap_minor`,
    amount, at, drawId, canonical, amount,
  );
  return r.changes === 1;
}

interface EntryCap {
  id: number;
  draw_id: number;
  canonical_key: string;
  stake_minor_units: number;
}

/** Releases THIS entry's held reservation exactly once (state guard on the entry
 *  row), so retries or other entries can never double-release. */
export function releaseReservation(db: Db, entry: EntryCap, at: string, actorId: number | null, requestId: string | null): boolean {
  const r = db.run(`UPDATE entries SET reservation_state = 'released', reservation_expires_at = NULL, updated_at = ? WHERE id = ? AND reservation_state = 'held'`, at, entry.id);
  if (r.changes !== 1) return false;
  const u = db.run(
    `UPDATE combination_capacity SET reserved_minor = reserved_minor - ?, updated_at = ? WHERE draw_id = ? AND canonical_key = ? AND reserved_minor >= ?`,
    entry.stake_minor_units, at, entry.draw_id, entry.canonical_key, entry.stake_minor_units,
  );
  if (u.changes !== 1) throw new Error('capacity accounting mismatch on release');
  audit(db, { actorId, action: 'capacity.released', entityType: 'entry', entityId: entry.id, after: { canonical: entry.canonical_key, amount: entry.stake_minor_units }, requestId, at });
  return true;
}

/** Approval moves reserved -> approved without changing total used. */
export function convertReservation(db: Db, entry: EntryCap, at: string): void {
  const r = db.run(`UPDATE entries SET reservation_state = 'converted', reservation_expires_at = NULL, updated_at = ? WHERE id = ? AND reservation_state = 'held'`, at, entry.id);
  if (r.changes !== 1) throw new Error('entry has no held reservation');
  const u = db.run(
    `UPDATE combination_capacity SET reserved_minor = reserved_minor - ?, approved_minor = approved_minor + ?, updated_at = ?
     WHERE draw_id = ? AND canonical_key = ? AND reserved_minor >= ?`,
    entry.stake_minor_units, entry.stake_minor_units, at, entry.draw_id, entry.canonical_key, entry.stake_minor_units,
  );
  if (u.changes !== 1) throw new Error('capacity accounting mismatch on approval');
}

export interface CombinationStat extends CapacityRow {
  entry_count: number;
  approved_count: number;
}

export function combinationTable(db: Db, drawId: number): CombinationStat[] {
  return db.all<CombinationStat>(
    `SELECT c.*,
       (SELECT count(*) FROM entries e WHERE e.draw_id = c.draw_id AND e.canonical_key = c.canonical_key AND e.eligibility_status IN ('awaiting_payment','pending_verification','approved')) AS entry_count,
       (SELECT count(*) FROM entries e WHERE e.draw_id = c.draw_id AND e.canonical_key = c.canonical_key AND e.eligibility_status = 'approved') AS approved_count
     FROM combination_capacity c WHERE c.draw_id = ? AND (c.reserved_minor + c.approved_minor) > 0
     ORDER BY (c.reserved_minor + c.approved_minor) DESC, c.canonical_key`,
    drawId,
  );
}
