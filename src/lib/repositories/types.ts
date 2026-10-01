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

export interface ListPostsOptions {
  limit?: number;
  offset?: number;
  categorySlug?: string;
  tagSlug?: string;
}

export interface CreatePostInput {
  title: string;
  bodyHtml: string;
  excerpt?: string;
  coverUrl?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  status?: Post["status"];
  featured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /**
   * When the post goes (or went) live. A future time schedules a published post.
   * Omitted: set to "now" the first time the post is published.
   */
  publishedAt?: string | null;
}

export interface UpdatePostOptions {
  /** Always keep the current title/body as a revision (used before a restore). */
  forceRevision?: boolean;
}

/** Minimum gap between automatic revisions while a post is being edited. */
export const REVISION_INTERVAL_MS = 10 * 60 * 1000;
/** Revisions kept per post; older ones are pruned. */
export const MAX_REVISIONS = 30;

export interface CreateCommentInput {
  postId: string;
  parentId: string | null;
  authorName: string;
  authorEmail: string;
  body: string;
  isAuthor?: boolean;
}

/**
 * Storage contract for the whole blog. The Astro app depends only on this
 * interface, so it can run against the in-memory repo (tests, local preview)
 * or Cloudflare D1 (production) without changing a single page.
 */
export interface BlogRepository {
  // Posts (public)
  listPublished(opts?: ListPostsOptions): Promise<PostWithRelations[]>;
  countPublished(opts?: ListPostsOptions): Promise<number>;
  getPublishedBySlug(slug: string): Promise<PostWithRelations | null>;
  getFeatured(): Promise<PostWithRelations | null>;
  relatedPosts(post: PostWithRelations, limit?: number): Promise<PostWithRelations[]>;
  searchPublished(query: string): Promise<PostWithRelations[]>;
  /** Count one view of a published post (drafts are ignored). */
  recordView(postId: string): Promise<void>;
  /** Published posts by views (desc), topped up with the newest; excludes `excludeIds`. */
  listMostRead(limit: number, excludeIds?: string[]): Promise<PostWithRelations[]>;

  // Posts (admin)
  listAllPosts(): Promise<PostWithRelations[]>;
  getPostById(id: string): Promise<PostWithRelations | null>;
  createPost(input: CreatePostInput): Promise<PostWithRelations>;
  /**
   * Update a post. When the title or body changes, the previous version is kept
   * as a revision (at most one per REVISION_INTERVAL_MS unless forced).
   */
  updatePost(id: string, input: Partial<CreatePostInput>, opts?: UpdatePostOptions): Promise<PostWithRelations>;
  deletePost(id: string): Promise<void>;
  /** Make `id` the only featured (home page hero) post; null = newest essay. */
  setFeaturedPost(id: string | null): Promise<void>;
  listRevisions(postId: string): Promise<PostRevision[]>;
  getRevision(id: string): Promise<PostRevision | null>;

  // Taxonomy
  listCategories(): Promise<Category[]>;
  getCategoryBySlug(slug: string): Promise<Category | null>;
  createCategory(name: string): Promise<Category>;
  listTags(): Promise<Tag[]>;
  getTagBySlug(slug: string): Promise<Tag | null>;
  /** Get-or-create tags by name, returning their ids. */
  ensureTags(names: string[]): Promise<Tag[]>;
  /** Number of posts (any status) per category id and per tag id. */
  taxonomyCounts(): Promise<{ categories: Record<string, number>; tags: Record<string, number> }>;
  /** Rename keeps the slug, so existing links keep working. */
  renameCategory(id: string, name: string): Promise<Category>;
  /** Posts in the category become uncategorised. */
  deleteCategory(id: string): Promise<void>;
  /** Move every post from `fromId` into `intoId`, then delete `fromId`. */
  mergeCategory(fromId: string, intoId: string): Promise<void>;
  renameTag(id: string, name: string): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  mergeTag(fromId: string, intoId: string): Promise<void>;

  // Pages
  listMenuPages(): Promise<Page[]>;
  listAllPages(): Promise<Page[]>;
  getPublishedPageBySlug(slug: string): Promise<Page | null>;
  getPageById(id: string): Promise<Page | null>;
  createPage(input: { title: string; bodyHtml: string; status?: Page["status"]; showInMenu?: boolean; menuOrder?: number }): Promise<Page>;
  updatePage(id: string, input: Partial<{ title: string; bodyHtml: string; status: Page["status"]; showInMenu: boolean; menuOrder: number }>): Promise<Page>;
  deletePage(id: string): Promise<void>;
  /** Set menu order to the position of each id in `ids`. */
  reorderPages(ids: string[]): Promise<void>;

  // Comments
  listApprovedForPost(postId: string): Promise<Comment[]>;
  listCommentsByStatus(status: CommentStatus): Promise<Comment[]>;
  listCommentsForPostAdmin(postId: string): Promise<Comment[]>;
  createComment(input: CreateCommentInput): Promise<Comment>;
  setCommentStatus(id: string, status: CommentStatus): Promise<void>;
  deleteComment(id: string): Promise<void>;

  // Contact + subscribers
  createMessage(input: { name: string; email: string; body: string }): Promise<ContactMessage>;
  listMessages(): Promise<ContactMessage[]>;
  markMessageRead(id: string, read: boolean): Promise<void>;
  addSubscriber(email: string): Promise<{ created: boolean }>;
  listSubscribers(): Promise<Subscriber[]>;

  // Media library
  addMedia(item: MediaItem): Promise<MediaItem>;
  listMedia(): Promise<MediaItem[]>;
  getMedia(key: string): Promise<MediaItem | null>;
  updateMediaAlt(key: string, alt: string): Promise<void>;
  deleteMedia(key: string): Promise<void>;

  // Settings
  getSettings(): Promise<SiteSettings>;
  updateSettings(settings: Partial<SiteSettings>): Promise<SiteSettings>;

  // Admin login rate limiting
  recordLoginFailure(ip: string): Promise<void>;
  countLoginFailuresSince(ip: string, sinceIso: string): Promise<number>;
  clearLoginFailures(ip: string): Promise<void>;
}
