// Downloads the Higgsfield-generated decorative media listed in
// src/data/generated-assets.json into the project. Safe to re-run: existing
// files are kept unless --force is passed.
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
  const dest = path.join(root, asset.file);
  if (!force && (await fs.stat(dest).catch(() => null))) {
    console.log(`keep  ${asset.file}`);
    continue;
  }
  try {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${asset.file}`);
  } catch (err) {
    failed++;
    console.error(`fail  ${asset.key}: ${err.message} (${asset.url})`);
  }
}

if (failed) {
  console.error(`\n${failed} download(s) failed. If the host is blocked, allow it or download manually to the paths above.`);
  process.exit(1);
}
