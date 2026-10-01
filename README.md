# Papa Website

A minimal, editorial personal blog for **Pradeep Singh** — built so the author manages
all content himself, running entirely on Cloudflare's free tier.

**Stack:** [Astro](https://astro.build) (SSR) on **Cloudflare Pages**, with **D1**
(SQLite database + FTS5 search) and **R2** (image storage), and a
[TipTap](https://tiptap.dev) editor. Costs nothing to run; a custom domain later is ~$10/yr.

See [`DAD-GUIDE.md`](./DAD-GUIDE.md) for the author's plain-language how-to.

---

## What it does

- **Public site** — home landing (featured + recent), articles, category & tag pages,
  full-text search, RSS, sitemap, robots, JSON-LD, OpenGraph/Twitter cards.
- **Reading extras** — reading time, table of contents, related posts, share buttons.
- **Admin dashboard** (`/admin`) — rich editor with drag-in images (compressed to WebP in
  the browser, stored in R2), draft/publish/delete, categories + tags, cover images,
  advanced-SEO overrides, page manager, comment moderation with author replies, contact
  inbox, subscribers (CSV export), site settings.
- **Comments** — name + email, honeypot-protected, held for moderation, one level of
  nested author replies.

## Architecture

| Concern | Implementation |
| --- | --- |
| Data | `BlogRepository` interface (`src/lib/repositories/types.ts`) with two implementations: **`D1Repository`** (production) and **`MemoryRepository`** (demo data when no `DB` binding exists). Both pass the same contract test suite. |
| Search | SQLite **FTS5** table `posts_fts` (porter stemming, bm25 ranking weighted title > tags > excerpt > body), kept in sync on every post write. User input is sanitized into quoted prefix terms. |
| Images | Uploaded to the R2 `MEDIA` bucket, served by `/media/[...key]` with immutable caching. |
| Admin login | Single admin. PBKDF2-SHA256 password hash (`ADMIN_PASSWORD_HASH`), HMAC-signed 30-day session cookie (`SESSION_SECRET`), max 10 failed logins per IP per 15 minutes. Fails closed if secrets are missing. |
| Pure logic | `src/lib/domain/` — slugs, reading time, excerpts, SEO, comment threading, HTML escaping, search. Unit-tested. |

Tests run the D1 repository against **real SQLite** (Node's built-in `node:sqlite`, which
includes FTS5) using the actual migration files — no mocks.

## Local development

Requires Node 22.18+.

```bash
npm install
npm run db:migrate:local     # create the local D1 database (.wrangler/)
npm run db:seed:local        # optional starter content
npm run dev                  # http://localhost:4321
```

`astro dev` emulates the D1 and R2 bindings from `wrangler.jsonc` locally. With no
`.dev.vars`, the admin login is `admin@local` / `changeme` (dev only — this fallback can
never be used in a production build).

```bash
npm test             # 120 unit + repository contract tests
npm run check        # astro check (types + templates)
npm run build        # production build
```

## Going live (all in Cloudflare)

You need a free Cloudflare account. Run the `wrangler` commands from this folder; the
first one opens a browser to log in.

### 1. Create the database and image bucket

```bash
npx wrangler login
npx wrangler d1 create papa-website           # prints a database_id
npx wrangler r2 bucket create papa-website-media
```

Paste the printed `database_id` into `wrangler.jsonc`, replacing the zeros, and commit it.

```bash
npm run db:migrate:remote    # create the tables in the real database
npm run db:seed:remote       # optional: About page + welcome post
```

### 2. Create the Pages project

In the Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**,
choose this GitHub repo, and set:

- **Project name:** `pradeepsingh` (this gives `https://pradeepsingh.pages.dev`)
- **Framework preset:** Astro · **Build command:** `npm run build` · **Output:** `dist`

The D1 and R2 bindings are read from `wrangler.jsonc`, so no binding setup is needed in
the dashboard.

### 3. Set the admin login secrets

```bash
npm run hash-password        # type Pradeep's password; copy the ADMIN_PASSWORD_HASH line
```

Then in the Pages project → **Settings → Variables and Secrets**, add as **Secrets**:

| Name | Value |
| --- | --- |
| `ADMIN_EMAIL` | Pradeep's email address |
| `ADMIN_PASSWORD_HASH` | the hash printed above |
| `SESSION_SECRET` | 32+ random characters, e.g. from `openssl rand -base64 48` |

Redeploy (Deployments → Retry) so the secrets take effect. Until all three are set, the
admin login stays disabled.

### 4. Check it

Visit `/admin`, sign in, publish a post with an image, leave a comment from a private
window, approve it, and reply.

## Operations

- **Backups:** `npx wrangler d1 export papa-website --remote --output backup.sql`.
  D1 Time Travel can also restore the database to any point in the last 7 days (free plan).
- **Schema changes:** add a numbered file to `migrations/`, then `npm run db:migrate:remote`.
- **Change the admin password:** run `npm run hash-password`, update the
  `ADMIN_PASSWORD_HASH` secret, redeploy. Changing `SESSION_SECRET` logs everyone out.

## Deferred (not in v1)

Custom domain, newsletter sending, analytics + Search Console, dark mode, monetization
pages, content import.
