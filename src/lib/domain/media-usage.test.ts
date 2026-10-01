import { describe, it, expect } from "vitest";
import { mediaUsage } from "./media-usage";

describe("mediaUsage", () => {
  it("finds covers, inline images, pages and the author photo", () => {
    const a = "/media/posts/a.webp", b = "/media/posts/b.webp", c = "/media/posts/c.webp";
    const got = mediaUsage(
      [a, b, c],
      [
        { id: "p1", title: "One", coverUrl: a, bodyHtml: "<p>x</p>" },
        { id: "p2", title: "Two", coverUrl: null, bodyHtml: `<figure><img src="${a}"></figure><img src="${b}">` },
      ],
      [{ id: "pg", title: "About", bodyHtml: `<img src="${b}">` }],
      { authorPhotoUrl: b },
    );
    expect(got[a].map((u) => u.id)).toEqual(["p1", "p2"]);
    expect(got[b].map((u) => u.kind)).toEqual(["post", "page", "settings"]);
    expect(got[c]).toEqual([]);
  });
});
