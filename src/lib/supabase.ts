import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey?: string;
}

/** Anon client — subject to Row Level Security. Used for public reads/inserts. */
export function createPublicClient(env: SupabaseEnv): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false },
  });
}

/**
 * Service-role client — bypasses RLS. Server-only. Never construct this with a
 * key that could reach the browser.
 */
export function createAdminClient(env: SupabaseEnv): SupabaseClient {
  if (!env.serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }
  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false },
  });
}
