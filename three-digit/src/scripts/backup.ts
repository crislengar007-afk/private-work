import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { Db } from '../db/index.js';

/** Consistent online backup via VACUUM INTO (safe while the server runs). */
const config = loadConfig();
const dir = path.resolve('data/backups');
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, `demo-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const db = new Db(config.databasePath);
db.raw.prepare('VACUUM INTO ?').run(target);
db.close();
console.log(`Backup written to ${target}`);
