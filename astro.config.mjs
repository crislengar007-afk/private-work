// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

// Routes mirror the existing WordPress site (/our-services/, /gallery/,
// /contact/) so current links and search listings keep working.
export default defineConfig({
  site: 'https://theflowerstudiotci.com',

  // Tests build into a separate folder so they never overwrite dist/.
  outDir: process.env.ASTRO_OUT_DIR || 'dist',

  trailingSlash: 'always',
  build: { format: 'directory' },

  image: {
    responsiveStyles: false,
  },

  // An earlier preview used /services/; keep it working.
  redirects: { '/services/': '/our-services/' },

  devToolbar: { enabled: false },
  // Design-comparison pages are not part of the public site map.
  integrations: [sitemap({ filter: (page) => !page.includes('/directions/') })],
});