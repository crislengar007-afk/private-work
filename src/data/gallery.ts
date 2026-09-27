import type { ImageMetadata } from 'astro';
import manifest from './gallery.json';

/**
 * Portfolio photographs: the studio's own work, imported from
 * theflowerstudiotci.com/gallery/ by `npm run import:gallery` and curated in
 * gallery.json (alt text, captions and palette categories written from
 * visual inspection). Generated imagery never enters this dataset.
 */

export type Provenance = 'real_portfolio' | 'concept';

export interface Collection {
  id: string;
  label: string;
}

interface ManifestEntry {
  id: string;
  file: string;
  alt: string;
  caption?: string;
  collection?: string;
  provenance: Provenance;
  credit?: string;
  status: 'published' | 'draft';
  sourceUrl: string;
}

export interface GalleryItem {
  id: string;
  alt: string;
  caption?: string;
  collection?: string;
  image: ImageMetadata;
  width: number;
  height: number;
  ratio: number;
  provenance: Provenance;
  credit?: string;
  sourceUrl: string;
}

const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/gallery/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
});

const typed = manifest as unknown as { collections: Collection[]; items: ManifestEntry[] };

export const galleryItems: GalleryItem[] = typed.items.flatMap((entry) => {
  const mod = files[`/src/assets/gallery/${entry.file}`];
  if (!mod || entry.status !== 'published' || entry.provenance !== 'real_portfolio') return [];
  const image = mod.default;
  return [
    {
      id: entry.id,
      alt: entry.alt,
      caption: entry.caption,
      collection: entry.collection,
      image,
      width: image.width,
      height: image.height,
      ratio: image.width / image.height,
      provenance: entry.provenance,
      credit: entry.credit,
      sourceUrl: entry.sourceUrl,
    },
  ];
});

const countFor = (id: string) => galleryItems.filter((item) => item.collection === id).length;

/** Collections with real items, with counts computed from the records. Empty ones are omitted. */
export const collections: (Collection & { count: number })[] = (() => {
  const withItems = typed.collections.map((c) => ({ ...c, count: countFor(c.id) })).filter((c) => c.count > 0);
  return withItems.length >= 2 ? withItems : [];
})();

export function collectionLabel(id?: string) {
  return typed.collections.find((c) => c.id === id)?.label;
}

/** Curated first items of the gallery, used for the Home page preview. */
export function selectedWork(count = 5) {
  return galleryItems.slice(0, count);
}
