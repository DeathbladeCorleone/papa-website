import { describe, it, expect } from "vitest";
import { D1Repository } from "./d1";
import { demoSeed } from "./memory";
import { createTestDatabase } from "./sqlite-test-db";
import { repositoryContract } from "./contract";

async function makeRepo(): Promise<D1Repository> {
  const repo = new D1Repository(createTestDatabase());
  await repo.importSeed(demoSeed());
  return repo;
}

repositoryContract("D1Repository", makeRepo);

describe("D1Repository — SQL specifics", () => {
  it("ranks title matches above body matches", async () => {
    const repo = await makeRepo();
    const inBody = await repo.createPost({ title: "Notes", bodyHtml: "<p>about lighthouse keepers</p>", status: "published" });
    const inTitle = await repo.createPost({ title: "The Lighthouse", bodyHtml: "<p>a story</p>", status: "published" });
    expect((await repo.searchPublished("lighthouse")).map((p) => p.id)).toEqual([inTitle.id, inBody.id]);
  });

  it("matches word stems and tag names", async () => {
    const repo = await makeRepo();
    expect((await repo.searchPublished("runs")).map((p) => p.slug)).toContain("on-morning-runs");
    expect((await repo.searchPublished("philosophy")).map((p) => p.slug)).toEqual(["welcome"]); // tag only
  });

  it("rolls back a failed batch atomically", async () => {
    const repo = await makeRepo();
    // A tag id that doesn't exist violates the post_tags foreign key.
    await expect(
      repo.createPost({ title: "Broken", bodyHtml: "<p>x</p>", tagIds: ["missing-tag"] }),
    ).rejects.toThrow();
    expect((await repo.listAllPosts()).map((p) => p.title)).not.toContain("Broken");
  });
});
