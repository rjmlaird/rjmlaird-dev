import { defineConfig } from "astro/config";
import path from "path";
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dev.rjmlaird.co.uk',
  integrations: [sitemap()],
  vite: {
    resolve: {
      alias: {
        "@": path.resolve("./src"),
      },
    },
  },
});
