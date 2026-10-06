import { defineConfig, devices } from '@playwright/test';

// The e2e server uses its own database (data/e2e.sqlite), reset and re-seeded
// before every run, so the demo clock advanced by the flow test never touches
// your local demo data.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3200', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx tsx src/scripts/reset.ts && npx tsx src/server.ts',
    url: 'http://127.0.0.1:3200/healthz',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_PATH: 'data/e2e.sqlite', PORT: '3200', HOST: '127.0.0.1', NODE_ENV: 'test', SHOW_DEMO_ACCOUNTS: 'true', DEMO_CLOCK_CONTROLS: 'true', AUTH_RATE_LIMIT: '1000' },
  },
});
