import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";
import { stripHtml } from "@/lib/domain/html";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** ?post=<id> lists a post's earlier versions; ?id=<revision id> returns one in full. */
export const GET: APIRoute = async ({ url, locals }) => {
  const repo = repoFrom(locals);
  const one = url.searchParams.get("id");
  if (one) {
    const r = await repo.getRevision(one);
    return r ? json({ revision: r }) : json({ error: "Not found" }, 404);
  }
  const postId = url.searchParams.get("post");
  if (!postId) return json({ error: "Missing post" }, 400);
  const list = await repo.listRevisions(postId);
  return json({
    revisions: list.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      words: stripHtml(r.bodyHtml).split(/\s+/).filter(Boolean).length,
    })),
  });
};
