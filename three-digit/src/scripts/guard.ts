import path from 'node:path';
import type { AppConfig } from '../config.js';

/** Reset/seed can never target a production or non-local database by accident. */
export function assertSafeLocalDatabase(config: AppConfig): string {
  if (config.production || process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed/reset: NODE_ENV=production.');
  }
  const dataDir = path.resolve('data');
  const file = path.resolve(config.databasePath);
  if (!file.startsWith(dataDir + path.sep) || !file.endsWith('.sqlite')) {
    throw new Error(`Refusing to seed/reset ${file}: only *.sqlite files inside ${dataDir} are allowed.`);
  }
  return file;
}
