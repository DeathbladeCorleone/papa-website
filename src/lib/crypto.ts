// Password hashing and signed session tokens using the Web Crypto API, which
// exists in both Cloudflare Workers and Node. This file has no imports so the
// `npm run hash-password` script can load it directly.

const enc = new TextEncoder();

/** Byte array backed by a plain ArrayBuffer (what Web Crypto accepts). */
type Bytes = Uint8Array<ArrayBuffer>;

/** Cloudflare Workers caps PBKDF2 at 100,000 iterations. */
export const DEFAULT_ITERATIONS = 100_000;

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function pbkdf2(password: string, salt: Bytes, iterations: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hash a password as `pbkdf2$<iterations>$<salt>$<hash>` (base64url parts). */
export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64url(salt)}$${toB64url(hash)}`;
}

/** Check a password against a stored hash. Never throws; malformed hashes fail. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromB64url(parts[2]);
  const expected = fromB64url(parts[3]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > DEFAULT_ITERATIONS) return false;
  if (!salt || !expected || salt.length === 0 || expected.length === 0) return false;
  const actual = await pbkdf2(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Create a signed `<payload>.<signature>` session token valid for `ttlSeconds`. */
export async function createSessionToken(
  email: string,
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
): Promise<string> {
  const payload = toB64url(enc.encode(JSON.stringify({ e: email, x: now + ttlSeconds * 1000 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload)));
  return `${payload}.${toB64url(sig)}`;
}

/** Verify a session token's signature and expiry. Returns the email or null. */
export async function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<{ email: string } | null> {
  const parts = (token ?? "").split(".");
  if (parts.length !== 2) return null;
  const [payload, sigPart] = parts;
  const sig = fromB64url(sigPart);
  if (!payload || !sig || sig.length === 0) return null;

  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(payload));
  if (!valid) return null;

  const raw = fromB64url(payload);
  if (!raw) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(raw)) as { e?: unknown; x?: unknown };
    if (typeof data.e !== "string" || typeof data.x !== "number" || data.x <= now) return null;
    return { email: data.e };
  } catch {
    return null;
  }
}
