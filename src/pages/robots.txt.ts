import type { APIRoute } from "astro";
import { envFrom } from "@/lib/context";
import { siteUrl } from "@/config/site";

export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  const url = siteUrl(envFrom(locals));
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${url}/sitemap.xml
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
