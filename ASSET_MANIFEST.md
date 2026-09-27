# Asset manifest

This manifest records every image and video in the preview.

- **Generated assets** are concept or decorative images only. They are never presented as client work, and each one is labelled "Concept image, generated for this design" where it appears.
- **Portfolio photographs** are the studio's own work, imported from the live gallery.

The machine-readable source is `src/data/generated-assets.json` for generated media and `src/data/gallery.json` for the portfolio.

## Generation run (27 September 2026)

| Item | Detail |
| --- | --- |
| Tool | Higgsfield MCP (authenticated, Max plan) |
| Budget approved | 75 credits |
| Credits used | 53 |

| ID | Model and settings | Credits |
| --- | --- | --- |
| H1 | GPT Image 2, 16:9, 2k, high | 6.5 |
| V1 | Kling 3.0 pro, 8 s, silent | 14 |
| H2 | GPT Image 2, 3:4, 2k, high | 6.5 |
| S1–S4 | GPT Image 2, 3:4, 2k, high | 4 × 6.5 |

The run followed the spec's test step: one still (H1) and one clip (V1) were generated and reviewed before the remaining variants.

Every output was reviewed against the spec's rejection criteria:

- warped stems
- impossible flower anatomy
- flicker
- artificial text
- changing bouquet identity
- misleading location cues

All seven outputs passed, so no retries were needed. For V1, the mean absolute difference between the first and last frame is 1.5/255, so the loop is seamless.

Flower varieties were chosen from those visible in the studio's own photographs: white and pink roses, lilies, hydrangea, snapdragons, calla lilies and bird of paradise. No studio photograph was used as a reference, so no generated image imitates a specific client piece.

## Generated assets in use

### H1: Home hero (desktop), video poster, social preview image

