-- =====================================================================
--  WOK!N · combo deals — customer choices + delivery rule
--  Adds, to each combo:
--   - items:         a structured list. Each entry is either a plain
--                    string (a fixed included item) or a JSON object
--                    {"pick":"<category id>","label":"..."} that the
--                    customer chooses a dish for when adding to cart.
--   - deli_eligible: false (default) = dine-in & pick-up only (not for
--                    delivery). true = can also be delivered.
--  The old `description` column is kept; combos with no `items` still
--  show their description's "·"-separated list as fixed items.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- =====================================================================

alter table public.combos add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.combos add column if not exists deli_eligible boolean not null default false;
