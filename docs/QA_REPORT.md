# QA report: Island Atelier preview

**Date:** 27 September 2026
**Branch:** `claude/flower-studio-tci-redesign-9qjl69`
**Build:** `npm run build` (Astro 7, static output)

## Summary

| Area | Result |
| --- | --- |
| Automated tests | **45 passed**, 1 skipped (the mobile menu test is skipped on the desktop project by design). Run with Playwright on desktop Chromium (1440×900) and a mobile Pixel 7 profile. |
| Type check | `astro check`: 0 errors, 0 warnings |
| Horizontal overflow | None at 375, 768, 1440 or 1920 px on any page |
| Console errors and failed requests | None on any page at any tested width |
| Keyboard | The skip link comes first. Every focus stop shows a 2 px lagoon ring. The mobile menu and viewer are modal: focus stays inside, Escape closes them, and focus returns to the control that opened them. |
| Reduced motion | Content is visible immediately, the video never loads, and filter changes are instant. |
| Contrast | All small text is 4.5:1 or better in light and dark themes. The detector's 1.0:1 reports on `.link` are false positives caused by its currentColor underline gradient. |

## Functional checks (automated)

- **Pages:** each page has a unique title and a meta description of at least 40 characters, one `h1`, no errors and no overflow.
- **Navigation:** primary and mobile navigation reach every page. `/services/` redirects to `/our-services/`.
- **Gallery filters:**
  - The URL updates and survives a reload.
  - Back restores the previous filter.
  - Counts come from the data.
  - Only photographs of the chosen colour are shown.
- **Viewer:**
  - Opens on click.
  - ←, →, Home and End move between photographs, and navigation wraps around.
  - Escape closes it and returns focus to the thumbnail.
  - Browser Back closes it.
  - Swipe changes the photograph, while a short or vertical drag is ignored.
  - The controls are never covered by the photograph.
  - Deep links (`?view=`) open it, and returning from Contact restores it.
- **Enquiry handoff:** "Enquire about this arrangement" carries the photograph, with a thumbnail and caption, into the form, and it can be removed. A later service enquiry does not inherit a stale photograph.
- **Service-specific questions:**
  - `?service=` preselects the service.
  - Weddings add venue and guest numbers.
  - Corporate and Hotels add venue and "one-off or ongoing".
  - The questions hide for other services.
- **Validation:** errors appear inline beside each field, `aria-invalid` is set, focus moves to the first problem, and a summary line gives the count.
- **Submission:**
  - Success is shown only when the endpoint returns 2xx.
  - A failed send shows an error, keeps the text and never claims success.
  - A filled honeypot blocks the send.
- **Reduced motion:** covered as in the summary.

## Viewport review

Every page was captured full-length at 375, 768, 1440 and 1920 px in the light theme, and Home in the dark theme at 375 and 1440. The captures are in `docs/qa/`:

- Before: `before-<page>-<width>.webp`
- After: `after-<page>-<width>.webp`
- Dark theme: `after-dark-home-<width>.webp`
- Viewer: `viewer-*.webp`

**Before (live site):** coral and peach colour blocks with a black footer. The layout has large empty blocks, a narrow sans-serif, and no alt text on any portfolio image. The Contact page map area renders blank at desktop width, and the Privacy and Terms entries have no destinations.

**After:** Island Atelier across all pages, as shown in the captures.

## Performance

These are measured values, not scores. The local `astro preview` server sends no compression and uses no CDN, so a production host will do better.

| Page | Conditions | FCP | LCP | LCP element | CLS | Transferred |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 375 px, DPR 3, 4× CPU, 150 ms, 1.6 Mbps | 0.66 s | **1.82 s** | Mobile hero (H2, 900 w AVIF) | 0.026 | 423 KB |
| Gallery | Same | 0.61 s | **2.12 s** | First portfolio photograph (AVIF) | 0.022 | 356 KB |
| Home | 1440 px, unthrottled | 0.09 s | 0.10 s | Desktop hero (H1 AVIF) | 0.001 | 289 KB, plus the 237 KB loop after load |

These meet the spec's targets: LCP at or under 2.5 s and CLS at or under 0.1. Interaction delay (INP) was not measured in the lab; the pages ship little script, and interactions update the page only once each. Improvements made during QA:

- AVIF heroes.
- Separate media-matched preloads for desktop and mobile, which removed a wasted 76 KB desktop download on phones.
- Mobile hero capped at 900 px.
- The loop starts only after `load`.
- Portfolio images below the fold are lazy and have reserved dimensions.

## Impeccable review

Two independent assessments were run, as the skill requires: a design review and a detector with browser evidence.

**Design review score:** 29/40 (73%) on Nielsen's heuristics before the fixes below.

**Addressed after the review:**

- Real work now appears directly under the hero. The Arrangements service also shows real portfolio thumbnails.
- On mobile, a service or photograph enquiry scrolls to the form. A stale photograph no longer leaks into later enquiries.
- The filter status no longer repeats its count, and filters now join browser history.
- Hero composition: the copy is centred on desktop, the mobile headline is smaller, and the mobile dock stays tucked away while the hero actions are on screen.
- Hospitality enquiries now ask "one-off or ongoing?" and weddings ask for guest numbers, instead of a generic "for events" block.
- Button labels are consistent ("Request Flowers", "Explore the Gallery"). The enquiry band is calmer in dark mode. Error borders stay visible while a field is focused.
- The mobile menu shows the phone number and hours.
- The duplicate mission quote is gone from Services, and the footer link targets meet 44 px.

**Detector false positives:**

- `broken-image` on two script-filled `<img>` elements.
- `low-contrast` on `.link`.
- `clipped-overflow` on the hero's intentional scale-in.

**Taste flags kept on purpose:** `italic-serif-display` and `cream-palette`. They are the chosen brand direction.

## Known limitations and open items

- **Portfolio categories:** there are no genuine wedding, corporate or hotel photographs, so those services use labelled concept images and the gallery filters by colour. Replace them when the owner supplies real work.
- **Portfolio resolution:** the 512 px squares are the largest the studio published. They are shown at native size, and the originals would look better.
- **Inquiry delivery:** not yet connected to a backend. The email fallback is labelled on the page (see README).
- **Published preview:** the claude.ai preview cannot pass query strings. Links such as `?service=` and `?view=` work locally with `npm run preview` but not inside the hosted preview. The photograph handoff still works there through session storage.
- **Owner decisions:** see SPEC §10 and README, "Before production".
