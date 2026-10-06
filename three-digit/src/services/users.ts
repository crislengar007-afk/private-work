import bcrypt from 'bcryptjs';
import type { Db } from '../db/index.js';
import { DomainError, NotFoundError, isConstraintError } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/ids.js';
import { audit } from './audit.js';
import { type Actor, type Ctx, type Role, GLOBAL_STAFF_ROLES, ROLES, SCOPED_ROLES, requireAny, nowIso } from './context.js';

export interface UserRow {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 10);
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 4);
const SESSION_MS = 12 * 3600_000;

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

export function passwordProblems(pw: unknown, confirm?: unknown): string[] {
  const p = typeof pw === 'string' ? pw : '';
  const out: string[] = [];
  if (p.length < 10) out.push('Password must be at least 10 characters.');
  if (p.length > 128) out.push('Password must be at most 128 characters.');
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) out.push('Password must include at least one letter and one number.');
  if (confirm !== undefined && confirm !== p) out.push('Passwords do not match.');
  return out;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, BCRYPT_COST);
}

export function rolesOf(db: Db, userId: number): Set<Role> {
  return new Set(db.all<{ role: Role }>('SELECT role FROM user_roles WHERE user_id = ?', userId).map((r) => r.role));
}

export function getUser(db: Db, id: number): UserRow | undefined {
  return db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

export function toActor(db: Db, u: UserRow): Actor {
  return { id: u.id, email: u.email, displayName: u.display_name, roles: rolesOf(db, u.id) };
}

/** Insert user + roles. Callers decide which roles are allowed. */
export function insertUser(db: Db, u: { email: string; displayName: string; passwordHash: string; roles: Role[]; grantedBy: number | null; at: string }): number {
  const id = db.run(
    'INSERT INTO users (email, display_name, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    u.email, u.displayName, u.passwordHash, 'active', u.at, u.at,
  ).lastInsertRowid;
  const combined = u.roles.some((r) => GLOBAL_STAFF_ROLES.includes(r)) && u.roles.some((r) => SCOPED_ROLES.includes(r));
  for (const role of u.roles) {
    db.run('INSERT INTO user_roles (user_id, role, granted_by, granted_at, combined_scope_confirmed) VALUES (?, ?, ?, ?, ?)', id, role, u.grantedBy, u.at, combined ? 1 : 0);
  }
  return id;
}

export interface RegisterInput {
  email: unknown;
  displayName: unknown;
  password: unknown;
  confirm: unknown;
  ageAck: unknown;
  termsAck: unknown;
}

/** Public registration ALWAYS creates a player-only account. Any role field in
 *  the request is ignored. */
export async function register(ctx: Ctx, input: RegisterInput): Promise<{ userId?: number; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  const email = normalizeEmail(input.email);
  if (!email) errors.email = 'Enter a valid email address (synthetic demo emails are fine).';
  const name = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (name.length < 2 || name.length > 80) errors.displayName = 'Display name must be 2–80 characters.';
  const pw = passwordProblems(input.password, input.confirm);
  if (pw.length) errors.password = pw.join(' ');
  if (input.ageAck !== 'on') errors.ageAck = 'Please confirm the demo eligibility notice.';
  if (input.termsAck !== 'on') errors.termsAck = 'Please acknowledge the demo terms.';
  if (Object.keys(errors).length) return { errors };
  const hash = await hashPassword(String(input.password));
  const at = nowIso(ctx);
  try {
    const userId = ctx.db.tx(() => {
      const id = insertUser(ctx.db, { email: email!, displayName: name, passwordHash: hash, roles: ['player'], grantedBy: null, at });
      audit(ctx.db, { actorId: id, action: 'user.registered', entityType: 'user', entityId: id, after: { roles: ['player'] }, requestId: ctx.requestId, at });
      return id;
    });
    return { userId, errors };
  } catch (err) {
    if (isConstraintError(err, 'users.email')) {
      // Do not confirm whether the address already has an account.
      return { errors: { email: 'Registration could not be completed with this email. If you already have an account, sign in or reset your password.' } };
    }
    throw err;
  }
}

export async function authenticate(db: Db, emailInput: unknown, password: unknown): Promise<UserRow | null> {
  const email = normalizeEmail(emailInput);
  const user = email ? db.get<UserRow>('SELECT * FROM users WHERE email = ?', email) : undefined;
  const ok = await bcrypt.compare(typeof password === 'string' ? password : '', user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || user.status !== 'active') return null;
  return user;
}

// ---- sessions ---------------------------------------------------------------

export function createSession(db: Db, userId: number, now: Date): string {
  const token = randomToken();
  db.run('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, now.toISOString(), new Date(now.getTime() + SESSION_MS).toISOString());
  return token;
}

export interface SessionInfo {
  sessionId: string;
  user: UserRow;
  flash: { kind: 'success' | 'error' | 'info'; message: string }[];
}

/** Sessions use real wall-clock expiry (independent of the demo clock). */
export function loadSession(db: Db, token: string | undefined): SessionInfo | null {
  if (!token) return null;
  const id = sha256(token);
  const row = db.get<{ id: string; user_id: number; flash_json: string | null; expires_at: string }>('SELECT * FROM sessions WHERE id = ?', id);
  if (!row || row.expires_at <= new Date().toISOString()) return null;
  const user = getUser(db, row.user_id);
  if (!user || user.status !== 'active') return null;
  return { sessionId: id, user, flash: row.flash_json ? JSON.parse(row.flash_json) : [] };
}

export function destroySession(db: Db, sessionId: string): void {
  db.run('DELETE FROM sessions WHERE id = ?', sessionId);
}

export function pushFlash(db: Db, sessionId: string, kind: 'success' | 'error' | 'info', message: string): void {
  const row = db.get<{ flash_json: string | null }>('SELECT flash_json FROM sessions WHERE id = ?', sessionId);
  const list = row?.flash_json ? JSON.parse(row.flash_json) : [];
  list.push({ kind, message });
  db.run('UPDATE sessions SET flash_json = ? WHERE id = ?', JSON.stringify(list.slice(-5)), sessionId);
}

export function clearFlash(db: Db, sessionId: string): void {
  db.run('UPDATE sessions SET flash_json = NULL WHERE id = ? AND flash_json IS NOT NULL', sessionId);
}

// ---- profile & password ----------------------------------------------------

export function updateProfile(ctx: Ctx, displayName: unknown): void {
  const actor = requireAny(ctx, ROLES);
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (name.length < 2 || name.length > 80) throw new DomainError('INVALID_NAME', 'Display name must be 2–80 characters.');
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    // Only the display name is updatable here; roles can never be set from a profile form.
    ctx.db.run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', name, at, actor.id);
    audit(ctx.db, { actorId: actor.id, action: 'user.profile_updated', entityType: 'user', entityId: actor.id, after: { display_name: name }, requestId: ctx.requestId, at });
  });
}

