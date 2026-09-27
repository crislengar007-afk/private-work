# The Flower Studio TCI — Website Upgrade Specification

**Status:** Implementation brief for Claude Code  
**Version:** 1.0 — 27 September 2026  
**Target:** <https://theflowerstudiotci.com/>  
**Primary focus:** An exquisite, interactive gallery supported by a cohesive site redesign and Higgsfield-produced campaign visuals.

## 1. Outcome

Create a working, responsive preview of an upgraded The Flower Studio TCI website. The experience should communicate a premium floral studio in Turks and Caicos and make it easy to explore real work and inquire about arrangements or events. Claude Code owns research, design, implementation, integration, and verification. Higgsfield supplies selected still and motion assets. The deliverable is a functioning preview with actual assets, not a mood board, prompt collection, or audit alone.

The live domain is an existing business site. Build in an isolated project or branch until the owner reviews the result. Do not replace the production site or change its domain during this brief.

## 2. Source of truth and discovery

Public pages observed for this brief:

| Page | URL | Publicly visible content to preserve or verify |
| --- | --- | --- |
| Home | <https://theflowerstudiotci.com/> | Island floral positioning; arrangements and decoration; About Us, Services, Our Story; contact and hours. |
| Our services | <https://theflowerstudiotci.com/our-services/> | Arrangements; wedding decoration; corporate, house guest, and luxury hotel flower arrangements. |
| Gallery | <https://theflowerstudiotci.com/gallery/> | Image-led collection; actual image subjects and rights require visual inspection. |
| Contact | <https://theflowerstudiotci.com/contact/> | Contact form, location, phone, email, and opening hours. Form behavior requires testing. |

The site displays **orders@theflowerstudiotci.com**, **+1 649 241 4343**, land line **+1 649 946 4043**, and a Ports of Call / Grace Bay, Turks and Caicos location. It displays Monday–Saturday 7:00 AM–7:00 PM and Sunday 8:00 AM–3:00 PM. Verify every detail with the owner or current production source before publication. Do not infer pricing, delivery zones, fulfillment time, availability, testimonials, or image rights from the public pages.

Before coding, inspect every public page at desktop and mobile widths. Inventory existing brand assets, image dimensions, navigation behavior, gallery content, form fields and submission behavior, footer links, SEO metadata, hosting platform, CMS, repository, and any analytics. Record what is observed versus what still needs confirmation. Reuse approved text and genuine portfolio photography whenever possible.

## 3. Audience and key journeys

| Audience | Goal | Desired path |
| --- | --- | --- |
| Local resident or visitor | Order a personal arrangement | Home or Gallery → Arrangements → inquiry or direct contact. |
| Couple or planner | Explore wedding styling | Home or Gallery → Weddings → event quote form. |
| Corporate or hospitality client | Discuss ongoing or event flowers | Services → Corporate / Hotels → tailored inquiry. |
| Returning visitor | Find address, phone, hours | Persistent navigation or footer → Contact. |

Primary conversion: a successfully delivered inquiry. Secondary conversions: tap to call, tap to email, and map directions. Avoid checkout, booking guarantees, or inventory claims without a verified operational process.

## 4. Creative direction

**Positioning:** Modern island elegance, floral artistry, personal service. The design should feel like a considered luxury editorial experience, while remaining readable and useful.

- Art direction: sculptural bouquets, authentic floral texture, warm natural light, limestone or linen-like neutrals, foliage tones, restrained accents drawn from the existing logo and approved photography. Avoid generic beach clichés, excessive gold, and visual effects that obscure the flowers.
- Typography: an expressive but legible display face for short headings paired with an accessible sans serif for navigation and body copy. License and self-host fonts where appropriate; define fallbacks.
- Layout: generous spacing, deliberate asymmetry, strong cropping, quiet backgrounds, and a consistent grid. Preserve contrast for text and controls.
- Motion: slow editorial transitions, subtle reveal and hover states, one cinematic hero moment. No scroll hijacking, perpetual autoplay across many sections, or animations that delay navigation.
- Copy: concise, specific, and grounded in the business's verified services. Keep the business name and contact information accurate.

Produce **three visually distinct homepage concepts** first: (A) Botanical Editorial, (B) Island Atelier, and (C) Minimal Floral Gallery. Show desktop and mobile compositions, palette, type pairing, hero treatment, and a brief rationale. Select the strongest direction for the working preview, while making the other two available for comparison. The selected direction must carry through the whole site.

