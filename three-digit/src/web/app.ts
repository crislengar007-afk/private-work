import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/index.js';
import type { Clock } from '../lib/clock.js';
import { DomainError } from '../lib/errors.js';
import { html } from '../lib/html.js';
import { landingFor, page } from './layout.js';
import { rateLimit, requestState, securityHeaders, verifyCsrf } from './middleware.js';
import { adminRouter } from './routes/admin.js';
import { playerRouter } from './routes/player.js';
import { publicRouter } from './routes/public.js';
import { teamRouter } from './routes/team.js';
import { alert, icon, pageHeader } from './ui.js';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../public');

export function createApp(db: Db, clock: Clock, config: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(securityHeaders);
  app.use('/static', express.static(PUBLIC_DIR, { maxAge: config.production ? '1h' : 0, index: false }));
  app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 200 }));
  app.use(requestState(db, clock, config));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(['/login', '/register', '/forgot-password', '/reset-password'], rateLimit(config.authRateLimit, 10 * 60_000));
  app.use(verifyCsrf);
  app.use(publicRouter);
  app.use(playerRouter);
  app.use(adminRouter);
  app.use(teamRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).send(page(req, { title: 'Not found', area: 'public', body: notFoundBody() }));
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const de = err instanceof DomainError ? err : null;
    const status = de?.status ?? ((err as { status?: number })?.status === 400 ? 400 : 500);
    if (status >= 500) console.error(`[${req.td?.requestId ?? '-'}] ${req.method} ${req.path}:`, err);
    if (!req.td) return res.status(status).send('Error');
    if (req.path.startsWith('/api/')) return res.status(status).json({ ok: false, error: de?.message ?? 'Something went wrong.' });
    let body;
    if (status === 404) body = notFoundBody(de?.message);
    else if (status === 403 || status === 429) {
      const home = req.td.actor ? landingFor(req.td.actor.roles) : '/login';
      body = html`${pageHeader(status === 429 ? 'Too many attempts' : 'Access denied')}${alert('error', de?.message ?? 'You do not have access.')}
        <p><a class="btn btn--secondary" href="${home}">${req.td.actor ? 'Go to your dashboard' : 'Log in'}</a></p>`;
    } else if (status < 500) body = html`${pageHeader('Request could not be completed')}${alert('error', de?.message ?? 'Invalid request.')}<p><a class="btn btn--secondary" href="/" data-back>${icon('back')} Go back</a></p>`;
    else
      body = html`${pageHeader('Something went wrong')}${alert('error', html`The server hit an unexpected error. Nothing was half-saved: every change runs in a transaction. Reference: <code>${req.td.requestId}</code>.`)}
        <p><a class="btn btn--primary" href="${req.originalUrl}">${icon('refresh')} Retry</a></p>`;
    res.status(status).send(page(req, { title: 'Error', area: 'public', body }));
  });
  return app;
}

function notFoundBody(message?: string) {
  return html`${pageHeader('Not found')}${alert('info', message ?? 'That page or record does not exist, or you do not have access to it.')}<p><a class="btn btn--secondary" href="/">Go home</a></p>`;
}
