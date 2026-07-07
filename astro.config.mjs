import { defineConfig } from "astro/config";
import path from "path";

export default defineConfig({
  site: "https://dev.rjmlaird.co.uk",
  vite: {
    resolve: {
      alias: {
        "@": path.resolve("./src"),
      },
    },
  },
});
