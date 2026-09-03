import type { APIRoute } from "astro";
import { repoFrom, envFrom } from "@/lib/context";
import { siteUrl } from "@/config/site";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const repo = repoFrom(locals);
  const url = siteUrl(envFrom(locals));
  const [posts, pages, categories, tags] = await Promise.all([
    repo.listPublished({ limit: 1000 }),
    repo.listMenuPages(),
    repo.listCategories(),
    repo.listTags(),
  ]);

  const urls: { loc: string; lastmod?: string }[] = [
    { loc: `${url}/` },
    { loc: `${url}/blog` },
    { loc: `${url}/search` },
    { loc: `${url}/contact` },
    ...posts.map((p) => ({ loc: `${url}/blog/${p.slug}`, lastmod: p.updatedAt })),
    ...pages.map((p) => ({ loc: `${url}/${p.slug}`, lastmod: p.updatedAt })),
    ...categories.map((c) => ({ loc: `${url}/category/${c.slug}` })),
    ...tags.map((t) => ({ loc: `${url}/tag/${t.slug}` })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ""}</url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
