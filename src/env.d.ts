/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type SiteEnv = Record<string, string | undefined>;

declare namespace App {
  interface Locals {
    runtime?: {
      env?: SiteEnv;
    };
    /** Set by middleware when an authenticated admin session is present. */
    admin?: { email: string } | null;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly KEEPALIVE_SECRET?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
