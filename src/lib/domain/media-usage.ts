import type { Page, Post, SiteSettings } from "./types";

export interface MediaUse {
  kind: "post" | "page" | "settings";
  id: string;
  title: string;
}

/**
 * Where each image URL appears: essay bodies and covers, page bodies, and the
 * author portrait. Used to warn before deleting a photo that is still shown.
 */
export function mediaUsage(
  urls: string[],
  posts: Pick<Post, "id" | "title" | "bodyHtml" | "coverUrl">[],
  pages: Pick<Page, "id" | "title" | "bodyHtml">[],
  settings: Pick<SiteSettings, "authorPhotoUrl">,
): Record<string, MediaUse[]> {
  const out: Record<string, MediaUse[]> = {};
  for (const url of urls) {
    const uses: MediaUse[] = [];
    for (const p of posts) {
      if (p.coverUrl === url || p.bodyHtml.includes(url)) uses.push({ kind: "post", id: p.id, title: p.title });
    }
    for (const pg of pages) if (pg.bodyHtml.includes(url)) uses.push({ kind: "page", id: pg.id, title: pg.title });
    if (settings.authorPhotoUrl === url) uses.push({ kind: "settings", id: "settings", title: "Author photo" });
    out[url] = uses;
  }
  return out;
}
