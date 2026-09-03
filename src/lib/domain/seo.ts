import type { PostWithRelations, SiteSettings } from "./types";
import { excerptFromHtml } from "./excerpt";

export interface MetaTags {
  title: string;
  description: string;
  canonical: string;
  ogType: "website" | "article";
  image: string | null;
  publishedTime?: string;
}

function joinUrl(site: string, path: string): string {
  return `${site.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Resolve the effective SEO title/description for a post (override -> derived). */
export function postSeo(post: PostWithRelations): { title: string; description: string } {
  return {
    title: post.seoTitle?.trim() || post.title,
    description:
      post.seoDescription?.trim() || post.excerpt?.trim() || excerptFromHtml(post.bodyHtml),
  };
}

/** Meta tags for a single article page. */
export function articleMeta(
  post: PostWithRelations,
  site: SiteSettings,
  siteUrl: string,
): MetaTags {
  const seo = postSeo(post);
  return {
    title: `${seo.title} — ${site.title}`,
    description: seo.description,
    canonical: joinUrl(siteUrl, `/blog/${post.slug}`),
    ogType: "article",
    image: post.coverUrl,
    publishedTime: post.publishedAt ?? undefined,
  };
}

/** Meta tags for a generic (non-article) page. */
export function pageMeta(
  opts: { title?: string; description?: string; path: string },
  site: SiteSettings,
  siteUrl: string,
): MetaTags {
  return {
    title: opts.title ? `${opts.title} — ${site.title}` : site.title,
    description: opts.description || site.description,
    canonical: joinUrl(siteUrl, opts.path),
    ogType: "website",
    image: null,
  };
}

/** JSON-LD BlogPosting schema for an article, as a stringifiable object. */
export function articleJsonLd(
  post: PostWithRelations,
  site: SiteSettings,
  siteUrl: string,
): Record<string, unknown> {
  const seo = postSeo(post);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: seo.title,
    description: seo.description,
    author: { "@type": "Person", name: site.authorName },
    ...(post.coverUrl ? { image: post.coverUrl } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    mainEntityOfPage: joinUrl(siteUrl, `/blog/${post.slug}`),
    publisher: { "@type": "Organization", name: site.title },
  };
}
