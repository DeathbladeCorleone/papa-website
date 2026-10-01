import { stripHtml } from "./html";
import type { PostWithRelations } from "./types";

/** Normalize a raw query: trim, collapse whitespace, cap length. */
export function normalizeQuery(raw: string): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
}

const MAX_TERMS = 10;

/**
 * Turn free-form user input into a safe SQLite FTS5 MATCH expression.
 * Only letter/number runs survive (so operators like AND, NEAR, -, *, ^, quotes
 * and column filters can't be injected); each term is quoted and
 * prefix-matched, and terms are implicitly AND-ed. Returns "" when nothing
 * searchable remains, so callers can skip the query.
 */
export function toFtsQuery(raw: string): string {
  const terms = normalizeQuery(raw).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return terms
    .slice(0, MAX_TERMS)
    .map((t) => `"${t}"*`)
    .join(" ");
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
