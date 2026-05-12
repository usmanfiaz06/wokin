-- =====================================================================
--  WOK!N · MENU OVERRIDES MIGRATION
--  ---------------------------------------------------------------------
--  Run this ONCE in Supabase SQL Editor, AFTER you've run
--  supabase-setup.sql (the orders schema).
--
--  WHY:
--    The menu structure (names, descriptions, categories) lives in
--    menu-data.js and ships with the front-end build. We only put the
--    DYNAMIC bits in the DB:
--       - is dish currently available?
--       - has price changed?
--       - has the description been edited?
--    so the kitchen can mark something sold-out, run a special price,
--    or edit a description in real-time without a code deploy.
-- =====================================================================

create table if not exists public.menu_overrides (
  dish_slug             text primary key,
  dish_name             text,                       -- snapshot for admin UI display
  is_available          boolean not null default true,
  price_override        numeric,
  price_full_override   numeric,
  description_override  text,
  pcs_override          text,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id)
);

create index if not exists idx_menu_overrides_available
  on public.menu_overrides(is_available);

-- ---------------------------------------------------------------------
-- ROW-LEVEL SECURITY
--   anon:           SELECT only  (customer site reads overrides)
--   authenticated:  full read/write (admin manages overrides)
-- ---------------------------------------------------------------------
alter table public.menu_overrides enable row level security;

drop policy if exists "anon_can_read_overrides"     on public.menu_overrides;
drop policy if exists "admin_can_manage_overrides"  on public.menu_overrides;

create policy "anon_can_read_overrides"
  on public.menu_overrides for select
  to anon, authenticated
  using (true);

create policy "admin_can_manage_overrides"
  on public.menu_overrides for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- AUTO-UPDATE the updated_at + updated_by columns
-- ---------------------------------------------------------------------
create or replace function public._touch_menu_overrides()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_touch_menu_overrides on public.menu_overrides;
create trigger trg_touch_menu_overrides
  before insert or update on public.menu_overrides
  for each row execute function public._touch_menu_overrides();

-- ---------------------------------------------------------------------
-- REALTIME (admin edits propagate live to customer site)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'menu_overrides'
  ) then
    execute 'alter publication supabase_realtime add table public.menu_overrides';
  end if;
end $$;
