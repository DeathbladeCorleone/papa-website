-- CMS: homepage layout, media library, post revisions, scheduled publishing.
--
-- Scheduling needs no new column: a post is "scheduled" when its status is
-- 'published' and its published_at lies in the future. Public queries only show
-- posts whose published_at has passed.

-- Homepage section order / visibility / headings, stored as JSON (see domain/home.ts).
ALTER TABLE settings ADD COLUMN home_layout TEXT;

-- Every image uploaded through the dashboard.
CREATE TABLE media (
  key          TEXT PRIMARY KEY,           -- R2 object key, e.g. posts/2026-10-01-uuid.webp
  url          TEXT NOT NULL,              -- site URL, e.g. /media/posts/...
  alt          TEXT NOT NULL DEFAULT '',
  width        INTEGER,
  height       INTEGER,
  bytes        INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX media_created ON media (created_at DESC);

-- Earlier versions of a post's title and body, newest first.
CREATE TABLE post_revisions (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX post_revisions_post ON post_revisions (post_id, created_at DESC);
