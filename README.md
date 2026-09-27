# The Flower Studio TCI: website preview

This is a working preview of an upgraded website for
[theflowerstudiotci.com](https://theflowerstudiotci.com), built to
[SPEC.md](SPEC.md). The selected direction is **Island Atelier**. It is
documented in [DESIGN.md](DESIGN.md), and the two alternative directions
remain at `/directions/`.

- **Stack:** Astro 7 (a static site), native CSS and a small amount of vanilla TypeScript.
- **Runtime dependencies:** only Astro, two self-hosted variable fonts and Phosphor icons.
- **Live site:** WordPress, untouched.

## Run it

Requires Node 22 or newer.

```bash
npm install
npm run dev        # http://localhost:4321 with hot reload
npm run build      # type-check, then build the static site into dist/
npm run preview    # serve dist/ at http://127.0.0.1:4321
npm test           # Playwright: 41 checks on desktop and mobile Chromium
```

## Pages and routes

| Route | Page |
| --- | --- |
| `/` | Home: hero, service entry points, portfolio preview, story, inquiry |
| `/our-services/` | The five service groups, each with an inquiry path (same slug as the live site) |
| `/gallery/` | The genuine portfolio, with colour filters and a full-screen viewer |
| `/contact/` | Contact details, directions and the inquiry form |
| `/services/` | Redirects to `/our-services/` |
| `/directions/` | The three homepage directions (not indexed; excluded from the sitemap) |

State that can be shared through the URL:

- `/gallery/?collection=whites` applies a filter.
- `/gallery/?view=img008` opens a photograph in the viewer.
- `/contact/?service=weddings` preselects a service.
- `/contact/?piece=img008` carries a photograph into the inquiry.

## Content and assets

| File | Contents |
| --- | --- |
| [CONTENT_MAP.md](CONTENT_MAP.md) | What was found on the live site and where it now lives |
| [ASSET_MANIFEST.md](ASSET_MANIFEST.md) | Every image and video, with source, provenance, alt text, sizes and placement |
| `src/data/site.ts` | Contact facts, hours and navigation |
| `src/data/services.ts` | The five services, using the studio's own wording |
| `src/data/gallery.json` | Portfolio records: alt text, caption, colour, provenance and status |
| `src/data/generated-assets.json` | Higgsfield outputs, with their jobs and prompts |

Commands for refreshing content:

- `npm run import:gallery` re-imports photographs from the live `/gallery/`
  and saves text snapshots of each page to `reference/`. It overwrites
  `gallery.json`, so re-apply the curated alt text afterwards (git shows
  the difference).
- `npm run fetch:media` downloads the original Higgsfield outputs into
  `generated-originals/`, which is git-ignored.

Inside restricted networks, both scripts use `NODE_USE_ENV_PROXY=1` so
that Node's `fetch` honours `HTTPS_PROXY`.

## Inquiry form

The form is ready, but delivery needs one decision from the owner. It
behaves differently depending on what is configured:

- **With `PUBLIC_FORM_ENDPOINT` set** (see `.env.example`), it posts JSON
  and shows success only when the endpoint answers 2xx. Formspree, Basin or
  a small serverless function all work.
- **Without an endpoint (the current state)**, it composes an email to
  orders@theflowerstudiotci.com. The page states that online delivery is
  not connected and that nothing is sent until the visitor sends the email.

Spam protection on the client uses a hidden honeypot field and a minimum
fill time. Server-side validation, spam filtering and a real privacy notice
must come with the chosen endpoint before the form collects data.

## Moving the approved result to theflowerstudiotci.com

The current site runs on WordPress 6.3 with Elementor, Contact Form 7 and
Hostinger webmail. There are two practical paths.

1. **Replace WordPress with this static site (recommended).** This is faster
   and simpler, and it has nothing to patch.
   - **Hosting:** deploy `dist/` to a static host such as Netlify,
     Cloudflare Pages or Hostinger static hosting.
   - **Domain:** point the domain there. Keep MX records unchanged so email
     keeps working.
   - **Forms:** choose a form service and set `PUBLIC_FORM_ENDPOINT`.
   - **Content editing:** edit the data files in `src/data/` and redeploy.
     A git-based CMS such as Decap can be added later if the owner wants
     to edit without code.
   - **Analytics:** none exist today. Add a privacy-friendly option only if
     the owner wants it.
   - **Redirects:** all live URLs (`/`, `/our-services/`, `/gallery/`,
     `/contact/`) are unchanged. Add redirects only for any other WordPress
     URLs the owner wants to keep, such as `/wp-admin/` or feed URLs.
2. **Keep WordPress and restyle it.** Port the tokens, type and components
   into a block theme. This keeps the WordPress editor but costs more to
   build and maintain.

### Before production

These points need the owner (SPEC §10):

- Access to hosting and DNS.
- Confirmation that the portfolio photographs may be reused.
- Approval of the logo, palette and fonts, and ideally a vector logo.
- Verification of the address, hours, phone numbers, email and social
  links.
- The inquiry destination and a privacy notice.
- Whether online ordering, delivery or packages exist. None are built.

## Imagery provenance

| Source | Where it appears | Label |
| --- | --- | --- |
| The studio's own photographs (`real_portfolio`) | Gallery, Home portfolio and story, House guests service | "From the studio's portfolio" |
| Higgsfield concepts (`concept`) | Hero, and the Arrangements, Weddings, Corporate and Hotels sections | "Concept image, generated for this design" |

Concept images never enter the gallery.
