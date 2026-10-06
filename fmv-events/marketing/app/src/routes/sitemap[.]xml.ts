import { createFileRoute } from "@tanstack/react-router";

const PAGES = [
  "/",
  "/services",
  "/services/weddings",
  "/services/photography",
  "/services/event-decor",
  "/services/photo-booths",
  "/services/event-coordination",
  "/packages",
  "/portfolio",
  "/about",
  "/contact",
  "/book",
  "/faq",
  "/service-area",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const urls = PAGES.map((p) => `  <url><loc>${origin}${p}</loc><changefreq>weekly</changefreq><priority>${p === "/" ? "1.0" : "0.8"}</priority></url>`);
        const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>"].join("\n");
        return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      },
    },
  },
});
