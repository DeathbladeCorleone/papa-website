/**
 * Turn a human title into a URL-safe slug.
 * Lowercases, strips accents, replaces non-alphanumerics with hyphens,
 * and collapses/trims hyphens.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/['"]/g, "") // drop apostrophes/quotes rather than hyphenating them
    .replace(/[^a-z0-9]+/g, "-") // everything else -> hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-"); // collapse runs
}

/**
 * Produce a slug that does not collide with any in `existing`.
 * Appends -2, -3, ... until unique. Empty base becomes "post".
 */
export function uniqueSlug(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  let candidate = slugify(base) || "post";
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${candidate}-${n}`)) n++;
  return `${candidate}-${n}`;
}
