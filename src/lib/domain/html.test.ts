import { describe, it, expect } from "vitest";
import { escapeHtml, stripHtml, renderCommentBody } from "./html";

describe("escapeHtml", () => {
  it("escapes dangerous characters", () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;",
    );
  });
});

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });
  it("decodes common entities", () => {
    expect(stripHtml("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
  });
});

describe("renderCommentBody", () => {
  it("neutralizes HTML injection", () => {
    const out = renderCommentBody("<img src=x onerror=alert(1)>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
  it("splits paragraphs and line breaks", () => {
    expect(renderCommentBody("a\nb\n\nc")).toBe("<p>a<br>b</p><p>c</p>");
  });
  it("returns empty string for blank input", () => {
    expect(renderCommentBody("   ")).toBe("");
  });
});
