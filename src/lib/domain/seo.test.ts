import { describe, it, expect } from "vitest";
import { postSeo, articleMeta, pageMeta, articleJsonLd } from "./seo";
import { makePost, testSite } from "./fixtures";

const SITE_URL = "https://pradeepsingh.pages.dev";

describe("postSeo", () => {
  it("prefers overrides", () => {
    const post = makePost({ id: "1", title: "T", seoTitle: "Override", seoDescription: "Desc" });
    expect(postSeo(post)).toEqual({ title: "Override", description: "Desc" });
  });
  it("falls back to title and excerpt", () => {
    const post = makePost({ id: "1", title: "Real Title", excerpt: "Real excerpt" });
    expect(postSeo(post)).toEqual({ title: "Real Title", description: "Real excerpt" });
  });
  it("derives a description from the body when no excerpt", () => {
    const post = makePost({ id: "1", title: "T", excerpt: "", bodyHtml: "<p>Derived body text.</p>" });
    expect(postSeo(post).description).toBe("Derived body text.");
  });
});

describe("articleMeta", () => {
  it("builds a canonical /blog/<slug> url and article type", () => {
    const post = makePost({ id: "1", slug: "my-essay", title: "My Essay", coverUrl: "https://img/x.webp" });
    const meta = articleMeta(post, testSite, SITE_URL);
    expect(meta.canonical).toBe("https://pradeepsingh.pages.dev/blog/my-essay");
    expect(meta.ogType).toBe("article");
    expect(meta.title).toBe("My Essay — Pradeep Singh");
    expect(meta.image).toBe("https://img/x.webp");
  });
});

describe("pageMeta", () => {
  it("uses site description as fallback and website type", () => {
    const meta = pageMeta({ path: "/about", title: "About" }, testSite, SITE_URL);
    expect(meta.title).toBe("About — Pradeep Singh");
    expect(meta.ogType).toBe("website");
    expect(meta.description).toBe(testSite.description);
    expect(meta.canonical).toBe("https://pradeepsingh.pages.dev/about");
  });
});

describe("articleJsonLd", () => {
  it("produces a BlogPosting with author and dates", () => {
    const post = makePost({ id: "1", slug: "s", title: "Title", publishedAt: "2026-02-02T00:00:00Z" });
    const ld = articleJsonLd(post, testSite, SITE_URL);
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.datePublished).toBe("2026-02-02T00:00:00Z");
    expect((ld.author as Record<string, string>).name).toBe("Pradeep Singh");
  });
});
