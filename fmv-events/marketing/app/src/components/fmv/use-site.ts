import { useLoaderData } from "@tanstack/react-router";
import type { SiteData } from "@/fmv/types";

/** Booking-app data loaded once by the root route (cached server-side 5 min). */
export function useSite(): SiteData {
  return useLoaderData({ from: "__root__" }) as SiteData;
}