## 5. Information architecture and page requirements

### Global shell

- Clear navigation: Home, Services, Gallery, Contact; visible inquiry call to action.
- Mobile menu with focus management, visible close control, keyboard access, and no trapped background scroll.
- Footer with verified address, phones, email, hours, social links where confirmed, privacy/terms links only where real destinations exist, and copyright with a maintained year.
- Consistent headings, breadcrumbs only if useful, and a compact contact action on mobile without covering page content.

### Home

1. Hero with strong floral visual, clear headline, concise value proposition, **Explore the Gallery** and **Request Flowers** actions. Text is live HTML, not embedded in an image or video.
2. Service entry points for Arrangements, Weddings, Corporate, House Guest, and Luxury Hotel Flowers. Each has a real destination or correctly preselected inquiry path.
3. Curated portfolio preview using genuine work, linking to the Gallery.
4. Short studio story based on the current site's verified information.
5. Invitation to inquire, with phone and email alternatives.

### Services

- Distinct sections for the five existing service groups. Explain what each service is and who it serves without inventing package details.
- Use approved real images or clearly identified conceptual campaign images. Each section leads to a service-specific inquiry.
- Provide optional questions for wedding and hospitality inquiries only when relevant.

### Gallery — signature experience

- Image-first editorial grid with varied but controlled aspect ratios; avoid chaotic masonry shifts while images load. Establish width/height or aspect ratio in advance.
- Category filters such as **All, Arrangements, Weddings, Corporate, Hospitality** only when existing photos can be tagged truthfully. House Guest and Hotel may be separate when enough genuine work is available. Show counts only when computed from actual records.
- Filter interactions update the visible collection without a full reload. Selection is visually clear, keyboard accessible, and represented in a shareable URL query or route where practical. Browser back/forward should behave sensibly.
- Lightbox opens the selected image with an accessible close control, next/previous buttons, keyboard arrows, Escape, image count, descriptive alt text or caption, and focus returned to the initiating item. Support swipe on touch devices if it does not conflict with page scroll.
- Progressive loading with responsive image sources, lazy loading below the fold, and a stable placeholder. Prioritize the first visible images. Do not download full-resolution assets for thumbnails.
- Preserve image quality: no visible stretching, cropped faces or bouquets without art direction, or low-resolution enlargement. Allow appropriate object position per image.
- Optional subtle parallax or crossfade may be used only after the core gallery is fast and usable; disable nonessential motion under `prefers-reduced-motion`.
- End with a relevant **Create Something Beautiful Together** inquiry action.
- **Portfolio integrity:** AI-generated imagery is never presented as a photograph of an actual client project. Keep genuine work in the portfolio dataset; place AI visuals in campaign/editorial sections with suitable labeling when needed.

### Contact and inquiry

- Display verified contact details and map link.
- Form fields: name, email, optional phone, service type, optional event date, short description; optional venue and approximate budget only when relevant to an event inquiry and approved by the business. Make required fields explicit.
- Client and server validation, spam protection, accessible errors, success and failure states, and an actual delivery destination. Never display success when the message was not sent.
- Phone and email links work on mobile and desktop. Do not publish private credentials in client code.

## 6. Higgsfield production brief

Higgsfield is an asset-production tool in this workflow. Claude Code should use an available official Higgsfield connection (MCP in Claude or CLI/skills in Claude Code) when authenticated. Confirm the actual connected tools and credit cost before a large batch. If no connection is available, produce precise shot prompts and asset slots, then continue the site preview with approved existing images; do not claim media was generated.

### Initial asset set

| ID | Asset | Creative specification | Intended use |
| --- | --- | --- | --- |
| H1 | Desktop hero still | High-end floral still life or approved real bouquet reference; warm island daylight; editorial negative space for HTML headline; landscape composition. | Home hero and video poster. |
| H2 | Mobile hero still | Recompose H1 for portrait rather than merely cropping; keep the subject and text-safe area. | Mobile home hero. |
| V1 | Cinematic hero loop | About 6–10 seconds, silent, restrained dolly-in or arc, natural petal/foliage motion, no cuts, no logos or text, stable first/last frame where feasible. | Desktop hero enhancement. |
| S1–S4 | Service campaign stills | Coordinated visual family for arrangements, wedding styling, corporate flowers, and hospitality; preserve product realism and consistent color. | Home and service sections; conceptual, not portfolio proof. |

