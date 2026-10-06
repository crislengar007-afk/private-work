try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional
}

const env = process.env.NODE_ENV ?? 'development';

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  nodeEnv: string;
  production: boolean;
  showDemoAccounts: boolean;
  demoClockControls: boolean;
  authRateLimit: number;
  outboxPath: string;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const production = env === 'production';
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? 'data/demo.sqlite',
    nodeEnv: env,
    production,
    showDemoAccounts: !production && process.env.SHOW_DEMO_ACCOUNTS === 'true',
    demoClockControls: !production && process.env.DEMO_CLOCK_CONTROLS !== 'false',
    authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 20),
    outboxPath: 'data/demo-outbox.txt',
    ...overrides,
  };
}
