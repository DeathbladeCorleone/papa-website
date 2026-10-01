// Dates are shown in India time — the author's timezone — so a post published
// late in the evening never displays tomorrow's (UTC) date.
const TZ = "Asia/Kolkata";

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "August 24, 2026". Empty for null/invalid. */
export function formatDate(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ }) : "";
}

/** "August 24" — for lists already grouped under a year heading. */
export function formatMonthDay(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: TZ }) : "";
}

/** "2026" (India time). */
export function yearOf(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-US", { year: "numeric", timeZone: TZ }) : "";
}

/** Machine-readable date for <time datetime>. */
export function isoDate(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? d.toISOString() : "";
}

/** Group already-sorted items into consecutive year buckets. */
export function groupByYear<T extends { publishedAt: string | null; createdAt: string }>(
  items: T[],
): { year: string; items: T[] }[] {
  const groups: { year: string; items: T[] }[] = [];
  for (const item of items) {
    const year = yearOf(item.publishedAt ?? item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(item);
    else groups.push({ year, items: [item] });
  }
  return groups;
}
