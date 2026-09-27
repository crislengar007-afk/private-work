# The Flower Studio TCI: The Floral Atelier

An editorial redesign of [theflowerstudiotci.com](https://theflowerstudiotci.com)
built around the gallery. The design system is described in
[DESIGN.md](DESIGN.md).

The stack is [Astro](https://astro.build) 7, a static site with native CSS
and a small amount of vanilla TypeScript. Only three runtime dependencies are
used: Astro, two self-hosted variable fonts (Bodoni Moda and Geist) and
Phosphor icons.

## Run it

Use Node 22 or newer.

```bash
npm install
npm run dev        # http://localhost:4321 with hot reload
npm run build      # type-check, then build the static site to dist/
npm run preview    # serve dist/ at http://127.0.0.1:4321
npm test           # Playwright tests on desktop and mobile Chromium
```

## Routes

The routes keep the existing WordPress slugs, so current links and search
results continue to work. No redirects are required.

| Route        | Page                                                   |
| ------------ | ------------------------------------------------------ |
| `/`          | Home                                                   |
| `/gallery/`  | Gallery with collection filters and the full-screen viewer |
| `/services/` | Services                                               |
| `/contact/`  | Enquiry form and contact details                       |

Gallery state lives in the URL:

- `/gallery/?collection=<id>` applies a filter.
- `/gallery/?view=<id>` opens a photograph.
- `/contact/?piece=<id>` carries a photograph into an enquiry.
- `/contact/?occasion=<value>` preselects the occasion.

## Content: what still needs to come from the live site

The build environment's network policy blocked `theflowerstudiotci.com` and
the Higgsfield media CDN. The site therefore runs today with clearly
labelled placeholder frames. Every placeholder disappears automatically once
the real files are present.

1. **Portfolio photographs (authentic work).** Run this once the site is
   reachable:

   ```bash
   npm run import:gallery -- --dry   # list what would be imported
   npm run import:gallery            # download and write src/data/gallery.json
   ```

   The importer copies each photograph from `/gallery/` into
   `src/assets/gallery/`. It records the source URL, alt text and caption,
   and creates collections only when the source page groups the images. It
   also saves text snapshots of the Home, Services, Contact and Gallery
   pages to `reference/` for fact-checking. Review any entry marked
   `altNeedsReview`.
2. **Contact details.** The phone numbers, email, address, hours and
   Facebook link in `src/data/site.ts` come from the search-engine index of
   the site (see `reference/extracted-2026-09-27.md`). Confirm them against
   `reference/contact.txt`, and add WhatsApp or Instagram if they exist.
   Any value left as `null` is simply omitted.
3. **Service wording.** Compare `src/data/services.ts` with
   `reference/services.txt` and adopt the studio's own descriptions.
4. **Logo.** Save the studio's logo as `src/assets/brand/logo.svg` (or
   `.png` or `.webp`). It replaces the typographic wordmark everywhere.
5. **Generated decorative media.** Run `npm run fetch:media` once
   `d8j0ntlcm91z4.cloudfront.net` is reachable. You can also download the
   files listed in `src/data/generated-assets.json` by hand to the paths
   shown there.

## Enquiry form

- **With a form service:** set `PUBLIC_FORM_ENDPOINT` (see `.env.example`)
  to any endpoint that accepts a JSON POST and returns 2xx, for example a
  Formspree form. Success is reported only when the endpoint confirms it.
- **Without one:** if `site.contact.email` is set, the button reads
  "Compose email". It opens the visitor's email app with the enquiry written
  out, and the page states plainly that nothing has been sent yet.
- **With neither:** the form explains that online enquiries are not
  connected, and the button stays disabled.

## Imagery provenance

- **Authentic:** every photograph in `src/assets/gallery/` is the studio's
  own work, imported from its website with the source URL recorded.
- **Generated:** the images and video listed in
  `src/data/generated-assets.json` were made with Higgsfield. They are used
  only as decoration (hero, studio atmosphere, contact), are captioned or
  credited as generated, and never appear in the gallery.

## Deployment

The project is not deployed. `npm run build` produces a static `dist/`
folder that any static host can serve. Replacing the live WordPress site is
a separate, explicit decision.
