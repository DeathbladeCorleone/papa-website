// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

// Editorial blog for Pradeep Singh.
// Server output so we can render dynamic content (comments, admin) on Cloudflare.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://pradeepsingh.pages.dev",
  output: "server",
  adapter: cloudflare({ imageService: "compile" }),
  integrations: [react()],
});
