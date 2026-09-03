import { stripHtml } from "./html";

const DEFAULT_MAX = 160;

/**
 * Build a plain-text excerpt from HTML, trimmed to a word boundary within
 * `maxChars` and suffixed with an ellipsis when truncated.
 */
export function excerptFromHtml(html: string, maxChars = DEFAULT_MAX): string {
  const text = stripHtml(html);
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(" ");
  const base = lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped;
  return base.replace(/[,.;:!?-]+$/, "").trim() + "…";
}
