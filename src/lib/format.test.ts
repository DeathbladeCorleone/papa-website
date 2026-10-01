import { describe, it, expect } from "vitest";
import { formatDate, formatMonthDay, yearOf, groupByYear } from "./format";

describe("date formatting (India time)", () => {
  it("formats a full date like the design", () => {
    expect(formatDate("2026-08-24T06:00:00Z")).toBe("August 24, 2026");
  });
  it("uses India time, so a late-evening IST post keeps its local date", () => {
    // 20:00 UTC on Aug 24 is 01:30 IST on Aug 25.
    expect(formatDate("2026-08-24T20:00:00Z")).toBe("August 25, 2026");
  });
  it("formats month and day for year-grouped lists", () => {
    expect(formatMonthDay("2026-07-02T06:00:00Z")).toBe("July 2");
  });
  it("returns empty strings for missing or invalid input", () => {
    expect(formatDate(null)).toBe("");
    expect(formatMonthDay("nope")).toBe("");
    expect(yearOf(undefined)).toBe("");
  });
  it("groups items by year, preserving order", () => {
    const items = [
      { id: "a", publishedAt: "2026-08-24T06:00:00Z", createdAt: "x" },
      { id: "b", publishedAt: "2026-01-02T06:00:00Z", createdAt: "x" },
      { id: "c", publishedAt: "2025-12-14T06:00:00Z", createdAt: "x" },
      { id: "d", publishedAt: null, createdAt: "2024-03-01T06:00:00Z" },
    ];
    expect(groupByYear(items).map((g) => [g.year, g.items.map((i) => i.id)])).toEqual([
      ["2026", ["a", "b"]],
      ["2025", ["c"]],
      ["2024", ["d"]],
    ]);
  });
});
