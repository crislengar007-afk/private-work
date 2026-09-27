# Island Atelier: Design System

This is the selected direction (B) from the three homepage concepts. Directions A (Botanical
Editorial) and C (Minimal Floral Gallery) remain at `/directions/` for comparison.

**Positioning:** modern island elegance, floral artistry, personal service.

Every visual choice comes from the business itself:

- The light display serif echoes the logo's wordmark.
- Lotus pink is the logo's own mark colour.
- Lagoon is the turquoise backdrop from the studio's own photographs, deepened for contrast.
- The limestone and linen neutrals let the vivid real work stand out without competing with it.

**Signature:** the arch. It frames the hero and the portfolio highlights, and acts as a quiet
architectural reference without beach clichés.

## 1. Colour

The page theme follows the system setting; an explicit `data-theme` on the root element overrides it.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--stone` | `#ECE7DE` | `#121817` | Page ground (limestone) |
| `--stone-2` | `#E4DED3` | `#181F1E` | Quiet bands, footer, form panel |
| `--sand` | `#DDD5C7` | `#1F2726` | Service band, media placeholders |
| `--ink` | `#1D2627` | `#ECE7DE` | Text |
| `--ink-soft` | `#4D5856` | `#A9B3B0` | Secondary text |
| `--lagoon` | `#0F6366` | `#6CC3C4` | The one interactive accent: buttons, links, active states, focus |
| `--lotus` | `#A93F66` | `#E58FAE` | Small details only: rules, errors, quotes |

Contrast, measured with the WCAG formula:

- `--ink` on stone: 12.6:1
- `--ink-soft` on stone: 6.0:1, and 5.1:1 on sand
- `--lagoon` on stone: 5.2:1 or better
- Button text on lagoon: 5.8:1 or better
- `--lotus`: 4.75:1

Dark mode stays at 7.6:1 or above throughout.

## 2. Typography

| Role | Family | Source and licence |
| --- | --- | --- |
| Display | Cormorant Garamond (variable; roman and italic) | Fontsource, SIL OFL 1.1 |
| Text | Hanken Grotesk (variable) | Fontsource, SIL OFL 1.1 |

- Both fonts are self-hosted with `font-display: swap`. The fallbacks are Garamond or Times, and system-ui.
- Display type is light (300 to 400) with line height 1.02 to 1.1 and balanced wrapping. Emphasis uses the italic, in lagoon.
- Body text is 1rem to 1.0625rem at line height 1.65, with a reading measure of 38rem or less.
- Small uppercase labels (0.75rem, 0.16em tracking) are for field and definition terms only. They are never used as eyebrows above headings.

## 3. Space, shape and layout

- The page gutter is `clamp(1.25rem, 4vw, 3.5rem)`, and the maximum width is 1440 px.
- Section rhythm is `clamp(5.5rem, 11vw, 10rem)`.
- **Shape rule:** interactive controls are pills (buttons, filters, nav bar, jump links). Featured media uses the arch (`999px 999px 0 0`). Form fields and panels use a 0.75rem or 1.25rem radius. Gallery photographs are square-cornered.
- Layouts are asymmetric:
  - **Home hero:** 7/5 split with the arch on the right.
  - **Services:** alternating two-column rows, stacked below 900 px.
  - **Gallery:** a three-step staggered rhythm keyed to the visible items, so filtering keeps the composition.

## 4. Imagery

- **Real portfolio** (`provenance: real_portfolio`): shown unfiltered at its true colour, and never enlarged beyond its native pixels. The 512 px squares cap at 512 CSS px, both in the grid and in the viewer.
- **Concepts** (`provenance: concept`, Higgsfield): used for the hero and four service sections only. Each carries a "Concept image, generated for this design" label and appears in ASSET_MANIFEST.md. None enters the gallery.
- Frames reserve their aspect ratio, and images are served as responsive AVIF and WebP. Only the hero still is eager and high priority; everything below the fold is lazy.

## 5. Motion

- **One authored moment:** on the Home hero, the arch opens upward (a clip-path rise over 1.6 s) while the headline lines rise from a mask. This is CSS only, so the content never depends on script.
- **The loop (V1):** starts only after page load, on desktop, with motion allowed and Save-Data off. A "Pause motion" control is provided.
- **Supporting motion:**
  - Content fades up 16 px once as it enters the viewport.
  - Arched photographs settle into their frames.
  - Gallery filters use a FLIP glide.
  - The viewer crossfades between photographs.
  - Links and buttons have a subtle hover glide.
- **Easing:** `cubic-bezier(.22,1,.36,1)`, and `(.76,0,.24,1)` for the arch.
- **Reduced motion:** transitions are near-instant, the video never loads, and reveals are shown immediately.
- There is no scroll-jacking, parallax, preloader or custom cursor.

## 6. Responsive behaviour

| Width | Behaviour |
| --- | --- |
| Under 640 px | Single column. The portfolio preview becomes a horizontal snap strip. The gallery alternates full and inset items. |
| Under 861 px | Full-screen menu dialog, and the mobile hero uses the separately composed H2 portrait. |
| Under 861 px | A contact dock (Call and Request flowers) sits at the viewport foot, with matching reserved padding. It is hidden on Contact. |
| 1024 px and up | Five service entry points in one row, and a three-column gallery rhythm. |

Verified at 375, 768, 1440 and 1920 px with no horizontal overflow.

## 7. Voice

The copy is the studio's own, condensed rather than rewritten in meaning. It uses verified facts only: no prices, delivery zones, turnaround times or testimonials. Primary actions are "Explore the Gallery" and "Request Flowers". Service calls to action read "Enquire about …".
