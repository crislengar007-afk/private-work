import fs from 'node:fs';
import path from 'node:path';
import type { ImageMetadata } from 'astro';
import registry from './generated-assets.json';

/**
 * Decorative imagery generated with Higgsfield. Recorded in
 * generated-assets.json with the job that produced it. Every consumer must
 * cope with a missing file (the media may not be downloaded yet).
 */

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/generated/*.{png,jpg,jpeg,webp}',
  { eager: true },
);

export interface Decor {
  image: ImageMetadata;
  alt: string;
}

export function decor(key: string): Decor | undefined {
  const entry = registry.assets.find((a) => a.key === key);
  if (!entry || entry.kind !== 'image') return undefined;
  const mod = files[`/${entry.file}`];
  return mod ? { image: mod.default, alt: entry.alt } : undefined;
}

/** Public URL of the hero loop, if it has been downloaded. */
export function heroVideo(): string | undefined {
  const entry = registry.assets.find((a) => a.key === 'hero-loop');
  if (!entry) return undefined;
  const onDisk = path.join(process.cwd(), entry.file);
  return fs.existsSync(onDisk) ? '/' + path.relative('public', entry.file) : undefined;
}

export const generatedAssets = registry.assets;
