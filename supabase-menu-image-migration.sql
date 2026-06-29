-- =====================================================================
--  WOK!N · menu image override
--  Lets the admin change the photo of an EXISTING (static) menu dish.
--  The image itself is stored in the existing "dish-images" Storage
--  bucket (same one used for custom dishes); this column just records
--  which file belongs to which dish override.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

alter table public.menu_overrides
  add column if not exists image_path text;   -- e.g. "1736-special.jpg"

-- No new RLS needed: the existing "admin_can_manage_overrides" (ALL) and
-- "anon_can_read_overrides" (SELECT) policies already cover this column.
