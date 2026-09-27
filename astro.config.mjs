// @ts-check
import { defineConfig } from 'astro/config';

// Routes mirror the existing WordPress site (/gallery/, /services/, /contact/)
// so current links and search listings keep working.
export default defineConfig({
  site: 'https://theflowerstudiotci.com',
  // Tests build into a separate folder so they never overwrite dist/.
  outDir: process.env.ASTRO_OUT_DIR || 'dist',
  trailingSlash: 'always',
  build: { format: 'directory' },
  image: {
    responsiveStyles: false,
  },
  devToolbar: { enabled: false },
});
