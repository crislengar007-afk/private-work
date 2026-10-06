import { DomainError, NotFoundError, isConstraintError } from '../lib/errors.js';
import { audit } from './audit.js';
import { type Ctx, requireAny } from './context.js';
import { rolesOf } from './users.js';

export interface TeamRow {
  id: number;
  name: string;
  leader_user_id: number | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface AgentRow {
  id: number;
  email: string;
  display_name: string;
  status: string;
  team_id: number | null;
  team_name: string | null;
  starts_at: string | null;
}

// ---- Main administrator: global visibility -----------------------------------

export interface TeamListRow extends TeamRow {
  leader_email: string | null;
  leader_name: string | null;
  agent_count: number;
}

export function adminListTeams(ctx: Ctx): TeamListRow[] {
  requireAny(ctx, ['admin']);
  return ctx.db.all<TeamListRow>(
    `SELECT t.*, u.email AS leader_email, u.display_name AS leader_name,
       (SELECT count(*) FROM agent_assignments a WHERE a.team_id = t.id AND a.ends_at IS NULL) AS agent_count
     FROM teams t LEFT JOIN users u ON u.id = t.leader_user_id ORDER BY t.name`,
  );
}

export function adminGetTeam(ctx: Ctx, id: number) {
  requireAny(ctx, ['admin']);
  const team = ctx.db.get<TeamListRow>(
    `SELECT t.*, u.email AS leader_email, u.display_name AS leader_name, 0 AS agent_count FROM teams t LEFT JOIN users u ON u.id = t.leader_user_id WHERE t.id = ?`,
    id,
  );
  if (!team) throw new NotFoundError();
  const agents = ctx.db.all<AgentRow>(
    `SELECT u.id, u.email, u.display_name, u.status, a.team_id, ? AS team_name, a.starts_at FROM agent_assignments a JOIN users u ON u.id = a.agent_user_id
     WHERE a.team_id = ? AND a.ends_at IS NULL ORDER BY u.display_name`,
    team.name, id,
  );
  const history = ctx.db.all<{ id: number; agent_email: string; starts_at: string; ends_at: string | null; assigned_by_email: string }>(
    `SELECT a.id, u.email AS agent_email, a.starts_at, a.ends_at, b.email AS assigned_by_email FROM agent_assignments a
     JOIN users u ON u.id = a.agent_user_id JOIN users b ON b.id = a.assigned_by WHERE a.team_id = ? ORDER BY a.id DESC`,
    id,
  );
  return { team, agents, history };
}

export function adminListAgents(ctx: Ctx, q: { search?: string; filter?: string }): AgentRow[] {
  requireAny(ctx, ['admin']);
  const where = [`EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'agent')`];
  const params: string[] = [];
  if (q.search) {
    where.push('(u.email LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${q.search}%`, `%${q.search}%`);
  }
  if (q.filter === 'unassigned') where.push('a.id IS NULL');
  if (q.filter === 'assigned') where.push('a.id IS NOT NULL');
  return ctx.db.all<AgentRow>(
    `SELECT u.id, u.email, u.display_name, u.status, a.team_id, t.name AS team_name, a.starts_at
     FROM users u LEFT JOIN agent_assignments a ON a.agent_user_id = u.id AND a.ends_at IS NULL LEFT JOIN teams t ON t.id = a.team_id
     WHERE ${where.join(' AND ')} ORDER BY u.display_name`,
    ...params,
  );
}

export function leaderCandidates(ctx: Ctx): { id: number; email: string; display_name: string }[] {
  requireAny(ctx, ['admin']);
  return ctx.db.all(
    `SELECT u.id, u.email, u.display_name FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'team_leader'
     WHERE u.status = 'active' AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.leader_user_id = u.id) ORDER BY u.display_name`,
  );
}

export function createTeam(ctx: Ctx, nameInput: unknown, leaderInput: unknown): number {
  const actor = requireAny(ctx, ['admin']);
  const name = typeof nameInput === 'string' ? nameInput.trim() : '';
  if (name.length < 2 || name.length > 60) throw new DomainError('INVALID_NAME', 'Team name must be 2–60 characters.');
  const leaderId = Number(leaderInput);
  try {
    return ctx.db.tx(() => {
      const at = ctx.clock.now().toISOString();
      if (!rolesOf(ctx.db, leaderId).has('team_leader')) throw new DomainError('NOT_LEADER', 'Choose a user who has the Team leader role.');
      const id = ctx.db.run(`INSERT INTO teams (name, leader_user_id, status, created_by, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?)`, name, leaderId, actor.id, at, at).lastInsertRowid;
      audit(ctx.db, { actorId: actor.id, action: 'team.created', entityType: 'team', entityId: id, after: { name, leader_user_id: leaderId }, requestId: ctx.requestId, at });
      return id;
    });
  } catch (err) {
    if (isConstraintError(err, 'teams.name')) throw new DomainError('NAME_TAKEN', 'A team with that name already exists.');
    if (isConstraintError(err, 'teams.leader_user_id')) throw new DomainError('LEADER_TAKEN', 'That leader already leads a team (one team per leader).');
    throw err;
  }
}

export function setTeamStatus(ctx: Ctx, teamId: number, status: unknown): void {
  const actor = requireAny(ctx, ['admin']);
  if (status !== 'active' && status !== 'inactive') throw new DomainError('INVALID_STATUS', 'Unknown status.');
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const t = ctx.db.get<TeamRow>('SELECT * FROM teams WHERE id = ?', teamId);
    if (!t) throw new NotFoundError();
    ctx.db.run('UPDATE teams SET status = ?, updated_at = ? WHERE id = ?', status, at, teamId);
    audit(ctx.db, { actorId: actor.id, action: 'team.status_changed', entityType: 'team', entityId: teamId, before: { status: t.status }, after: { status }, requestId: ctx.requestId, at });
  });
}

