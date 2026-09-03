import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete("ps_session", { path: "/" });
  return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
};
