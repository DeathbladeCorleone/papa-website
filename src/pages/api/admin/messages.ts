import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const read = String(form.get("read") ?? "true") === "true";
  if (id) await repoFrom(locals).markMessageRead(id, read);
  return new Response(null, { status: 303, headers: { Location: "/admin/messages" } });
};
