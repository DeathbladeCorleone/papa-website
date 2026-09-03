import { slugify } from "./slug";
import { stripHtml } from "./html";

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Ensure every h2/h3 in the HTML has a stable, unique id (derived from its
 * text) so the table of contents can link to it. Existing ids are preserved.
 * Returns the rewritten HTML plus the extracted TOC entries in document order.
 */
export function withHeadingIds(html: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const used = new Set<string>();

  const out = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_match, levelStr: string, attrs: string, inner: string) => {
      const level = Number(levelStr) as 2 | 3;
      const text = stripHtml(inner);
      const existing = /\sid=["']([^"']+)["']/i.exec(attrs);
      let id = existing?.[1] ?? slugify(text) ?? "";
      if (!id) id = "section";
      let unique = id;
      let n = 2;
      while (used.has(unique)) unique = `${id}-${n++}`;
      used.add(unique);

      toc.push({ id: unique, text, level });
      const attrsWithoutId = attrs.replace(/\sid=["'][^"']*["']/i, "");
      return `<h${level}${attrsWithoutId} id="${unique}">${inner}</h${level}>`;
    },
  );

  return { html: out, toc };
}
