import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved under /services. Permanent redirect keeps old links and search results working.
export const Route = createFileRoute("/events")({
  beforeLoad: () => {
    throw redirect({ to: "/services/event-decor", statusCode: 301 });
  },
});
