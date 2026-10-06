import { defineConfig } from '@playwright/test';

// `npm run docs:screenshots` — performs the documented demo walkthrough on a
// fresh, separately seeded database (data/walkthrough.sqlite) and saves desktop
// and 360px-mobile screenshots to docs/screenshots/.
export default defineConfig({
  testDir: 'tests/walkthrough',
  workers: 1,
  timeout: 180_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3201' },
  webServer: {
    command: 'npx tsx src/scripts/reset.ts && npx tsx src/server.ts',
    url: 'http://127.0.0.1:3201/healthz',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_PATH: 'data/walkthrough.sqlite', PORT: '3201', HOST: '127.0.0.1', NODE_ENV: 'test', SHOW_DEMO_ACCOUNTS: 'true', DEMO_CLOCK_CONTROLS: 'true', AUTH_RATE_LIMIT: '1000' },
  },
});
