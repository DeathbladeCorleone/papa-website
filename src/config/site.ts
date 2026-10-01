/** Static site configuration (things not stored in the DB). */
export const SITE = {
  /** Fallback used before Settings are loaded / for build-time contexts. */
  defaultTitle: "Pradeep Singh",
  locale: "en",
  /** Posts per page on listing pages. */
  pageSize: 10,
};

/** Resolve the public site URL from env, with a sensible default. */
export function siteUrl(env: Record<string, string | undefined> = {}): string {
  const fromEnv =
    env.PUBLIC_SITE_URL ||
    (typeof process !== "undefined" ? process.env?.PUBLIC_SITE_URL : undefined);
  return (fromEnv || "https://pradeepsingh.pages.dev").replace(/\/$/, "");
}
