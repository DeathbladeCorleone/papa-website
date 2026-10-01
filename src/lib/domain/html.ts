/** Escape a plain string for safe insertion into HTML. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip all HTML tags and collapse whitespace, returning plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render user-submitted comment text safely: escape HTML, then turn blank-line
 * separated blocks into paragraphs and single newlines into <br>. Never trusts
 * the input, so it is safe to render the result with set:html.
 */
export function renderCommentBody(input: string): string {
  const escaped = escapeHtml(input.trim());
  if (!escaped) return "";
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Plain-text paragraphs from author HTML (only <p> blocks; empty ones dropped). */
export function paragraphs(html: string): string[] {
  const out: string[] = [];
  for (const m of (html ?? "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    // Inline formatting tags vanish without leaving a space ("<b>Pradeep</b>." → "Pradeep.").
    const inline = m[1].replace(/<\/?(?:a|b|i|em|strong|u|s|span|code|mark|sub|sup|small)\b[^>]*>/gi, "");
    const text = stripHtml(inline);
    if (text) out.push(text);
  }
  return out;
}
