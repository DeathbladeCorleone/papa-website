// Minimal structural types for the Cloudflare bindings we use. Cloudflare's
// real D1Database / R2Bucket objects satisfy these, and so does the node:sqlite
// test adapter — which keeps @cloudflare/workers-types (and its global type
// clashes with the DOM lib) out of the project.

export interface SqlRunResult {
  meta: { changes?: number };
}

export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<SqlRunResult>;
}

/** Subset of Cloudflare D1Database. `batch` runs statements in one transaction. */
export interface SqlDatabase {
  prepare(query: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<unknown[]>;
}

export interface MediaObject {
  body: ReadableStream;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
}

/** Subset of Cloudflare R2Bucket. */
export interface MediaBucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<MediaObject | null>;
  delete(key: string): Promise<void>;
}

/** Bindings + vars available on `Astro.locals.runtime.env` in production. */
export interface RuntimeEnv {
  DB?: SqlDatabase;
  MEDIA?: MediaBucket;
  [key: string]: unknown;
}
