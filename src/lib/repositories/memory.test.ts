import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepository, demoSeed } from "./memory";
import { buildThreads } from "../domain/comments";

describe("MemoryRepository", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository(demoSeed());
  });

  it("lists only published posts, newest first", async () => {
    const posts = await repo.listPublished();
    expect(posts.map((p) => p.slug)).toEqual(["welcome", "on-morning-runs"]);
  });

  it("paginates", async () => {
    const page1 = await repo.listPublished({ limit: 1, offset: 0 });
    const page2 = await repo.listPublished({ limit: 1, offset: 1 });
    expect(page1[0].slug).toBe("welcome");
    expect(page2[0].slug).toBe("on-morning-runs");
    expect(await repo.countPublished()).toBe(2);
  });

  it("filters by category and tag slug", async () => {
    expect((await repo.listPublished({ categorySlug: "life" })).length).toBe(2);
    expect((await repo.listPublished({ tagSlug: "running" })).map((p) => p.slug)).toEqual(["on-morning-runs"]);
  });

  it("hydrates category and tags", async () => {
    const post = await repo.getPublishedBySlug("on-morning-runs");
    expect(post?.category?.name).toBe("Life");
    expect(post?.tags.map((t) => t.slug)).toEqual(["running"]);
  });

  it("picks the featured post first", async () => {
    expect((await repo.getFeatured())?.slug).toBe("welcome");
  });

  it("creates a draft that is not publicly listed until published", async () => {
    const draft = await repo.createPost({ title: "Secret Draft", bodyHtml: "<p>wip</p>" });
    expect(draft.status).toBe("draft");
    expect(draft.publishedAt).toBeNull();
    expect(await repo.getPublishedBySlug(draft.slug)).toBeNull();

    const published = await repo.updatePost(draft.id, { status: "published" });
    expect(published.publishedAt).not.toBeNull();
    expect(await repo.getPublishedBySlug(draft.slug)).not.toBeNull();
  });

  it("auto-generates an excerpt when none is given", async () => {
    const post = await repo.createPost({ title: "T", bodyHtml: "<p>Generated body text here.</p>" });
    expect(post.excerpt).toBe("Generated body text here.");
  });

  it("ensures unique slugs across posts", async () => {
    const a = await repo.createPost({ title: "Same Title", bodyHtml: "<p>a</p>" });
    const b = await repo.createPost({ title: "Same Title", bodyHtml: "<p>b</p>" });
    expect(a.slug).toBe("same-title");
    expect(b.slug).toBe("same-title-2");
  });

  it("finds related posts by shared category/tags", async () => {
    const post = await repo.getPublishedBySlug("welcome");
    const related = await repo.relatedPosts(post!);
    expect(related.map((p) => p.slug)).toContain("on-morning-runs"); // shares category
  });

  it("get-or-creates tags by name (case-insensitive)", async () => {
    const [t1] = await repo.ensureTags(["Running"]);
    expect(t1.id).toBe("tag_running");
    const [t2] = await repo.ensureTags(["brand-new-tag"]);
    expect(t2.slug).toBe("brand-new-tag");
  });

  it("stores comments as pending and threads them once approved", async () => {
    const post = await repo.getPublishedBySlug("welcome");
    const c1 = await repo.createComment({ postId: post!.id, parentId: null, authorName: "Asha", authorEmail: "a@x.com", body: "Great!" });
    expect(c1.status).toBe("pending");
    expect(await repo.listApprovedForPost(post!.id)).toHaveLength(0);

    await repo.setCommentStatus(c1.id, "approved");
    const reply = await repo.createComment({ postId: post!.id, parentId: c1.id, authorName: "Pradeep", authorEmail: "p@x.com", body: "Thank you", isAuthor: true });
    expect(reply.status).toBe("approved"); // author replies auto-approve

    const threads = buildThreads(await repo.listApprovedForPost(post!.id));
    expect(threads).toHaveLength(1);
    expect(threads[0].replies[0].isAuthor).toBe(true);
  });

  it("deletes a comment and its replies", async () => {
    const post = await repo.getPublishedBySlug("welcome");
    const c1 = await repo.createComment({ postId: post!.id, parentId: null, authorName: "Asha", authorEmail: "a@x.com", body: "hi" });
    await repo.createComment({ postId: post!.id, parentId: c1.id, authorName: "P", authorEmail: "p@x.com", body: "reply", isAuthor: true });
    await repo.deleteComment(c1.id);
    expect(await repo.listCommentsForPostAdmin(post!.id)).toHaveLength(0);
  });

  it("adds subscribers idempotently by email", async () => {
    expect((await repo.addSubscriber("Reader@Example.com")).created).toBe(true);
    expect((await repo.addSubscriber("reader@example.com")).created).toBe(false);
    expect(await repo.listSubscribers()).toHaveLength(1);
  });

  it("stores and searches published content", async () => {
    const results = await repo.searchPublished("road");
    expect(results.map((p) => p.slug)).toEqual(["on-morning-runs"]);
  });
});