export async function changePassword(ctx: Ctx, sessionId: string, current: unknown, next: unknown, confirm: unknown): Promise<void> {
  const actor = requireAny(ctx, ROLES);
  const user = getUser(ctx.db, actor.id)!;
  if (!(await bcrypt.compare(typeof current === 'string' ? current : '', user.password_hash))) {
    throw new DomainError('BAD_PASSWORD', 'Current password is incorrect.');
  }
  const problems = passwordProblems(next, confirm);
  if (problems.length) throw new DomainError('WEAK_PASSWORD', problems.join(' '));
  const hash = await hashPassword(String(next));
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    ctx.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hash, at, actor.id);
    ctx.db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', actor.id, sessionId);
    audit(ctx.db, { actorId: actor.id, action: 'user.password_changed', entityType: 'user', entityId: actor.id, requestId: ctx.requestId, at });
  });
}

// ---- password reset (local demo outbox, no email provider) ------------------

export function createPasswordReset(db: Db, emailInput: unknown, now: Date): { token: string; email: string } | null {
  const email = normalizeEmail(emailInput);
  const user = email ? db.get<UserRow>('SELECT * FROM users WHERE email = ? AND status = ?', email, 'active') : undefined;
  if (!user) return null;
  const token = randomToken();
  db.run('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', sha256(token), user.id, new Date(now.getTime() + 30 * 60_000).toISOString(), now.toISOString());
  return { token, email: user.email };
}

