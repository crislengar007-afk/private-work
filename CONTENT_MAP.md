# Content map

This file inventories the live site as observed on 27 September 2026 and
maps each piece of content to its place in the preview.

- **Captured from:** https://theflowerstudiotci.com at 1440px and 375px wide.
- **Snapshots:** `reference/*.txt` (text) and the QA report (screenshots).

## Platform observed

| Item | Observation |
| --- | --- |
| CMS | WordPress 6.3.12 with Elementor 3.16.6 and a Qode "Qi" theme |
| Forms | Contact Form 7 (form 305), posting to `/contact/`. Fields: name, email, message |
| Analytics | None found in the page source (no gtag, GTM or Meta pixel) |
| Meta descriptions | None set on any page |
| Titles | "The Flower Studio TCI"; "Our services – …"; "Gallery – …"; "Contact – …" |
| Webmail | Footer link to Hostinger Titan webmail, which is internal and not carried over |
| Privacy Policy and Terms of Use | Text only, with no link destination. Omitted until real pages exist |
| Map | Google Maps embed, plus a short link at https://goo.gl/maps/64xcxPowM6JqJkMa7 |
| Social | https://www.instagram.com/theflowerstudiotci/ and https://web.facebook.com/theflowerstudiotci |

## Routes

| Live URL | Preview URL | Notes |
| --- | --- | --- |
| `/` | `/` | Same |
| `/our-services/` | `/our-services/` | Kept. `/services/` redirects to it |
| `/gallery/` | `/gallery/` | Same |
| `/contact/` | `/contact/` | Same |

No redirects are needed for live URLs.

## Text

| Source | Live copy | Where it goes |
| --- | --- | --- |
| Home hero | "Bringing Flower Elegance to Your Island Experience" | Home hero headline (kept) |
| Home, About Us | Opened March 2023 at Ports of Call; fresh, exquisite blooms; community and visitors | Home studio story |
| Home, Services | "…luxurious experience, tailored … for events and personal celebrations" | Home services intro |
| Home, Our Story | Founder with a luxury-services background; island insight; personalisation | Home studio story (condensed, not reworded in meaning) |
| Footer mission | "Our mission is to create a deep connection … personalization …" | Home story pull-quote and the Services intro |
| Services, Arrangements | "Celebrate with Every Moment …" | Our services: Arrangements |
| Services, Wedding decoration | "Forever Blooms for Your Special Day …" | Our services: Weddings |
| Services, Corporate | "Elevate your corporate meetings …" | Our services: Corporate |
| Services, House Guest | "Extend a warm and blossoming welcome …" | Our services: House guests |
| Services, Luxury Hotel | "Tailored elegance for every corner …" | Our services: Luxury hotels |
| Contact | "For any inquiries or floral needs, feel free to get in touch with our skilled Floral Artisan" | Contact introduction |

Service descriptions are shortened for scanning. No packages, prices,
delivery zones or turnaround times are added.

## Contact facts (shown on the live site; confirm with the owner before launch)

| Detail | Value |
| --- | --- |
| Address | Ports of Call, Leeward (through Grace Bay), Turks and Caicos Islands, TKCA 1ZZ |
| Mobile | +1 649 241 4343 |
| Landline | +1 649 946 4043 |
| Email | orders@theflowerstudiotci.com |
| Hours | Monday to Saturday 7:00 AM to 7:00 PM; Sunday 8:00 AM to 3:00 PM |

## Images

| Live file | Provenance judgement | Use in preview |
| --- | --- | --- |
| `2023/10/img001–img016.jpg` (the Gallery page) | Studio's own work, taken in two consistent shoots (grey curtain, and turquoise backdrop) | Gallery portfolio (`real_portfolio`) |
| `2023/10/tfstci_slider001.jpg` | Studio's own; the same arrangement and backdrop as `img002` and `img007` | Not duplicated, because the gallery already has it |
| `2023/10/tfstci_slider002–005.jpg`, `2023/10/004.jpg` | Unverified. The tulip field, butterfly basket and blue hydrangea look like stock | Not used until the owner confirms rights |
| `2020/11/h-img-*.jpg`, `p-img-*.jpg`, `fullscreen-menu-img.jpg` | Uploaded in 2020, before the studio opened, with one-letter alt text; most likely theme demo content | Not used |
| `2023/10/tfstci_logo-1.png`, `tfstci_logo_ft.png` | Studio logo (lotus mark and wordmark) | Header and footer |

## Gallery categories

The live gallery has no categories, and none of the 16 photographs shows a
wedding, corporate or hotel setting. They are all arrangements. Service
categories would therefore be untruthful, so the preview filters by colour
palette instead, which anyone can check by looking at the photos:

- Whites and greens
- Reds
- Tropical
- Pinks and purples

Counts are computed from the data file.
