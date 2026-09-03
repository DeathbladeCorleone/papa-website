-- Papa Website — initial schema
-- Run in the Supabase SQL editor (or via the Supabase CLI) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Taxonomy
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id   uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table if not exists tags (
  id   uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
create table if not exists posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  excerpt         text not null default '',
  body_html       text not null default '',
  body_text       text not null default '',           -- plain text for search
  cover_url       text,
  category_id     uuid references categories(id) on delete set null,
  status          text not null default 'draft' check (status in ('draft','published')),
  featured        boolean not null default false,
  seo_title       text,
  seo_description text,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Full-text search vector: title weighted highest, then excerpt, then body.
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'C')
  ) stored
);

create index if not exists posts_fts_idx on posts using gin (fts);
create index if not exists posts_status_published_idx on posts (status, published_at desc);

create table if not exists post_tags (
  post_id uuid not null references posts(id) on delete cascade,
  tag_id  uuid not null references tags(id)  on delete cascade,
  primary key (post_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Pages (standalone CMS pages: About, Contact, custom)
-- ---------------------------------------------------------------------------
create table if not exists pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  body_html    text not null default '',
  status       text not null default 'draft' check (status in ('draft','published')),
  show_in_menu boolean not null default true,
  menu_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Comments (moderated, one level of nesting)
-- ---------------------------------------------------------------------------
create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts(id) on delete cascade,
  parent_id    uuid references comments(id) on delete cascade,
  author_name  text not null,
  author_email text not null,                          -- private, never rendered
  body         text not null,
  status       text not null default 'pending' check (status in ('pending','approved','spam')),
  is_author    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists comments_post_status_idx on comments (post_id, status);

-- ---------------------------------------------------------------------------
-- Contact inbox + subscribers
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Site settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id          integer primary key default 1 check (id = 1),
  title       text not null default 'Pradeep Singh',
  tagline     text not null default 'Essays and reflections',
  description text not null default 'Writing on a variety of topics by Pradeep Singh.',
  author_name text not null default 'Pradeep Singh'
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Public (anon key) can read published content and submit comments/contact/
-- subscriptions. All privileged writes happen server-side with the service
-- role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table categories  enable row level security;
alter table tags        enable row level security;
alter table posts       enable row level security;
alter table post_tags   enable row level security;
alter table pages       enable row level security;
alter table comments    enable row level security;
alter table messages    enable row level security;
alter table subscribers enable row level security;
alter table settings    enable row level security;

-- Public read access
create policy "read categories"  on categories  for select using (true);
create policy "read tags"        on tags        for select using (true);
create policy "read post_tags"   on post_tags   for select using (true);
create policy "read settings"    on settings    for select using (true);
create policy "read published posts" on posts    for select using (status = 'published');
create policy "read published pages" on pages    for select using (status = 'published');
create policy "read approved comments" on comments for select using (status = 'approved');

-- Public inserts (validated + rate-limited in application code)
create policy "submit comment"    on comments    for insert with check (status = 'pending' and is_author = false);
create policy "submit message"    on messages    for insert with check (true);
create policy "submit subscriber" on subscribers for insert with check (true);
