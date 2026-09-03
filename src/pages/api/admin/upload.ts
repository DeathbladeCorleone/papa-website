import type { APIRoute } from "astro";
import { envFrom } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase";

export const prerender = false;

const BUCKET = "media";

/**
 * Receives an image (already compressed to WebP client-side) and stores it.
 * In production it goes to the Supabase Storage `media` bucket and a public URL
 * is returned. Without Supabase (local preview) it is returned as a data URL so
 * the editor still works.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "No file provided" }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "image/webp";

  const env = envFrom(locals);
  const hasSupabase =
    env.PUBLIC_SUPABASE_URL &&
    !env.PUBLIC_SUPABASE_URL.includes("YOUR-PROJECT") &&
    env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasSupabase) {
    const b64 = Buffer.from(bytes).toString("base64");
    return json({ url: `data:${contentType};base64,${b64}` });
  }

  try {
    const admin = createAdminClient({
      url: env.PUBLIC_SUPABASE_URL!,
      anonKey: env.PUBLIC_SUPABASE_ANON_KEY ?? "",
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });
    const ext = contentType.split("/")[1] ?? "webp";
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `posts/${name}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) return json({ error: error.message }, 500);
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return json({ url: data.publicUrl });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
