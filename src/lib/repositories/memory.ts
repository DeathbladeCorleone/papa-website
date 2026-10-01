import type {
  Category,
  Comment,
  CommentStatus,
  ContactMessage,
  MediaItem,
  Page,
  Post,
  PostRevision,
  PostWithRelations,
  SiteSettings,
  Subscriber,
  Tag,
} from "../domain/types";
import type {
  BlogRepository,
  CreateCommentInput,
  CreatePostInput,
  ListPostsOptions,
  UpdatePostOptions,
} from "./types";
import { MAX_REVISIONS, REVISION_INTERVAL_MS } from "./types";
import { isLive } from "../domain/schedule";
import { DEFAULT_HOME_LAYOUT, normalizeHomeLayout } from "../domain/home";
import { uniqueSlug } from "../domain/slug";
import { excerptFromHtml } from "../domain/excerpt";
import { searchPosts } from "../domain/search";

let counter = 0;
const id = (prefix: string) => `${prefix}_${(++counter).toString(36)}_${Date.now().toString(36)}`;
const now = () => new Date().toISOString();

export interface SeedData {
  categories?: Category[];
  tags?: Tag[];
  posts?: Post[];
  pages?: Page[];
  comments?: Comment[];
  settings?: Partial<SiteSettings>;
}

const DEFAULT_SETTINGS: SiteSettings = {
  title: "Pradeep Singh",
  tagline: "Essays and reflections",
  description: "Writing on a variety of topics by Pradeep Singh.",
  authorName: "Pradeep Singh",
  authorPhotoUrl: null,
  homeLayout: DEFAULT_HOME_LAYOUT,
};

/**
 * In-memory implementation of BlogRepository. Deterministic and dependency-free
 * so it powers the test suite and local preview. Production uses the D1
 * implementation behind the same interface.
 */
export class MemoryRepository implements BlogRepository {
  private categories: Category[];
  private tags: Tag[];
  private posts: Post[];
  private pages: Page[];
  private comments: Comment[];
  private messages: ContactMessage[] = [];
  private subscribers: Subscriber[] = [];
  private settings: SiteSettings;
  private media: MediaItem[] = [];
  private views = new Map<string, number>();
  private revisions: PostRevision[] = [];

  constructor(seed: SeedData = {}) {
    this.categories = seed.categories ?? [];
    this.tags = seed.tags ?? [];
    this.posts = seed.posts ?? [];
    this.pages = seed.pages ?? [];
    this.comments = seed.comments ?? [];
    this.settings = { ...DEFAULT_SETTINGS, ...seed.settings };
    this.settings.homeLayout = normalizeHomeLayout(this.settings.homeLayout);
  }

  private hydrate(post: Post): PostWithRelations {
    return {
      ...post,
      views: this.views.get(post.id) ?? 0,
      category: this.categories.find((c) => c.id === post.categoryId) ?? null,
      tags: post.tagIds
        .map((tid) => this.tags.find((t) => t.id === tid))
        .filter((t): t is Tag => Boolean(t)),
    };
  }

  private matches(post: Post, opts?: ListPostsOptions): boolean {
    if (opts?.categorySlug) {
      const cat = this.categories.find((c) => c.slug === opts.categorySlug);
      if (!cat || post.categoryId !== cat.id) return false;
    }
    if (opts?.tagSlug) {
      const tag = this.tags.find((t) => t.slug === opts.tagSlug);
      if (!tag || !post.tagIds.includes(tag.id)) return false;
    }
    return true;
  }

  private publishedSorted(): Post[] {
    return this.posts
      .filter((p) => isLive(p))
      .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
  }

  async listPublished(opts: ListPostsOptions = {}): Promise<PostWithRelations[]> {
    const filtered = this.publishedSorted().filter((p) => this.matches(p, opts));
    const start = opts.offset ?? 0;
    const end = opts.limit != null ? start + opts.limit : undefined;
    return filtered.slice(start, end).map((p) => this.hydrate(p));
  }

  async countPublished(opts: ListPostsOptions = {}): Promise<number> {
    return this.publishedSorted().filter((p) => this.matches(p, opts)).length;
  }

  async getPublishedBySlug(slug: string): Promise<PostWithRelations | null> {
    const post = this.posts.find((p) => p.slug === slug && isLive(p));
    return post ? this.hydrate(post) : null;
  }

