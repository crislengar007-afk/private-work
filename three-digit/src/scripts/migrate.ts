import { loadConfig } from '../config.js';
import { Db, migrate } from '../db/index.js';

const config = loadConfig();
const db = new Db(config.databasePath);
const ran = migrate(db);
console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database schema is up to date.');
db.close();
