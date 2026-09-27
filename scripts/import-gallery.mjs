// Imports the studio's authentic portfolio photographs from the live site.
//
//   npm run import:gallery            import https://theflowerstudiotci.com/gallery/
//   npm run import:gallery -- --dry   list what would be imported
//
// It downloads each photograph into src/assets/gallery/, records its source
// URL, alt text and caption in src/data/gallery.json, and groups images into
// collections only when the source page itself groups them (gallery tags or
// section headings). It also saves plain-text snapshots of the Home,
// Services, Contact and Gallery pages to reference/ so business details can
// be checked against the source.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';
import sharp from 'sharp';

// SOURCE_SITE overrides the origin (used to test against a local fixture).
const SITE = process.env.SOURCE_SITE || 'https://theflowerstudiotci.com';
const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'src/assets/gallery');
const manifestPath = path.join(root, 'src/data/gallery.json');
const dry = process.argv.includes('--dry');
const MIN_WIDTH = 600;

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (site migration)' } });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return res;
}

function largestFromSrcset(srcset) {
  if (!srcset) return null;
  return srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .map(([url, size]) => ({ url, w: parseInt(size, 10) || 0 }))
    .sort((a, b) => b.w - a.w)[0]?.url;
}

// WordPress resizes carry a -WIDTHxHEIGHT suffix; the original has none.
const originalOf = (url) => url.replace(/-\d{2,5}x\d{2,5}(?=\.(jpe?g|png|webp)(\?|$))/i, '');

function bestUrl(img) {
  const a = (n) => img.getAttribute(n);
  const candidate =
    a('data-orig-file') ||
    a('data-large-file') ||
    a('data-full-url') ||
    largestFromSrcset(a('srcset') || a('data-srcset') || a('data-lazy-srcset')) ||
    a('data-src') ||
    a('data-lazy-src') ||
    a('src');
  if (!candidate || candidate.startsWith('data:')) return null;
  return new URL(candidate, SITE).href;
}

function isChrome(img) {
  // Skip logos, icons and anything in the header, footer or navigation.
  for (let el = img; el; el = el.parentNode) {
    const tag = el.rawTagName?.toLowerCase();
    if (['header', 'footer', 'nav'].includes(tag)) return true;
    const cls = (el.getAttribute?.('class') || '').toLowerCase();
    if (/\b(logo|site-branding|menu|widget_nav|icon)\b/.test(cls)) return true;
  }
  return /logo|icon|favicon/i.test(img.getAttribute('src') || '');
}

function captionOf(img) {
  const figure = img.closest('figure');
  const text = figure?.querySelector('figcaption')?.text?.trim();
  return text || img.getAttribute('data-image-caption')?.replace(/<[^>]+>/g, '').trim() || undefined;
}

function collectionOf(img, headings) {
  // Gallery plugins that tag items (Elementor, FooGallery, Envira, etc.).
  for (let el = img; el; el = el.parentNode) {
    const tags = el.getAttribute?.('data-e-gallery-tags') || el.getAttribute?.('data-tags');
    if (tags) return tags.split(',')[0].trim();
  }
  // Otherwise the nearest section heading before the image.
  const pos = img.range?.[0] ?? 0;
  const before = headings.filter((h) => h.pos < pos);
  return before.length ? before[before.length - 1].text : undefined;
}

async function snapshot(page) {
  try {
    const html = await (await get(`${SITE}/${page}`)).text();
    const doc = parse(html);
    doc.querySelectorAll('script, style, noscript, svg').forEach((n) => n.remove());
    const text = doc.querySelector('body')?.structuredText ?? '';
    const links = doc
      .querySelectorAll('a[href^="mailto:"], a[href^="tel:"], a[href*="wa.me"], a[href*="instagram.com"], a[href*="facebook.com"]')
      .map((a) => a.getAttribute('href'));
    const name = page.replace(/\/$/, '') || 'home';
    await fs.mkdir(path.join(root, 'reference'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'reference', `${name}.txt`),
      `Source: ${SITE}/${page}\nCaptured: ${new Date().toISOString()}\n\nContact links:\n${[...new Set(links)].join('\n')}\n\n${text}\n`,
    );
    console.log(`snapshot reference/${name}.txt`);
  } catch (err) {
    console.warn(`snapshot failed for /${page}: ${err.message}`);
  }
}

const galleryHtml = await (await get(`${SITE}/gallery/`)).text();
const doc = parse(galleryHtml, { comment: false });
const main = doc.querySelector('main') || doc.querySelector('#content') || doc.querySelector('.entry-content') || doc;
const headings = main
  .querySelectorAll('h2, h3, h4')
  .map((h) => ({ pos: h.range?.[0] ?? 0, text: h.text.trim() }))
  .filter((h) => h.text && !/gallery/i.test(h.text));

const seen = new Set();
const found = [];
for (const img of main.querySelectorAll('img')) {
  if (isChrome(img)) continue;
  const url = bestUrl(img);
  if (!url) continue;
  const key = originalOf(url);
  if (seen.has(key)) continue;
  seen.add(key);
  found.push({
    url,
    original: key,
    alt: img.getAttribute('alt')?.trim() || '',
    caption: captionOf(img),
    collection: collectionOf(img, headings),
  });
}

console.log(`Found ${found.length} candidate photographs on /gallery/.`);
if (dry) {
  for (const f of found) console.log(`- ${f.original}  [${f.collection ?? 'no collection'}] ${f.alt}`);
  process.exit(0);
}

await fs.mkdir(outDir, { recursive: true });
const items = [];
const usedIds = new Set();

for (const f of found) {
  let res;
  let source = f.original;
  try {
    res = await get(f.original);
  } catch {
    source = f.url;
    res = await get(f.url).catch(() => null);
  }
  if (!res) {
    console.warn(`skip  ${f.url}: download failed`);
    continue;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buffer).metadata().catch(() => null);
  if (!meta?.width || meta.width < MIN_WIDTH) {
    console.warn(`skip  ${source}: too small or unreadable`);
    continue;
  }
  const ext = meta.format === 'jpeg' ? 'jpg' : meta.format;
  let id = slug(path.basename(new URL(source).pathname).replace(/\.\w+$/, '')) || `photo-${items.length + 1}`;
  while (usedIds.has(id)) id += '-b';
  usedIds.add(id);
  const file = `${id}.${ext}`;
  await fs.writeFile(path.join(outDir, file), buffer);
  items.push({
    id,
    file,
    alt: f.alt || 'Floral design by The Flower Studio',
    ...(f.alt ? {} : { altNeedsReview: true }),
    ...(f.caption ? { caption: f.caption } : {}),
    ...(f.collection ? { collection: slug(f.collection) } : {}),
    collectionLabel: f.collection,
    sourceUrl: source,
  });
  console.log(`saved ${file} (${meta.width}x${meta.height})`);
}

const collections = [...new Map(items.filter((i) => i.collection).map((i) => [i.collection, i.collectionLabel])).entries()].map(
  ([id, label]) => ({ id, label }),
);
for (const i of items) delete i.collectionLabel;

await fs.writeFile(
  manifestPath,
  JSON.stringify({ importedFrom: `${SITE}/gallery/`, importedAt: new Date().toISOString(), collections, items }, null, 2) + '\n',
);
console.log(`\nWrote ${items.length} photographs and ${collections.length} collections to src/data/gallery.json.`);
const review = items.filter((i) => i.altNeedsReview).length;
if (review) console.log(`${review} photograph(s) had no alt text on the source; review "altNeedsReview" entries.`);

for (const page of ['', 'services/', 'contact/', 'gallery/']) await snapshot(page);
