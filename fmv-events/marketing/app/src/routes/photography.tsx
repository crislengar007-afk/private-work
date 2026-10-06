import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved under /services. Permanent redirect keeps old links and search results working.
export const Route = createFileRoute("/photography")({
  beforeLoad: () => {
    throw redirect({ to: "/services/photography", statusCode: 301 });
  },
});
