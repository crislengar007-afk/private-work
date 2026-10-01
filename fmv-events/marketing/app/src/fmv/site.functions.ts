import { createServerFn } from "@tanstack/react-start";
import { loadSiteData } from "./api.server";

/** Everything a page needs from the booking app, cached server-side for 5 minutes. */
export const getSiteData = createServerFn({ method: "GET" }).handler(async () => loadSiteData());
