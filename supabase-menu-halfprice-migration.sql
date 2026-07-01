-- =====================================================================
--  WOK!N · menu half-size price override
--  Lets the admin override the Half price of a 3-size dish (soups:
--  Single / Half / Full) from the menu editor. Single = price_override,
--  Full = price_full_override, and this adds the middle Half size.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

alter table public.menu_overrides
  add column if not exists price_half_override numeric;

-- No new RLS needed: the existing "admin_can_manage_overrides" (ALL) and
-- "anon_can_read_overrides" (SELECT) policies already cover this column.
