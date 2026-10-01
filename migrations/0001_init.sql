-- Papa Website — initial schema for Cloudflare D1 (SQLite).
-- Apply with: npx wrangler d1 migrations apply papa-website --remote
-- IDs are text UUIDs; timestamps are ISO-8601 text; booleans are 0/1 integers.

CREATE TABLE categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE posts (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  excerpt         TEXT NOT NULL DEFAULT '',
  body_html       TEXT NOT NULL DEFAULT '',
  body_text       TEXT NOT NULL DEFAULT '',
  cover_url       TEXT,
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  featured        INTEGER NOT NULL DEFAULT 0,
  seo_title       TEXT,
  seo_description TEXT,
  published_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX posts_status_published ON posts (status, published_at DESC);
CREATE INDEX posts_category ON posts (category_id);

CREATE TABLE post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX post_tags_tag ON post_tags (tag_id);

CREATE TABLE pages (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  body_html    TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  show_in_menu INTEGER NOT NULL DEFAULT 1,
  menu_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE comments (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id    TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_name  TEXT NOT NULL,
  author_email TEXT NOT NULL,            -- private, never rendered publicly
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'spam')),
  is_author    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX comments_post_status ON comments (post_id, status);
CREATE INDEX comments_status_created ON comments (status, created_at DESC);

CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  body       TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE subscribers (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  title       TEXT NOT NULL,
  tagline     TEXT NOT NULL,
  description TEXT NOT NULL,
  author_name TEXT NOT NULL
);
INSERT INTO settings (id, title, tagline, description, author_name) VALUES (
  1,
  'Pradeep Singh',
  'Essays and reflections',
  'Writing on a variety of topics by Pradeep Singh.',
  'Pradeep Singh'
);

-- Failed admin logins, for rate limiting. Old rows are pruned by the app.
CREATE TABLE login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX login_attempts_ip_created ON login_attempts (ip, created_at);

-- Full-text search index over posts (kept in sync by the application).
-- Column order matters for the bm25() weights used in queries.
CREATE VIRTUAL TABLE posts_fts USING fts5(
  title,
  excerpt,
  body_text,
  tags,
  post_id UNINDEXED,
  tokenize = 'porter unicode61'
);
