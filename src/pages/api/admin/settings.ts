import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  await repoFrom(locals).updateSettings({
    title: String(form.get("title") ?? "").trim() || undefined,
    tagline: String(form.get("tagline") ?? "").trim(),
    description: String(form.get("description") ?? "").trim() || undefined,
    authorName: String(form.get("author_name") ?? "").trim() || undefined,
    authorPhotoUrl: String(form.get("author_photo_url") ?? "").trim() || null,
  });
  return new Response(null, { status: 303, headers: { Location: "/admin/settings?saved=1" } });
};
