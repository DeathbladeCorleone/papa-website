/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    runtime?: {
      /** Cloudflare bindings (DB, MEDIA) and vars/secrets. See src/lib/bindings.ts. */
      env?: Record<string, unknown>;
    };
    /** Set by middleware when an authenticated admin session is present. */
    admin?: { email: string } | null;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
