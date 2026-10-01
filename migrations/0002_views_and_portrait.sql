-- Home v3: "Most read" needs per-post view counts; the About section shows an
-- author portrait chosen in Settings.
ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
CREATE INDEX posts_views ON posts (status, views DESC);

ALTER TABLE settings ADD COLUMN author_photo_url TEXT;
