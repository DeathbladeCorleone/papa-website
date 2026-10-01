import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const honeypot = String(form.get("website") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  // Only allow same-site relative paths as the return target (no open redirect).
  const rawBack = String(form.get("return_to") ?? "/");
  const back = rawBack.startsWith("/") && !rawBack.startsWith("//") ? rawBack : "/";

  if (honeypot) return redirect(`${back}?subscribed=1#subscribe`);
  if (!EMAIL_RE.test(email)) return redirect(`${back}?subscribed=error#subscribe`);

  try {
    await repoFrom(locals).addSubscriber(email);
    // Always report success — whether newly added or already on the list.
    return redirect(`${back}?subscribed=1#subscribe`);
  } catch {
    return redirect(`${back}?subscribed=error#subscribe`);
  }
};

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
