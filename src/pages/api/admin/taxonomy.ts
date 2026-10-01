import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface Body {
  action?: "rename" | "delete" | "merge" | "create" | "menu";
  kind?: "category" | "tag";
  id?: string;
  name?: string;
  into?: string;
  /** action "menu": page ids in menu order, and which of them are shown. */
  order?: string[];
  shown?: string[];
}

/** Categories, tags and the order of pages in the menu. */
export const POST: APIRoute = async ({ request, locals }) => {
  const repo = repoFrom(locals);
  const b = (await request.json().catch(() => null)) as Body | null;
  if (!b?.action) return json({ error: "Invalid request" }, 400);
  try {
    if (b.action === "menu") {
      const order = (b.order ?? []).filter((x): x is string => typeof x === "string");
      await repo.reorderPages(order);
      const shown = new Set(b.shown ?? []);
      for (const id of order) {
        const page = await repo.getPageById(id);
        if (page && page.showInMenu !== shown.has(id)) await repo.updatePage(id, { showInMenu: shown.has(id) });
      }
      return json({ ok: true });
    }
    const name = (b.name ?? "").trim().slice(0, 60);
    if (b.action === "create") {
      if (!name) return json({ error: "Please type a name." }, 400);
      const item = b.kind === "tag" ? (await repo.ensureTags([name]))[0] : await repo.createCategory(name);
      return json({ ok: true, item });
    }
    if (!b.id) return json({ error: "Missing id" }, 400);
    const isTag = b.kind === "tag";
    switch (b.action) {
      case "rename":
        if (!name) return json({ error: "The name can't be empty." }, 400);
        return json({ ok: true, item: isTag ? await repo.renameTag(b.id, name) : await repo.renameCategory(b.id, name) });
      case "delete":
        await (isTag ? repo.deleteTag(b.id) : repo.deleteCategory(b.id));
        return json({ ok: true });
      case "merge":
        if (!b.into || b.into === b.id) return json({ error: "Choose another one to merge into." }, 400);
        await (isTag ? repo.mergeTag(b.id, b.into) : repo.mergeCategory(b.id, b.into));
        return json({ ok: true });
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
};
