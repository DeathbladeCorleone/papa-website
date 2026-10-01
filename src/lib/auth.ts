import { createSessionToken, verifyPassword, verifySessionToken } from "./crypto";

type Env = Record<string, string | undefined>;

export const SESSION_COOKIE = "ps_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AuthConfig {
  email: string;
  /** PBKDF2 hash from `npm run hash-password` (production). */
  passwordHash: string | null;
  /** Plain password, only ever set for local development. */
  devPassword: string | null;
  secret: string;
}

const DEV_SECRET = "dev-only-insecure-session-secret-do-not-use-in-prod";

/**
 * Resolve the single admin's login configuration.
 * Production requires ADMIN_EMAIL, ADMIN_PASSWORD_HASH and a SESSION_SECRET of
 * at least 32 characters; if any is missing, returns null and login is
 * disabled (fail closed). In dev, missing values fall back to
 * admin@local / changeme so the dashboard can be explored.
 */
export function authConfig(env: Env, isDev: boolean): AuthConfig | null {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const hash = env.ADMIN_PASSWORD_HASH?.trim();
  const secret = env.SESSION_SECRET;

  if (email && hash && secret && secret.length >= 32) {
    return { email, passwordHash: hash, devPassword: null, secret };
  }
  if (!isDev) return null;
  return {
    email: email || "admin@local",
    passwordHash: hash || null,
    devPassword: hash ? null : env.ADMIN_DEV_PASSWORD || "changeme",
    secret: secret && secret.length >= 32 ? secret : DEV_SECRET,
  };
}

/** Check credentials; on success return a signed session token. */
export async function signIn(email: string, password: string, cfg: AuthConfig): Promise<string | null> {
  if (email.trim().toLowerCase() !== cfg.email) return null;
  const ok = cfg.passwordHash
    ? await verifyPassword(password, cfg.passwordHash)
    : cfg.devPassword !== null && password === cfg.devPassword;
  if (!ok) return null;
  return createSessionToken(cfg.email, cfg.secret, SESSION_TTL_SECONDS);
}

/** Verify a session cookie value. Returns the admin or null. */
export async function verifySession(token: string, cfg: AuthConfig): Promise<{ email: string } | null> {
  const session = await verifySessionToken(token, cfg.secret);
  // A token for a since-changed admin email is no longer valid.
  return session && session.email === cfg.email ? session : null;
}
