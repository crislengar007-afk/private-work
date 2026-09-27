import { defineConfig, devices } from '@playwright/test';

// Tests run against a production build. The form endpoint points at a
// fictitious host that each test intercepts, so no enquiry leaves the machine.
export const TEST_ENDPOINT = 'https://forms.example.test/enquiry';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4322',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `PUBLIC_FORM_ENDPOINT=${TEST_ENDPOINT} ASTRO_OUT_DIR=dist-test sh -c 'npx astro build && npx http-server dist-test -a 127.0.0.1 -p 4322 -s -c-1'`,
    url: 'http://127.0.0.1:4322/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
