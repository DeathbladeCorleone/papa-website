-- Optional starter content. Run AFTER 0001_init.sql.
-- Gives the site one category, one page, and one published post so it isn't empty.

insert into categories (name, slug) values ('Life', 'life')
  on conflict (slug) do nothing;

insert into pages (slug, title, body_html, status, show_in_menu, menu_order)
values (
  'about', 'About',
  '<p>I am Pradeep Singh. I write about the things that interest me, from running to the questions that do not have tidy answers.</p>',
  'published', true, 0
) on conflict (slug) do nothing;

insert into posts (slug, title, excerpt, body_html, body_text, status, featured, published_at)
values (
  'welcome',
  'Welcome to my blog',
  'A first note on why I started writing here, and what to expect.',
  '<p>This is where I will share essays on the things I keep thinking about — running, books, and the odd idea that will not leave me alone.</p><h2>Why write?</h2><p>Because the refusal to think is its own kind of loss. Writing is how I think.</p>',
  'This is where I will share essays on the things I keep thinking about — running, books, and the odd idea that will not leave me alone. Why write? Because the refusal to think is its own kind of loss. Writing is how I think.',
  'published', true, now()
) on conflict (slug) do nothing;
