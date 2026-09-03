import { describe, it, expect } from "vitest";
import { withHeadingIds } from "./toc";

describe("withHeadingIds", () => {
  it("adds ids and extracts entries in order", () => {
    const { html, toc } = withHeadingIds(
      "<h2>First Part</h2><p>x</p><h3>Sub Point</h3>",
    );
    expect(toc).toEqual([
      { id: "first-part", text: "First Part", level: 2 },
      { id: "sub-point", text: "Sub Point", level: 3 },
    ]);
    expect(html).toContain('<h2 id="first-part">First Part</h2>');
    expect(html).toContain('<h3 id="sub-point">Sub Point</h3>');
  });

  it("deduplicates repeated heading text", () => {
    const { toc } = withHeadingIds("<h2>Notes</h2><h2>Notes</h2>");
    expect(toc.map((t) => t.id)).toEqual(["notes", "notes-2"]);
  });

  it("preserves an existing id", () => {
    const { html, toc } = withHeadingIds('<h2 id="custom">Title</h2>');
    expect(html).toContain('id="custom"');
    expect(toc[0].id).toBe("custom");
  });

  it("ignores h1 and h4+", () => {
    const { toc } = withHeadingIds("<h1>Big</h1><h4>Small</h4>");
    expect(toc).toEqual([]);
  });
});
