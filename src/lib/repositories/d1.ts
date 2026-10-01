import type {
  Category,
  Comment,
  CommentStatus,
  ContactMessage,
  Page,
  PostWithRelations,
  SiteSettings,
  Subscriber,
  Tag,
} from "../domain/types";
import type { BlogRepository, CreateCommentInput, CreatePostInput, ListPostsOptions } from "./types";
import type { SqlDatabase, SqlStatement } from "../bindings";
import type { SeedData } from "./memory";
import { uniqueSlug } from "../domain/slug";
import { excerptFromHtml } from "../domain/excerpt";
import { stripHtml } from "../domain/html";
import { toFtsQuery } from "../domain/search";

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const str = (v: unknown) => (v == null ? null : String(v));

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapCategory(r: Row): Category {
  return { id: String(r.id), name: String(r.name), slug: String(r.slug) };
}
const mapTag = mapCategory as (r: Row) => Tag;

function mapPage(r: Row): Page {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    bodyHtml: String(r.body_html ?? ""),
    status: r.status as Page["status"],
    showInMenu: Boolean(r.show_in_menu),
    menuOrder: Number(r.menu_order ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapComment(r: Row): Comment {
  return {
    id: String(r.id),
    postId: String(r.post_id),
    parentId: str(r.parent_id),
    authorName: String(r.author_name),
    authorEmail: String(r.author_email),
    body: String(r.body),
    status: r.status as CommentStatus,
    isAuthor: Boolean(r.is_author),
    createdAt: String(r.created_at),
  };
}

function mapMessage(r: Row): ContactMessage {
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    body: String(r.body),
    read: Boolean(r.read),
    createdAt: String(r.created_at),
  };
}

function mapSettings(r: Row): SiteSettings {
  return {
    title: String(r.title),
    tagline: String(r.tagline),
    description: String(r.description),
    authorName: String(r.author_name),
    authorPhotoUrl: str(r.author_photo_url),
  };
}

/** Post columns joined with their category (prefixed c_). */
const POST_FROM = `
  SELECT p.*, c.id AS c_id, c.name AS c_name, c.slug AS c_slug
  FROM posts p LEFT JOIN categories c ON c.id = p.category_id`;
const PUBLISHED_ORDER = "COALESCE(p.published_at, p.created_at) DESC, p.id";

function mapPost(r: Row, tags: Tag[]): PostWithRelations {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    excerpt: String(r.excerpt ?? ""),
    bodyHtml: String(r.body_html ?? ""),
    coverUrl: str(r.cover_url),
    categoryId: str(r.category_id),
    tagIds: tags.map((t) => t.id),
    status: r.status as PostWithRelations["status"],
    featured: Boolean(r.featured),
    seoTitle: str(r.seo_title),
    seoDescription: str(r.seo_description),
    publishedAt: str(r.published_at),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    category: r.c_id ? { id: String(r.c_id), name: String(r.c_name), slug: String(r.c_slug) } : null,
    tags,
  };
}

/**
 * Cloudflare D1 (SQLite) implementation of BlogRepository. Search uses an FTS5
 * table (`posts_fts`) that this class keeps in sync on every post write.
 */
export class D1Repository implements BlogRepository {
  constructor(private db: SqlDatabase) {}

  // -- helpers --------------------------------------------------------------

  private async rows(sql: string, ...params: unknown[]): Promise<Row[]> {
    const stmt = params.length ? this.db.prepare(sql).bind(...params) : this.db.prepare(sql);
    return (await stmt.all<Row>()).results;
  }

  private async row(sql: string, ...params: unknown[]): Promise<Row | null> {
    const stmt = params.length ? this.db.prepare(sql).bind(...params) : this.db.prepare(sql);
    return stmt.first<Row>();
  }

