import type { Post } from "./types";

/** What readers see: a draft, a post waiting for its publish time, or a live post. */
export type PostState = "draft" | "scheduled" | "published";

const nowIso = (now: Date | string = new Date()) => (typeof now === "string" ? now : now.toISOString());

/** True when readers can see the post right now. */
export function isLive(post: Pick<Post, "status" | "publishedAt" | "createdAt">, now?: Date | string): boolean {
  return post.status === "published" && (post.publishedAt ?? post.createdAt) <= nowIso(now);
}

export function postState(post: Pick<Post, "status" | "publishedAt" | "createdAt">, now?: Date | string): PostState {
  if (post.status !== "published") return "draft";
  return isLive(post, now) ? "published" : "scheduled";
}

/**
 * Parse a publish date sent by the dashboard. Accepts any ISO-8601 string
 * (the browser converts its local time to UTC before sending). Returns a
 * normalized `toISOString()` value, or null when empty/invalid.
 */
export function parsePublishDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