/** One active team assignment per agent. Reassignment ends the old one; prior
 *  team history stays with the former team (proposed default). */
export function assignAgent(ctx: Ctx, agentId: number, teamInput: unknown): void {
  const actor = requireAny(ctx, ['admin']);
  const teamId = Number(teamInput);
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    if (!rolesOf(ctx.db, agentId).has('agent')) throw new DomainError('NOT_AGENT', 'This user does not have the Agent role.');
    const team = ctx.db.get<TeamRow>('SELECT * FROM teams WHERE id = ?', teamId);
    if (!team) throw new DomainError('INVALID_TEAM', 'Choose a team.');
    if (team.status !== 'active') throw new DomainError('TEAM_INACTIVE', 'That team is inactive.');
    const cur = ctx.db.get<{ id: number; team_id: number }>('SELECT id, team_id FROM agent_assignments WHERE agent_user_id = ? AND ends_at IS NULL', agentId);
    if (cur?.team_id === teamId) return;
    if (cur) ctx.db.run('UPDATE agent_assignments SET ends_at = ?, ended_by = ? WHERE id = ?', at, actor.id, cur.id);
    ctx.db.run('INSERT INTO agent_assignments (agent_user_id, team_id, assigned_by, starts_at) VALUES (?, ?, ?, ?)', agentId, teamId, actor.id, at);
    audit(ctx.db, { actorId: actor.id, action: cur ? 'agent.reassigned' : 'agent.assigned', entityType: 'user', entityId: agentId, before: cur ? { team_id: cur.team_id } : undefined, after: { team_id: teamId }, requestId: ctx.requestId, at });
  });
}

export function unassignAgent(ctx: Ctx, agentId: number): void {
  const actor = requireAny(ctx, ['admin']);
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const cur = ctx.db.get<{ id: number; team_id: number }>('SELECT id, team_id FROM agent_assignments WHERE agent_user_id = ? AND ends_at IS NULL', agentId);
    if (!cur) return;
    ctx.db.run('UPDATE agent_assignments SET ends_at = ?, ended_by = ? WHERE id = ?', at, actor.id, cur.id);
    audit(ctx.db, { actorId: actor.id, action: 'agent.unassigned', entityType: 'user', entityId: agentId, before: { team_id: cur.team_id }, requestId: ctx.requestId, at });
  });
}

