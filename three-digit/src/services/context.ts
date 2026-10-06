import type { Db } from '../db/index.js';
import type { Clock } from '../lib/clock.js';
import { ForbiddenError } from '../lib/errors.js';

export const ROLES = ['player', 'payment_reviewer', 'result_editor', 'result_reviewer', 'admin', 'team_leader', 'agent'] as const;
export type Role = (typeof ROLES)[number];
export const GLOBAL_STAFF_ROLES: Role[] = ['admin', 'payment_reviewer', 'result_editor', 'result_reviewer'];
export const SCOPED_ROLES: Role[] = ['team_leader', 'agent'];

export const ROLE_LABEL: Record<Role, string> = {
  player: 'Player',
  payment_reviewer: 'Payment reviewer',
  result_editor: 'Result editor',
  result_reviewer: 'Result reviewer',
  admin: 'Administrator',
  team_leader: 'Team leader',
  agent: 'Agent',
};

export interface Actor {
  id: number;
  email: string;
  displayName: string;
  roles: ReadonlySet<Role>;
}

export interface Ctx {
  db: Db;
  clock: Clock;
  actor: Actor | null;
  requestId: string;
}

export function hasAny(actor: Actor | null, roles: readonly Role[]): boolean {
  return !!actor && roles.some((r) => actor.roles.has(r));
}

/** Server-side permission gate used by every mutation. */
export function requireAny(ctx: Ctx, roles: readonly Role[]): Actor {
  if (!ctx.actor) throw new ForbiddenError('Please sign in.');
  if (!hasAny(ctx.actor, roles)) throw new ForbiddenError();
  return ctx.actor;
}

export const nowIso = (ctx: { clock: Clock }) => ctx.clock.now().toISOString();
