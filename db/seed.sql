-- Optional starter content: one category, an About page and a welcome post.
-- Local:  npm run db:seed:local      Remote: npm run db:seed:remote
-- Safe to run more than once.

INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('seed-cat-life', 'Life', 'life');

INSERT OR IGNORE INTO pages (id, slug, title, body_html, status, show_in_menu, menu_order, created_at, updated_at)
VALUES (
  'seed-page-about', 'about', 'About',
  '<p>I am Pradeep Singh. I write about the things that interest me, from running to the questions that do not have tidy answers.</p>',
  'published', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT OR IGNORE INTO posts (id, slug, title, excerpt, body_html, body_text, category_id, status, featured,
                             published_at, created_at, updated_at)
VALUES (
  'seed-post-welcome', 'welcome', 'Welcome to my blog',
  'A first note on why I started writing here, and what to expect.',
  '<p>This is where I will share essays on the things I keep thinking about — running, books, and the odd idea that will not leave me alone.</p><h2>Why write?</h2><p>Because the refusal to think is its own kind of loss. Writing is how I think.</p>',
  'This is where I will share essays on the things I keep thinking about — running, books, and the odd idea that will not leave me alone. Why write? Because the refusal to think is its own kind of loss. Writing is how I think.',
  'seed-cat-life', 'published', 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- Keep the search index in sync for the seeded post.
DELETE FROM posts_fts WHERE post_id = 'seed-post-welcome';
INSERT INTO posts_fts (title, excerpt, body_text, tags, post_id)
SELECT title, excerpt, body_text, '', id FROM posts WHERE id = 'seed-post-welcome';
