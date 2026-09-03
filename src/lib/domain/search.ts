import { stripHtml } from "./html";
import type { PostWithRelations } from "./types";

/** Normalize a raw query: trim, collapse whitespace, cap length. */
export function normalizeQuery(raw: string): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
}

/**
 * Build a Postgres `websearch_to_tsquery`-compatible string. websearch already
 * handles quotes/or/-, so we mostly pass it through after normalizing. Returns
 * "" for an empty query so callers can skip the search entirely.
 */
export function toTsQuery(raw: string): string {
  return normalizeQuery(raw);
}

/**
 * In-memory search fallback (used in tests and when full-text is unavailable).
 * Ranks published posts by matches in title (weighted), tags, then body.
 */
export function searchPosts(
  posts: PostWithRelations[],
  raw: string,
): PostWithRelations[] {
  const q = normalizeQuery(raw).toLowerCase();
  if (!q) return [];
  const terms = q.split(" ").filter(Boolean);

  const scored = posts
    .filter((p) => p.status === "published")
    .map((p) => {
      const title = p.title.toLowerCase();
      const tags = p.tags.map((t) => t.name.toLowerCase()).join(" ");
      const body = stripHtml(p.bodyHtml).toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 5;
        if (tags.includes(term)) score += 3;
        if (body.includes(term)) score += 1;
      }
      return { post: p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.post);
}