Use approved business photographs as references when rights and access are confirmed. Test one still and one short clip before producing all variants. Reject warped stems, impossible flower anatomy, flicker, artificial text, changing bouquet identity, or misleading location cues. Keep prompts, model/settings, reference files, outputs, and usage notes in an asset manifest. Compress final files and provide appropriate still-image fallback. Use original portfolio photos for real-work gallery entries.

**Hero direction prompt for Higgsfield:**

> A cinematic luxury floral editorial for The Flower Studio TCI. A sophisticated arrangement of fresh flowers with natural stem structure and delicate textures, styled in a refined island interior with soft limestone and warm linen tones. Late-afternoon Caribbean daylight grazes the petals. Premium botanical photography, authentic materials, restrained palette, elegant negative space on the left for a website headline. Slow, smooth dolly-in with subtle natural foliage movement. Photorealistic, no people, no text, no logo, no dramatic wind, no surreal flowers, no rapid cuts. Compose for a seamless, silent website hero loop.

Choose the actual flowers and palette from approved studio references rather than assuming the business sells specific varieties. Generate desktop and mobile still compositions separately. Export a web-optimized video format supported by target browsers, plus a poster image.

## 7. Implementation approach

1. Inspect the existing stack and determine whether this is a theme/CMS update, a repository refactor, or an independent preview. Do not assume the public HTML reveals editing access.
2. Capture a content inventory and create a source-to-new-page mapping. Preserve all essential pages, contacts, and working URLs. Plan redirects if routes change.
3. Build a small design system: color tokens, typography scale, spacing, container widths, media breakpoints, buttons, cards, focus rings, and motion durations.
4. Implement reusable page sections and a typed or well-structured gallery content model: `id`, `src`, `srcSet` or variants, `width`, `height`, `alt`, `category`, optional `caption`, `credit`, `provenance` (`real_portfolio` or `concept`), and publish status.
5. Integrate selected Higgsfield assets into editorial sections after review. Keep generation separate from runtime page rendering; the website must not call Higgsfield on each visitor request.
6. Connect inquiries to the verified backend or email service. If unavailable, build the form UI and mark submission as unconfigured in the preview; do not fake an operational flow.
7. Run the site locally and provide an accessible preview link or reproducible local run instructions, with screenshots at desktop and mobile sizes.

Use the existing site's platform if maintainable and compatible with the requirements. If a replacement implementation is justified, explain the migration path, content ownership, editing workflow, hosting, forms, analytics, and redirects before production release. Do not add a CMS, payment provider, account system, or ecommerce checkout without a real operational need.

### Claude Code working instructions

- Follow the repository's actual `AGENTS.md`, `CLAUDE.md`, existing conventions, and package manager if present.
- If an approved design-quality skill such as Taste or Impeccable is available in the environment, use it for a visual review pass; verify its source and instructions before installation. These are optional quality aids, not prerequisites or substitutes for implementing and testing the site.
- Prefer official Higgsfield integration instructions; do not paste account credentials into prompts, files, or browser code.
- Keep generated asset provenance and any licensing/usage decisions in the project documentation.
- Deliver running code and inspect rendered output; do not stop after writing `SPEC.md` or component stubs.

## 8. Quality, accessibility, and performance

- Responsive at small phones, tablets, laptops, and wide desktops; no horizontal overflow or clipped navigation.
- Semantic landmarks, one meaningful page H1, descriptive link text, image alt text, visible focus, usable keyboard navigation, labeled form controls, and sufficient color contrast.
- Respect `prefers-reduced-motion`; pause or remove autoplay motion where appropriate. The hero message and calls to action remain visible when media fails.
- Serve optimized responsive images; lazy-load below-the-fold gallery content; defer noncritical scripts; prevent layout shifts by reserving media dimensions.
- Set explicit performance targets for representative mobile and desktop runs after baseline measurement. Aim for Core Web Vitals in the “good” range, especially LCP ≤ 2.5 s, CLS ≤ 0.1, and INP ≤ 200 ms under the measurement conditions recorded in the report. If the video prevents the target, use a still poster or delayed playback.
- Unique page titles and descriptions, canonical URLs, descriptive headings, crawlable service copy, and local-business structured data only with verified facts. Generate a sitemap and maintain redirects if paths change.
- Make contact handling secure and private; collect only needed fields and publish a real privacy notice before collecting data.

## 9. Verification and acceptance criteria

The project is ready for owner review when all of the following are true:

