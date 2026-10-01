import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "./crypto";

// Low iteration count keeps tests fast; production uses the default.
const FAST = 1_000;
const SECRET = "test-secret-at-least-32-characters-long!!";

describe("password hashing", () => {
  it("verifies the correct password", async () => {
    const stored = await hashPassword("correct horse battery", FAST);
    expect(stored).toMatch(/^pbkdf2\$1000\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery", FAST);
    expect(await verifyPassword("Correct horse battery", stored)).toBe(false);
  });

  it("salts each hash differently", async () => {
    const a = await hashPassword("same", FAST);
    const b = await hashPassword("same", FAST);
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$abc$def")).toBe(false);
    expect(await verifyPassword("x", "md5$1$a$b")).toBe(false);
  });

  it("defaults to the Cloudflare Workers PBKDF2 maximum of 100k iterations", async () => {
    expect(await hashPassword("x")).toMatch(/^pbkdf2\$100000\$/);
  });
});

describe("session tokens", () => {
  const now = Date.UTC(2026, 9, 1);

  it("round-trips the email for a valid token", async () => {
    const token = await createSessionToken("pradeep@example.com", SECRET, 3600, now);
    expect(await verifySessionToken(token, SECRET, now + 1000)).toEqual({ email: "pradeep@example.com" });
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken("p@x.com", SECRET, 60, now);
    expect(await verifySessionToken(token, SECRET, now + 61_000)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("p@x.com", SECRET, 3600, now);
    expect(await verifySessionToken(token, SECRET + "x", now)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await createSessionToken("p@x.com", SECRET, 3600, now);
    const [, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ e: "attacker@x.com", x: now + 999_999 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifySessionToken(`${forged}.${sig}`, SECRET, now)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySessionToken("", SECRET, now)).toBeNull();
    expect(await verifySessionToken("abc", SECRET, now)).toBeNull();
    expect(await verifySessionToken("a.b.c", SECRET, now)).toBeNull();
    expect(await verifySessionToken("!!!.???", SECRET, now)).toBeNull();
  });
});
