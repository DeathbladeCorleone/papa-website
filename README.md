# Papa Website

A minimal, editorial personal blog for **Pradeep Singh** — built so the author manages
all content himself while staying cheap to run.

**Stack:** [Astro](https://astro.build) (SSR) · [Supabase](https://supabase.com)
(Postgres + Auth + Storage) · [Cloudflare Pages](https://pages.cloudflare.com)
· [TipTap](https://tiptap.dev) editor. Runs free but for a ~$10/yr domain.

See [`claude/build-spec.md`](../) in the project for the full decision record, and
[`DAD-GUIDE.md`](./DAD-GUIDE.md) for the author's plain-language how-to.

---

## What it does

- **Public site** — home landing (featured + recent), article pages, category & tag
  pages, full-text search, RSS, sitemap, robots, JSON-LD, OpenGraph/Twitter cards.
- **Reading extras** — reading time, table of contents, related posts, share buttons.
- **Admin dashboard** (`/admin`) — write/edit posts in a rich editor with drag-in images
  (auto-compressed to WebP), draft/publish/delete, categories + tags, cover images,
  advanced-SEO overrides, a page manager, comment moderation with author replies, a
  contact inbox, subscribers, and site settings.
- **Comments** — name + email, honeypot-protected, held for moderation, one level of
  nested author replies.

## Architecture

The app depends only on a `BlogRepository` interface (`src/lib/repositories/types.ts`).
Two implementations sit behind it:

- **`MemoryRepository`** — in-memory, seeded with demo content. Used by the test suite
  and automatically as a **local preview fallback** when no Supabase keys are set.
- **`SupabaseRepository`** — production. Public reads use the anon key (guarded by Row
  Level Security); privileged writes use the service-role key.

Pure logic (slugs, reading time, excerpts, SEO, comment threading, search ranking, HTML
sanitizing) lives in `src/lib/domain/` and is unit-tested.

## Local development

```bash
npm install
npm run dev        # http://localhost:4321  (runs on demo data if no .env)
```

With no `.env`, the site runs on in-memory demo data and the admin accepts
`admin@local` / `changeme`. Nothing persists across restarts — this is only for
exploring the UI.

```bash
npm test           # vitest — domain + repository unit tests
npm run check      # astro check (types + templates)
npm run build      # production build for Cloudflare
```

## Going live

### 1. Create a Supabase project

1. Create a free project at supabase.com.
2. In **SQL Editor**, run [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql).
   Optionally also run [`supabase/seed.sql`](./supabase/seed.sql) for starter content.
3. In **Storage**, create a **public** bucket named `media` (holds uploaded images).
4. In **Authentication → Users**, add one user — Pradeep's admin login
   (email + password). Under **Authentication → Providers**, disable "Enable email
   signups" so no one else can register.
5. From **Settings → API**, copy the Project URL, the `anon` key, and the
   `service_role` key.

### 2. Set environment variables

Copy `.env.example` to `.env` for local use, and set the same variables in
**Cloudflare Pages → Settings → Environment variables** for production:

| Variable | Notes |
| --- | --- |
| `PUBLIC_SITE_URL` | e.g. `https://pradeepsingh.pages.dev` (used for canonical URLs, sitemap, RSS) |
| `PUBLIC_SUPABASE_URL` | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** — service role key (admin writes) |
| `KEEPALIVE_SECRET` | any random string, used by the keep-alive cron |

### 3. Deploy to Cloudflare Pages

Connect the Git repo in the Cloudflare dashboard (Framework preset: **Astro**), or:

```bash
npm run build
npx wrangler pages deploy dist
```

### 4. Keep Supabase awake

Supabase pauses a free project after ~7 days of inactivity. Add a **Cloudflare Cron
Trigger** (e.g. daily) that requests:

```
https://<your-site>/api/keepalive?key=<KEEPALIVE_SECRET>
```

## Deferred (not in v1)

Custom domain, newsletter sending, analytics + Search Console connection, dark mode,
monetization pages, content import. All are additive — none require reworking the above.

## Tests

62 unit tests cover the domain logic and the in-memory repository. The Supabase
implementation mirrors the same interface and is exercised in production; verify it
after deploy by publishing a post, commenting, and moderating.