// ---- Team leader: own team only ----------------------------------------------
// Scope is derived from the authenticated identity and the CURRENT server-side
// team record on every request. No client-supplied team_id is ever read.

function ownTeam(ctx: Ctx): TeamRow | undefined {
  const actor = requireAny(ctx, ['team_leader']);
  return ctx.db.get<TeamRow>('SELECT * FROM teams WHERE leader_user_id = ?', actor.id);
}

export function leaderDashboard(ctx: Ctx) {
  const team = ownTeam(ctx);
  if (!team) return { team: null, agentCount: 0, activity: [] as { agent_name: string; starts_at: string; ends_at: string | null }[] };
  const agentCount = ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM agent_assignments WHERE team_id = ? AND ends_at IS NULL', team.id)!.n;
  // Only this team's own assignment records; nothing about where agents went.
  const activity = ctx.db.all<{ agent_name: string; starts_at: string; ends_at: string | null }>(
    `SELECT u.display_name AS agent_name, a.starts_at, a.ends_at FROM agent_assignments a JOIN users u ON u.id = a.agent_user_id WHERE a.team_id = ? ORDER BY a.id DESC LIMIT 20`,
    team.id,
  );
  return { team, agentCount, activity };
}

export function leaderAgents(ctx: Ctx, search?: string): AgentRow[] {
  const team = ownTeam(ctx);
  if (!team) return [];
  const params: (string | number)[] = [team.name, team.id];
  let extra = '';
  if (search) {
    extra = 'AND (u.email LIKE ? OR u.display_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  return ctx.db.all<AgentRow>(
    `SELECT u.id, u.email, u.display_name, u.status, a.team_id, ? AS team_name, a.starts_at FROM agent_assignments a JOIN users u ON u.id = a.agent_user_id
     WHERE a.team_id = ? AND a.ends_at IS NULL ${extra} ORDER BY u.display_name`,
    ...params,
  );
}

/** Another team's agent, an unassigned agent, or a non-agent all return 404. */
export function leaderAgent(ctx: Ctx, agentId: number) {
  const team = ownTeam(ctx);
  if (!team) throw new NotFoundError();
  const agent = ctx.db.get<AgentRow>(
    `SELECT u.id, u.email, u.display_name, u.status, a.team_id, ? AS team_name, a.starts_at FROM agent_assignments a JOIN users u ON u.id = a.agent_user_id
     WHERE a.agent_user_id = ? AND a.team_id = ? AND a.ends_at IS NULL`,
    team.name, agentId, team.id,
  );
  if (!agent) throw new NotFoundError();
  const attributed = ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM entries WHERE agent_id = ? AND team_id = ?', agentId, team.id)!.n;
  return { agent, attributed };
}

export function leaderReport(ctx: Ctx) {
  const team = ownTeam(ctx);
  if (!team) return { team: null, attributedEntries: 0, attributedStakeMinor: 0 };
  const r = ctx.db.get<{ n: number; s: number | null }>(`SELECT count(*) AS n, sum(stake_minor_units) AS s FROM entries WHERE team_id = ? AND eligibility_status = 'approved'`, team.id)!;
  return { team, attributedEntries: r.n, attributedStakeMinor: r.s ?? 0 };
}

// ---- Agent: own records only ---------------------------------------------------

export function agentSelf(ctx: Ctx) {
  const actor = requireAny(ctx, ['agent']);
  const assignment = ctx.db.get<{ team_name: string; starts_at: string }>(
    `SELECT t.name AS team_name, a.starts_at FROM agent_assignments a JOIN teams t ON t.id = a.team_id WHERE a.agent_user_id = ? AND a.ends_at IS NULL`,
    actor.id,
  );
  const attributed = ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM entries WHERE agent_id = ?', actor.id)!.n;
  return { assignment, attributed };
}
