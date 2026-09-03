import type { APIRoute } from "astro";
import { repoFrom, envFrom } from "@/lib/context";
import { siteUrl } from "@/config/site";
import { escapeHtml } from "@/lib/domain/html";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const repo = repoFrom(locals);
  const [settings, posts] = await Promise.all([
    repo.getSettings(),
    repo.listPublished({ limit: 30 }),
  ]);
  const url = siteUrl(envFrom(locals));

  const items = posts
    .map((p) => {
      const link = `${url}/blog/${p.slug}`;
      const date = p.publishedAt ? new Date(p.publishedAt).toUTCString() : "";
      return `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      ${date ? `<pubDate>${date}</pubDate>` : ""}
      ${p.category ? `<category>${escapeHtml(p.category.name)}</category>` : ""}
      <description>${escapeHtml(p.excerpt)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(settings.title)}</title>
    <link>${url}</link>
    <description>${escapeHtml(settings.description)}</description>
    <language>en</language>
    <atom:link href="${url}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
