import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";
import type { Page } from "@/lib/domain/types";

export const prerender = false;

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface SaveBody {
  id?: string;
  title?: string;
  bodyHtml?: string;
  status?: Page["status"];
  showInMenu?: boolean;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const repo = repoFrom(locals);

  // The editor saves pages as JSON.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => null)) as SaveBody | null;
    if (!body) return json({ error: "Invalid request" }, 400);
    const input: Partial<{ title: string; bodyHtml: string; status: Page["status"]; showInMenu: boolean }> = {};
    if (body.title !== undefined) input.title = body.title.trim() || "Untitled page";
    if (body.bodyHtml !== undefined) input.bodyHtml = body.bodyHtml;
    if (body.status === "draft" || body.status === "published") input.status = body.status;
    if (body.showInMenu !== undefined) input.showInMenu = Boolean(body.showInMenu);
    try {
      if (body.id && !(await repo.getPageById(body.id))) return json({ error: "This page no longer exists." }, 404);
      const saved = body.id
        ? await repo.updatePage(body.id, input)
        : await repo.createPage({ title: input.title ?? "Untitled page", bodyHtml: input.bodyHtml ?? "", ...input });
      return json({ page: { ...saved, state: saved.status } });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Could not save" }, 500);
    }
  }

  // Form actions from the pages list.
  const form = await request.formData();
  const action = String(form.get("_action") ?? "");
  const id = String(form.get("id") ?? "").trim();
  if (!id) return redirect("/admin/pages");
  if (action === "delete") {
    await repo.deletePage(id);
    return redirect("/admin/pages?deleted=1");
  }
  if (action === "publish" || action === "unpublish") {
    await repo.updatePage(id, { status: action === "publish" ? "published" : "draft" });
    return redirect(`/admin/pages?${action === "publish" ? "published" : "unpublished"}=1`);
  }
  if (action === "menu") {
    await repo.updatePage(id, { showInMenu: form.get("show") === "1" });
    return redirect("/admin/pages?updated=1");
  }
  return redirect("/admin/pages");
};