  async getFeatured(): Promise<PostWithRelations | null> {
    const featured = this.publishedSorted().find((p) => p.featured);
    const chosen = featured ?? this.publishedSorted()[0];
    return chosen ? this.hydrate(chosen) : null;
  }

  async relatedPosts(post: PostWithRelations, limit = 3): Promise<PostWithRelations[]> {
    const scored = this.publishedSorted()
      .filter((p) => p.id !== post.id)
      .map((p) => {
        let score = 0;
        if (post.categoryId && p.categoryId === post.categoryId) score += 2;
        score += p.tagIds.filter((t) => post.tagIds.includes(t)).length;
        return { p, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => this.hydrate(s.p));
  }

  async recordView(postId: string): Promise<void> {
    const post = this.posts.find((p) => p.id === postId && isLive(p));
    if (post) this.views.set(postId, (this.views.get(postId) ?? 0) + 1);
  }

  async listMostRead(limit: number, excludeIds: string[] = []): Promise<PostWithRelations[]> {
    const pool = this.publishedSorted().filter((p) => !excludeIds.includes(p.id));
    const ranked = pool
      .map((p, i) => ({ p, v: this.views.get(p.id) ?? 0, i }))
      .sort((a, b) => b.v - a.v || a.i - b.i);
    return ranked.slice(0, limit).map((r) => this.hydrate(r.p));
  }

  async searchPublished(query: string): Promise<PostWithRelations[]> {
    return searchPosts(this.posts.filter((p) => isLive(p)).map((p) => this.hydrate(p)), query);
  }

  async listAllPosts(): Promise<PostWithRelations[]> {
    return [...this.posts]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((p) => this.hydrate(p));
  }

  async getPostById(pid: string): Promise<PostWithRelations | null> {
    const post = this.posts.find((p) => p.id === pid);
    return post ? this.hydrate(post) : null;
  }

  async createPost(input: CreatePostInput): Promise<PostWithRelations> {
    const ts = now();
    const status = input.status ?? "draft";
    const post: Post = {
      id: id("post"),
      slug: uniqueSlug(input.title, this.posts.map((p) => p.slug)),
      title: input.title,
      excerpt: input.excerpt?.trim() || excerptFromHtml(input.bodyHtml),
      bodyHtml: input.bodyHtml,
      coverUrl: input.coverUrl ?? null,
      categoryId: input.categoryId ?? null,
      tagIds: input.tagIds ?? [],
      status,
      featured: input.featured ?? false,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      publishedAt: input.publishedAt ?? (status === "published" ? ts : null),
      createdAt: ts,
      updatedAt: ts,
    };
    this.posts.push(post);
    return this.hydrate(post);
  }

  async updatePost(pid: string, input: Partial<CreatePostInput>, opts: UpdatePostOptions = {}): Promise<PostWithRelations> {
    const post = this.posts.find((p) => p.id === pid);
    if (!post) throw new Error(`Post ${pid} not found`);
    this.snapshot(post, input, opts);
    if (input.title !== undefined && input.title !== post.title && post.status === "draft" && !post.publishedAt) {
      post.slug = uniqueSlug(input.title, this.posts.filter((p) => p.id !== pid).map((p) => p.slug));
    }
    if (input.title !== undefined) post.title = input.title;
    if (input.bodyHtml !== undefined) post.bodyHtml = input.bodyHtml;
    if (input.excerpt !== undefined) post.excerpt = input.excerpt.trim() || excerptFromHtml(post.bodyHtml);
    if (input.coverUrl !== undefined) post.coverUrl = input.coverUrl;
    if (input.categoryId !== undefined) post.categoryId = input.categoryId;
    if (input.tagIds !== undefined) post.tagIds = input.tagIds;
    if (input.featured !== undefined) post.featured = input.featured;
    if (input.seoTitle !== undefined) post.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) post.seoDescription = input.seoDescription;
    if (input.status !== undefined && input.status !== post.status) {
      post.status = input.status;
      if (input.status === "published" && !post.publishedAt) post.publishedAt = now();
    }
    if (input.publishedAt !== undefined) {
      post.publishedAt = input.publishedAt ?? (post.status === "published" ? now() : null);
    }
    post.updatedAt = now();
    return this.hydrate(post);
  }

  async deletePost(pid: string): Promise<void> {
    this.posts = this.posts.filter((p) => p.id !== pid);
    this.comments = this.comments.filter((c) => c.postId !== pid);
    this.revisions = this.revisions.filter((r) => r.postId !== pid);
  }

  /** Keep the current title/body as a revision before it's overwritten. */
  private snapshot(post: Post, input: Partial<CreatePostInput>, opts: UpdatePostOptions): void {
    const changed =
      (input.title !== undefined && input.title !== post.title) ||
      (input.bodyHtml !== undefined && input.bodyHtml !== post.bodyHtml);
    if (!changed) return;
    const mine = this.revisions.filter((r) => r.postId === post.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = mine[0];
    if (!opts.forceRevision && latest && Date.now() - Date.parse(latest.createdAt) < REVISION_INTERVAL_MS) return;
    // Strictly increasing timestamps keep "newest first" stable within one millisecond.
    let ts = now();
    if (latest && ts <= latest.createdAt) ts = new Date(Date.parse(latest.createdAt) + 1).toISOString();
    this.revisions.push({ id: id("rev"), postId: post.id, title: post.title, bodyHtml: post.bodyHtml, createdAt: ts });
    const pruned = new Set(mine.slice(MAX_REVISIONS - 1).map((r) => r.id));
    this.revisions = this.revisions.filter((r) => !pruned.has(r.id));
  }

  async listRevisions(postId: string): Promise<PostRevision[]> {
    return this.revisions
      .filter((r) => r.postId === postId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r }));
  }

