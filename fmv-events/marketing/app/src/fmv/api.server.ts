// Server-only reads from the booking app's public API. Env is read per request
// (Workers bind env at request time); responses are cached in-isolate for 5 min.
import process from "node:process";
import demoCatalog from "./demo/catalog.json";
import demoPolicies from "./demo/policies.json";
import demoSettings from "./demo/settings.json";
import type { Catalog, MiniCampaign, Policy, PortfolioItem, PublicSettings, SiteData, Testimonial } from "./types";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

function readEnv(name: string): string | null {
  // Workers (nodejs_compat, compatibility date >= 2025-04-01) expose secrets on process.env.
  const v = (process.env[name] ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function bookingConfig(): { apiUrl: string | null; bookingUrl: string | null } {
  const apiUrl = readEnv("BOOKING_API_URL");
  const bookingUrl = readEnv("BOOKING_APP_URL") ?? apiUrl;
  return { apiUrl, bookingUrl };
}

async function getJson<T>(apiUrl: string, path: string): Promise<T | null> {
  const key = apiUrl + path;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  try {
    const res = await fetch(apiUrl + path, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { v?: number; data?: T };
    if (body.v !== 1 || body.data === undefined) throw new Error("unexpected response shape");
    cache.set(key, { at: Date.now(), value: body.data });
    return body.data;
  } catch (e) {
    console.error(`[booking-api] ${path}:`, e instanceof Error ? e.message : e);
    // Serve the last good copy if we have one, however old.
    return (hit?.value as T | undefined) ?? null;
  }
}

/** Prototype preview is on until the booking app is connected, unless FMV_PROTOTYPE=off. */
function prototypeEnabled(): boolean {
  return (process.env.FMV_PROTOTYPE ?? "").trim().toLowerCase() !== "off";
}

export async function loadSiteData(): Promise<SiteData> {
  const { apiUrl, bookingUrl } = bookingConfig();
  if (!apiUrl && prototypeEnabled()) {
    // Sample data transcribed from FMV's price flyers, so the finished site can be previewed.
    return {
      live: true,
      prototype: true,
      bookingUrl: null,
      apiUrl: null,
      settings: demoSettings as PublicSettings,
      catalog: demoCatalog as Catalog,
      minis: [],
      portfolio: [],
      testimonials: [],
      policies: demoPolicies as Policy[],
    };
  }
  if (!apiUrl) {
    return {
      live: false,
      prototype: false,
      bookingUrl,
      apiUrl: null,
      settings: null,
      catalog: null,
      minis: [],
      portfolio: [],
      testimonials: [],
      policies: [],
    };
  }
  const [settings, catalog, minis, portfolio, testimonials, policies] = await Promise.all([
    getJson<PublicSettings>(apiUrl, "/api/public/settings"),
    getJson<Catalog>(apiUrl, "/api/public/catalog"),
    getJson<MiniCampaign[]>(apiUrl, "/api/public/minis"),
    getJson<PortfolioItem[]>(apiUrl, "/api/public/portfolio"),
    getJson<Testimonial[]>(apiUrl, "/api/public/testimonials"),
    getJson<Policy[]>(apiUrl, "/api/public/policies"),
  ]);
  return {
    live: Boolean(settings || catalog),
    prototype: false,
    bookingUrl,
    apiUrl,
    settings,
    catalog,
    minis: minis ?? [],
    portfolio: (portfolio ?? []).filter((p) => p.url),
    testimonials: testimonials ?? [],
    policies: policies ?? [],
  };
}
