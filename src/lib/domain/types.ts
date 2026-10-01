// Core domain entity types. Shared by repositories, pages, and admin.

export type PostStatus = "draft" | "published";
export type CommentStatus = "pending" | "approved" | "spam";
export type PageStatus = "draft" | "published";

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Rendered HTML produced by the editor (author-trusted content). */
  bodyHtml: string;
  coverUrl: string | null;
  categoryId: string | null;
  tagIds: string[];
  status: PostStatus;
  featured: boolean;
  /** Optional per-post SEO overrides; fall back to derived values when null. */
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A post joined with its category and tags, ready for rendering. */
export interface PostWithRelations extends Post {
  category: Category | null;
  tags: Tag[];
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  bodyHtml: string;
  status: PageStatus;
  showInMenu: boolean;
  menuOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorName: string;
  /** Stored privately, never rendered to the public. */
  authorEmail: string;
  body: string;
  status: CommentStatus;
  /** True when the reply is from the blog author (Pradeep). */
  isAuthor: boolean;
  createdAt: string;
}

/** A comment with its (one level of) approved replies attached. */
export interface CommentThread extends Comment {
  replies: Comment[];
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface Subscriber {
  id: string;
  email: string;
  createdAt: string;
}

export interface SiteSettings {
  title: string;
  tagline: string;
  description: string;
  authorName: string;
  /** Portrait shown in the home page About section. */
  authorPhotoUrl: string | null;
}
