import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";
import type { CreatePostInput } from "@/lib/repositories/types";

export const prerender = false;

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const repo = repoFrom(locals);
  const form = await request.formData();
  const action = String(form.get("_action") ?? "save");
  const id = String(form.get("id") ?? "").trim();

  if (action === "delete") {
    if (id) await repo.deletePost(id);
    return redirect("/admin/posts?deleted=1");
  }

  if (action === "unpublish" && id) {
    await repo.updatePost(id, { status: "draft" });
    return redirect("/admin/posts?updated=1");
  }
  if (action === "publish" && id) {
    await repo.updatePost(id, { status: "published" });
    return redirect("/admin/posts?updated=1");
  }

  // Save (create or update)
  const title = String(form.get("title") ?? "").trim();
  if (!title) return redirect(id ? `/admin/posts/${id}?error=title` : "/admin/posts/new?error=title");

  // Resolve category: existing id, or create from a typed name.
  let categoryId: string | null = String(form.get("category_id") ?? "") || null;
  const newCategory = String(form.get("new_category") ?? "").trim();
  if (newCategory) {
    const cat = await repo.createCategory(newCategory);
    categoryId = cat.id;
  }

  // Tags: comma-separated -> ensure they exist -> ids.
  const tagNames = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tags = await repo.ensureTags(tagNames);

  const input: CreatePostInput = {
    title,
    bodyHtml: String(form.get("body_html") ?? ""),
    excerpt: String(form.get("excerpt") ?? ""),
    coverUrl: String(form.get("cover_url") ?? "") || null,
    categoryId,
    tagIds: tags.map((t) => t.id),
    status: String(form.get("status") ?? "draft") === "published" ? "published" : "draft",
    featured: form.get("featured") != null,
    seoTitle: String(form.get("seo_title") ?? "").trim() || null,
    seoDescription: String(form.get("seo_description") ?? "").trim() || null,
  };

  const saved = id ? await repo.updatePost(id, input) : await repo.createPost(input);
  return redirect(`/admin/posts/${saved.id}?saved=1`);
};
