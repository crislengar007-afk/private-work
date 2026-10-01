/**
 * Scene data for the scroll-scrub journey. Single-shot: one continuous ~15 s
 * film (blush chiffon, blooming florals, a vintage camera's shutter closing,
 * bokeh settling onto cream paper). Atmosphere only: no people, no venue,
 * nothing that reads as an event FMV did.
 */
import type { ScrollScrubScene, ScrollScrubTheme } from "@/components/scroll-scrub/scroll-scrub";

export const scrollScrubTheme: ScrollScrubTheme = {
  accent: "#b4935a",
  background: "#faf4ef",
  ink: "#2b2627",
  muted: "#5a5054",
};

export const scrollScrubScenes: ScrollScrubScene[] = [
  {
    body: "Photography, wedding coordination, décor and photo booths from Marie and the FMV team, in Fredericton and across New Brunswick.",
    clip: "/assets/world/scene-01.mp4",
    id: "start",
    kicker: "FMV Events & Photography",
    label: "Begin",
    mobileClip: "/assets/world/scene-01-mobile.mp4",
    mobilePoster: "/assets/world/scene-01-mobile-poster.webp",
    poster: "/assets/world/scene-01-poster.webp",
    scroll: 3.2,
    linger: 0.4,
    tags: ["Photography", "Weddings & Coordination", "Décor & Styling", "Photo Booth Rentals"],
    title: "Photos, styling, booths and coordination. One team for your whole event.",
  },
];
