-- =====================================================================
--  WOK!N · manage the "Crowd Favourites" (popular) row from admin
--  Flag any dish with is_popular = true to feature it in the popular
--  row at the top of the customer menu. If no dish is flagged, the site
--  falls back to its built-in curated list.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

alter table public.menu_overrides
  add column if not exists is_popular boolean not null default false;

-- No new RLS needed: the existing "admin_can_manage_overrides" (ALL) and
-- "anon_can_read_overrides" (SELECT) policies already cover this column.
