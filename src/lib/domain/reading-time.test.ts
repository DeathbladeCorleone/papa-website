import { describe, it, expect } from "vitest";
import { countWords, readingTimeMinutes, readingTimeLabel } from "./reading-time";

describe("countWords", () => {
  it("counts words in HTML", () => {
    expect(countWords("<p>one two three</p>")).toBe(3);
  });
  it("returns 0 for empty", () => {
    expect(countWords("   ")).toBe(0);
  });
});

describe("readingTimeMinutes", () => {
  it("is at least 1 minute for short content", () => {
    expect(readingTimeMinutes("a few words")).toBe(1);
  });
  it("is 0 for empty content", () => {
    expect(readingTimeMinutes("")).toBe(0);
  });
  it("rounds ~440 words to 2 minutes", () => {
    const text = Array(440).fill("word").join(" ");
    expect(readingTimeMinutes(text)).toBe(2);
  });
});

describe("readingTimeLabel", () => {
  it("formats a label", () => {
    expect(readingTimeLabel("hello there friend")).toBe("1 min read");
  });
  it("is empty for no content", () => {
    expect(readingTimeLabel("")).toBe("");
  });
});
