import fs from 'node:fs';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { assertSafeLocalDatabase } from './guard.js';
import { seed } from './seed.js';

const config = loadConfig();
const file = assertSafeLocalDatabase(config);
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
const db = openDatabase(config.databasePath);
seed(db);
db.close();
console.log(`Reset ${config.databasePath} and re-seeded sample data relative to ${new Date().toISOString()}.`);
