import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";

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
    if (id) await repo.deletePage(id);
    return redirect("/admin/pages?deleted=1");
  }

  const title = String(form.get("title") ?? "").trim();
  if (!title) return redirect(id ? `/admin/pages/${id}?error=title` : "/admin/pages/new?error=title");

  const input = {
    title,
    bodyHtml: String(form.get("body_html") ?? ""),
    status: (String(form.get("status") ?? "draft") === "published" ? "published" : "draft") as "draft" | "published",
    showInMenu: form.get("show_in_menu") != null,
    menuOrder: Number(form.get("menu_order") ?? "0") || 0,
  };

  const saved = id ? await repo.updatePage(id, input) : await repo.createPage(input);
  return redirect(`/admin/pages/${saved.id}?saved=1`);
};
