import { describe, it, expect } from "vitest";
import { validateComment, buildThreads, approvedCount } from "./comments";
import type { Comment, CommentStatus } from "./types";

function comment(partial: Partial<Comment> & { id: string }): Comment {
  return {
    postId: "p1",
    parentId: null,
    authorName: "Reader",
    authorEmail: "r@example.com",
    body: "hi",
    status: "approved" as CommentStatus,
    isAuthor: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("validateComment", () => {
  it("accepts a good submission and normalizes email", () => {
    const r = validateComment({
      authorName: "  Asha ",
      authorEmail: "Asha@Example.COM",
      body: "  Nice post ",
      parentId: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.authorEmail).toBe("asha@example.com");
      expect(r.value.authorName).toBe("Asha");
      expect(r.value.body).toBe("Nice post");
    }
  });

  it("silently rejects when honeypot is filled", () => {
    const r = validateComment({
      authorName: "Bot",
      authorEmail: "bot@x.com",
      body: "spam",
      parentId: null,
      honeypot: "http://spam",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects bad email", () => {
    const r = validateComment({
      authorName: "Asha",
      authorEmail: "nope",
      body: "hello",
      parentId: null,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects empty name and body", () => {
    expect(validateComment({ authorName: "", authorEmail: "a@b.co", body: "hi", parentId: null }).ok).toBe(false);
    expect(validateComment({ authorName: "Asha", authorEmail: "a@b.co", body: "", parentId: null }).ok).toBe(false);
  });
});

describe("buildThreads", () => {
  it("nests approved replies under their parent, chronologically", () => {
    const comments: Comment[] = [
      comment({ id: "c1", createdAt: "2026-01-01T10:00:00Z" }),
      comment({ id: "r1", parentId: "c1", isAuthor: true, createdAt: "2026-01-01T11:00:00Z" }),
      comment({ id: "c2", createdAt: "2026-01-01T09:00:00Z" }),
    ];
    const threads = buildThreads(comments);
    expect(threads.map((t) => t.id)).toEqual(["c2", "c1"]); // by time
    expect(threads[1].replies.map((r) => r.id)).toEqual(["r1"]);
  });

  it("excludes pending/spam comments", () => {
    const comments: Comment[] = [
      comment({ id: "c1", status: "pending" }),
      comment({ id: "c2", status: "approved" }),
      comment({ id: "c3", status: "spam" }),
    ];
    expect(buildThreads(comments).map((t) => t.id)).toEqual(["c2"]);
  });

  it("promotes a reply to top-level when its parent is not approved", () => {
    const comments: Comment[] = [
      comment({ id: "c1", status: "pending" }),
      comment({ id: "r1", parentId: "c1", status: "approved" }),
    ];
    const threads = buildThreads(comments);
    expect(threads.map((t) => t.id)).toEqual(["r1"]);
    expect(threads[0].replies).toEqual([]);
  });
});

describe("approvedCount", () => {
  it("counts only approved", () => {
    const comments: Comment[] = [
      comment({ id: "a", status: "approved" }),
      comment({ id: "b", status: "approved" }),
      comment({ id: "c", status: "pending" }),
    ];
    expect(approvedCount(comments)).toBe(2);
  });
});
