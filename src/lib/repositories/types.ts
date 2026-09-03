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
}

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
 * or Supabase (production) without changing a single page.
 */
export interface BlogRepository {
  // Posts (public)
  listPublished(opts?: ListPostsOptions): Promise<PostWithRelations[]>;
  countPublished(opts?: ListPostsOptions): Promise<number>;
  getPublishedBySlug(slug: string): Promise<PostWithRelations | null>;
  getFeatured(): Promise<PostWithRelations | null>;
  relatedPosts(post: PostWithRelations, limit?: number): Promise<PostWithRelations[]>;
  searchPublished(query: string): Promise<PostWithRelations[]>;

  // Posts (admin)
  listAllPosts(): Promise<PostWithRelations[]>;
  getPostById(id: string): Promise<PostWithRelations | null>;
  createPost(input: CreatePostInput): Promise<PostWithRelations>;
  updatePost(id: string, input: Partial<CreatePostInput>): Promise<PostWithRelations>;
  deletePost(id: string): Promise<void>;

  // Taxonomy
  listCategories(): Promise<Category[]>;
  getCategoryBySlug(slug: string): Promise<Category | null>;
  createCategory(name: string): Promise<Category>;
  listTags(): Promise<Tag[]>;
  getTagBySlug(slug: string): Promise<Tag | null>;
  /** Get-or-create tags by name, returning their ids. */
  ensureTags(names: string[]): Promise<Tag[]>;

  // Pages
  listMenuPages(): Promise<Page[]>;
  listAllPages(): Promise<Page[]>;
  getPublishedPageBySlug(slug: string): Promise<Page | null>;
  getPageById(id: string): Promise<Page | null>;
  createPage(input: { title: string; bodyHtml: string; status?: Page["status"]; showInMenu?: boolean; menuOrder?: number }): Promise<Page>;
  updatePage(id: string, input: Partial<{ title: string; bodyHtml: string; status: Page["status"]; showInMenu: boolean; menuOrder: number }>): Promise<Page>;
  deletePage(id: string): Promise<void>;

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

  // Settings
  getSettings(): Promise<SiteSettings>;
  updateSettings(settings: Partial<SiteSettings>): Promise<SiteSettings>;
}
