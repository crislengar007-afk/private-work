export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Used both for "does not exist" and "exists but not yours" so that record
 *  identities never leak across players or teams. */
export class NotFoundError extends DomainError {
  constructor(message = 'Not found.') {
    super('NOT_FOUND', message, 404);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You do not have access to this action.') {
    super('FORBIDDEN', message, 403);
  }
}

export function isConstraintError(err: unknown, fragment?: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const hit = /constraint failed|UNIQUE|CHECK/i.test(msg);
  return hit && (!fragment || msg.includes(fragment));
}
