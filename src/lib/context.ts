import { getRepository, type BlogRepository } from "./repositories";
import type { MediaBucket, RuntimeEnv, SqlDatabase } from "./bindings";

type EnvSource = Record<string, string | undefined>;

function runtimeEnv(locals: App.Locals): RuntimeEnv {
  return (locals?.runtime?.env ?? {}) as RuntimeEnv;
}

/** String vars/secrets: Cloudflare runtime env layered over process env. */
export function envFrom(locals: App.Locals): EnvSource {
  const out: EnvSource = typeof process !== "undefined" ? { ...(process.env as EnvSource) } : {};
  for (const [k, v] of Object.entries(runtimeEnv(locals))) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function dbFrom(locals: App.Locals): SqlDatabase | undefined {
  return runtimeEnv(locals).DB;
}

export function mediaFrom(locals: App.Locals): MediaBucket | undefined {
  return runtimeEnv(locals).MEDIA;
}

/** Resolve the repository for the current request. */
export function repoFrom(locals: App.Locals): BlogRepository {
  return getRepository(dbFrom(locals));
}

/** True when no D1 binding is present and the in-memory demo data is in use. */
export function usingDemoData(locals: App.Locals): boolean {
  return !dbFrom(locals);
}
