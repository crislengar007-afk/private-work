// Per-page <head>: unique title and description, canonical URL and Open Graph tags.
// SITE_ORIGIN is the public address of the site. Change it when the custom domain
// (e.g. fmveventsandphotography.com) is connected so canonicals follow.
export const SITE_ORIGIN = "https://fmv-events.higgsfield.app";

export function pageHead(path: string, title: string, description: string, opts: { noindex?: boolean } = {}) {
  const url = `${SITE_ORIGIN}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      ...(opts.noindex ? [{ name: "robots", content: "noindex" }] : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
