import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved under /services. Permanent redirect keeps old links and search results working.
export const Route = createFileRoute("/booths")({
  beforeLoad: () => {
    throw redirect({ to: "/services/photo-booths", statusCode: 301 });
  },
});
