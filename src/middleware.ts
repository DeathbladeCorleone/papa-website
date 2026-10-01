import { defineMiddleware } from "astro:middleware";
import { authConfig, verifySession, SESSION_COOKIE } from "@/lib/auth";
import { envFrom } from "@/lib/context";

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals } = context;
  locals.admin = null;

  const isAdminArea = url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin");
  if (!isAdminArea) return next();

  const cfg = authConfig(envFrom(locals), import.meta.env.DEV);
  const token = cookies.get(SESSION_COOKIE)?.value;
  locals.admin = cfg && token ? await verifySession(token, cfg) : null;

  const isLoginRoute = url.pathname === "/admin/login" || url.pathname === "/api/admin/login";
  if (!locals.admin && !isLoginRoute) {
    if (url.pathname.startsWith("/api/")) return new Response("Unauthorized", { status: 401 });
    return context.redirect("/admin/login");
  }

  // Admin pages must never be cached by a shared cache.
  const response = await next();
  response.headers.set("Cache-Control", "no-store");
  return response;
});