1. Three visual directions are shown, and one is implemented as a working preview with cohesive desktop and mobile pages.
2. Home, Services, Gallery, and Contact are complete and navigable; existing business information is preserved or explicitly flagged for verification.
3. The Gallery contains genuine work with accurate categories; filters, lightbox, keyboard controls, Escape, focus return, and browser navigation work. Empty categories are omitted.
4. At least one real Higgsfield-produced still and one short clip are visible in the preview if the integration is connected and the owner has accepted the generation cost. Their source and role are documented; AI concepts are distinguishable from real portfolio work.
5. All buttons go to a real destination. Inquiry submission is tested end to end where backend access exists; otherwise the preview clearly identifies the unconfigured integration.
6. The site has been reviewed at 375 px, 768 px, 1440 px, and one wider desktop viewport, plus keyboard-only navigation and reduced-motion mode.
7. Broken images, console errors, layout shifts, and inaccessible controls found during review are fixed. Record measured performance and remaining constraints.
8. Provide a preview URL or local run command, before/after screenshots, asset manifest, concise change log, and steps required to move the approved result to the existing domain.

## 10. Decisions that need owner input before production

These do not block the isolated preview, but must be resolved before the live migration:

- Access to the current website source, hosting/CMS, and domain administration.
- Which existing photographs may be reused and which represent real completed work.
- Approved brand logo, palette, fonts, and any official voice or style guide.
- Correct address, hours, phone numbers, social links, and inquiry destination.
- Whether the business offers online ordering, delivery, fixed packages, or payments. Do not build these based on assumptions.
- Higgsfield generation budget and final choice of creative direction.

## 11. Delivery package

- Working preview and source changes in an isolated branch/project.
- `SPEC.md` (this file) updated for any approved scope changes.
- `ASSET_MANIFEST.md` with source, provenance, alt text, output sizes, and placement.
- `CONTENT_MAP.md` listing source page content, new location, and any verified edits.
- Brief QA report with viewport screenshots, functional checks, performance measurements, and known issues.

**Definition of done:** The owner can open a functioning, visually distinctive preview, browse the real portfolio smoothly, understand all services, and complete or clearly preview the inquiry path. The production website remains untouched until the new experience and operational connections have been reviewed.

---

## Appendix: scope notes from the preview build (27 September 2026)

These notes record how the preview interprets the spec. None of them changes the brief itself.

- **Selected direction:** B, Island Atelier. A and C remain at `/directions/`.
- **Gallery categories.** None of the 16 genuine photographs shows a wedding, corporate or hotel setting; all are arrangements. Service-based filters would therefore be untruthful, per §5, and the gallery filters by colour instead: White, Red, Tropical, and Pink and purple. Counts are computed from the records. Service categories can be added when genuine photographs of that work are tagged.
- **Inquiry fields.** Approximate budget is omitted until the business approves it. The optional venue field appears only for event services (Weddings, Corporate, Hotels).
- **Inquiry delivery.** The live Contact Form 7 endpoint is not called from the preview. Doing so would send real email from an unreviewed site and needs WordPress nonces. The preview supports any JSON form endpoint through `PUBLIC_FORM_ENDPOINT`. Until one is configured, the form composes an email to orders@theflowerstudiotci.com and says plainly that nothing has been sent.
- **Spam protection.** The client side has a honeypot field and a minimum fill time. Server-side validation and spam filtering belong to whichever endpoint is chosen.
- **Privacy.** The live site's "Privacy Policy" and "Terms of Use" are text without link destinations, so they are omitted. A real privacy notice is required before the form collects data through a backend.
- **Images from the live site.** The 2020 uploads, which appear to be theme demo content, and the stock-looking slider images are not used. See CONTENT_MAP.md.
- **Motion round (owner request).** The owner asked for moving flowers, full-screen video, interactive pages and a page per service category, and chose service categories.
  - **New pages:** each service now has its own page (`/our-services/<id>/`) with a full-screen concept film, the studio's wording, the questions the form will ask, real portfolio photographs and the other services.
  - **Home:** opens on a full-screen film, with a separately composed tall film for phones.
  - **Portfolio honesty:** event pages say plainly that the published portfolio shows arrangements, not event work.
  - **Real photographs with motion:** with the owner's approval, three real photographs have gentle motion added. Each is labelled "Motion added digitally", with a switch in the viewer to show the still.
  - **Credits:** 126.75 of the 130 approved. Details are in ASSET_MANIFEST.md.
