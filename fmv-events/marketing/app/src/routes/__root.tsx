import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportHiggsfieldError } from "../lib/higgsfield-error-reporting";
// Page metadata (title/favicon/og) committed into the repo and read at BUILD time.
import appMetaJson from "../app-meta.json";
import { getSiteData } from "../fmv/site.functions";
import { businessJsonLd } from "../fmv/jsonld";
import type { SiteData } from "../fmv/types";
import { ContactFab, SiteFooter, SiteHeader } from "../components/fmv/chrome";
import { StructuredData } from "../components/StructuredData";
import { scrollScrubTheme } from "../scroll-scrub-scenes";

declare const __HF_DESIGN_INSPECTOR__: boolean;

const DEFAULT_TITLE = "FMV Events & Photography · Fredericton, NB";
const DEFAULT_DESCRIPTION =
  "Photography, wedding coordination, décor and photo booth rentals in Fredericton and across New Brunswick. One team for your whole event.";

type AppMeta = {
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  favicon_url?: string | null;
  og_video_url?: string | null;
  marketplace_cover_url?: string | null;
};

const appMeta = appMetaJson as AppMeta;
const APP_HOST_ZONES = ["higgsfield.app", "higgsfield-dev.app"];

// Own assets resolve against whoever serves this page (preview, prod or a custom domain).
function toOwnAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  try {
    const u = new URL(value);
    const isAppHost = APP_HOST_ZONES.some((zone) => u.hostname === zone || u.hostname.endsWith(`.${zone}`));
    return isAppHost ? u.pathname + u.search : value;
  } catch {
    return value;
  }
}

function buildHead(meta: AppMeta) {
  const title = meta.og_title ?? DEFAULT_TITLE;
  const description = meta.og_description ?? DEFAULT_DESCRIPTION;
  const ogImage = toOwnAssetUrl(meta.og_image_url);
  const favicon = toOwnAssetUrl(meta.favicon_url);
  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },
      { name: "theme-color", content: scrollScrubTheme.background },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_CA" },
      { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
      ...(ogImage ? [{ property: "og:image", content: ogImage }, { name: "twitter:image", content: ogImage }] : []),
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      ...(favicon ? [{ rel: "icon", href: favicon }] : [{ rel: "icon", href: "/assets/brand/favicon.svg", type: "image/svg+xml" }]),
    ],
  };
}

function NotFoundComponent() {
  return (
    <section className="fmv-section">
      <div className="fmv-wrap grid gap-4">
        <p className="fmv-eyebrow">Page not found</p>
        <h1 className="fmv-h2">This page has wandered off.</h1>
        <p className="fmv-lede">The link may be old. Everything else is right where you left it.</p>
        <p><Link to="/" className="fmv-link-underline">Back to the home page</Link></p>
      </div>
    </section>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportHiggsfieldError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <section className="fmv-section">
      <div className="fmv-wrap grid gap-4">
        <h1 className="fmv-h2">This page didn&apos;t load</h1>
        <p className="fmv-lede">Something went wrong on our end. Please try again.</p>
        <p>
          <button type="button" className="fmv-cta-ghost" onClick={() => { router.invalidate(); reset(); }}>Try again</button>
        </p>
      </div>
    </section>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => buildHead(appMeta),
  loader: () => getSiteData(),
  staleTime: 5 * 60 * 1000,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CA" className="fmv">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const site = Route.useLoaderData() as SiteData;
  const jsonLd = businessJsonLd(site, "");

  useEffect(() => {
    if (!__HF_DESIGN_INSPECTOR__) return;
    void import("../module/design-inspector/runtime")
      .then(({ installHiggsfieldDesignInspector }) => installHiggsfieldDesignInspector())
      .catch((error) => {
        reportHiggsfieldError(error instanceof Error ? error : new Error("Failed to load design inspector"), {
          boundary: "higgsfield_design_inspector_import",
        });
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {jsonLd ? <StructuredData json={jsonLd} /> : null}
      <a className="fmv-skip" href="#main">Skip to content</a>
      <SiteHeader />
      <div id="main">
        {/* Required: nested routes render here. */}
        <Outlet />
      </div>
      <SiteFooter />
      <ContactFab />
    </QueryClientProvider>
  );
}
