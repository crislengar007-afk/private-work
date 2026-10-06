// Child process used by the concurrency test: opens the SAME database file and
// tries to reserve one entry. Prints OK or the domain error code.
import { Db } from '../../src/db/index.js';
import { systemClock } from '../../src/lib/clock.js';
import { DomainError } from '../../src/lib/errors.js';
import { createEntry } from '../../src/services/entries.js';
import { getUser, toActor } from '../../src/services/users.js';

const [file, userId, drawId, digits, startAt] = process.argv.slice(2);
const db = new Db(file);
const ctx = { db, clock: systemClock, actor: toActor(db, getUser(db, Number(userId))!), requestId: 'worker' };
// Line all workers up so they hit the database at the same moment.
while (Date.now() < Number(startAt)) { /* spin */ }
try {
  createEntry(ctx, { drawId: Number(drawId), digits, stakeMinor: 1000, idempotencyKey: `worker-${userId}-${process.pid}-key` });
  console.log('OK');
} catch (e) {
  console.log(e instanceof DomainError ? e.code : `ERR ${(e as Error).message}`);
}
db.close();