| Field | Value |
| --- | --- |
| File | `src/assets/generated/h1-desktop.jpg` |
| Tool | Higgsfield generate_image, model gpt_image_2 (2k, high) |
| Higgsfield job | `383b174a-adb7-437b-9cb5-3266fb0cba60` |
| Original output | 2688×1520, [source file](https://d8j0ntlcm91z4.cloudfront.net/user_3JA3HUMIaslskyPRgWby3H6Bqwz/hf_20260927_060114_383b174a-adb7-437b-9cb5-3266fb0cba60.png) |
| Alt text | A generous arrangement of white roses, lilies, green hydrangea and snapdragons on a limestone console in soft island light. |
| Prompt (summary) | Sculptural arrangement of white garden roses, white lilies, green hydrangea, white snapdragons and calla lilies in a low stone vessel on a honed limestone console; warm linen-toned plaster; late-afternoon Caribbean daylight through unseen louvred shutters; arrangement right of centre with quiet negative space on the left; photorealistic; no people, text, logo, surreal flowers, beach or sea. |
| Provenance | `concept` |

### H2: Home hero (mobile), recomposed for portrait rather than cropped

| Field | Value |
| --- | --- |
| File | `src/assets/generated/h2-mobile.jpg` |
| Tool | Higgsfield generate_image, model gpt_image_2 (2k, high) |
| Higgsfield job | `d8fd2c95-d44c-4ebe-9063-97ffc2eb0844` |
| Original output | 1744×2336, [source file](https://d8j0ntlcm91z4.cloudfront.net/user_3JA3HUMIaslskyPRgWby3H6Bqwz/hf_20260927_060845_d8fd2c95-d44c-4ebe-9063-97ffc2eb0844.png) |
| Alt text | A tall arrangement of white roses, lilies, hydrangea and snapdragons in a stone bowl on a limestone console. |
| Prompt (summary) | Portrait recomposition (not a crop) of H1: the same kind of arrangement fills the lower two-thirds, with calm plaster in the upper third; same light and palette. |
| Provenance | `concept` |

### V1: Home hero loop, desktop only; still image under reduced motion, small screens and Save-Data

| Field | Value |
| --- | --- |
| File | `public/media/v1-loop.mp4` and `public/media/v1-loop.webm` |
| Tool | Higgsfield generate_video, model kling3_0 (pro, 8 s, silent), start and end frame = H1 for a seamless loop |
| Higgsfield job | `6ab44b29-e8f7-4fe8-9d0a-b036a6597511` |
| Original output | 1600×904, [source file](https://d8j0ntlcm91z4.cloudfront.net/user_3JA3HUMIaslskyPRgWby3H6Bqwz/hf_20260927_060319_6ab44b29-e8f7-4fe8-9d0a-b036a6597511.mp4) |
| Alt text | Decorative (aria-hidden); the still image carries the alt text |
| Prompt (summary) | Silent website hero loop from H1 (start and end frame = H1): a very slow, restrained camera drift in and back; a faint tremor in snapdragon tips and greenery; same flowers, stems and vessel throughout; no cuts, zoom jumps, wind, new objects, people, text, logo or flicker. |
| Provenance | `concept` |

### S1: Our services: Arrangements (concept image)

| Field | Value |
| --- | --- |
| File | `src/assets/generated/s-arrangements.jpg` |
| Tool | Higgsfield generate_image, model gpt_image_2 (2k, high) |
| Higgsfield job | `5e8a94e1-698b-466b-b898-faf58e29ece4` |
| Original output | 1744×2336, [source file](https://d8j0ntlcm91z4.cloudfront.net/user_3JA3HUMIaslskyPRgWby3H6Bqwz/hf_20260927_060845_5e8a94e1-698b-466b-b898-faf58e29ece4.png) |
| Alt text | A concept image of pink and white roses, purple calla lilies and lilies in a clear glass vase on a limestone ledge. |
| Prompt (summary) | Hand-arranged bouquet of pink and white roses, purple calla lilies, white lilies and greenery in a clear glass vase on a limestone ledge, in the same light. |
| Provenance | `concept` |

### S2: Our services: Wedding decoration (concept image)

| Field | Value |
| --- | --- |
| File | `src/assets/generated/s-weddings.jpg` |
| Tool | Higgsfield generate_image, model gpt_image_2 (2k, high) |
| Higgsfield job | `4d7fc915-6de3-4e16-ad54-6e81e7c2abd0` |
| Original output | 1744×2336, [source file](https://d8j0ntlcm91z4.cloudfront.net/user_3JA3HUMIaslskyPRgWby3H6Bqwz/hf_20260927_060845_4d7fc915-6de3-4e16-ad54-6e81e7c2abd0.png) |
| Alt text | A concept image of a long linen-dressed wedding table with low white floral centrepieces, candles and glassware. |
| Prompt (summary) | Long linen-dressed reception table with a low, flowing centrepiece of white roses, green hydrangea, lilies and trailing greenery, and slim candles; shaded island interior with louvred shutters; no people or signage. |
| Provenance | `concept` |

### S3: Our services: Corporate flowers (concept image)

| Field | Value |
| --- | --- |
| File | `src/assets/generated/s-corporate.jpg` |
| Tool | Higgsfield generate_image, model gpt_image_2 (2k, high) |
| Higgsfield job | `4f4e53c1-724a-4708-bd37-d7257b91855e` |
| Original output | 1744×2336, [source file](https://d8j0ntlcm91z4.cloudfront.net/user_3JA3HUMIaslskyPRgWby3H6Bqwz/hf_20260927_060845_4f4e53c1-724a-4708-bd37-d7257b91855e.png) |
| Alt text | A concept image of a tall arrangement of calla lilies, bird of paradise, lilies and monstera leaves on a limestone reception console. |
| Prompt (summary) | Tall architectural arrangement of white calla lilies, bird of paradise, lilies and tropical leaves in a stone cylinder on a limestone reception console in a calm office lobby; no people, logos or screens. |
| Provenance | `concept` |

### S4: Our services: Luxury hotel flowers (concept image)

| Field | Value |
| --- | --- |
| File | `src/assets/generated/s-hotels.jpg` |
| Tool | Higgsfield generate_image, model gpt_image_2 (2k, high) |
| Higgsfield job | `45682474-58f4-4c63-9d66-329c4e1f6da0` |
| Original output | 1744×2336, [source file](https://d8j0ntlcm91z4.cloudfront.net/user_3JA3HUMIaslskyPRgWby3H6Bqwz/hf_20260927_060845_45682474-58f4-4c63-9d66-329c4e1f6da0.png) |
| Alt text | A concept image of a low arrangement of white roses, lilies and hydrangea on a limestone side table in a hotel suite. |
| Prompt (summary) | Low arrangement of white roses, lilies, green hydrangea and trailing greenery in a stone bowl on a limestone side table in a serene hotel suite; no people and no sea view. |
| Provenance | `concept` |

## Web versions

- **Stills:** re-encoded as JPEG q86 masters (`src/assets/generated/*.jpg`). The build serves them as responsive AVIF and WebP from 360 to 2200 px wide.
- **V1:** 1600 px wide at 24 fps, with no audio. It is 353 KB as H.264 MP4 and 242 KB as VP9 WebM.
- **V1 playback:** desktop only, and never under reduced motion or Save-Data. The H1 still is its fallback.
- **Original outputs:** `npm run fetch:media` downloads them into `generated-originals/`, which is git-ignored.

## Earlier exploration (not on the live pages)

| Key | Status |
| --- | --- |
| `hero-petals` | earlier exploration; used only on the /directions/ comparison pages |
| `atelier-table` | earlier exploration; not used |
| `orchid-wall` | earlier exploration; not used |
| `hero-loop` | earlier exploration; used only on the /directions/ comparison pages |

## Portfolio photographs (`real_portfolio`)

- **Source:** https://theflowerstudiotci.com/gallery/, imported on 27 September 2026 with `npm run import:gallery`.
- **Rights:** the photographs appear on the studio's own site. Confirm reuse rights with the owner before launch.
- **Descriptions:** the source has no alt text, so alt text, captions and colour categories were written from visual inspection.
- **Sizes:** the 512 px squares are the largest versions the studio published. They are never shown larger than 512 CSS px.

| ID | Size | Colour | Alt text |
| --- | --- | --- | --- |
| img011 | 1080×1920 | Tropical | Bird of paradise, orange and yellow roses and pink asters in a tall tropical arrangement. |
| img008 | 512×512 | White | White roses and lilies with dark green foliage against a turquoise backdrop. |
| img002 | 1080×1920 | Pink and purple | A glass vase of purple calla lilies, pink roses and waxflower on a wooden table. |
| img015 | 512×512 | Red | A dense arrangement of red roses and yellow solidago against a turquoise backdrop. |
| img006 | 512×512 | Tropical | A tropical arrangement of bird of paradise, yellow roses, pink gerberas and green hydrangea. |
| img010 | 512×512 | Pink and purple | Pink roses, white lilies, purple statice and snapdragons in a full mixed arrangement. |
| img012 | 1080×1920 | White | White roses, chrysanthemums and hydrangea with lilies in a tall arrangement. |
| img003 | 512×512 | Red | Red roses with sprigs of yellow solidago and glossy green leaves, seen up close. |
| img016 | 1080×1920 | White | White lilies, roses and snapdragons with trailing greenery, tall and airy. |
| img013 | 512×512 | Pink and purple | A close view of pink roses, white lilies, yellow solidago and purple statice. |
| img007 | 512×512 | Pink and purple | Purple calla lilies, pink roses and waxflower against a turquoise backdrop. |
| img001 | 512×512 | White | A low white trough arrangement of white roses, lilies and deep green foliage. |
| img014 | 512×512 | Tropical | Bird of paradise, yellow roses, lilies and pink gerberas against a turquoise backdrop. |
| img004 | 512×512 | Pink and purple | A bright mixed arrangement of pink roses, yellow lilies and snapdragons. |
| img009 | 1080×1920 | Red | Deep red roses with yellow solidago, photographed against pale blue. |
| img005 | 1080×1920 | White | A tall white arrangement of chrysanthemums, hydrangea and lilies. |

## Brand assets

| File | Source | Use |
| --- | --- | --- |
| `src/assets/brand/tfstci_logo-1.png` (400×60) | Live site header logo | Site header and footer (light theme) |
| `src/assets/brand/tfstci_logo_ft.png` (250×38) | Live site footer logo | Dark theme |
| `public/favicon.png`, `public/apple-touch-icon.png` | Cropped from the lotus mark in the logo | Browser icons |

A vector version of the logo would sharpen it on high-density screens. Ask the owner for one.

## Not used

- **Theme demo images:** the live site's 2020 uploads (`h-img-*`, `p-img-*`, `fullscreen-menu-img`) predate the studio and appear to be theme demo content.
- **Unverified images:** `tfstci_slider002–005` and `004.jpg` look like stock photography.

None of these are used unless the owner confirms their rights.