  async getRevision(rid: string): Promise<PostRevision | null> {
    const r = this.revisions.find((x) => x.id === rid);
    return r ? { ...r } : null;
  }

  async setFeaturedPost(pid: string | null): Promise<void> {
    for (const p of this.posts) p.featured = p.id === pid;
  }

  async listCategories(): Promise<Category[]> {
    return [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    return this.categories.find((c) => c.slug === slug) ?? null;
  }

  async createCategory(name: string): Promise<Category> {
    const existing = this.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const cat: Category = { id: id("cat"), name, slug: uniqueSlug(name, this.categories.map((c) => c.slug)) };
    this.categories.push(cat);
    return cat;
  }

  async taxonomyCounts(): Promise<{ categories: Record<string, number>; tags: Record<string, number> }> {
    const categories: Record<string, number> = {};
    const tags: Record<string, number> = {};
    for (const p of this.posts) {
      if (p.categoryId) categories[p.categoryId] = (categories[p.categoryId] ?? 0) + 1;
      for (const t of new Set(p.tagIds)) tags[t] = (tags[t] ?? 0) + 1;
    }
    return { categories, tags };
  }

  async renameCategory(cid: string, name: string): Promise<Category> {
    const c = this.categories.find((x) => x.id === cid);
    if (!c) throw new Error(`Category ${cid} not found`);
    c.name = name.trim();
    return { ...c };
  }

  async deleteCategory(cid: string): Promise<void> {
    this.categories = this.categories.filter((c) => c.id !== cid);
    for (const p of this.posts) if (p.categoryId === cid) p.categoryId = null;
  }

  async mergeCategory(fromId: string, intoId: string): Promise<void> {
    if (fromId === intoId || !this.categories.some((c) => c.id === intoId)) return;
    for (const p of this.posts) if (p.categoryId === fromId) p.categoryId = intoId;
    this.categories = this.categories.filter((c) => c.id !== fromId);
  }

  async renameTag(tid: string, name: string): Promise<Tag> {
    const t = this.tags.find((x) => x.id === tid);
    if (!t) throw new Error(`Tag ${tid} not found`);
    t.name = name.trim();
    return { ...t };
  }

  async deleteTag(tid: string): Promise<void> {
    this.tags = this.tags.filter((t) => t.id !== tid);
    for (const p of this.posts) p.tagIds = p.tagIds.filter((t) => t !== tid);
  }

  async mergeTag(fromId: string, intoId: string): Promise<void> {
    if (fromId === intoId || !this.tags.some((t) => t.id === intoId)) return;
    for (const p of this.posts) {
      if (p.tagIds.includes(fromId)) p.tagIds = [...new Set(p.tagIds.map((t) => (t === fromId ? intoId : t)))];
    }
    this.tags = this.tags.filter((t) => t.id !== fromId);
  }

  async listTags(): Promise<Tag[]> {
    return [...this.tags].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTagBySlug(slug: string): Promise<Tag | null> {
    return this.tags.find((t) => t.slug === slug) ?? null;
  }

  async ensureTags(names: string[]): Promise<Tag[]> {
    const result: Tag[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      let tag = this.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!tag) {
        tag = { id: id("tag"), name, slug: uniqueSlug(name, this.tags.map((t) => t.slug)) };
        this.tags.push(tag);
      }
      result.push(tag);
    }
    return result;
  }

  async listMenuPages(): Promise<Page[]> {
    return this.pages
      .filter((p) => p.status === "published" && p.showInMenu)
      .sort((a, b) => a.menuOrder - b.menuOrder || a.title.localeCompare(b.title));
  }

  async listAllPages(): Promise<Page[]> {
    return [...this.pages].sort((a, b) => a.menuOrder - b.menuOrder);
  }

  async getPublishedPageBySlug(slug: string): Promise<Page | null> {
    return this.pages.find((p) => p.slug === slug && p.status === "published") ?? null;
  }

  async getPageById(pid: string): Promise<Page | null> {
    return this.pages.find((p) => p.id === pid) ?? null;
  }

  async createPage(input: { title: string; bodyHtml: string; status?: Page["status"]; showInMenu?: boolean; menuOrder?: number }): Promise<Page> {
    const ts = now();
    const page: Page = {
      id: id("page"),
      slug: uniqueSlug(input.title, this.pages.map((p) => p.slug)),
      title: input.title,
      bodyHtml: input.bodyHtml,
      status: input.status ?? "draft",
      showInMenu: input.showInMenu ?? true,
      menuOrder: input.menuOrder ?? this.pages.length,
      createdAt: ts,
      updatedAt: ts,
    };
    this.pages.push(page);
    return page;
  }

  async updatePage(pid: string, input: Partial<{ title: string; bodyHtml: string; status: Page["status"]; showInMenu: boolean; menuOrder: number }>): Promise<Page> {
    const page = this.pages.find((p) => p.id === pid);
    if (!page) throw new Error(`Page ${pid} not found`);
    Object.assign(page, input);
    page.updatedAt = now();
    return page;
  }

  async deletePage(pid: string): Promise<void> {
    this.pages = this.pages.filter((p) => p.id !== pid);
  }

  async reorderPages(ids: string[]): Promise<void> {
    ids.forEach((pid, i) => {
      const page = this.pages.find((p) => p.id === pid);
      if (page) page.menuOrder = i;
    });
  }

  async addMedia(item: MediaItem): Promise<MediaItem> {
    this.media = this.media.filter((m) => m.key !== item.key);
    this.media.push({ ...item });
    return { ...item };
  }

  async listMedia(): Promise<MediaItem[]> {
    return [...this.media].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((m) => ({ ...m }));
  }

  async getMedia(key: string): Promise<MediaItem | null> {
    const m = this.media.find((x) => x.key === key);
    return m ? { ...m } : null;
  }

  async updateMediaAlt(key: string, alt: string): Promise<void> {
    const m = this.media.find((x) => x.key === key);
    if (m) m.alt = alt.trim();
  }

  async deleteMedia(key: string): Promise<void> {
    this.media = this.media.filter((m) => m.key !== key);
  }

  async listApprovedForPost(postId: string): Promise<Comment[]> {
    return this.comments.filter((c) => c.postId === postId && c.status === "approved");
  }

  async listCommentsByStatus(status: CommentStatus): Promise<Comment[]> {
    return this.comments
      .filter((c) => c.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listCommentsForPostAdmin(postId: string): Promise<Comment[]> {
    return this.comments.filter((c) => c.postId === postId);
  }

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const comment: Comment = {
      id: id("cmt"),
      postId: input.postId,
      parentId: input.parentId,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      body: input.body,
      status: input.isAuthor ? "approved" : "pending",
      isAuthor: input.isAuthor ?? false,
      createdAt: now(),
    };
    this.comments.push(comment);
    return comment;
  }

  async setCommentStatus(cid: string, status: CommentStatus): Promise<void> {
    const c = this.comments.find((x) => x.id === cid);
    if (c) c.status = status;
  }

  async deleteComment(cid: string): Promise<void> {
    this.comments = this.comments.filter((c) => c.id !== cid && c.parentId !== cid);
  }

  async createMessage(input: { name: string; email: string; body: string }): Promise<ContactMessage> {
    const msg: ContactMessage = { id: id("msg"), ...input, read: false, createdAt: now() };
    this.messages.push(msg);
    return msg;
  }

  async listMessages(): Promise<ContactMessage[]> {
    return [...this.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async markMessageRead(mid: string, read: boolean): Promise<void> {
    const m = this.messages.find((x) => x.id === mid);
    if (m) m.read = read;
  }

  async addSubscriber(email: string): Promise<{ created: boolean }> {
    const normalized = email.trim().toLowerCase();
    if (this.subscribers.some((s) => s.email === normalized)) return { created: false };
    this.subscribers.push({ id: id("sub"), email: normalized, createdAt: now() });
    return { created: true };
  }

  async listSubscribers(): Promise<Subscriber[]> {
    return [...this.subscribers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getSettings(): Promise<SiteSettings> {
    return { ...this.settings };
  }

  async updateSettings(settings: Partial<SiteSettings>): Promise<SiteSettings> {
    const defined = Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined));
    this.settings = { ...this.settings, ...defined };
    this.settings.homeLayout = normalizeHomeLayout(this.settings.homeLayout);
    return { ...this.settings };
  }

  private loginFailures: { ip: string; createdAt: string }[] = [];

  async recordLoginFailure(ip: string): Promise<void> {
    this.loginFailures.push({ ip, createdAt: now() });
  }

  async countLoginFailuresSince(ip: string, sinceIso: string): Promise<number> {
    return this.loginFailures.filter((f) => f.ip === ip && f.createdAt >= sinceIso).length;
  }

  async clearLoginFailures(ip: string): Promise<void> {
    this.loginFailures = this.loginFailures.filter((f) => f.ip !== ip);
  }
}

/** Small deterministic seed used for local preview and demos. */
export function demoSeed(): SeedData {
  const ts = "2026-01-15T09:00:00.000Z";
  const catLife: Category = { id: "cat_life", name: "Life", slug: "life" };
  const catIdeas: Category = { id: "cat_ideas", name: "Ideas", slug: "ideas" };
  const tagRun: Tag = { id: "tag_running", name: "Running", slug: "running" };
  const tagPhil: Tag = { id: "tag_philosophy", name: "Philosophy", slug: "philosophy" };

  const posts: Post[] = [
    {
      id: "post_welcome",
      slug: "welcome",
      title: "Welcome to my blog",
      excerpt: "A first note on why I started writing here, and what to expect.",
      bodyHtml:
        "<p>This is where I will share essays on the things I keep thinking about — running, books, and the odd idea that will not leave me alone.</p><h2>Why write?</h2><p>Because the refusal to think is its own kind of loss. Writing is how I think.</p>",
      coverUrl: null,
      categoryId: catLife.id,
      tagIds: [tagPhil.id],
      status: "published",
      featured: true,
      seoTitle: null,
      seoDescription: null,
      publishedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "post_morning",
      slug: "on-morning-runs",
      title: "On morning runs",
      excerpt: "What ten years of early miles taught me about discipline.",
      bodyHtml:
        "<p>The alarm is the hardest part. After that, the road does the rest.</p><h2>The first mile</h2><p>Every run negotiates with the first mile. Win that, and the rest is a gift.</p>",
      coverUrl: null,
      categoryId: catLife.id,
      tagIds: [tagRun.id],
      status: "published",
      featured: false,
      seoTitle: null,
      seoDescription: null,
      publishedAt: "2026-01-10T09:00:00.000Z",
      createdAt: "2026-01-10T09:00:00.000Z",
      updatedAt: "2026-01-10T09:00:00.000Z",
    },
  ];

  const pages: Page[] = [
    {
      id: "page_about",
      slug: "about",
      title: "About",
      bodyHtml:
        "<p>I am Pradeep Singh. I write about the things that interest me, from running to the questions that do not have tidy answers.</p>",
      status: "published",
      showInMenu: true,
      menuOrder: 0,
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  return {
    categories: [catLife, catIdeas],
    tags: [tagRun, tagPhil],
    posts,
    pages,
    comments: [],
  };
}
