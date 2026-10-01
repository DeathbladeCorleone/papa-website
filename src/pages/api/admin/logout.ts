import type { APIRoute } from "astro";
import { SESSION_COOKIE } from "@/lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
};
