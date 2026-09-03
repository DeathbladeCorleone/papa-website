import { describe, it, expect } from "vitest";
import { excerptFromHtml } from "./excerpt";

describe("excerptFromHtml", () => {
  it("returns full text when short", () => {
    expect(excerptFromHtml("<p>Short one.</p>")).toBe("Short one.");
  });
  it("truncates at a word boundary with an ellipsis", () => {
    const html = `<p>${Array(60).fill("word").join(" ")}</p>`;
    const out = excerptFromHtml(html, 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toContain("wor…"); // did not cut mid-word
  });
  it("strips tags before measuring", () => {
    expect(excerptFromHtml("<h1>Title</h1><p>Body.</p>")).toBe("Title Body.");
  });
});
