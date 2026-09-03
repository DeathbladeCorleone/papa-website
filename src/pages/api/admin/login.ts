import type { APIRoute } from "astro";
import { signIn } from "@/lib/auth";
import { envFrom } from "@/lib/context";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url, locals }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  const result = await signIn(email, password, envFrom(locals));
  if (!result) {
    return new Response(null, { status: 303, headers: { Location: "/admin/login?error=1" } });
  }

  cookies.set("ps_session", result.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 7,
  });
  return new Response(null, { status: 303, headers: { Location: "/admin" } });
};
