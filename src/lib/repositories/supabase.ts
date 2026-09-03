import type { SupabaseClient } from "@supabase/supabase-js";
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
import { createAdminClient, createPublicClient, type SupabaseEnv } from "../supabase";
import { slugify } from "../domain/slug";
import { excerptFromHtml } from "../domain/excerpt";
import { stripHtml } from "../domain/html";
import { normalizeQuery } from "../domain/search";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function mapCategory(r: Row): Category {
  return { id: r.id, name: r.name, slug: r.slug };
}
function mapTag(r: Row): Tag {
  return { id: r.id, name: r.name, slug: r.slug };
}
function mapPage(r: Row): Page {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    bodyHtml: r.body_html,
    status: r.status,
    showInMenu: r.show_in_menu,
    menuOrder: r.menu_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapComment(r: Row): Comment {
  return {
    id: r.id,
    postId: r.post_id,
    parentId: r.parent_id,
    authorName: r.author_name,
    authorEmail: r.author_email,
    body: r.body,
    status: r.status,
    isAuthor: r.is_author,
    createdAt: r.created_at,
  };
}
function mapMessage(r: Row): ContactMessage {
  return { id: r.id, name: r.name, email: r.email, body: r.body, read: r.read, createdAt: r.created_at };
}
function mapSubscriber(r: Row): Subscriber {
  return { id: r.id, email: r.email, createdAt: r.created_at };
}
function mapSettings(r: Row): SiteSettings {
  return { title: r.title, tagline: r.tagline, description: r.description, authorName: r.author_name };
}

const POST_SELECT = "*, category:categories(*), post_tags(tag:tags(*))";

function mapPost(r: Row): PostWithRelations {
  const tags: Tag[] = (r.post_tags ?? [])
    .map((pt: Row) => pt.tag)
    .filter(Boolean)
    .map(mapTag);
  const base: Post = {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? "",
    bodyHtml: r.body_html ?? "",
    coverUrl: r.cover_url ?? null,
    categoryId: r.category_id ?? null,
    tagIds: tags.map((t) => t.id),
    status: r.status,
    featured: r.featured,
    seoTitle: r.seo_title ?? null,
    seoDescription: r.seo_description ?? null,
    publishedAt: r.published_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  return { ...base, category: r.category ? mapCategory(r.category) : null, tags };
}

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("No data returned");
  return data;
}

/**
 * Supabase-backed implementation of BlogRepository. Public reads go through the
 * anon client (RLS-guarded); privileged writes go through the admin client.
 */
export class SupabaseRepository implements BlogRepository {
  private pub: SupabaseClient;
  private admin: SupabaseClient | null;

  constructor(env: SupabaseEnv) {
    this.pub = createPublicClient(env);
    this.admin = env.serviceKey ? createAdminClient(env) : null;
  }

  private get write(): SupabaseClient {
    if (!this.admin) throw new Error("Admin (service role) client not configured");
    return this.admin;
  }

  private async applyTags(postId: string, tagIds: string[]): Promise<void> {
    await this.write.from("post_tags").delete().eq("post_id", postId);
    if (tagIds.length) {
      const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
      const { error } = await this.write.from("post_tags").insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  async listPublished(opts: ListPostsOptions = {}): Promise<PostWithRelations[]> {
    let q = this.pub.from("posts").select(POST_SELECT).eq("status", "published");
    if (opts.categorySlug) {
      const cat = await this.getCategoryBySlug(opts.categorySlug);
      if (!cat) return [];
      q = q.eq("category_id", cat.id);
    }
    q = q.order("published_at", { ascending: false });
    if (opts.limit != null) {
      const from = opts.offset ?? 0;
      q = q.range(from, from + opts.limit - 1);
    }
    const { data, error } = await q;
    let posts = unwrap(data, error).map(mapPost);
    if (opts.tagSlug) posts = posts.filter((p) => p.tags.some((t) => t.slug === opts.tagSlug));
    return posts;
  }

  async countPublished(opts: ListPostsOptions = {}): Promise<number> {
    // Tag filtering is applied client-side, so count reflects category filter only.
    let q = this.pub.from("posts").select("id", { count: "exact", head: true }).eq("status", "published");
    if (opts.categorySlug) {
      const cat = await this.getCategoryBySlug(opts.categorySlug);
      if (!cat) return 0;
      q = q.eq("category_id", cat.id);
    }
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async getPublishedBySlug(slug: string): Promise<PostWithRelations | null> {
    const { data, error } = await this.pub
      .from("posts").select(POST_SELECT).eq("slug", slug).eq("status", "published").maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPost(data) : null;
  }

  async getFeatured(): Promise<PostWithRelations | null> {
    const { data } = await this.pub
      .from("posts").select(POST_SELECT).eq("status", "published").eq("featured", true)
      .order("published_at", { ascending: false }).limit(1).maybeSingle();
    if (data) return mapPost(data);
    const recent = await this.listPublished({ limit: 1 });
    return recent[0] ?? null;
  }

  async relatedPosts(post: PostWithRelations, limit = 3): Promise<PostWithRelations[]> {
    // Fetch candidates sharing the category or a tag, score in memory.
    const candidates = await this.listPublished({ limit: 50 });
    return candidates
      .filter((p) => p.id !== post.id)
      .map((p) => {
        let score = 0;
        if (post.categoryId && p.categoryId === post.categoryId) score += 2;
        score += p.tags.filter((t) => post.tags.some((pt) => pt.id === t.id)).length;
        return { p, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.p);
  }

  async searchPublished(query: string): Promise<PostWithRelations[]> {
    const q = normalizeQuery(query);
    if (!q) return [];
    const { data, error } = await this.pub
      .from("posts").select(POST_SELECT).eq("status", "published")
      .textSearch("fts", q, { type: "websearch", config: "english" });
    return unwrap(data, error).map(mapPost);
  }

  async listAllPosts(): Promise<PostWithRelations[]> {
    const { data, error } = await this.write
      .from("posts").select(POST_SELECT).order("updated_at", { ascending: false });
    return unwrap(data, error).map(mapPost);
  }

  async getPostById(id: string): Promise<PostWithRelations | null> {
    const { data, error } = await this.write.from("posts").select(POST_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPost(data) : null;
  }

  private async uniquePostSlug(title: string): Promise<string> {
    const base = slugify(title) || "post";
    const { data } = await this.write.from("posts").select("slug").like("slug", `${base}%`);
    const taken = new Set((data ?? []).map((r: Row) => r.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  async createPost(input: CreatePostInput): Promise<PostWithRelations> {
    const status = input.status ?? "draft";
    const slug = await this.uniquePostSlug(input.title);
    const row = {
      slug,
      title: input.title,
      excerpt: input.excerpt?.trim() || excerptFromHtml(input.bodyHtml),
      body_html: input.bodyHtml,
      body_text: stripHtml(input.bodyHtml),
      cover_url: input.coverUrl ?? null,
      category_id: input.categoryId ?? null,
      status,
      featured: input.featured ?? false,
      seo_title: input.seoTitle ?? null,
      seo_description: input.seoDescription ?? null,
      published_at: status === "published" ? new Date().toISOString() : null,
    };
    const { data, error } = await this.write.from("posts").insert(row).select("id").single();
    const created = unwrap(data, error);
    await this.applyTags(created.id, input.tagIds ?? []);
    return (await this.getPostById(created.id))!;
  }

  async updatePost(id: string, input: Partial<CreatePostInput>): Promise<PostWithRelations> {
    const current = await this.getPostById(id);
    if (!current) throw new Error(`Post ${id} not found`);
    const patch: Row = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.bodyHtml !== undefined) {
      patch.body_html = input.bodyHtml;
      patch.body_text = stripHtml(input.bodyHtml);
    }
    if (input.excerpt !== undefined) {
      patch.excerpt = input.excerpt.trim() || excerptFromHtml(input.bodyHtml ?? current.bodyHtml);
    }
    if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId;
    if (input.featured !== undefined) patch.featured = input.featured;
    if (input.seoTitle !== undefined) patch.seo_title = input.seoTitle;
    if (input.seoDescription !== undefined) patch.seo_description = input.seoDescription;
    if (input.status !== undefined && input.status !== current.status) {
      patch.status = input.status;
      if (input.status === "published" && !current.publishedAt) {
        patch.published_at = new Date().toISOString();
      }
    }
    const { error } = await this.write.from("posts").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    if (input.tagIds !== undefined) await this.applyTags(id, input.tagIds);
    return (await this.getPostById(id))!;
  }

  async deletePost(id: string): Promise<void> {
    const { error } = await this.write.from("posts").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listCategories(): Promise<Category[]> {
    const { data, error } = await this.pub.from("categories").select("*").order("name");
    return unwrap(data, error).map(mapCategory);
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const { data, error } = await this.pub.from("categories").select("*").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapCategory(data) : null;
  }

  async createCategory(name: string): Promise<Category> {
    const existing = (await this.listCategories()).find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const { data, error } = await this.write
      .from("categories").insert({ name, slug: slugify(name) }).select("*").single();
    return mapCategory(unwrap(data, error));
  }

  async listTags(): Promise<Tag[]> {
    const { data, error } = await this.pub.from("tags").select("*").order("name");
    return unwrap(data, error).map(mapTag);
  }

  async getTagBySlug(slug: string): Promise<Tag | null> {
    const { data, error } = await this.pub.from("tags").select("*").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapTag(data) : null;
  }

  async ensureTags(names: string[]): Promise<Tag[]> {
    const existing = await this.listTags();
    const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
    const result: Tag[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const found = byName.get(name.toLowerCase());
      if (found) {
        result.push(found);
        continue;
      }
      const { data, error } = await this.write
        .from("tags").insert({ name, slug: slugify(name) }).select("*").single();
      const tag = mapTag(unwrap(data, error));
      byName.set(name.toLowerCase(), tag);
      result.push(tag);
    }
    return result;
  }

  async listMenuPages(): Promise<Page[]> {
    const { data, error } = await this.pub
      .from("pages").select("*").eq("status", "published").eq("show_in_menu", true)
      .order("menu_order");
    return unwrap(data, error).map(mapPage);
  }

  async listAllPages(): Promise<Page[]> {
    const { data, error } = await this.write.from("pages").select("*").order("menu_order");
    return unwrap(data, error).map(mapPage);
  }

  async getPublishedPageBySlug(slug: string): Promise<Page | null> {
    const { data, error } = await this.pub
      .from("pages").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPage(data) : null;
  }

  async getPageById(id: string): Promise<Page | null> {
    const { data, error } = await this.write.from("pages").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPage(data) : null;
  }

  async createPage(input: { title: string; bodyHtml: string; status?: Page["status"]; showInMenu?: boolean; menuOrder?: number }): Promise<Page> {
    const row = {
      slug: slugify(input.title) || "page",
      title: input.title,
      body_html: input.bodyHtml,
      status: input.status ?? "draft",
      show_in_menu: input.showInMenu ?? true,
      menu_order: input.menuOrder ?? 0,
    };
    const { data, error } = await this.write.from("pages").insert(row).select("*").single();
    return mapPage(unwrap(data, error));
  }

  async updatePage(id: string, input: Partial<{ title: string; bodyHtml: string; status: Page["status"]; showInMenu: boolean; menuOrder: number }>): Promise<Page> {
    const patch: Row = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.bodyHtml !== undefined) patch.body_html = input.bodyHtml;
    if (input.status !== undefined) patch.status = input.status;
    if (input.showInMenu !== undefined) patch.show_in_menu = input.showInMenu;
    if (input.menuOrder !== undefined) patch.menu_order = input.menuOrder;
    const { data, error } = await this.write.from("pages").update(patch).eq("id", id).select("*").single();
    return mapPage(unwrap(data, error));
  }

  async deletePage(id: string): Promise<void> {
    const { error } = await this.write.from("pages").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listApprovedForPost(postId: string): Promise<Comment[]> {
    const { data, error } = await this.pub
      .from("comments").select("*").eq("post_id", postId).eq("status", "approved")
      .order("created_at");
    return unwrap(data, error).map(mapComment);
  }

  async listCommentsByStatus(status: CommentStatus): Promise<Comment[]> {
    const { data, error } = await this.write
      .from("comments").select("*").eq("status", status).order("created_at", { ascending: false });
    return unwrap(data, error).map(mapComment);
  }

  async listCommentsForPostAdmin(postId: string): Promise<Comment[]> {
    const { data, error } = await this.write
      .from("comments").select("*").eq("post_id", postId).order("created_at");
    return unwrap(data, error).map(mapComment);
  }

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const row = {
      post_id: input.postId,
      parent_id: input.parentId,
      author_name: input.authorName,
      author_email: input.authorEmail,
      body: input.body,
      status: input.isAuthor ? "approved" : "pending",
      is_author: input.isAuthor ?? false,
    };
    // Author replies use the admin client (auto-approved); public uses anon+RLS.
    const client = input.isAuthor ? this.write : this.pub;
    const { data, error } = await client.from("comments").insert(row).select("*").single();
    return mapComment(unwrap(data, error));
  }

  async setCommentStatus(id: string, status: CommentStatus): Promise<void> {
    const { error } = await this.write.from("comments").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteComment(id: string): Promise<void> {
    const { error } = await this.write.from("comments").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async createMessage(input: { name: string; email: string; body: string }): Promise<ContactMessage> {
    const { data, error } = await this.pub.from("messages").insert(input).select("*").single();
    return mapMessage(unwrap(data, error));
  }

  async listMessages(): Promise<ContactMessage[]> {
    const { data, error } = await this.write.from("messages").select("*").order("created_at", { ascending: false });
    return unwrap(data, error).map(mapMessage);
  }

  async markMessageRead(id: string, read: boolean): Promise<void> {
    const { error } = await this.write.from("messages").update({ read }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async addSubscriber(email: string): Promise<{ created: boolean }> {
    const normalized = email.trim().toLowerCase();
    const { error } = await this.pub.from("subscribers").insert({ email: normalized });
    if (error) {
      if (error.code === "23505") return { created: false }; // unique violation
      throw new Error(error.message);
    }
    return { created: true };
  }

  async listSubscribers(): Promise<Subscriber[]> {
    const { data, error } = await this.write.from("subscribers").select("*").order("created_at", { ascending: false });
    return unwrap(data, error).map(mapSubscriber);
  }

  async getSettings(): Promise<SiteSettings> {
    const { data, error } = await this.pub.from("settings").select("*").eq("id", 1).single();
    return mapSettings(unwrap(data, error));
  }

  async updateSettings(settings: Partial<SiteSettings>): Promise<SiteSettings> {
    const patch: Row = {};
    if (settings.title !== undefined) patch.title = settings.title;
    if (settings.tagline !== undefined) patch.tagline = settings.tagline;
    if (settings.description !== undefined) patch.description = settings.description;
    if (settings.authorName !== undefined) patch.author_name = settings.authorName;
    const { data, error } = await this.write.from("settings").update(patch).eq("id", 1).select("*").single();
    return mapSettings(unwrap(data, error));
  }
}
