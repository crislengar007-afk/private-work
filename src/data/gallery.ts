import type { ImageMetadata } from 'astro';
import manifest from './gallery.json';

/**
 * Portfolio photographs: the studio's own work.
 *
 * `gallery.json` is written by `npm run import:gallery`, which copies the
 * photographs published on theflowerstudiotci.com/gallery/ into
 * src/assets/gallery/ and records each image's source URL, alt text and
 * caption. Collections are only assigned where the source groups them.
 *
 * Until that import has run, the gallery renders clearly labelled
 * placeholder frames so layout and interactions can be reviewed. They are
 * never presented as work.
 */

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
  sourceUrl: string;
}

export interface GalleryItem {
  id: string;
  alt: string;
  caption?: string;
  collection?: string;
  image?: ImageMetadata;
  /** Width / height, used for layout when there is no image yet. */
  ratio: number;
  sourceUrl?: string;
  placeholder?: boolean;
}

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/gallery/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

const typed = manifest as { collections: Collection[]; items: ManifestEntry[] };

const real: GalleryItem[] = typed.items.flatMap((entry) => {
  const mod = files[`/src/assets/gallery/${entry.file}`];
  if (!mod) return [];
  const image = mod.default;
  return [
    {
      id: entry.id,
      alt: entry.alt,
      caption: entry.caption,
      collection: entry.collection,
      image,
      ratio: image.width / image.height,
      sourceUrl: entry.sourceUrl,
    },
  ];
});

const placeholderCollections: Collection[] = [
  { id: 'events', label: 'Events' },
  { id: 'celebrations', label: 'Celebrations' },
];

// Proportions vary the way a real portfolio does, so the art-directed
// layout can be judged honestly before photographs arrive.
const placeholderRatios = [4 / 5, 3 / 2, 2 / 3, 1, 4 / 5, 3 / 4, 3 / 2, 4 / 5, 2 / 3, 1, 3 / 4, 4 / 5];

const placeholders: GalleryItem[] = placeholderRatios.map((ratio, i) => ({
  id: `pending-${i + 1}`,
  alt: '',
  caption: 'Portfolio photograph pending import',
  collection: placeholderCollections[i % 3 === 2 ? 1 : 0].id,
  ratio,
  placeholder: true,
}));

export const isPlaceholderGallery = real.length === 0;

export const galleryItems: GalleryItem[] = isPlaceholderGallery ? placeholders : real;

const allCollections = isPlaceholderGallery ? placeholderCollections : typed.collections;

/** Collections worth filtering by: at least two, each with two or more items. */
export const collections: Collection[] = (() => {
  const counted = allCollections.filter(
    (c) => galleryItems.filter((item) => item.collection === c.id).length >= 2,
  );
  return counted.length >= 2 ? counted : [];
})();

export function collectionLabel(id?: string) {
  return allCollections.find((c) => c.id === id)?.label;
}

/** First items of the gallery, used for the Home page sequence. */
export function selectedWork(count = 5) {
  return galleryItems.slice(0, count);
}
