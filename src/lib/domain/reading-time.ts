import { stripHtml } from "./html";

const WORDS_PER_MINUTE = 220;

/** Count words in plain text or HTML. */
export function countWords(input: string): number {
  const text = stripHtml(input);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Estimated reading time in whole minutes (minimum 1 for any content). */
export function readingTimeMinutes(input: string): number {
  const words = countWords(input);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Human label, e.g. "6 min read". Empty content returns "". */
export function readingTimeLabel(input: string): string {
  const mins = readingTimeMinutes(input);
  return mins === 0 ? "" : `${mins} min read`;
}
