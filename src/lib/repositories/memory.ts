import type {
  Category,
  Comment,
  CommentStatus,
  ContactMessage,
  Page,
  Post,
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
} from "./types";
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

  constructor(seed: SeedData = {}) {
    this.categories = seed.categories ?? [];
    this.tags = seed.tags ?? [];
    this.posts = seed.posts ?? [];
    this.pages = seed.pages ?? [];
    this.comments = seed.comments ?? [];
    this.settings = { ...DEFAULT_SETTINGS, ...seed.settings };
  }

  private hydrate(post: Post): PostWithRelations {
    return {
      ...post,
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
      .filter((p) => p.status === "published")
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
    const post = this.posts.find((p) => p.slug === slug && p.status === "published");
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

  async searchPublished(query: string): Promise<PostWithRelations[]> {
    return searchPosts(this.posts.map((p) => this.hydrate(p)), query);
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
      publishedAt: status === "published" ? ts : null,
      createdAt: ts,
      updatedAt: ts,
    };
    this.posts.push(post);
    return this.hydrate(post);
  }

  async updatePost(pid: string, input: Partial<CreatePostInput>): Promise<PostWithRelations> {
    const post = this.posts.find((p) => p.id === pid);
    if (!post) throw new Error(`Post ${pid} not found`);
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
    post.updatedAt = now();
    return this.hydrate(post);
  }

  async deletePost(pid: string): Promise<void> {
    this.posts = this.posts.filter((p) => p.id !== pid);
    this.comments = this.comments.filter((c) => c.postId !== pid);
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
    this.settings = { ...this.settings, ...settings };
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
