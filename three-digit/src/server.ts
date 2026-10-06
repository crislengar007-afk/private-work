import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { DemoClock } from './lib/clock.js';
import { runMaintenance } from './services/maintenance.js';
import { createApp } from './web/app.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const clock = new DemoClock(db);
const app = createApp(db, clock, config);

// Periodic expiry/matching job. Request-time guards enforce cutoffs even if this stops.
const timer = setInterval(() => {
  try {
    runMaintenance(db, clock);
  } catch (err) {
    console.error('[maintenance]', (err as Error).message);
  }
}, 15_000);
timer.unref();

const server = app.listen(config.port, config.host, () => {
  console.log(`3Digit DEMO running at http://${config.host}:${config.port}  (db: ${config.databasePath}, env: ${config.nodeEnv})`);
  console.log('DEMO — Walang totoong bayad o cash prize. Simulated payments only.');
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