  /** Attach tags to post rows with a single query. */
  private async hydrate(rows: Row[]): Promise<PostWithRelations[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => String(r.id));
    const tagRows = await this.rows(
      `SELECT pt.post_id AS post_id, t.id, t.name, t.slug
       FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.post_id IN (SELECT value FROM json_each(?))
       ORDER BY t.name COLLATE NOCASE`,
      JSON.stringify(ids),
    );
    const byPost = new Map<string, Tag[]>();
    for (const t of tagRows) {
      const list = byPost.get(String(t.post_id)) ?? [];
      list.push(mapTag(t));
      byPost.set(String(t.post_id), list);
    }
    return rows.map((r) => mapPost(r, byPost.get(String(r.id)) ?? []));
  }

  private async uniqueSlugFor(table: "posts" | "pages" | "categories" | "tags", text: string): Promise<string> {
    const base = uniqueSlug(text, []);
    const taken = await this.rows(`SELECT slug FROM ${table} WHERE slug = ? OR slug LIKE ?`, base, `${base}-%`);
    return uniqueSlug(text, taken.map((r) => String(r.slug)));
  }

  /** Statements that rebuild a post's row in the search index. */
  private ftsSync(postId: string): SqlStatement[] {
    return [
      this.db.prepare("DELETE FROM posts_fts WHERE post_id = ?").bind(postId),
      this.db
        .prepare(
          `INSERT INTO posts_fts (title, excerpt, body_text, tags, post_id)
           SELECT p.title, p.excerpt, p.body_text,
                  COALESCE((SELECT group_concat(t.name, ' ') FROM post_tags pt
                            JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), ''),
                  p.id
           FROM posts p WHERE p.id = ?`,
        )
        .bind(postId),
    ];
  }

  private tagStatements(postId: string, tagIds: string[]): SqlStatement[] {
    return [
      this.db.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId),
      ...[...new Set(tagIds)].map((tagId) =>
        this.db.prepare("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)").bind(postId, tagId),
      ),
    ];
  }

  private publishedFilter(opts: ListPostsOptions): { where: string; params: unknown[] } {
    let where = "p.status = 'published'";
    const params: unknown[] = [];
    if (opts.categorySlug) {
      where += " AND c.slug = ?";
      params.push(opts.categorySlug);
    }
    if (opts.tagSlug) {
      where += ` AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
                             WHERE pt.post_id = p.id AND t.slug = ?)`;
      params.push(opts.tagSlug);
    }
    return { where, params };
  }

  // -- posts (public) -------------------------------------------------------

  async listPublished(opts: ListPostsOptions = {}): Promise<PostWithRelations[]> {
    const { where, params } = this.publishedFilter(opts);
    const rows = await this.rows(
      `${POST_FROM} WHERE ${where} ORDER BY ${PUBLISHED_ORDER} LIMIT ? OFFSET ?`,
      ...params,
      opts.limit ?? -1,
      opts.offset ?? 0,
    );
    return this.hydrate(rows);
  }

  async countPublished(opts: ListPostsOptions = {}): Promise<number> {
    const { where, params } = this.publishedFilter(opts);
    const r = await this.row(
      `SELECT COUNT(*) AS n FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE ${where}`,
      ...params,
    );
    return Number(r?.n ?? 0);
  }

  async getPublishedBySlug(slug: string): Promise<PostWithRelations | null> {
    const r = await this.row(`${POST_FROM} WHERE p.slug = ? AND p.status = 'published'`, slug);
    return r ? (await this.hydrate([r]))[0] : null;
  }

  async getFeatured(): Promise<PostWithRelations | null> {
    const r = await this.row(
      `${POST_FROM} WHERE p.status = 'published' ORDER BY p.featured DESC, ${PUBLISHED_ORDER} LIMIT 1`,
    );
    return r ? (await this.hydrate([r]))[0] : null;
  }

  async relatedPosts(post: PostWithRelations, limit = 3): Promise<PostWithRelations[]> {
    const rows = await this.rows(
      `SELECT * FROM (
         SELECT p.*, c.id AS c_id, c.name AS c_name, c.slug AS c_slug,
           (CASE WHEN p.category_id = ? THEN 2 ELSE 0 END)
           + (SELECT COUNT(*) FROM post_tags pt WHERE pt.post_id = p.id
                AND pt.tag_id IN (SELECT value FROM json_each(?))) AS score
         FROM posts p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'published' AND p.id != ?
       ) WHERE score > 0
       ORDER BY score DESC, COALESCE(published_at, created_at) DESC
       LIMIT ?`,
      post.categoryId,
      JSON.stringify(post.tagIds),
      post.id,
      limit,
    );
    return this.hydrate(rows);
  }

  async recordView(postId: string): Promise<void> {
    await this.db.prepare("UPDATE posts SET views = views + 1 WHERE id = ? AND status = 'published'").bind(postId).run();
  }

  async listMostRead(limit: number, excludeIds: string[] = []): Promise<PostWithRelations[]> {
    const rows = await this.rows(
      `${POST_FROM}
       WHERE p.status = 'published' AND p.id NOT IN (SELECT value FROM json_each(?))
       ORDER BY p.views DESC, ${PUBLISHED_ORDER}
       LIMIT ?`,
      JSON.stringify(excludeIds),
      limit,
    );
    return this.hydrate(rows);
  }

  async searchPublished(query: string): Promise<PostWithRelations[]> {
    const match = toFtsQuery(query);
    if (!match) return [];
    const rows = await this.rows(
      `SELECT p.*, c.id AS c_id, c.name AS c_name, c.slug AS c_slug
       FROM posts_fts
       JOIN posts p ON p.id = posts_fts.post_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE posts_fts MATCH ? AND p.status = 'published'
       ORDER BY bm25(posts_fts, 5.0, 2.0, 1.0, 3.0, 0.0)
       LIMIT 50`,
      match,
    );
    return this.hydrate(rows);
  }

  // -- posts (admin) --------------------------------------------------------

  async listAllPosts(): Promise<PostWithRelations[]> {
    return this.hydrate(await this.rows(`${POST_FROM} ORDER BY p.updated_at DESC`));
  }

  async getPostById(id: string): Promise<PostWithRelations | null> {
    const r = await this.row(`${POST_FROM} WHERE p.id = ?`, id);
    return r ? (await this.hydrate([r]))[0] : null;
  }

  async createPost(input: CreatePostInput): Promise<PostWithRelations> {
    const id = newId();
    const ts = now();
    const status = input.status ?? "draft";
    const slug = await this.uniqueSlugFor("posts", input.title);
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO posts (id, slug, title, excerpt, body_html, body_text, cover_url, category_id,
             status, featured, seo_title, seo_description, published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          slug,
          input.title,
          input.excerpt?.trim() || excerptFromHtml(input.bodyHtml),
          input.bodyHtml,
          stripHtml(input.bodyHtml),
          input.coverUrl ?? null,
          input.categoryId ?? null,
          status,
          input.featured ? 1 : 0,
          input.seoTitle ?? null,
          input.seoDescription ?? null,
          status === "published" ? ts : null,
          ts,
          ts,
        ),
      ...this.tagStatements(id, input.tagIds ?? []),
      ...this.ftsSync(id),
    ]);
    return (await this.getPostById(id))!;
  }

  async updatePost(id: string, input: Partial<CreatePostInput>): Promise<PostWithRelations> {
    const cur = await this.getPostById(id);
    if (!cur) throw new Error(`Post ${id} not found`);

    const bodyHtml = input.bodyHtml ?? cur.bodyHtml;
    const status = input.status ?? cur.status;
    const publishedAt = status === "published" && !cur.publishedAt ? now() : cur.publishedAt;
    const excerpt =
      input.excerpt !== undefined ? input.excerpt.trim() || excerptFromHtml(bodyHtml) : cur.excerpt;

    await this.db.batch([
      this.db
        .prepare(
          `UPDATE posts SET title = ?, excerpt = ?, body_html = ?, body_text = ?, cover_url = ?,
             category_id = ?, status = ?, featured = ?, seo_title = ?, seo_description = ?,
             published_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          input.title ?? cur.title,
          excerpt,
          bodyHtml,
          stripHtml(bodyHtml),
          input.coverUrl !== undefined ? input.coverUrl : cur.coverUrl,
          input.categoryId !== undefined ? input.categoryId : cur.categoryId,
          status,
          (input.featured ?? cur.featured) ? 1 : 0,
          input.seoTitle !== undefined ? input.seoTitle : cur.seoTitle,
          input.seoDescription !== undefined ? input.seoDescription : cur.seoDescription,
          publishedAt,
          now(),
          id,
        ),
      ...(input.tagIds !== undefined ? this.tagStatements(id, input.tagIds) : []),
      ...this.ftsSync(id),
    ]);
    return (await this.getPostById(id))!;
  }

  async deletePost(id: string): Promise<void> {
    // post_tags and comments go via ON DELETE CASCADE.
    await this.db.batch([
      this.db.prepare("DELETE FROM posts_fts WHERE post_id = ?").bind(id),
      this.db.prepare("DELETE FROM posts WHERE id = ?").bind(id),
    ]);
  }

  // -- taxonomy -------------------------------------------------------------

  async listCategories(): Promise<Category[]> {
    return (await this.rows("SELECT * FROM categories ORDER BY name COLLATE NOCASE")).map(mapCategory);
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const r = await this.row("SELECT * FROM categories WHERE slug = ?", slug);
    return r ? mapCategory(r) : null;
  }

  async createCategory(name: string): Promise<Category> {
    const existing = await this.row("SELECT * FROM categories WHERE lower(name) = lower(?)", name.trim());
    if (existing) return mapCategory(existing);
    const cat: Category = { id: newId(), name: name.trim(), slug: await this.uniqueSlugFor("categories", name) };
    await this.db.prepare("INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)").bind(cat.id, cat.name, cat.slug).run();
    return cat;
  }

  async listTags(): Promise<Tag[]> {
    return (await this.rows("SELECT * FROM tags ORDER BY name COLLATE NOCASE")).map(mapTag);
  }

  async getTagBySlug(slug: string): Promise<Tag | null> {
    const r = await this.row("SELECT * FROM tags WHERE slug = ?", slug);
    return r ? mapTag(r) : null;
  }

  async ensureTags(names: string[]): Promise<Tag[]> {
    const result: Tag[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const existing = await this.row("SELECT * FROM tags WHERE lower(name) = lower(?)", name);
      if (existing) {
        result.push(mapTag(existing));
        continue;
      }
      const tag: Tag = { id: newId(), name, slug: await this.uniqueSlugFor("tags", name) };
      await this.db.prepare("INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)").bind(tag.id, tag.name, tag.slug).run();
      result.push(tag);
    }
    return result;
  }

  // -- pages ----------------------------------------------------------------

  async listMenuPages(): Promise<Page[]> {
    return (
      await this.rows(
        "SELECT * FROM pages WHERE status = 'published' AND show_in_menu = 1 ORDER BY menu_order, title COLLATE NOCASE",
      )
    ).map(mapPage);
  }

  async listAllPages(): Promise<Page[]> {
    return (await this.rows("SELECT * FROM pages ORDER BY menu_order, title COLLATE NOCASE")).map(mapPage);
  }

  async getPublishedPageBySlug(slug: string): Promise<Page | null> {
    const r = await this.row("SELECT * FROM pages WHERE slug = ? AND status = 'published'", slug);
    return r ? mapPage(r) : null;
  }

  async getPageById(id: string): Promise<Page | null> {
    const r = await this.row("SELECT * FROM pages WHERE id = ?", id);
    return r ? mapPage(r) : null;
  }

  async createPage(input: { title: string; bodyHtml: string; status?: Page["status"]; showInMenu?: boolean; menuOrder?: number }): Promise<Page> {
    const id = newId();
    const ts = now();
    const slug = await this.uniqueSlugFor("pages", input.title);
    const order = input.menuOrder ?? Number((await this.row("SELECT COUNT(*) AS n FROM pages"))?.n ?? 0);
    await this.db
      .prepare(
        `INSERT INTO pages (id, slug, title, body_html, status, show_in_menu, menu_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, slug, input.title, input.bodyHtml, input.status ?? "draft", (input.showInMenu ?? true) ? 1 : 0, order, ts, ts)
      .run();
    return (await this.getPageById(id))!;
  }

  async updatePage(id: string, input: Partial<{ title: string; bodyHtml: string; status: Page["status"]; showInMenu: boolean; menuOrder: number }>): Promise<Page> {
    const cur = await this.getPageById(id);
    if (!cur) throw new Error(`Page ${id} not found`);
    await this.db
      .prepare(
        `UPDATE pages SET title = ?, body_html = ?, status = ?, show_in_menu = ?, menu_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.title ?? cur.title,
        input.bodyHtml ?? cur.bodyHtml,
        input.status ?? cur.status,
        (input.showInMenu ?? cur.showInMenu) ? 1 : 0,
        input.menuOrder ?? cur.menuOrder,
        now(),
        id,
      )
      .run();
    return (await this.getPageById(id))!;
  }

  async deletePage(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM pages WHERE id = ?").bind(id).run();
  }

  // -- comments -------------------------------------------------------------

  async listApprovedForPost(postId: string): Promise<Comment[]> {
    return (
      await this.rows("SELECT * FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at", postId)
    ).map(mapComment);
  }

  async listCommentsByStatus(status: CommentStatus): Promise<Comment[]> {
    return (await this.rows("SELECT * FROM comments WHERE status = ? ORDER BY created_at DESC", status)).map(mapComment);
  }

  async listCommentsForPostAdmin(postId: string): Promise<Comment[]> {
    return (await this.rows("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at", postId)).map(mapComment);
  }

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const comment: Comment = {
      id: newId(),
      postId: input.postId,
      parentId: input.parentId,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      body: input.body,
      status: input.isAuthor ? "approved" : "pending",
      isAuthor: input.isAuthor ?? false,
      createdAt: now(),
    };
    await this.db
      .prepare(
        `INSERT INTO comments (id, post_id, parent_id, author_name, author_email, body, status, is_author, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        comment.id,
        comment.postId,
        comment.parentId,
        comment.authorName,
        comment.authorEmail,
        comment.body,
        comment.status,
        comment.isAuthor ? 1 : 0,
        comment.createdAt,
      )
      .run();
    return comment;
  }

  async setCommentStatus(id: string, status: CommentStatus): Promise<void> {
    await this.db.prepare("UPDATE comments SET status = ? WHERE id = ?").bind(status, id).run();
  }

  async deleteComment(id: string): Promise<void> {
    // Replies go via ON DELETE CASCADE on parent_id.
    await this.db.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
  }

  // -- contact + subscribers -----------------------------------------------

  async createMessage(input: { name: string; email: string; body: string }): Promise<ContactMessage> {
    const msg: ContactMessage = { id: newId(), ...input, read: false, createdAt: now() };
    await this.db
      .prepare("INSERT INTO messages (id, name, email, body, read, created_at) VALUES (?, ?, ?, ?, 0, ?)")
      .bind(msg.id, msg.name, msg.email, msg.body, msg.createdAt)
      .run();
    return msg;
  }

  async listMessages(): Promise<ContactMessage[]> {
    return (await this.rows("SELECT * FROM messages ORDER BY created_at DESC")).map(mapMessage);
  }

  async markMessageRead(id: string, read: boolean): Promise<void> {
    await this.db.prepare("UPDATE messages SET read = ? WHERE id = ?").bind(read ? 1 : 0, id).run();
  }

  async addSubscriber(email: string): Promise<{ created: boolean }> {
    const r = await this.db
      .prepare("INSERT INTO subscribers (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING")
      .bind(newId(), email.trim().toLowerCase(), now())
      .run();
    return { created: (r.meta.changes ?? 0) > 0 };
  }

  async listSubscribers(): Promise<Subscriber[]> {
    return (await this.rows("SELECT * FROM subscribers ORDER BY created_at DESC")).map((r) => ({
      id: String(r.id),
      email: String(r.email),
      createdAt: String(r.created_at),
    }));
  }

  // -- settings -------------------------------------------------------------

  async getSettings(): Promise<SiteSettings> {
    const r = await this.row("SELECT * FROM settings WHERE id = 1");
    if (!r) throw new Error("Settings row missing — has the migration been applied?");
    return mapSettings(r);
  }

  async updateSettings(settings: Partial<SiteSettings>): Promise<SiteSettings> {
    const cur = await this.getSettings();
    const next = { ...cur, ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined)) };
    await this.db
      .prepare("UPDATE settings SET title = ?, tagline = ?, description = ?, author_name = ?, author_photo_url = ? WHERE id = 1")
      .bind(next.title, next.tagline, next.description, next.authorName, next.authorPhotoUrl ?? null)
      .run();
    return next;
  }

  // -- login rate limiting --------------------------------------------------

  async recordLoginFailure(ip: string): Promise<void> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await this.db.batch([
      this.db.prepare("INSERT INTO login_attempts (ip, created_at) VALUES (?, ?)").bind(ip, now()),
      this.db.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(dayAgo),
    ]);
  }

  async countLoginFailuresSince(ip: string, sinceIso: string): Promise<number> {
    const r = await this.row("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND created_at >= ?", ip, sinceIso);
    return Number(r?.n ?? 0);
  }

  async clearLoginFailures(ip: string): Promise<void> {
    await this.db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
  }

  // -- seeding (tests / starter content) -----------------------------------

  /** Insert seed data, preserving its ids. Intended for empty databases. */
  async importSeed(seed: SeedData): Promise<void> {
    const stmts: SqlStatement[] = [];
    for (const c of seed.categories ?? []) {
      stmts.push(this.db.prepare("INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)").bind(c.id, c.name, c.slug));
    }
    for (const t of seed.tags ?? []) {
      stmts.push(this.db.prepare("INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)").bind(t.id, t.name, t.slug));
    }
    for (const p of seed.posts ?? []) {
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO posts (id, slug, title, excerpt, body_html, body_text, cover_url, category_id,
               status, featured, seo_title, seo_description, published_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            p.id, p.slug, p.title, p.excerpt, p.bodyHtml, stripHtml(p.bodyHtml), p.coverUrl, p.categoryId,
            p.status, p.featured ? 1 : 0, p.seoTitle, p.seoDescription, p.publishedAt, p.createdAt, p.updatedAt,
          ),
        ...this.tagStatements(p.id, p.tagIds),
        ...this.ftsSync(p.id),
      );
    }
    for (const pg of seed.pages ?? []) {
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO pages (id, slug, title, body_html, status, show_in_menu, menu_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(pg.id, pg.slug, pg.title, pg.bodyHtml, pg.status, pg.showInMenu ? 1 : 0, pg.menuOrder, pg.createdAt, pg.updatedAt),
      );
    }
    for (const c of seed.comments ?? []) {
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO comments (id, post_id, parent_id, author_name, author_email, body, status, is_author, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(c.id, c.postId, c.parentId, c.authorName, c.authorEmail, c.body, c.status, c.isAuthor ? 1 : 0, c.createdAt),
      );
    }
    if (stmts.length) await this.db.batch(stmts);
    if (seed.settings) await this.updateSettings(seed.settings);
  }
}
