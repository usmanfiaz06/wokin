-- =====================================================================
--  WOK!N · hide a dish from the customer menu
--  "is_available = false" shows the dish as SOLD OUT (still visible).
--  "is_hidden = true" removes it from the customer menu entirely.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

alter table public.menu_overrides
  add column if not exists is_hidden boolean not null default false;

-- No new RLS needed: the existing "admin_can_manage_overrides" (ALL) and
-- "anon_can_read_overrides" (SELECT) policies already cover this column.
