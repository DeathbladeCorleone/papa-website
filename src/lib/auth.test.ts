import { describe, it, expect } from "vitest";
import { authConfig, signIn, verifySession } from "./auth";
import { hashPassword } from "./crypto";

const SECRET = "x".repeat(40);

describe("authConfig", () => {
  it("is null in production when secrets are missing (login disabled, fail closed)", () => {
    expect(authConfig({}, false)).toBeNull();
    expect(authConfig({ ADMIN_EMAIL: "p@x.com", ADMIN_PASSWORD_HASH: "pbkdf2$1$a$b" }, false)).toBeNull();
  });

  it("rejects a short session secret in production", () => {
    expect(
      authConfig({ ADMIN_EMAIL: "p@x.com", ADMIN_PASSWORD_HASH: "h", SESSION_SECRET: "short" }, false),
    ).toBeNull();
  });

  it("falls back to dev credentials only in dev", () => {
    const cfg = authConfig({}, true);
    expect(cfg?.email).toBe("admin@local");
  });
});

describe("signIn / verifySession", () => {
  it("issues a session that verifies, for the right credentials", async () => {
    const env = {
      ADMIN_EMAIL: "Pradeep@Example.com",
      ADMIN_PASSWORD_HASH: await hashPassword("s3cret-pass", 1000),
      SESSION_SECRET: SECRET,
    };
    const cfg = authConfig(env, false)!;
    const token = await signIn(" pradeep@example.com ", "s3cret-pass", cfg);
    expect(token).not.toBeNull();
    expect(await verifySession(token!, cfg)).toEqual({ email: "pradeep@example.com" });
  });

  it("rejects wrong email or password", async () => {
    const cfg = authConfig(
      { ADMIN_EMAIL: "p@x.com", ADMIN_PASSWORD_HASH: await hashPassword("right", 1000), SESSION_SECRET: SECRET },
      false,
    )!;
    expect(await signIn("p@x.com", "wrong", cfg)).toBeNull();
    expect(await signIn("other@x.com", "right", cfg)).toBeNull();
  });

  it("accepts the dev password only via the dev config", async () => {
    const cfg = authConfig({}, true)!;
    expect(await signIn("admin@local", "changeme", cfg)).not.toBeNull();
    expect(await signIn("admin@local", "nope", cfg)).toBeNull();
  });
});