export async function completePasswordReset(db: Db, token: unknown, pw: unknown, confirm: unknown): Promise<string[]> {
  const problems = passwordProblems(pw, confirm);
  if (problems.length) return problems;
  const hash = await hashPassword(String(pw));
  const now = new Date().toISOString();
  return db.tx(() => {
    const row = typeof token === 'string' ? db.get<{ user_id: number; expires_at: string; used_at: string | null }>('SELECT * FROM password_resets WHERE token_hash = ?', sha256(token)) : undefined;
    if (!row || row.used_at || row.expires_at <= now) return ['This reset link is invalid or has expired. Request a new one.'];
    db.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', now, sha256(String(token)));
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hash, now, row.user_id);
    db.run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
    audit(db, { actorId: row.user_id, action: 'user.password_reset', entityType: 'user', entityId: row.user_id, at: now });
    return [];
  });
}

// ---- administration --------------------------------------------------------

export interface UserListRow extends UserRow {
  roles: string | null;
}

export function listUsers(ctx: Ctx, q: { search?: string; role?: string }): UserListRow[] {
  requireAny(ctx, ['admin']);
  const where: string[] = [];
  const params: string[] = [];
  if (q.search) {
    where.push('(u.email LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${q.search}%`, `%${q.search}%`);
  }
  if (q.role && (ROLES as readonly string[]).includes(q.role)) {
    where.push('EXISTS (SELECT 1 FROM user_roles r2 WHERE r2.user_id = u.id AND r2.role = ?)');
    params.push(q.role);
  }
  return ctx.db.all<UserListRow>(
    `SELECT u.*, (SELECT group_concat(role, ',') FROM user_roles r WHERE r.user_id = u.id) AS roles
     FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.id LIMIT 300`,
    ...params,
  );
}

export function adminGetUser(ctx: Ctx, id: number): { user: UserRow; roles: Set<Role>; roleRows: { role: Role; granted_at: string; granted_by_email: string | null; combined_scope_confirmed: number }[] } {
  requireAny(ctx, ['admin']);
  const user = getUser(ctx.db, id);
  if (!user) throw new NotFoundError();
  const roleRows = ctx.db.all<{ role: Role; granted_at: string; granted_by_email: string | null; combined_scope_confirmed: number }>(
    'SELECT r.role, r.granted_at, r.combined_scope_confirmed, g.email AS granted_by_email FROM user_roles r LEFT JOIN users g ON g.id = r.granted_by WHERE r.user_id = ? ORDER BY r.role',
    id,
  );
  return { user, roles: new Set(roleRows.map((r) => r.role)), roleRows };
}

function needsScopeConfirmation(existing: Set<Role>, adding: Role[]): boolean {
  const all = new Set([...existing, ...adding]);
  return [...all].some((r) => GLOBAL_STAFF_ROLES.includes(r)) && [...all].some((r) => SCOPED_ROLES.includes(r));
}

export async function adminCreateUser(ctx: Ctx, input: { email: unknown; displayName: unknown; password: unknown; roles: unknown; confirmScope: unknown }): Promise<number> {
  const actor = requireAny(ctx, ['admin']);
  const email = normalizeEmail(input.email);
  if (!email) throw new DomainError('INVALID_EMAIL', 'Enter a valid email address.');
  const name = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (name.length < 2 || name.length > 80) throw new DomainError('INVALID_NAME', 'Display name must be 2–80 characters.');
  const problems = passwordProblems(input.password);
  if (problems.length) throw new DomainError('WEAK_PASSWORD', problems.join(' '));
  const roles = (Array.isArray(input.roles) ? input.roles : input.roles ? [input.roles] : []).filter((r): r is Role => (ROLES as readonly string[]).includes(String(r)));
  if (!roles.length) throw new DomainError('NO_ROLE', 'Choose at least one role.');
  if (needsScopeConfirmation(new Set(), roles) && input.confirmScope !== 'on') {
    throw new DomainError('SCOPE_CONFIRMATION', 'Combining a team-scoped role (team leader/agent) with a global staff role grants global visibility. Tick the confirmation to proceed.');
  }
  const hash = await hashPassword(String(input.password));
  const at = nowIso(ctx);
  try {
    return ctx.db.tx(() => {
      const id = insertUser(ctx.db, { email, displayName: name, passwordHash: hash, roles, grantedBy: actor.id, at });
      audit(ctx.db, { actorId: actor.id, action: 'user.created', entityType: 'user', entityId: id, after: { email, roles }, requestId: ctx.requestId, at });
      return id;
    });
  } catch (err) {
    if (isConstraintError(err, 'users.email')) throw new DomainError('EMAIL_TAKEN', 'That email already has an account.');
    throw err;
  }
}

export function grantRole(ctx: Ctx, userId: number, roleInput: unknown, confirmScope: unknown): void {
  const actor = requireAny(ctx, ['admin']);
  const role = String(roleInput) as Role;
  if (!ROLES.includes(role)) throw new DomainError('INVALID_ROLE', 'Unknown role.');
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    const user = getUser(ctx.db, userId);
    if (!user) throw new NotFoundError();
    const existing = rolesOf(ctx.db, userId);
    if (existing.has(role)) return;
    const combined = needsScopeConfirmation(existing, [role]);
    if (combined && confirmScope !== 'on') {
      throw new DomainError('SCOPE_CONFIRMATION', 'This would combine a team-scoped role with a global staff role. Tick the explicit confirmation to grant it; the resulting global scope is recorded in the audit log.');
    }
    ctx.db.run('INSERT INTO user_roles (user_id, role, granted_by, granted_at, combined_scope_confirmed) VALUES (?, ?, ?, ?, ?)', userId, role, actor.id, at, combined ? 1 : 0);
    audit(ctx.db, { actorId: actor.id, action: 'role.granted', entityType: 'user', entityId: userId, before: { roles: [...existing] }, after: { roles: [...existing, role], combined_scope: combined }, requestId: ctx.requestId, at });
  });
}

