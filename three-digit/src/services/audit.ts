import type { Db } from '../db/index.js';

const SENSITIVE = /password|token|secret|hash|session/i;

function safe(obj: unknown): string | null {
  if (obj === undefined || obj === null) return null;
  return JSON.stringify(obj, (k, v) => (k && SENSITIVE.test(k) ? '[redacted]' : v));
}

export interface AuditInput {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  at: string;
}

/** Append-only (DB triggers reject UPDATE/DELETE on audit_events). */
export function audit(db: Db, e: AuditInput): void {
  db.run(
    `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, before_json, after_json, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    e.actorId,
    e.action,
    e.entityType,
    e.entityId === undefined || e.entityId === null ? null : String(e.entityId),
    safe(e.before),
    safe(e.after),
    e.requestId ?? null,
    e.at,
  );
}

export interface AuditRow {
  id: number;
  actor_user_id: number | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  request_id: string | null;
  created_at: string;
}

export function searchAudit(db: Db, q: { text?: string; entityType?: string; limit?: number }): AuditRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.text) {
    where.push(`(a.action LIKE ? OR a.entity_id = ? OR u.email LIKE ? OR a.after_json LIKE ?)`);
    const like = `%${q.text}%`;
    params.push(like, q.text, like, like);
  }
  if (q.entityType) {
    where.push('a.entity_type = ?');
    params.push(q.entityType);
  }
  return db.all<AuditRow>(
    `SELECT a.*, u.email AS actor_email FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`,
    ...params,
    q.limit ?? 200,
  );
}
