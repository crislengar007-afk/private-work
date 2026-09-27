import fs from 'node:fs';
import path from 'node:path';
import type { ImageMetadata } from 'astro';
import registry from './generated-assets.json';

/**
 * Generated imagery (Higgsfield), recorded in generated-assets.json and
 * ASSET_MANIFEST.md. Concept and decorative use only; never portfolio.
 * Every consumer copes with a missing file.
 */

const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/generated/*.{png,jpg,jpeg,webp}', {
  eager: true,
});

interface Entry {
  key: string;
  file: string;
  kind: string;
  alt: string;
  sources?: string[];
}

const entries = registry.assets as Entry[];

export interface Decor {
  image: ImageMetadata;
  alt: string;
}

export function decor(key: string): Decor | undefined {
  const entry = entries.find((a) => a.key === key);
  if (!entry || entry.kind !== 'image') return undefined;
  const mod = files[`/${entry.file}`];
  return mod ? { image: mod.default, alt: entry.alt } : undefined;
}

export interface VideoSource {
  src: string;
  type: string;
}

/** Web sources for a generated clip that exist on disk, best codec first. */
export function decorVideo(key: string): VideoSource[] {
  const entry = entries.find((a) => a.key === key);
  if (!entry || entry.kind !== 'video') return [];
  const candidates = entry.sources ?? [entry.file];
  return candidates
    .filter((f) => fs.existsSync(path.join(process.cwd(), f)))
    .map((f) => ({ src: '/' + path.relative('public', f), type: f.endsWith('.webm') ? 'video/webm' : 'video/mp4' }));
}

/** Back-compat for the comparison pages. */
export function heroVideo(): string | undefined {
  return decorVideo('hero-loop').find((s) => s.type === 'video/mp4')?.src;
}
