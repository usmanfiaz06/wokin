-- =====================================================================
--  WOK!N · Menu category overrides
--  Lets admin rename a category, change its emoji, reorder the menu, and
--  hide/show a whole category — without touching the dish data (dishes map
--  to a category by its stable id, so a rename never orphans anything).
--  Managed from Admin → Categories; read by the storefront + dine-in page.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- =====================================================================

create table if not exists public.menu_categories (
  cat_id     text primary key,              -- matches the id in menu-data.js (e.g. 'starters')
  name       text,                          -- null = keep the built-in name
  emoji      text,                          -- null = keep the built-in emoji
  position   integer,                       -- display order; null = keep built-in order
  is_hidden  boolean not null default false,-- true = hide the whole category from customers
  updated_at timestamptz not null default now()
);

alter table public.menu_categories enable row level security;
drop policy if exists "anon_read_categories"    on public.menu_categories;
drop policy if exists "admin_manage_categories" on public.menu_categories;
create policy "anon_read_categories"    on public.menu_categories for select to anon, authenticated using (true);
create policy "admin_manage_categories" on public.menu_categories for all    to authenticated using (true) with check (true);

-- Realtime so an admin change can reach open storefronts.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='menu_categories')
  then execute 'alter publication supabase_realtime add table public.menu_categories'; end if;
end $$;
