# Generated media assets

All files below live in `public/media/`. They were generated with Higgsfield on **6 October 2026**, with the owner's approval (see "Owner amendment" at the end of `SPEC.md`), then converted to WebP locally. None of them depicts money, prizes, casino imagery or a real lottery or brand.

| File | Used on | Model | Settings | Job ID | Credits |
| --- | --- | --- | --- | --- | --- |
| `hero.webp` | Home page hero (`/`) | GPT Image 2.5 (`gpt_image_2_5`) | 4:3, medium, 1k; option 4 of 4 chosen by owner | `5b9dbbb0-589d-428a-9df4-00f2fa248bd9` | 0.5 (2.0 for all 4 options) |
| `how-it-works-poster.webp` | Poster frame for the video | Frame at 5.6 s of `how-it-works.mp4` (both digit rows visible), resized to 960×720 | — | — | 0 |
| `how-it-works.mp4` | Home page "How it works" | Seedance 2.5 (`seedance_2_5`), image-to-video from `hero.webp` | 4:3 (1112×834), 8 s, 720p, no audio; re-muxed with `+faststart` | `789ee867-41a1-4631-9722-329513734a56` | 56 |
| `how-it-works.webm` | Same video, VP9 fallback for browsers without H.264 | Encoded locally from `how-it-works.mp4` with ffmpeg (libvpx-vp9, CRF 36, no audio) | — | — | 0 |
| `empty-entries.webp` | Player "No entries yet" | GPT Image 2.5 | 1:1, medium, 1k → 320 px | `828515a9-4a54-44ab-9588-07053dab01ff` | 0.5 |
| `empty-results.webp` | Player "No results yet" / "No published results yet" | GPT Image 2.5 | 1:1, medium, 1k → 320 px | `c37d4749-1a38-4112-a533-febc7f2c4e15` | 0.5 |

**Total spent:** about 59 credits.

## Prompts

**Hero (4 variants, same prompt):**
> Calm, modern editorial illustration for a simple number-picking web app demo. Three softly rounded square tiles, each showing one large clean sans-serif digit: 0, 4 and 7, arranged in a gentle staggered row and floating slightly above a pale warm-grey background (#f6f6f4). Matte off-white tiles with dark charcoal digits, one thin deep-teal (#0b6b66) accent line and soft natural shadows. Minimal flat-meets-soft-3D style, generous empty space, quiet and trustworthy mood. Absolutely no money, no coins, no banknotes, no casino or slot-machine imagery, no sparkles, no confetti, no neon, no logos, and no text other than the three digits 0, 4, 7.

**Empty state — no entries:**
> Small minimal empty-state illustration for a web app: three empty rounded square tiles with dashed outlines in a row, the middle one with a small deep-teal (#0b6b66) plus sign, on a pale warm-grey background (#f6f6f4). Flat, simple, calm, soft shadows, lots of space. No text, no numbers, no money, no casino imagery, no logos.

**Empty state — no results:**
> Small minimal empty-state illustration for a web app meaning 'result not published yet': a row of six blank rounded square tiles with a small simple clock icon above them in deep teal (#0b6b66), on a pale warm-grey background (#f6f6f4). Flat, simple, calm, soft shadows, lots of space. No text, no numbers, no money, no casino imagery, no logos.

**Video (start frame = hero; the suggested "IN THE DARK" preset was declined by the owner):**
> Calm, minimal motion graphic continuing from the start image. Static camera. The three off-white tiles with the digits 0, 4 and 7 gently float and settle into a straight row near the top. Then a second row of six smaller matching off-white tiles slides in smoothly from below, showing the digits 0 4 7 1 2 3. One by one, the tiles 0, 4 and 7 in the lower row softly light up with a deep teal (#0b6b66) edge, matching the three tiles above. Soft shadows, pale warm-grey background, slow and gentle easing, quiet trustworthy mood. Keep every digit sharp and legible. No money, no coins, no casino or slot-machine effects, no sparkles, no confetti, no flashing, no extra text, no logos, no people.

## Accessibility

- The hero image has descriptive alt text.
- Empty-state art is decorative (`alt=""`); the text beside it carries the meaning.
- The video is silent and starts only when the viewer presses play. It never autoplays or loops, and it has a text description right below it.
