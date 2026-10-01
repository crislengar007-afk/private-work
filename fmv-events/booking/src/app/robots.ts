import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/request';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/build', '/minis', '/policies', '/contact'],
      // Token-gated quote/pay pages, the admin, the client portal, APIs and auth callbacks.
      disallow: ['/q/', '/pay/', '/admin', '/portal', '/api/', '/auth'],
    },
    sitemap: appUrl('/sitemap.xml'),
  };
}
