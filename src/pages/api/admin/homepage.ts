import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";
import { normalizeHomeLayout } from "@/lib/domain/home";
import { isLive } from "@/lib/domain/schedule";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** { layout: HomeLayout, featuredId: string | null } — null lets the newest essay lead. */
export const POST: APIRoute = async ({ request, locals }) => {
  const repo = repoFrom(locals);
  const body = (await request.json().catch(() => null)) as { layout?: unknown; featuredId?: string | null; authorPhotoUrl?: string | null } | null;
  if (!body) return json({ error: "Invalid request" }, 400);
  if (body.featuredId) {
    const post = await repo.getPostById(body.featuredId);
    if (!post || !isLive(post)) return json({ error: "Only a published essay can lead the home page." }, 400);
  }
  const settings = await repo.updateSettings({
    homeLayout: normalizeHomeLayout(body.layout),
    ...(body.authorPhotoUrl !== undefined ? { authorPhotoUrl: (body.authorPhotoUrl ?? "").trim() || null } : {}),
  });
  if (body.featuredId !== undefined) await repo.setFeaturedPost(body.featuredId || null);
  return json({ ok: true, layout: settings.homeLayout });
};
