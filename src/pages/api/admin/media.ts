import type { APIRoute } from "astro";
import { mediaFrom, repoFrom } from "@/lib/context";
import { mediaUsage } from "@/lib/domain/media-usage";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The photo library, each item with the essays/pages that show it. */
export const GET: APIRoute = async ({ locals }) => {
  const repo = repoFrom(locals);
  const [items, posts, pages, settings] = await Promise.all([
    repo.listMedia(),
    repo.listAllPosts(),
    repo.listAllPages(),
    repo.getSettings(),
  ]);
  const usage = mediaUsage(items.map((m) => m.url), posts, pages, settings);
  return json({ items: items.map((m) => ({ ...m, usedIn: usage[m.url] ?? [] })) });
};

/** { action: "alt", key, alt } or { action: "delete", key } */
export const POST: APIRoute = async ({ request, locals }) => {
  const repo = repoFrom(locals);
  const body = (await request.json().catch(() => ({}))) as { action?: string; key?: string; alt?: string };
  const key = String(body.key ?? "");
  const item = key ? await repo.getMedia(key) : null;
  if (!item) return json({ error: "Photo not found" }, 404);

  if (body.action === "alt") {
    await repo.updateMediaAlt(key, String(body.alt ?? "").slice(0, 200));
    return json({ ok: true });
  }
  if (body.action === "delete") {
    await mediaFrom(locals)?.delete(key);
    await repo.deleteMedia(key);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
};