export function revokeRole(ctx: Ctx, userId: number, roleInput: unknown): void {
  const actor = requireAny(ctx, ['admin']);
  const role = String(roleInput) as Role;
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    const existing = rolesOf(ctx.db, userId);
    if (!existing.has(role)) return;
    if (role === 'admin') {
      const admins = ctx.db.get<{ n: number }>(`SELECT count(*) AS n FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'admin' AND u.status = 'active'`)!.n;
      if (admins <= 1) throw new DomainError('LAST_ADMIN', 'Cannot remove the last active administrator.');
    }
    if (role === 'team_leader' && ctx.db.get('SELECT 1 FROM teams WHERE leader_user_id = ?', userId)) {
      throw new DomainError('LEADS_TEAM', 'This user leads a team. Assign a different leader first.');
    }
    if (role === 'agent' && ctx.db.get('SELECT 1 FROM agent_assignments WHERE agent_user_id = ? AND ends_at IS NULL', userId)) {
      throw new DomainError('ASSIGNED_AGENT', 'End this agent’s team assignment first.');
    }
    ctx.db.run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', userId, role);
    audit(ctx.db, { actorId: actor.id, action: 'role.revoked', entityType: 'user', entityId: userId, before: { roles: [...existing] }, after: { removed: role }, requestId: ctx.requestId, at });
  });
}

export function setUserStatus(ctx: Ctx, userId: number, status: unknown): void {
  const actor = requireAny(ctx, ['admin']);
  if (status !== 'active' && status !== 'disabled') throw new DomainError('INVALID_STATUS', 'Unknown status.');
  if (userId === actor.id && status === 'disabled') throw new DomainError('SELF_DISABLE', 'You cannot disable your own account.');
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    const user = getUser(ctx.db, userId);
    if (!user) throw new NotFoundError();
    ctx.db.run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', status, at, userId);
    if (status === 'disabled') ctx.db.run('DELETE FROM sessions WHERE user_id = ?', userId);
    audit(ctx.db, { actorId: actor.id, action: 'user.status_changed', entityType: 'user', entityId: userId, before: { status: user.status }, after: { status }, requestId: ctx.requestId, at });
  });
}
