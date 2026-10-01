// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

// Editorial blog for Pradeep Singh, on Cloudflare Pages + D1 + R2.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://pradeepsingh.pages.dev",
  output: "server",
  adapter: cloudflare({
    imageService: "compile",
    // `astro dev` emulates the D1/R2 bindings from wrangler.jsonc locally.
    platformProxy: { enabled: true },
  }),
  integrations: [react()],
  // Local D1/R2 data lives in .wrangler/; writing to it must not reload the page.
  vite: { server: { watch: { ignored: ["**/.wrangler/**"] } } },
});
