import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const honeypot = String(form.get("website") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const body = String(form.get("body") ?? "").trim();

  // Bots: silently accept without storing.
  if (honeypot) return redirect("/contact?sent=1");

  if (name.length < 2 || !EMAIL_RE.test(email) || body.length < 2 || body.length > 5000) {
    return redirect("/contact?sent=error");
  }

  try {
    await repoFrom(locals).createMessage({ name, email, body });
    return redirect("/contact?sent=1");
  } catch {
    return redirect("/contact?sent=error");
  }
};

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
