import { createClient } from "@supabase/supabase-js";

type Env = Record<string, string | undefined>;

export interface AdminSession {
  email: string;
}

function supabaseAuthClient(env: Env) {
  const url = env.PUBLIC_SUPABASE_URL;
  const anon = env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || url.includes("YOUR-PROJECT")) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

const DEV_PREFIX = "dev:";

/**
 * Authenticate an admin. In production this is Supabase email/password. When no
 * Supabase project is configured (local preview on the in-memory demo repo), a
 * dev credential pair is accepted so the dashboard can be explored — this path
 * is unreachable once real Supabase keys are set.
 */
export async function signIn(
  email: string,
  password: string,
  env: Env,
): Promise<{ token: string; email: string } | null> {
  const client = supabaseAuthClient(env);
  if (client) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) return null;
    return { token: data.session.access_token, email: data.user?.email ?? email };
  }
  // Local preview fallback only.
  const devEmail = env.ADMIN_DEV_EMAIL ?? "admin@local";
  const devPass = env.ADMIN_DEV_PASSWORD ?? "changeme";
  if (email.trim().toLowerCase() === devEmail.toLowerCase() && password === devPass) {
    return { token: `${DEV_PREFIX}${devEmail}`, email: devEmail };
  }
  return null;
}

/** Verify a session token from the cookie. Returns the admin or null. */
export async function verifySession(token: string, env: Env): Promise<AdminSession | null> {
  const client = supabaseAuthClient(env);
  if (token.startsWith(DEV_PREFIX)) {
    // Dev tokens are only valid while Supabase is NOT configured.
    if (client) return null;
    return { email: token.slice(DEV_PREFIX.length) };
  }
  if (!client) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return { email: data.user.email };
}
