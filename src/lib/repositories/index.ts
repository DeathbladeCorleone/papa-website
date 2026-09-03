import type { BlogRepository } from "./types";
import { MemoryRepository, demoSeed } from "./memory";
import { SupabaseRepository } from "./supabase";

export type { BlogRepository } from "./types";

type EnvSource = Record<string, string | undefined>;

function fromImportMeta(): EnvSource {
  try {
    // Astro/Vite inject PUBLIC_* here; may be undefined under plain node.
    return (import.meta as unknown as { env?: EnvSource }).env ?? {};
  } catch {
    return {};
  }
}

function fromProcess(): EnvSource {
  const p = (globalThis as { process?: { env?: EnvSource } }).process;
  return p?.env ?? {};
}

// A single in-memory repo instance so local preview keeps state between requests.
let memoryRepo: MemoryRepository | null = null;

/**
 * Resolve the repository. When Supabase env vars are present we talk to
 * Supabase; otherwise we fall back to an in-memory repo seeded with demo
 * content (used by `astro dev`/preview before Supabase is wired, and by tests).
 *
 * `runtimeEnv` lets Astro pass Cloudflare's per-request secrets
 * (`Astro.locals.runtime.env`) which are not on `process.env`.
 */
export function getRepository(runtimeEnv: EnvSource = {}): BlogRepository {
  const env: EnvSource = { ...fromImportMeta(), ...fromProcess(), ...runtimeEnv };
  const url = env.PUBLIC_SUPABASE_URL;
  const anonKey = env.PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && anonKey && !url.includes("YOUR-PROJECT")) {
    return new SupabaseRepository({ url, anonKey, serviceKey });
  }

  if (!memoryRepo) memoryRepo = new MemoryRepository(demoSeed());
  return memoryRepo;
}

/** True when running against the in-memory fallback (useful for admin banners). */
export function isUsingMemoryFallback(runtimeEnv: EnvSource = {}): boolean {
  const env: EnvSource = { ...fromImportMeta(), ...fromProcess(), ...runtimeEnv };
  const url = env.PUBLIC_SUPABASE_URL;
  return !url || url.includes("YOUR-PROJECT") || !env.PUBLIC_SUPABASE_ANON_KEY;
}
