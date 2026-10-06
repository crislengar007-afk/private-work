import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { capacityView } from '../../src/services/capacity.js';
import { createEntry } from '../../src/services/entries.js';
import { DAY, HOUR } from '../../src/lib/clock.js';
import { createEnv, idem } from '../helpers/env.js';

const run = promisify(execFile);

describe('real concurrency across processes (acceptance 19)', () => {
  it('concurrent requests at ₱490 yield exactly one success and never exceed ₱500', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-conc-'));
    const file = path.join(dir, 'race.sqlite');
    const env = createEnv(file);
    // Real-time draw so worker processes (system clock) see it open.
    env.clock.set(Date.now());
    const drawId = env.draw({ opensIn: -HOUR, submissionIn: DAY, verificationIn: DAY + HOUR, drawIn: DAY + 2 * HOUR });
    for (let i = 0; i < 49; i++) createEntry(env.as(env.user(['player'])), { drawId, digits: ['123', '321', '213'][i % 3], stakeMinor: 1000, idempotencyKey: idem() });
    const racers = Array.from({ length: 6 }, () => env.user(['player']));
    env.db.close();
    const startAt = Date.now() + 2500;
    const outputs = await Promise.all(
      racers.map((u, i) => run(process.execPath, ['--import', 'tsx', 'tests/helpers/reserve-worker.ts', file, String(u), String(drawId), ['132', '231', '312', '321', '123', '213'][i], String(startAt)], { timeout: 30000 })),
    );
    const results = outputs.map((o) => o.stdout.trim());
    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
    expect(results.filter((r) => r === 'CAPACITY_FULL')).toHaveLength(5);
    const after = createEnv(file);
    expect(capacityView(after.db, drawId, '123')).toMatchObject({ usedMinor: 50000, availableMinor: 0 });
    expect(after.db.get<{ n: number }>('SELECT count(*) AS n FROM entries')!.n).toBe(50);
    after.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60000);
});
