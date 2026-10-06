import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../../src/config.js';
import { Db, migrate } from '../../src/db/index.js';
import { DEMO_PASSWORD } from '../../src/demo-accounts.js';
import { DemoClock } from '../../src/lib/clock.js';
import { seed } from '../../src/scripts/seed.js';
import { createApp } from '../../src/web/app.js';

export interface TestServer {
  db: Db;
  base: string;
  close(): Promise<void>;
}

export async function startSeededServer(): Promise<TestServer> {
  const db = new Db(':memory:');
  migrate(db);
  seed(db);
  const config = loadConfig({ authRateLimit: 10_000, showDemoAccounts: true, demoClockControls: true, production: false });
  const app = createApp(db, new DemoClock(db), config);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    db,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export interface Res {
  status: number;
  text: string;
  location: string | null;
  headers: Headers;
}

/** Minimal browser-like client with a cookie jar and automatic CSRF field. */
export class Client {
  private jar = new Map<string, string>();
  constructor(private base: string) {}

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a)) || v === '';
      if (expired) this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }

  private cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  get csrf() {
    return decodeURIComponent(this.jar.get('td_csrf') ?? '');
  }

  async get(path: string): Promise<Res> {
    const res = await fetch(this.base + path, { headers: { cookie: this.cookie() }, redirect: 'manual' });
    this.store(res);
    return { status: res.status, text: await res.text(), location: res.headers.get('location'), headers: res.headers };
  }

  async post(path: string, form: Record<string, string | string[]> = {}, opts: { csrf?: boolean } = {}): Promise<Res> {
    if (!this.jar.has('td_csrf')) await this.get('/login');
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) for (const x of Array.isArray(v) ? v : [v]) body.append(k, x);
    if (opts.csrf !== false) body.set('_csrf', this.csrf);
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: { cookie: this.cookie(), 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
    });
    this.store(res);
    return { status: res.status, text: await res.text(), location: res.headers.get('location'), headers: res.headers };
  }

  async login(email: string, password = DEMO_PASSWORD): Promise<Res> {
    await this.get('/login');
    const r = await this.post('/login', { email, password });
    if (r.status !== 303) throw new Error(`login failed for ${email}: ${r.status}`);
    return r;
  }
}
