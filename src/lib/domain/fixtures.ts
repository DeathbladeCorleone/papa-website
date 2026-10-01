import type { PostWithRelations, SiteSettings, Category, Tag } from "./types";

export const testSite: SiteSettings = {
  title: "Pradeep Singh",
  tagline: "Essays and reflections",
  description: "Writing on a variety of topics by Pradeep Singh.",
  authorName: "Pradeep Singh",
  authorPhotoUrl: null,
};

export function makeCategory(p: Partial<Category> & { id: string }): Category {
  return { name: "General", slug: "general", ...p };
}

export function makeTag(p: Partial<Tag> & { id: string }): Tag {
  return { name: "Life", slug: "life", ...p };
}

export function makePost(
  p: Partial<PostWithRelations> & { id: string },
): PostWithRelations {
  return {
    slug: p.slug ?? p.id,
    title: "Untitled",
    excerpt: "",
    bodyHtml: "<p>Body</p>",
    coverUrl: null,
    categoryId: null,
    tagIds: [],
    status: "published",
    featured: false,
    seoTitle: null,
    seoDescription: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    category: null,
    tags: [],
    ...p,
  };
}
