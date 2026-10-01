import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";
import type { BlogRepository, CreatePostInput } from "@/lib/repositories/types";
import { parsePublishDate, postState } from "@/lib/domain/schedule";
import type { PostWithRelations } from "@/lib/domain/types";

export const prerender = false;

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Go back to the admin page the form was on (keeps list filters), else the essays list. */
function backTo(request: Request, flag: string): string {
  const ref = request.headers.get("referer");
  let path = "/admin/posts";
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.origin === new URL(request.url).origin && u.pathname.startsWith("/admin")) path = u.pathname + u.search;
    } catch { /* ignore */ }
  }
  return path + (path.includes("?") ? "&" : "?") + flag + "=1";
}

/** What the editor needs back after a save. */
function postPayload(p: PostWithRelations) {
  return { ...p, state: postState(p) };
}

/** JSON body sent by the editor. */
interface SaveBody {
  id?: string;
  title?: string;
  bodyHtml?: string;
  excerpt?: string;
  coverUrl?: string | null;
  categoryId?: string | null;
  newCategory?: string;
  tags?: string[];
  featured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  status?: "draft" | "published";
  /** ISO time; future = scheduled. null = "now" on first publish. */
  publishedAt?: string | null;
  /** Keep the current version in History first (used when restoring an old version). */
  forceRevision?: boolean;
}

async function saveFromJson(repo: BlogRepository, body: SaveBody) {
  let categoryId = body.categoryId === undefined ? undefined : body.categoryId || null;
  if (body.newCategory?.trim()) categoryId = (await repo.createCategory(body.newCategory.trim())).id;
  const tagIds = body.tags ? (await repo.ensureTags(body.tags.map((t) => t.trim()).filter(Boolean))).map((t) => t.id) : undefined;

  const input: Partial<CreatePostInput> = {
    title: body.title === undefined ? undefined : body.title.trim() || "Untitled",
    bodyHtml: body.bodyHtml,
    excerpt: body.excerpt,
    coverUrl: body.coverUrl === undefined ? undefined : body.coverUrl || null,
    categoryId,
    tagIds,
    featured: body.featured,
    seoTitle: body.seoTitle === undefined ? undefined : body.seoTitle?.trim() || null,
    seoDescription: body.seoDescription === undefined ? undefined : body.seoDescription?.trim() || null,
    status: body.status,
    publishedAt: body.publishedAt === undefined ? undefined : parsePublishDate(body.publishedAt),
  };
  // Drop undefined keys so a partial save leaves other fields alone.
  for (const k of Object.keys(input) as (keyof CreatePostInput)[]) if (input[k] === undefined) delete input[k];

  let saved = body.id
    ? await repo.updatePost(body.id, input, { forceRevision: body.forceRevision })
    : await repo.createPost({ title: "Untitled", bodyHtml: "", ...input } as CreatePostInput);
  // Only one essay can lead the home page.
  if (body.featured === true) {
    await repo.setFeaturedPost(saved.id);
    saved = (await repo.getPostById(saved.id))!;
  }
  return saved;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const repo = repoFrom(locals);

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    let body: SaveBody;
    try {
      body = (await request.json()) as SaveBody;
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    if (body.id && !(await repo.getPostById(body.id))) return json({ error: "This essay no longer exists." }, 404);
    try {
      const saved = await saveFromJson(repo, body);
      return json({ post: postPayload(saved), categories: await repo.listCategories() });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Could not save" }, 500);
    }
  }

  // Form actions from the essays list.
  const form = await request.formData();
  const action = String(form.get("_action") ?? "");
  const id = String(form.get("id") ?? "").trim();
  if (!id) return redirect("/admin/posts");

  switch (action) {
    case "delete":
      await repo.deletePost(id);
      return redirect(backTo(request, "deleted").replace(/^\/admin\/posts\/[^/?]+.*$/, "/admin/posts?deleted=1"));
    case "unpublish":
      await repo.updatePost(id, { status: "draft" });
      return redirect(backTo(request, "unpublished"));
    case "publish": {
      const cur = await repo.getPostById(id);
      // "Publish now" means now — even if the draft once had a future date.
      const future = cur?.publishedAt && cur.publishedAt > new Date().toISOString();
      await repo.updatePost(id, { status: "published", ...(future ? { publishedAt: new Date().toISOString() } : {}) });
      return redirect(backTo(request, "published"));
    }
    case "feature":
      await repo.setFeaturedPost(id);
      return redirect(backTo(request, "featured"));
    default:
      return redirect("/admin/posts");
  }
};
