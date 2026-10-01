import { describe, it, expect, beforeEach } from "vitest";
import type { BlogRepository } from "./types";
import { buildThreads } from "../domain/comments";

/**
 * Behavioral contract every BlogRepository must satisfy. `make` must return a
 * fresh repository seeded with `demoSeed()`.
 */
export function repositoryContract(name: string, make: () => Promise<BlogRepository>): void {
  describe(`${name} — BlogRepository contract`, () => {
    let repo: BlogRepository;
    beforeEach(async () => {
      repo = await make();
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
      expect(await repo.listPublished({ categorySlug: "nope" })).toEqual([]);
    });

    it("applies the tag filter before pagination, and counts by tag", async () => {
      // Two newer posts without the tag must not push the tagged one off page 1.
      const [tag] = await repo.ensureTags(["running"]);
      await repo.createPost({ title: "Newer A", bodyHtml: "<p>a</p>", status: "published" });
      await repo.createPost({ title: "Newer B", bodyHtml: "<p>b</p>", status: "published" });
      const page = await repo.listPublished({ tagSlug: tag.slug, limit: 1, offset: 0 });
      expect(page.map((p) => p.slug)).toEqual(["on-morning-runs"]);
      expect(await repo.countPublished({ tagSlug: tag.slug })).toBe(1);
    });

    it("hydrates category and tags", async () => {
      const post = await repo.getPublishedBySlug("on-morning-runs");
      expect(post?.category?.name).toBe("Life");
      expect(post?.tags.map((t) => t.slug)).toEqual(["running"]);
      expect(post?.tagIds).toEqual(["tag_running"]);
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

    it("keeps the original publish date when re-published", async () => {
      const post = await repo.createPost({ title: "Dated", bodyHtml: "<p>x</p>", status: "published" });
      await repo.updatePost(post.id, { status: "draft" });
      const again = await repo.updatePost(post.id, { status: "published" });
      expect(again.publishedAt).toBe(post.publishedAt);
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

    it("stores booleans and tags on create/update", async () => {
      const [t1, t2] = await repo.ensureTags(["Books", "Ideas"]);
      const post = await repo.createPost({
        title: "Tagged",
        bodyHtml: "<p>x</p>",
        featured: true,
        tagIds: [t1.id, t2.id],
      });
      expect(post.featured).toBe(true);
      expect(post.tags.map((t) => t.name).sort()).toEqual(["Books", "Ideas"]);
      const updated = await repo.updatePost(post.id, { featured: false, tagIds: [t2.id] });
      expect(updated.featured).toBe(false);
      expect(updated.tags.map((t) => t.name)).toEqual(["Ideas"]);
    });

    it("finds related posts by shared category/tags", async () => {
      const post = await repo.getPublishedBySlug("welcome");
      const related = await repo.relatedPosts(post!);
      expect(related.map((p) => p.slug)).toContain("on-morning-runs");
      expect(related.map((p) => p.slug)).not.toContain("welcome");
    });

    it("get-or-creates tags and categories by name (case-insensitive)", async () => {
      const [t1] = await repo.ensureTags(["Running"]);
      expect(t1.id).toBe("tag_running");
      const [t2] = await repo.ensureTags(["brand-new-tag"]);
      expect(t2.slug).toBe("brand-new-tag");
      const c1 = await repo.createCategory("life");
      expect(c1.id).toBe("cat_life");
      const c2 = await repo.createCategory("Travel");
      expect(c2.slug).toBe("travel");
    });

    it("stores comments as pending and threads them once approved", async () => {
      const post = await repo.getPublishedBySlug("welcome");
      const c1 = await repo.createComment({ postId: post!.id, parentId: null, authorName: "Asha", authorEmail: "a@x.com", body: "Great!" });
      expect(c1.status).toBe("pending");
      expect(await repo.listApprovedForPost(post!.id)).toHaveLength(0);
      expect((await repo.listCommentsByStatus("pending")).map((c) => c.id)).toEqual([c1.id]);

      await repo.setCommentStatus(c1.id, "approved");
      const reply = await repo.createComment({ postId: post!.id, parentId: c1.id, authorName: "Pradeep", authorEmail: "p@x.com", body: "Thank you", isAuthor: true });
      expect(reply.status).toBe("approved");

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

    it("deleting a post removes its comments and search entry", async () => {
      const post = await repo.getPublishedBySlug("on-morning-runs");
      await repo.createComment({ postId: post!.id, parentId: null, authorName: "A", authorEmail: "a@x.com", body: "hi" });
      await repo.deletePost(post!.id);
      expect(await repo.getPostById(post!.id)).toBeNull();
      expect(await repo.listCommentsForPostAdmin(post!.id)).toHaveLength(0);
      expect(await repo.searchPublished("road")).toEqual([]);
    });

    it("adds subscribers idempotently by email", async () => {
      expect((await repo.addSubscriber("Reader@Example.com")).created).toBe(true);
      expect((await repo.addSubscriber("reader@example.com")).created).toBe(false);
      expect((await repo.listSubscribers()).map((s) => s.email)).toEqual(["reader@example.com"]);
    });

    it("stores contact messages and toggles read state", async () => {
      const m = await repo.createMessage({ name: "Ravi", email: "r@x.com", body: "Hello" });
      expect(m.read).toBe(false);
      await repo.markMessageRead(m.id, true);
      expect((await repo.listMessages())[0].read).toBe(true);
    });

    it("searches published content only", async () => {
      expect((await repo.searchPublished("road")).map((p) => p.slug)).toEqual(["on-morning-runs"]);
      const draft = await repo.createPost({ title: "Draft about roads", bodyHtml: "<p>road</p>" });
      expect((await repo.searchPublished("road")).map((p) => p.slug)).not.toContain(draft.slug);
    });

    it("reflects edits in search results", async () => {
      const post = await repo.createPost({ title: "Monsoon", bodyHtml: "<p>rain</p>", status: "published" });
      expect((await repo.searchPublished("monsoon")).map((p) => p.id)).toEqual([post.id]);
      await repo.updatePost(post.id, { title: "Winter", bodyHtml: "<p>snow</p>" });
      expect(await repo.searchPublished("monsoon")).toEqual([]);
      expect((await repo.searchPublished("snow")).map((p) => p.id)).toEqual([post.id]);
    });

    it("does not throw on hostile search input", async () => {
      for (const q of ['"', "AND", "-x", "a*b(", "NEAR/2", "col:x", "');DROP TABLE posts;--", ""]) {
        await expect(repo.searchPublished(q)).resolves.toBeInstanceOf(Array);
      }
    });

    it("manages pages and the menu", async () => {
      const page = await repo.createPage({ title: "Now", bodyHtml: "<p>now</p>", status: "published", showInMenu: true, menuOrder: 5 });
      expect((await repo.listMenuPages()).map((p) => p.slug)).toEqual(["about", "now"]);
      await repo.updatePage(page.id, { showInMenu: false });
      expect((await repo.listMenuPages()).map((p) => p.slug)).toEqual(["about"]);
      expect((await repo.getPublishedPageBySlug("now"))?.title).toBe("Now");
      await repo.deletePage(page.id);
      expect(await repo.getPageById(page.id)).toBeNull();
    });

    it("reads and updates settings", async () => {
      expect((await repo.getSettings()).authorName).toBe("Pradeep Singh");
      const s = await repo.updateSettings({ tagline: "New tagline" });
      expect(s.tagline).toBe("New tagline");
      expect((await repo.getSettings()).title).toBe("Pradeep Singh");
    });

    it("ranks Most read by views, topping up with newest when views are sparse", async () => {
      const a = await repo.createPost({ title: "Old Favourite", bodyHtml: "<p>a</p>", status: "published" });
      const runs = await repo.getPublishedBySlug("on-morning-runs");
      for (let i = 0; i < 3; i++) await repo.recordView(runs!.id);
      await repo.recordView(a.id);

      const top = await repo.listMostRead(3);
      expect(top.map((p) => p.slug)).toEqual(["on-morning-runs", "old-favourite", "welcome"]);
      expect(await repo.listMostRead(2, [runs!.id])).toHaveLength(2);
      expect((await repo.listMostRead(5, [runs!.id])).map((p) => p.id)).not.toContain(runs!.id);
    });

    it("never counts views for drafts or ranks them", async () => {
      const draft = await repo.createPost({ title: "Hidden", bodyHtml: "<p>x</p>" });
      await repo.recordView(draft.id);
      await repo.recordView(draft.id);
      expect((await repo.listMostRead(10)).map((p) => p.id)).not.toContain(draft.id);
    });

    it("stores the author portrait in settings", async () => {
      expect((await repo.getSettings()).authorPhotoUrl).toBeNull();
      await repo.updateSettings({ authorPhotoUrl: "/media/posts/me.webp" });
      expect((await repo.getSettings()).authorPhotoUrl).toBe("/media/posts/me.webp");
      await repo.updateSettings({ authorPhotoUrl: null });
      expect((await repo.getSettings()).authorPhotoUrl).toBeNull();
    });

    it("tracks login failures per IP within a window", async () => {
      const before = new Date(Date.now() - 1000).toISOString();
      await repo.recordLoginFailure("1.1.1.1");
      await repo.recordLoginFailure("1.1.1.1");
      await repo.recordLoginFailure("2.2.2.2");
      expect(await repo.countLoginFailuresSince("1.1.1.1", before)).toBe(2);
      expect(await repo.countLoginFailuresSince("1.1.1.1", new Date(Date.now() + 60_000).toISOString())).toBe(0);
      await repo.clearLoginFailures("1.1.1.1");
      expect(await repo.countLoginFailuresSince("1.1.1.1", before)).toBe(0);
      expect(await repo.countLoginFailuresSince("2.2.2.2", before)).toBe(1);
    });
  });
}
