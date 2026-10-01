import { describe, it, expect } from "vitest";
import { DEFAULT_HOME_LAYOUT, normalizeHomeLayout } from "./home";

describe("normalizeHomeLayout", () => {
  it("falls back to the default for empty or broken input", () => {
    expect(normalizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout("{not json")).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout(42)).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("keeps the chosen order, drops junk and duplicates, appends missing sections", () => {
    const got = normalizeHomeLayout(JSON.stringify({
      sections: [
        { key: "latest", visible: false, title: "  New writing  " },
        { key: "bogus", visible: true, title: "x" },
        { key: "latest", visible: true, title: "dupe" },
        { key: "about", title: "" },
      ],
    }));
    expect(got.sections.map((s) => s.key)).toEqual(["latest", "about", "mostRead", "subscribe", "topics"]);
    expect(got.sections[0]).toEqual({ key: "latest", visible: false, title: "New writing" });
    expect(got.sections[1]).toEqual({ key: "about", visible: true, title: "About me" });
  });

  it("clamps the essay counts", () => {
    const got = normalizeHomeLayout({ mostReadCount: 99, latestCount: -3 });
    expect(got.mostReadCount).toBe(8);
    expect(got.latestCount).toBe(2);
    expect(normalizeHomeLayout({ mostReadCount: "abc" }).mostReadCount).toBe(4);
  });
});
