import { Db, migrate } from '../../src/db/index.js';
import { FixedClock, HOUR, MINUTE } from '../../src/lib/clock.js';
import { type Ctx, type Role } from '../../src/services/context.js';
import { ensureDefaultRuleVersion } from '../../src/services/draws.js';
import { insertUser, toActor, getUser } from '../../src/services/users.js';

export const T0 = new Date('2026-10-06T00:00:00.000Z');

export interface TestEnv {
  db: Db;
  clock: FixedClock;
  user(roles: Role[], email?: string): number;
  as(userId: number): Ctx;
  system(): Ctx;
  draw(opts?: Partial<{ opensIn: number; submissionIn: number; verificationIn: number; drawIn: number; status: 'draft' | 'open' }>): number;
}

let seq = 0;

/** In-memory database + deterministic clock. Password hashes are dummies because
 *  service tests never authenticate. */
export function createEnv(file = ':memory:'): TestEnv {
  const db = new Db(file);
  migrate(db);
  const clock = new FixedClock(T0);
  const env: TestEnv = {
    db,
    clock,
    user(roles, email) {
      return insertUser(db, { email: email ?? `user${++seq}_${Math.random().toString(36).slice(2, 7)}@test.local`, displayName: 'Test User', passwordHash: 'x', roles, grantedBy: null, at: clock.now().toISOString() });
    },
    as(userId) {
      return { db, clock, actor: toActor(db, getUser(db, userId)!), requestId: 'test' };
    },
    system() {
      return { db, clock, actor: null, requestId: 'test' };
    },
    draw(o = {}) {
      const now = clock.now().getTime();
      const iso = (ms: number) => new Date(now + ms).toISOString();
      const ruleId = ensureDefaultRuleVersion(db, iso(0));
      const status = o.status ?? 'open';
      return db.run(
        `INSERT INTO draws (reference_label, opens_at, submission_closes_at, verification_closes_at, scheduled_draw_at, status, rule_version_id, frozen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `Test draw ${++seq}`, iso(o.opensIn ?? -HOUR), iso(o.submissionIn ?? 2 * HOUR), iso(o.verificationIn ?? 3 * HOUR), iso(o.drawIn ?? 4 * HOUR),
        status, ruleId, status === 'draft' ? null : iso(0), iso(0), iso(0),
      ).lastInsertRowid;
    },
  };
  return env;
}

let keySeq = 0;
export const idem = () => `test-key-${Date.now()}-${++keySeq}-abcdef`;
export { HOUR, MINUTE };
