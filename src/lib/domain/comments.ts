import type { Comment, CommentThread } from "./types";

export interface CommentInput {
  authorName: string;
  authorEmail: string;
  body: string;
  parentId: string | null;
  /** Honeypot field — must be empty for a human submission. */
  honeypot?: string;
}

export type ValidationResult =
  | { ok: true; value: { authorName: string; authorEmail: string; body: string; parentId: string | null } }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate + normalize a public comment submission. Rejects bot submissions
 * (filled honeypot), missing fields, bad emails, and over-long input.
 */
export function validateComment(input: CommentInput): ValidationResult {
  if (input.honeypot && input.honeypot.trim() !== "") {
    return { ok: false, error: "Rejected." }; // silent bot rejection
  }
  const authorName = input.authorName?.trim() ?? "";
  const authorEmail = input.authorEmail?.trim().toLowerCase() ?? "";
  const body = input.body?.trim() ?? "";

  if (authorName.length < 2 || authorName.length > 80) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!EMAIL_RE.test(authorEmail)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (body.length < 2) {
    return { ok: false, error: "Please write a comment." };
  }
  if (body.length > 5000) {
    return { ok: false, error: "Comment is too long (5000 characters max)." };
  }

  return {
    ok: true,
    value: { authorName, authorEmail, body, parentId: input.parentId ?? null },
  };
}

/**
 * Assemble approved comments into one level of nesting: top-level comments in
 * chronological order, each with its approved replies (also chronological).
 * Replies whose parent is missing/unapproved are surfaced as top-level so no
 * approved comment is silently dropped.
 */
export function buildThreads(comments: Comment[]): CommentThread[] {
  const approved = comments.filter((c) => c.status === "approved");
  const byId = new Map(approved.map((c) => [c.id, c]));
  const byTime = (a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt);

  const roots = approved
    .filter((c) => !c.parentId || !byId.has(c.parentId))
    .sort(byTime);

  const repliesByParent = new Map<string, Comment[]>();
  for (const c of approved) {
    if (c.parentId && byId.has(c.parentId)) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  }

  return roots.map((root) => ({
    ...root,
    replies: (repliesByParent.get(root.id) ?? []).sort(byTime),
  }));
}

/** Count of approved comments (top-level + replies) for a post's header. */
export function approvedCount(comments: Comment[]): number {
  return comments.filter((c) => c.status === "approved").length;
}
