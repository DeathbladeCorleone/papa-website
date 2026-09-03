import { defineMiddleware } from "astro:middleware";
import { verifySession } from "@/lib/auth";
import { envFrom } from "@/lib/context";

const COOKIE = "ps_session";

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals } = context;
  locals.admin = null;

  const isAdminArea =
    url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin");
  if (!isAdminArea) return next();

  const token = cookies.get(COOKIE)?.value;
  const admin = token ? await verifySession(token, envFrom(locals)) : null;
  locals.admin = admin;

  const isLoginRoute =
    url.pathname === "/admin/login" || url.pathname === "/api/admin/login";

  if (!admin && !isLoginRoute) {
    if (url.pathname.startsWith("/api/")) {
      return new Response("Unauthorized", { status: 401 });
    }
    return context.redirect("/admin/login");
  }

  return next();
});
