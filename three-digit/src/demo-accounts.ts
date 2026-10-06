/** Synthetic, LOCAL-ONLY demo accounts created by `npm run db:seed`.
 *  Never use these in any shared or production environment. */
export const DEMO_PASSWORD = 'Demo-Pass-2026';

export const DEMO_ACCOUNTS = [
  { email: 'admin@demo.local', name: 'Main Administrator', roles: ['admin'], note: 'Global visibility; teams, users, settings' },
  { email: 'payments@demo.local', name: 'Paz Payment-Reviewer', roles: ['payment_reviewer'], note: 'Approves/rejects simulated payments' },
  { email: 'editor@demo.local', name: 'Eddie Result-Editor', roles: ['result_editor'], note: 'Enters draft six-digit results' },
  { email: 'reviewer@demo.local', name: 'Rhea Result-Reviewer', roles: ['result_reviewer'], note: 'Publishes results entered by someone else' },
  { email: 'juan@demo.local', name: 'Juan Dela Cruz', roles: ['player'], note: 'Player with entries in every state' },
  { email: 'maria@demo.local', name: 'Maria Santos', roles: ['player'], note: 'Player' },
  { email: 'pedro@demo.local', name: 'Pedro Reyes', roles: ['player'], note: 'Player' },
  { email: 'leader.a@demo.local', name: 'Lea Team-A Leader', roles: ['team_leader'], note: 'Sees Team Alpha only' },
  { email: 'leader.b@demo.local', name: 'Ben Team-B Leader', roles: ['team_leader'], note: 'Sees Team Bravo only' },
  { email: 'agent.a1@demo.local', name: 'Andy Agent A1', roles: ['agent'], note: 'Team Alpha' },
  { email: 'agent.a2@demo.local', name: 'Abby Agent A2', roles: ['agent'], note: 'Team Alpha' },
  { email: 'agent.b1@demo.local', name: 'Bert Agent B1', roles: ['agent'], note: 'Team Bravo' },
  { email: 'agent.b2@demo.local', name: 'Bea Agent B2', roles: ['agent'], note: 'Team Bravo' },
  { email: 'agent.free@demo.local', name: 'Una Unassigned Agent', roles: ['agent'], note: 'No team; visible only to admin' },
] as const;
