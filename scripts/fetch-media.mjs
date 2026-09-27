// Downloads the original Higgsfield outputs listed in
// src/data/generated-assets.json into generated-originals/ (git-ignored), for
// re-encoding or archiving. The web masters in the project are not touched.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const registry = JSON.parse(await fs.readFile(path.join(root, 'src/data/generated-assets.json'), 'utf8'));
const force = process.argv.includes('--force');
let failed = 0;

for (const asset of registry.assets) {
  if (!asset.url) {
    console.warn(`skip  ${asset.key}: no URL recorded`);
    continue;
  }
  const dest = path.join(root, 'generated-originals', asset.key + path.extname(new URL(asset.url).pathname));
  if (!force && (await fs.stat(dest).catch(() => null))) {
    console.log(`keep  ${path.relative(root, dest)}`);
    continue;
  }
  try {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${path.relative(root, dest)}`);
  } catch (err) {
    failed++;
    console.error(`fail  ${asset.key}: ${err.message} (${asset.url})`);
  }
}

if (failed) {
  console.error(`\n${failed} download(s) failed. If the host is blocked, allow it or download manually to the paths above.`);
  process.exit(1);
}
