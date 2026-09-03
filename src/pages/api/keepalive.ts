import type { APIRoute } from "astro";
import { repoFrom, envFrom } from "@/lib/context";

export const prerender = false;

/**
 * Lightweight endpoint hit by a Cloudflare Cron trigger so the Supabase free
 * project never reaches its inactivity pause. Protected by a shared secret.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const env = envFrom(locals);
  const secret = env.KEEPALIVE_SECRET;
  const provided = new URL(request.url).searchParams.get("key");
  if (secret && provided !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    // A trivial read keeps the database warm.
    await repoFrom(locals).countPublished();
    return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
