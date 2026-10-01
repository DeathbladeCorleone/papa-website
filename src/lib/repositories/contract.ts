import { describe, it, expect, beforeEach } from "vitest";
import type { BlogRepository } from "./types";
import { buildThreads } from "../domain/comments";
import { MAX_REVISIONS } from "./types";
import { DEFAULT_HOME_LAYOUT } from "../domain/home";

const future = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const past = "2025-06-01T08:00:00.000Z";

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
    it("re-slugs a never-published draft when its title changes, but never a published post", async () => {
      const d = await repo.createPost({ title: "Untitled", bodyHtml: "" });
      const renamed = await repo.updatePost(d.id, { title: "Monsoon Notes" });
      expect(renamed.slug).toBe("monsoon-notes");
      const live = await repo.updatePost(d.id, { status: "published" });
      const again = await repo.updatePost(live.id, { title: "Different Title" });
      expect(again.slug).toBe("monsoon-notes");
      // Unpublished back to draft: the public link already existed, keep it.
      await repo.updatePost(d.id, { status: "draft" });
      expect((await repo.updatePost(d.id, { title: "Third" })).slug).toBe("monsoon-notes");
    });

    // -- scheduling ---------------------------------------------------------

    it("hides a scheduled post from every public query until its time", async () => {
      const [tag] = await repo.ensureTags(["running"]);
      const p = await repo.createPost({
        title: "Tomorrow's essay", bodyHtml: "<p>lighthouse</p>", status: "published",
        publishedAt: future(), featured: true, categoryId: "cat_life", tagIds: [tag.id],
      });
      expect((await repo.listPublished()).map((x) => x.id)).not.toContain(p.id);
      expect(await repo.countPublished()).toBe(2);
      expect(await repo.getPublishedBySlug(p.slug)).toBeNull();
      expect((await repo.getFeatured())?.id).not.toBe(p.id);
      expect((await repo.listMostRead(10)).map((x) => x.id)).not.toContain(p.id);
      expect(await repo.searchPublished("lighthouse")).toEqual([]);
      const runs = await repo.getPublishedBySlug("on-morning-runs");
      expect((await repo.relatedPosts(runs!)).map((x) => x.id)).not.toContain(p.id);
      expect((await repo.listAllPosts()).map((x) => x.id)).toContain(p.id);

      await repo.updatePost(p.id, { publishedAt: past });
      expect((await repo.getPublishedBySlug(p.slug))?.publishedAt).toBe(past);
      expect((await repo.searchPublished("lighthouse")).map((x) => x.id)).toEqual([p.id]);
    });

    it("accepts a back-dated publish date", async () => {
      const p = await repo.createPost({ title: "Old letter", bodyHtml: "<p>x</p>", status: "published", publishedAt: past });
      expect(p.publishedAt).toBe(past);
      const all = await repo.listPublished();
      expect(all[all.length - 1].id).toBe(p.id); // oldest last
    });

    // -- featured -----------------------------------------------------------

    it("keeps exactly one featured post, or none for 'newest essay'", async () => {
      const p = await repo.createPost({ title: "New hero", bodyHtml: "<p>x</p>", status: "published", publishedAt: past });
      await repo.setFeaturedPost(p.id);
      expect((await repo.getFeatured())?.id).toBe(p.id);
      expect((await repo.listAllPosts()).filter((x) => x.featured).map((x) => x.id)).toEqual([p.id]);
      await repo.setFeaturedPost(null);
      expect((await repo.listAllPosts()).some((x) => x.featured)).toBe(false);
      expect((await repo.getFeatured())?.slug).toBe("welcome"); // newest
    });

    // -- revisions ----------------------------------------------------------

    it("keeps the previous version when the body changes", async () => {
      const p = await repo.createPost({ title: "Draft one", bodyHtml: "<p>first</p>" });
      expect(await repo.listRevisions(p.id)).toEqual([]);
      await repo.updatePost(p.id, { bodyHtml: "<p>second</p>" });
      const revs = await repo.listRevisions(p.id);
      expect(revs.map((r) => r.bodyHtml)).toEqual(["<p>first</p>"]);
      expect((await repo.getRevision(revs[0].id))?.title).toBe("Draft one");

      // Rapid autosaves don't flood the history...
      await repo.updatePost(p.id, { bodyHtml: "<p>third</p>" });
      expect(await repo.listRevisions(p.id)).toHaveLength(1);
      // ...but a forced snapshot (before a restore) always lands, newest first.
      await repo.updatePost(p.id, { bodyHtml: "<p>fourth</p>" }, { forceRevision: true });
      expect((await repo.listRevisions(p.id)).map((r) => r.bodyHtml)).toEqual(["<p>third</p>", "<p>first</p>"]);
      // Unchanged content never creates a revision.
      await repo.updatePost(p.id, { featured: true }, { forceRevision: true });
      expect(await repo.listRevisions(p.id)).toHaveLength(2);
    });

    it("prunes old revisions and drops them with the post", async () => {
      const p = await repo.createPost({ title: "Busy", bodyHtml: "<p>0</p>" });
      for (let i = 1; i <= MAX_REVISIONS + 3; i++) {
        await repo.updatePost(p.id, { bodyHtml: `<p>${i}</p>` }, { forceRevision: true });
      }
      const revs = await repo.listRevisions(p.id);
      expect(revs).toHaveLength(MAX_REVISIONS);
      expect(revs[0].bodyHtml).toBe(`<p>${MAX_REVISIONS + 2}</p>`);
      await repo.deletePost(p.id);
      expect(await repo.listRevisions(p.id)).toEqual([]);
      expect(await repo.getRevision(revs[0].id)).toBeNull();
    });

    // -- topics -------------------------------------------------------------

    it("counts posts per category and tag", async () => {
      await repo.createPost({ title: "Draft in ideas", bodyHtml: "<p>x</p>", categoryId: "cat_ideas", tagIds: ["tag_running"] });
      const counts = await repo.taxonomyCounts();
      expect(counts.categories).toEqual({ cat_life: 2, cat_ideas: 1 });
      expect(counts.tags).toEqual({ tag_running: 2, tag_philosophy: 1 });
    });

    it("renames a category without changing its link", async () => {
      const c = await repo.renameCategory("cat_life", "Life & Living");
      expect(c).toEqual({ id: "cat_life", name: "Life & Living", slug: "life" });
      expect((await repo.getPublishedBySlug("welcome"))?.category?.name).toBe("Life & Living");
    });

    it("deletes a category, leaving its posts uncategorised", async () => {
      await repo.deleteCategory("cat_life");
      expect((await repo.listCategories()).map((c) => c.id)).toEqual(["cat_ideas"]);
      const post = await repo.getPublishedBySlug("welcome");
      expect(post?.categoryId).toBeNull();
      expect(post?.category).toBeNull();
    });

    it("merges one category into another", async () => {
      await repo.mergeCategory("cat_life", "cat_ideas");
      expect((await repo.listCategories()).map((c) => c.id)).toEqual(["cat_ideas"]);
      expect((await repo.listPublished({ categorySlug: "ideas" })).length).toBe(2);
    });

    it("renames, merges and deletes tags (and search follows)", async () => {
      await repo.renameTag("tag_running", "Jogging");
      expect((await repo.getPublishedBySlug("on-morning-runs"))?.tags.map((t) => t.name)).toEqual(["Jogging"]);
      expect((await repo.searchPublished("jogging")).map((p) => p.slug)).toEqual(["on-morning-runs"]);

      // welcome has philosophy; give it running too so the merge must de-duplicate.
      await repo.updatePost("post_welcome", { tagIds: ["tag_philosophy", "tag_running"] });
      await repo.mergeTag("tag_running", "tag_philosophy");
      expect((await repo.listTags()).map((t) => t.id)).toEqual(["tag_philosophy"]);
      expect((await repo.getPostById("post_welcome"))?.tagIds).toEqual(["tag_philosophy"]);
      expect((await repo.getPostById("post_morning"))?.tagIds).toEqual(["tag_philosophy"]);

      await repo.deleteTag("tag_philosophy");
      expect(await repo.listTags()).toEqual([]);
      expect((await repo.getPostById("post_welcome"))?.tagIds).toEqual([]);
      expect(await repo.searchPublished("philosophy")).toEqual([]);
    });

    // -- menu ---------------------------------------------------------------

    it("reorders menu pages", async () => {
      const now = await repo.createPage({ title: "Now", bodyHtml: "<p>n</p>", status: "published" });
      const books = await repo.createPage({ title: "Books", bodyHtml: "<p>b</p>", status: "published" });
      await repo.reorderPages([books.id, now.id, "page_about"]);
      expect((await repo.listMenuPages()).map((p) => p.slug)).toEqual(["books", "now", "about"]);
    });

    // -- media --------------------------------------------------------------

    it("stores, lists, captions and deletes media", async () => {
      const base = { url: "", alt: "", width: 800, height: 600, bytes: 1234, contentType: "image/webp" };
      await repo.addMedia({ ...base, key: "posts/a.webp", url: "/media/posts/a.webp", createdAt: "2026-01-01T00:00:00.000Z" });
      await repo.addMedia({ ...base, key: "posts/b.webp", url: "/media/posts/b.webp", createdAt: "2026-02-01T00:00:00.000Z" });
      expect((await repo.listMedia()).map((m) => m.key)).toEqual(["posts/b.webp", "posts/a.webp"]);
      await repo.updateMediaAlt("posts/a.webp", "A banyan tree");
      expect((await repo.getMedia("posts/a.webp"))?.alt).toBe("A banyan tree");
      expect((await repo.getMedia("posts/a.webp"))?.width).toBe(800);
      await repo.deleteMedia("posts/a.webp");
      expect(await repo.getMedia("posts/a.webp")).toBeNull();
      expect(await repo.listMedia()).toHaveLength(1);
    });

    // -- home layout --------------------------------------------------------

    it("stores the home page layout in settings", async () => {
      expect((await repo.getSettings()).homeLayout).toEqual(DEFAULT_HOME_LAYOUT);
      const layout = {
        ...DEFAULT_HOME_LAYOUT,
        sections: [...DEFAULT_HOME_LAYOUT.sections].reverse().map((s) => (s.key === "subscribe" ? { ...s, visible: false } : s)),
        latestCount: 6,
      };
      await repo.updateSettings({ homeLayout: layout });
      const got = (await repo.getSettings()).homeLayout;
      expect(got.sections.map((s) => s.key)).toEqual(["topics", "latest", "about", "subscribe", "mostRead"]);
      expect(got.sections.find((s) => s.key === "subscribe")?.visible).toBe(false);
      expect(got.latestCount).toBe(6);
      expect((await repo.getSettings()).title).toBe("Pradeep Singh");
    });
  });
}
