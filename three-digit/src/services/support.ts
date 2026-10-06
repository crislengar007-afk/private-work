import { DomainError, NotFoundError } from '../lib/errors.js';
import { audit } from './audit.js';
import { type Ctx, requireAny } from './context.js';

export interface TicketRow {
  id: number;
  user_id: number;
  entry_id: number | null;
  subject: string;
  body: string;
  state: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  entry_ref?: string | null;
  user_email?: string;
}

export interface MessageRow {
  id: number;
  ticket_id: number;
  author_id: number;
  author_name: string;
  author_is_owner: number;
  body: string;
  internal: number;
  created_at: string;
}

export const TICKET_STATES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export function createTicket(ctx: Ctx, input: { subject: unknown; body: unknown; entryId: unknown }): number {
  const actor = requireAny(ctx, ['player']);
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (subject.length < 3 || subject.length > 120) throw new DomainError('INVALID_SUBJECT', 'Subject must be 3–120 characters.');
  if (body.length < 5 || body.length > 4000) throw new DomainError('INVALID_BODY', 'Message must be 5–4000 characters.');
  let entryId: number | null = null;
  if (input.entryId !== undefined && input.entryId !== '') {
    entryId = Number(input.entryId);
    // Only the player's own entry can be attached.
    if (!ctx.db.get('SELECT 1 FROM entries WHERE id = ? AND user_id = ?', entryId, actor.id)) throw new NotFoundError('Entry not found.');
  }
  return ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const id = ctx.db.run(
      `INSERT INTO support_tickets (user_id, entry_id, subject, body, state, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?)`,
      actor.id, entryId, subject, body, at, at,
    ).lastInsertRowid;
    audit(ctx.db, { actorId: actor.id, action: 'support.ticket_created', entityType: 'support_ticket', entityId: id, after: { entry_id: entryId }, requestId: ctx.requestId, at });
    return id;
  });
}

export function listOwnTickets(ctx: Ctx): TicketRow[] {
  const actor = requireAny(ctx, ['player']);
  return ctx.db.all<TicketRow>(
    `SELECT t.*, e.public_ref AS entry_ref FROM support_tickets t LEFT JOIN entries e ON e.id = t.entry_id WHERE t.user_id = ? ORDER BY t.id DESC`,
    actor.id,
  );
}

function messages(ctx: Ctx, ticketId: number, includeInternal: boolean): MessageRow[] {
  return ctx.db.all<MessageRow>(
    `SELECT m.*, u.display_name AS author_name, (m.author_id = t.user_id) AS author_is_owner
     FROM support_messages m JOIN users u ON u.id = m.author_id JOIN support_tickets t ON t.id = m.ticket_id
     WHERE m.ticket_id = ? ${includeInternal ? '' : 'AND m.internal = 0'} ORDER BY m.id`,
    ticketId,
  );
}

export function getOwnTicket(ctx: Ctx, id: number): { ticket: TicketRow; messages: MessageRow[] } {
  const actor = requireAny(ctx, ['player']);
  const ticket = ctx.db.get<TicketRow>(
    'SELECT t.*, e.public_ref AS entry_ref FROM support_tickets t LEFT JOIN entries e ON e.id = t.entry_id WHERE t.id = ? AND t.user_id = ?',
    id, actor.id,
  );
  if (!ticket) throw new NotFoundError('Ticket not found.');
  return { ticket, messages: messages(ctx, id, false) };
}

export function addPlayerMessage(ctx: Ctx, ticketId: number, body: unknown): void {
  const actor = requireAny(ctx, ['player']);
  const text = typeof body === 'string' ? body.trim() : '';
  if (text.length < 1 || text.length > 4000) throw new DomainError('INVALID_BODY', 'Message must be 1–4000 characters.');
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const t = ctx.db.get<TicketRow>('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?', ticketId, actor.id);
    if (!t) throw new NotFoundError('Ticket not found.');
    if (t.state === 'closed') throw new DomainError('TICKET_CLOSED', 'This ticket is closed. Open a new request instead.', 409);
    ctx.db.run('INSERT INTO support_messages (ticket_id, author_id, body, internal, created_at) VALUES (?, ?, ?, 0, ?)', ticketId, actor.id, text, at);
    ctx.db.run(`UPDATE support_tickets SET state = CASE WHEN state = 'resolved' THEN 'open' ELSE state END, updated_at = ? WHERE id = ?`, at, ticketId);
  });
}

export function adminListTickets(ctx: Ctx, q: { state?: string }): TicketRow[] {
  requireAny(ctx, ['admin']);
  const valid = (TICKET_STATES as readonly string[]).includes(q.state ?? '');
  return ctx.db.all<TicketRow>(
    `SELECT t.*, e.public_ref AS entry_ref, u.email AS user_email FROM support_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN entries e ON e.id = t.entry_id
     ${valid ? 'WHERE t.state = ?' : ''} ORDER BY t.updated_at DESC LIMIT 300`,
    ...(valid ? [q.state!] : []),
  );
}

export function adminGetTicket(ctx: Ctx, id: number): { ticket: TicketRow; messages: MessageRow[] } {
  requireAny(ctx, ['admin']);
  const ticket = ctx.db.get<TicketRow>(
    'SELECT t.*, e.public_ref AS entry_ref, u.email AS user_email FROM support_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN entries e ON e.id = t.entry_id WHERE t.id = ?',
    id,
  );
  if (!ticket) throw new NotFoundError();
  return { ticket, messages: messages(ctx, id, true) };
}

export function adminUpdateTicket(ctx: Ctx, id: number, input: { state: unknown; reply: unknown; note: unknown }): void {
  const actor = requireAny(ctx, ['admin']);
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const t = ctx.db.get<TicketRow>('SELECT * FROM support_tickets WHERE id = ?', id);
    if (!t) throw new NotFoundError();
    const reply = typeof input.reply === 'string' ? input.reply.trim() : '';
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (reply) ctx.db.run('INSERT INTO support_messages (ticket_id, author_id, body, internal, created_at) VALUES (?, ?, ?, 0, ?)', id, actor.id, reply.slice(0, 4000), at);
    if (note) ctx.db.run('INSERT INTO support_messages (ticket_id, author_id, body, internal, created_at) VALUES (?, ?, ?, 1, ?)', id, actor.id, note.slice(0, 4000), at);
    const state = String(input.state ?? t.state);
    if (!(TICKET_STATES as readonly string[]).includes(state)) throw new DomainError('INVALID_STATE', 'Unknown ticket state.');
    ctx.db.run('UPDATE support_tickets SET state = ?, updated_at = ? WHERE id = ?', state, at, id);
    audit(ctx.db, { actorId: actor.id, action: 'support.ticket_updated', entityType: 'support_ticket', entityId: id, before: { state: t.state }, after: { state, replied: !!reply, internal_note: !!note }, requestId: ctx.requestId, at });
  });
}
