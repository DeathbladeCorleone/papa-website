import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
  it("strips accents", () => {
    expect(slugify("Café Society")).toBe("cafe-society");
  });
  it("drops apostrophes without leaving hyphens", () => {
    expect(slugify("It's a Test")).toBe("its-a-test");
  });
  it("collapses punctuation and trims", () => {
    expect(slugify("  What?!  Now...  ")).toBe("what-now");
  });
  it("collapses repeated separators", () => {
    expect(slugify("a---b   c")).toBe("a-b-c");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("My Post", [])).toBe("my-post");
  });
  it("suffixes on collision", () => {
    expect(uniqueSlug("My Post", ["my-post"])).toBe("my-post-2");
  });
  it("skips taken suffixes", () => {
    expect(uniqueSlug("My Post", ["my-post", "my-post-2"])).toBe("my-post-3");
  });
  it("falls back to 'post' for empty input", () => {
    expect(uniqueSlug("!!!", [])).toBe("post");
  });
});
