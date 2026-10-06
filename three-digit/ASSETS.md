# Generated media assets

All files below live in `public/media/`. They were generated with Higgsfield on **6 October 2026**, with the owner's approval (see "Owner amendment" at the end of `SPEC.md`), then converted to WebP locally. None of them depicts money, prizes, casino imagery or a real lottery or brand.

| File | Used on | Model | Settings | Job ID | Credits |
| --- | --- | --- | --- | --- | --- |
| `hero.webp` | Home page hero (`/`) | GPT Image 2.5 (`gpt_image_2_5`), edit of the owner-chosen option 4 | 4:3, medium, 1k; digit 0 changed to 8 at the owner's request (tiles read 8-4-7) | `fd114fff-91c6-4348-b374-63619348f277` (from `5b9dbbb0-589d-428a-9df4-00f2fa248bd9`) | 0.5 (+2.0 for the original 4 options) |
| `how-it-works-poster.webp` | Poster frame for the video | Frame at 5.6 s of `how-it-works.mp4` (both digit rows visible), resized to 960×720 | — | — | 0 |
| `how-it-works.mp4` | Home page "How it works" | Seedance 2.5 (`seedance_2_5`), image-to-video from the 8-4-7 `hero.webp` | 4:3 (1112×834), 720p, no audio. **Trimmed at 6.30 s, then the last frame (7 lit) is held for 1.75 s** (about 8.1 s in total), re-encoded H.264 High with `+faststart`. See the note below. | `b886f353-2d1d-4b5c-a166-74a77dc6496e` | 56 |
| `how-it-works.webm` | Same video, VP9 fallback for browsers without H.264 | Encoded locally from `how-it-works.mp4` with ffmpeg (libvpx-vp9, CRF 36, no audio) | — | — | 0 |
| `empty-entries.webp` | Player "No entries yet" | GPT Image 2.5 | 1:1, medium, 1k → 320 px | `828515a9-4a54-44ab-9588-07053dab01ff` | 0.5 |
| `empty-results.webp` | Player "No results yet" / "No published results yet" | GPT Image 2.5 | 1:1, medium, 1k → 320 px | `c37d4749-1a38-4112-a533-febc7f2c4e15` | 0.5 |

**Total spent:** about 115.5 credits. That covers the first set (59) plus the 8-4-7 replacement (56.5). The first hero and video used the digit 0 (0-4-7, video job `789ee867-41a1-4631-9722-329513734a56`). At the owner's request the 0 was replaced with 8, and those first versions are no longer in the repository.

## Prompts

**Hero, original (4 variants, same prompt; option 4 chosen, later edited 0 → 8):**
> Calm, modern editorial illustration for a simple number-picking web app demo. Three softly rounded square tiles, each showing one large clean sans-serif digit: 0, 4 and 7, arranged in a gentle staggered row and floating slightly above a pale warm-grey background (#f6f6f4). Matte off-white tiles with dark charcoal digits, one thin deep-teal (#0b6b66) accent line and soft natural shadows. Minimal flat-meets-soft-3D style, generous empty space, quiet and trustworthy mood. Absolutely no money, no coins, no banknotes, no casino or slot-machine imagery, no sparkles, no confetti, no neon, no logos, and no text other than the three digits 0, 4, 7.

**Empty state — no entries:**
> Small minimal empty-state illustration for a web app: three empty rounded square tiles with dashed outlines in a row, the middle one with a small deep-teal (#0b6b66) plus sign, on a pale warm-grey background (#f6f6f4). Flat, simple, calm, soft shadows, lots of space. No text, no numbers, no money, no casino imagery, no logos.

**Empty state — no results:**
> Small minimal empty-state illustration for a web app meaning 'result not published yet': a row of six blank rounded square tiles with a small simple clock icon above them in deep teal (#0b6b66), on a pale warm-grey background (#f6f6f4). Flat, simple, calm, soft shadows, lots of space. No text, no numbers, no money, no casino imagery, no logos.

**Hero edit (0 → 8), reference = original option 4:**
> Edit the reference image: change only the digit on the left tile from 0 to 8, so the three tiles read 8, 4, 7. Keep everything else exactly the same: same tile shapes, positions, angles, matte off-white tiles, dark charcoal clean sans-serif digits in the same font and size, deep-teal (#0b6b66) bottom edges, soft shadows, pale warm-grey background, same framing and lighting. No other text, no money, no casino imagery.

**Video (start frame = 8-4-7 hero; the suggested "IN THE DARK" preset was declined by the owner):**
> Calm, minimal motion graphic continuing from the start image. Static camera. The three off-white tiles with the digits 8, 4 and 7 gently float and settle into a straight row near the top. Then a second row of six smaller matching off-white tiles slides in smoothly from below, showing the digits 8 4 7 1 2 3. One by one, the tiles 8, 4 and 7 in the lower row softly light up with a deep teal (#0b6b66) edge, matching the three tiles above. Soft shadows, pale warm-grey background, slow and gentle easing, quiet trustworthy mood. Keep every digit sharp and legible; there is no digit 0 anywhere. No money, no coins, no casino or slot-machine effects, no sparkles, no confetti, no flashing, no extra text, no logos, no people.

## Note on the explainer video edit

The generated 8-second clip highlighted 8, 4 and 7 correctly until about 6.3 s. After that it went on to light up **1** and **2**, which are not matches, and it changed the last result tile from 3 to 7. Shipping that would misstate the matching rule. The clip was therefore cut at 6.30 s, after the 7 is lit and before the 1 starts to glow, and the final correct frame is held so the video still runs about 8 seconds. No extra credits were spent on this fix.

## Accessibility

- The hero image has descriptive alt text.
- Empty-state art is decorative (`alt=""`); the text beside it carries the meaning.
- The video is silent and starts only when the viewer presses play. It never autoplays or loops, and it has a text description right below it.
