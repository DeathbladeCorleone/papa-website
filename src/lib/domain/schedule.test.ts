import { describe, it, expect } from "vitest";
import { isLive, parsePublishDate, postState } from "./schedule";

const now = "2026-10-01T12:00:00.000Z";
const post = (status: "draft" | "published", publishedAt: string | null) =>
  ({ status, publishedAt, createdAt: "2026-01-01T00:00:00.000Z" });

describe("schedule", () => {
  it("derives draft / scheduled / published", () => {
    expect(postState(post("draft", null), now)).toBe("draft");
    expect(postState(post("draft", "2026-09-01T00:00:00.000Z"), now)).toBe("draft");
    expect(postState(post("published", "2026-09-30T00:00:00.000Z"), now)).toBe("published");
    expect(postState(post("published", "2026-10-02T00:00:00.000Z"), now)).toBe("scheduled");
    expect(isLive(post("published", null), now)).toBe(true); // falls back to createdAt
  });

  it("parses publish dates sent by the browser", () => {
    expect(parsePublishDate("2026-10-05T03:30:00.000Z")).toBe("2026-10-05T03:30:00.000Z");
    expect(parsePublishDate("2026-10-05T09:00:00+05:30")).toBe("2026-10-05T03:30:00.000Z");
    expect(parsePublishDate("")).toBeNull();
    expect(parsePublishDate("tomorrow-ish")).toBeNull();
    expect(parsePublishDate(undefined)).toBeNull();
  });
});
