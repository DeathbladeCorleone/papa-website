import { describe, it, expect } from "vitest";
import { normalizeQuery, searchPosts, toFtsQuery } from "./search";
import { makePost, makeTag } from "./fixtures";

describe("normalizeQuery", () => {
  it("trims, collapses whitespace, and caps length", () => {
    expect(normalizeQuery("  hello   world ")).toBe("hello world");
    expect(normalizeQuery("a".repeat(200)).length).toBe(100);
  });
});

describe("toFtsQuery", () => {
  it("quotes each word and prefix-matches it", () => {
    expect(toFtsQuery("morning runs")).toBe('"morning"* "runs"*');
  });
  it("strips FTS5 operators and punctuation so user input can't break the query", () => {
    expect(toFtsQuery('run* AND "x" -y (z) ^w NEAR/2 col:v')).toBe(
      '"run"* "and"* "x"* "y"* "z"* "w"* "near"* "2"* "col"* "v"*',
    );
  });
  it("returns empty string when nothing searchable remains", () => {
    expect(toFtsQuery('  "" ** () ')).toBe("");
  });
  it("keeps non-ASCII letters", () => {
    expect(toFtsQuery("café नमस्ते")).toBe('"café"* "नमस्ते"*');
  });
  it("caps the number of terms", () => {
    expect(toFtsQuery(Array(30).fill("w").join(" ")).split(" ").length).toBe(10);
  });
});

describe("searchPosts", () => {
  const posts = [
    makePost({ id: "1", title: "Running a Marathon", bodyHtml: "<p>discipline and pace</p>" }),
    makePost({
      id: "2",
      title: "On Nutrition",
      bodyHtml: "<p>eating well every day</p>",
      tags: [makeTag({ id: "t1", name: "marathon" })],
    }),
    makePost({ id: "3", title: "Philosophy", bodyHtml: "<p>thinking about ideas</p>" }),
    makePost({ id: "4", title: "Hidden Draft", status: "draft", bodyHtml: "<p>marathon</p>" }),
  ];

  it("returns empty for a blank query", () => {
    expect(searchPosts(posts, "  ")).toEqual([]);
  });

  it("ranks title matches above tag/body matches", () => {
    const results = searchPosts(posts, "marathon");
    expect(results.map((p) => p.id)).toEqual(["1", "2"]); // title(5) before tag(3)
  });

  it("never returns unpublished posts", () => {
    const results = searchPosts(posts, "marathon");
    expect(results.find((p) => p.id === "4")).toBeUndefined();
  });

  it("matches body content", () => {
    expect(searchPosts(posts, "ideas").map((p) => p.id)).toEqual(["3"]);
  });
});
