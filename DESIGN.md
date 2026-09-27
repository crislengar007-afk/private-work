# The Floral Atelier: Design System

Working concept for The Flower Studio TCI. The site should feel like a luxury
floral atelier presented through an editorial magazine. The flowers supply the
colour, and the interface frames them quietly.

**Design read:** an editorial luxury portfolio for clients planning island
weddings, events and personal celebrations in the Turks and Caicos Islands.
The language is a fashion-magazine layout built with native CSS, a Didone
display serif and restrained, motivated motion.

**Dials (Taste):** variance 7, motion 4, density 3. The layouts are
asymmetric, the motion is quiet and the layout is airy, like a gallery.

---

## 1. Colour

One page theme follows the system preference, and both modes use the same
tokens. There is one accent, muted rose, which is used sparingly: link hover,
the active filter, selection and small details. Deep botanical green is a
structural colour for primary buttons and the single colour-block section on
each page, the inquiry invitation.

| Token          | Light     | Dark      | Use                                   |
| -------------- | --------- | --------- | ------------------------------------- |
| `--paper`      | `#F3F1EA` | `#101612` | Page background (green-leaning ivory) |
| `--paper-2`    | `#E8E6DC` | `#18201B` | Image frames, quiet bands             |
| `--ink`        | `#17221C` | `#ECE9E0` | Headlines and body text               |
| `--ink-soft`   | `#48574E` | `#AEB8AF` | Captions, secondary text (AA)         |
| `--green`      | `#1E3A2D` | `#1E3A2D` | Primary buttons, inquiry band         |
| `--on-green`   | `#F3F1EA` | `#F3F1EA` | Text on green                         |
| `--rose`       | `#8A4753` | `#E0A7AF` | Single accent                         |
| `--rule`       | ink @ 16% | ink @ 18% | Hairline rules                        |

Contrast was measured with the WCAG formula:

- `--ink` on `--paper`: 14.5:1 light, 15.1:1 dark
- `--ink-soft` on `--paper`: 6.8:1 light, 9.0:1 dark
- `--rose` on `--paper`: 6.0:1 light, 9.0:1 dark
- `--on-green` on `--green`: 10.9:1

What the palette avoids: the generic beige, brass and espresso luxury
palette, gradients, glows and pure black or pure white.

## 2. Typography

| Role    | Family                         | Source and licence                                      |
| ------- | ------------------------------ | ------------------------------------------------------- |
| Display | **Bodoni Moda** (variable, opsz) | Google Fonts / Fontsource, SIL Open Font License 1.1 |
| Text    | **Geist** (variable)           | Vercel / Fontsource, SIL Open Font License 1.1          |

Both fonts are self-hosted through `@fontsource-variable/*` with
`font-display: swap`, and no third-party font requests are made at runtime.

**Why a Didone:** the high-contrast modern serif is the typographic voice of
fashion magazines. Bodoni Moda's optical-size axis keeps hairlines sturdy at
headline sizes. Geist is a neutral, highly legible grotesk that keeps body
copy, captions and forms calm.

- Display headlines use Bodoni Moda at weights 400 to 500, `opsz` 96, with
  tracking of -0.02em. Emphasis comes from the italic of the same family.
- The scale is fluid:
  - `--step-6`: 3.25 to 7.5rem (hero only)
  - `--step-5`: 2.6 to 5rem
  - `--step-4`: 2 to 3.4rem
  - `--step-3`: 1.5 to 2.2rem
  - `--step-1`: 1.125rem
  - `--step-0`: 1rem (17px body)
  - `--step--1`: 0.8125rem (captions)
- Body text uses Geist at 1rem to 1.0625rem with a line height of 1.65 and a
  measure of 60 to 66 characters or fewer.
- Italic descenders use a line height of at least 1.1 on display type.
- Small labels are Geist at 0.75rem with 0.14em uppercase tracking. They
  appear on at most one of every three sections.
- No em dashes appear anywhere in visible copy.

## 3. Space and layout

- The base unit is 8px. The page gutter is `clamp(1.25rem, 4vw, 3.5rem)`.
- The content grid has 12 columns up to a maximum width of 1440px. Reading
  columns are 640px or narrower.
- Section rhythm is `clamp(6rem, 12vw, 11rem)`, which leaves generous
  whitespace.
- Compositions are asymmetric: images offset against type, with
  deliberately empty columns. There are no three-equal-card rows, and no
  layout family repeats on the same page.
- The corner radius is **0 everywhere**, which keeps the look sharp and
  editorial. Structure comes from hairline rules and negative space, not
  cards or shadows.
- Each page has at most one colour-block section, the green inquiry
  invitation.

## 4. Image treatment

- **Authentic portfolio photographs are shown unfiltered**, for true colour
  and no stylisation. They sit on a `--paper-2` frame colour while loading,
  with dimensions reserved through `width` and `height` and `aspect-ratio`.
- The gallery varies proportions using each photograph's own ratio. Placement
  varies by position in the rhythm, and photographs are not cropped into a
  uniform grid.
- Captions sit *below* images in small Geist. No labels or pills are
  overlaid on photographs.
- **Generated imagery (Higgsfield) is decorative only**: macro petals,
  atelier textures and light. It never depicts a complete arrangement
  presented as client work. It is recorded in `src/data/assets.ts` and
  credited in the footer.
- Media are produced as responsive AVIF and WebP through `astro:assets`, and
  everything below the fold is lazy-loaded.

## 5. Interaction and motion

Motion is used only to communicate hierarchy, sequence, feedback or a change
of state.

- **Easing:** `--ease-out: cubic-bezier(.22,1,.36,1)`,
  `--ease-inout: cubic-bezier(.65,0,.35,1)`. There is no linear easing on
  interface motion.
- **Entrances:** content fades up 24px over 900ms, once per element, through
  IntersectionObserver. There are no scroll listeners.
- **The hero** plays a slow five-second loop, muted, with `playsinline` and
  a poster frame. It does not play under reduced motion, where the still
  image is shown instead.
- **Hover:** photographs ease toward a scale of 1.03 over 1.2s, and links
  draw an underline. Touch devices get the same affordances on focus and tap.
- **Gallery filters** use a FLIP transition in which items glide to new
  positions and new items fade in. The container height is locked during the
  swap to avoid jumps.
- **The viewer** crossfades between images. It supports arrow keys, Home and
  End, Escape and swipe, traps focus and returns focus to the originating
  thumbnail when closed.
- **Reduced motion:** all transitions collapse to instant, video is replaced
  by the still image, and reveals are disabled.
- There is no preloader, no custom cursor, no parallax, no marquee and no
  scroll-jacking.

## 6. Responsive behaviour

| Width     | Layout                                                                   |
| --------- | ------------------------------------------------------------------------ |
| < 640     | Single column. The gallery alternates full-width and inset images. The nav becomes a full-screen menu. |
| 640-1023  | Two-column gallery with an offset second column. Split sections stack.   |
| >= 1024   | Twelve-column asymmetric compositions and a six-step gallery rhythm.     |

- Heroes use `min-height: 100svh`, never `100vh`.
- Tap targets are 44px or larger. The viewer controls sit within thumb reach
  on mobile.
- No horizontal overflow is allowed at any width. This was verified at 360,
  768, 1024 and 1440 pixels.

## 7. Voice

The voice is plain, warm and precise. Copy uses only verified facts about the
studio (see `src/data/site.ts`), with no invented testimonials, awards,
prices, clients or venues. Interface language is functional: "View the
gallery", "Enquire", "Send enquiry".
