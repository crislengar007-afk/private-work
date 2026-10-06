import { type Request, type Response, Router } from 'express';
import { peso } from '../../lib/format.js';
import { type SafeHtml, html } from '../../lib/html.js';
import { agentSelf, leaderAgent, leaderAgents, leaderDashboard, leaderReport } from '../../services/teams.js';
import { page } from '../layout.js';
import { intParam, requireRoles, str } from '../middleware.js';
import { alert, dataTable, dl, emptyState, field, filterBar, icon, pageHeader, stat, time } from '../ui.js';

/** Team leader and agent areas. Every query is scoped by the authenticated
 *  identity on the server; no team id is ever read from the request. */
export const teamRouter = Router();
teamRouter.use('/team', requireRoles('team_leader'));
teamRouter.use('/agent', requireRoles('agent'));

const send = (req: Request, res: Response, area: 'team' | 'agent', title: string, body: SafeHtml) => res.send(page(req, { title, area, body }));
const NO_ATTRIBUTION = 'No agent selling, collection or player-attribution workflow has been confirmed, so there are no team-attributed transactions. Nothing is estimated or invented.';

teamRouter.get('/team', (req, res) => {
  const d = leaderDashboard(req.td.ctx);
  if (!d.team) return send(req, res, 'team', 'Team', html`${pageHeader('Team dashboard')}${emptyState('No team assigned', 'The main administrator has not assigned you to lead a team yet.')}`);
  const body = html`${pageHeader(d.team.name, 'Your own team only. Other teams, their leaders and agents are not visible to you.')}
  <div class="stats">${stat('Active agents', String(d.agentCount))}${stat('Team status', d.team.status === 'active' ? 'Active' : 'Inactive')}${stat('Attributed transactions', '0', 'No confirmed workflow')}</div>
  ${alert('info', NO_ATTRIBUTION)}
  <section class="section"><h2>Recent team activity</h2>
  ${dataTable(
    [
      { label: 'Agent', render: (a) => a.agent_name },
      { label: 'Joined team', render: (a) => time(a.starts_at, true) },
      { label: 'Left team', render: (a) => time(a.ends_at, true) },
    ],
    d.activity,
    { caption: 'Team assignment activity', empty: emptyState('No activity yet', 'Agent assignments to your team appear here.') },
  )}</section>
  <p><a href="/team/agents">View my agents ${icon('arrow')}</a></p>`;
  send(req, res, 'team', 'Team dashboard', body);
});

teamRouter.get('/team/agents', (req, res) => {
  const q = str(req.query.q).trim();
  const agents = leaderAgents(req.td.ctx, q);
  const body = html`${pageHeader('My agents', 'Agents currently assigned to your team.')}
  ${filterBar('/team/agents', field('Search my agents', 'q', { value: q }))}
  ${dataTable(
    [
      { label: 'Agent', render: (a) => html`<a href="/team/agents/${a.id}">${a.display_name}</a>` },
      { label: 'Email', render: (a) => a.email },
      { label: 'In team since', render: (a) => time(a.starts_at, true) },
      { label: 'Account', render: (a) => (a.status === 'active' ? 'Active' : 'Disabled') },
    ],
    agents,
    { caption: 'My agents', empty: q ? emptyState('No matching agents', 'Try another search.') : emptyState('No agents assigned', 'The main administrator assigns agents to teams.') },
  )}`;
  send(req, res, 'team', 'My agents', body);
});

teamRouter.get('/team/agents/:id', (req, res) => {
  const { agent, attributed } = leaderAgent(req.td.ctx, intParam(req.params.id));
  const body = html`${pageHeader(agent.display_name, 'Assigned agent profile', html`<a class="btn btn--ghost" href="/team/agents">${icon('back')} My agents</a>`)}
  <section class="card">${dl([['Email', agent.email], ['Team', agent.team_name], ['In team since', time(agent.starts_at)], ['Account', agent.status === 'active' ? 'Active' : 'Disabled'], ['Attributed records', String(attributed)]])}</section>
  ${alert('info', NO_ATTRIBUTION)}`;
  send(req, res, 'team', agent.display_name, body);
});

teamRouter.get('/team/reports', (req, res) => {
  const r = leaderReport(req.td.ctx);
  const body = html`${pageHeader('Team report', r.team ? r.team.name : 'No team assigned')}
  ${r.team
    ? html`<div class="stats">${stat('Attributed approved entries', String(r.attributedEntries))}${stat('Attributed stakes (simulated)', peso(r.attributedStakeMinor))}</div>
      ${r.attributedEntries === 0 ? emptyState('No attributed transactions', NO_ATTRIBUTION) : ''}`
    : emptyState('No team assigned', 'Reports appear once you lead a team.')}`;
  send(req, res, 'team', 'Team report', body);
});

teamRouter.get('/agent', (req, res) => {
  const a = agentSelf(req.td.ctx);
  const me = req.td.actor!;
  const body = html`${pageHeader('Agent dashboard', 'Your own profile and records only.')}
  <section class="card">${dl([['Name', me.displayName], ['Email', me.email], ['Team', a.assignment ? a.assignment.team_name : 'Not assigned to a team'], ['Assigned since', a.assignment ? time(a.assignment.starts_at) : '—'], ['Attributed records', String(a.attributed)]])}</section>
  ${alert('info', 'Agent powers (selling, creating players, submitting entries for others, cash collection, approvals) are not yet confirmed by the owner and are therefore unavailable.')}
  ${a.attributed === 0 ? emptyState('No attributed records', 'Nothing is attributed to you yet.') : ''}`;
  send(req, res, 'agent', 'Agent dashboard', body);
});
