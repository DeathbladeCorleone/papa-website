import { getRepository, isUsingMemoryFallback, type BlogRepository } from "./repositories";

type EnvSource = Record<string, string | undefined>;

/** Extract the effective env (Cloudflare runtime secrets + process env). */
export function envFrom(locals: App.Locals): EnvSource {
  const runtime = locals?.runtime?.env ?? {};
  const proc = typeof process !== "undefined" ? (process.env as EnvSource) : {};
  return { ...proc, ...runtime };
}

/** Resolve the repository for the current request. */
export function repoFrom(locals: App.Locals): BlogRepository {
  return getRepository(envFrom(locals));
}

/** Whether we're on the in-memory demo fallback (no Supabase configured). */
export function usingDemoData(locals: App.Locals): boolean {
  return isUsingMemoryFallback(envFrom(locals));
}
