import type { APIRoute } from "astro";
import { authConfig, signIn, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { envFrom, repoFrom } from "@/lib/context";

export const prerender = false;

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export const POST: APIRoute = async ({ request, cookies, url, locals }) => {
  const cfg = authConfig(envFrom(locals), import.meta.env.DEV);
  if (!cfg) return redirect("/admin/login?error=config");

  const repo = repoFrom(locals);
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  if ((await repo.countLoginFailuresSince(ip, since)) >= MAX_FAILURES) {
    return redirect("/admin/login?error=locked");
  }

  const form = await request.formData();
  const token = await signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""), cfg);
  if (!token) {
    await repo.recordLoginFailure(ip);
    return redirect("/admin/login?error=1");
  }

  await repo.clearLoginFailures(ip);
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: url.protocol === "https:",
    maxAge: SESSION_TTL_SECONDS,
  });
  return redirect("/admin");
};
