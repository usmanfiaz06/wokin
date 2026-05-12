-- =====================================================================
--  WOK!N · CUSTOM DISHES MIGRATION
--  ---------------------------------------------------------------------
--  Run this ONCE in Supabase SQL Editor, AFTER supabase-setup.sql and
--  supabase-menu-migration.sql.
--
--  Lets the admin add ENTIRELY NEW dishes from the dashboard (not just
--  toggle/edit the static menu). Custom dishes show up in the customer
--  site under their chosen category, alongside the static items.
-- =====================================================================

create table if not exists public.custom_dishes (
  id            uuid primary key default gen_random_uuid(),
  category_id   text not null,         -- e.g. "starters", "poultry"
  name          text not null,
  description   text,
  price         numeric not null,
  price_full    numeric,
  pcs           text,
  small_label   text,
  tags          text[] not null default '{}',
  is_available  boolean not null default true,
  position      int not null default 100, -- sort order within category (higher = later)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

create index if not exists idx_custom_dishes_category on public.custom_dishes(category_id);
create index if not exists idx_custom_dishes_available on public.custom_dishes(is_available);

-- ---------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.custom_dishes enable row level security;

drop policy if exists "anon_can_read_custom"  on public.custom_dishes;
drop policy if exists "admin_manage_custom"   on public.custom_dishes;

create policy "anon_can_read_custom"
  on public.custom_dishes for select
  to anon, authenticated
  using (true);

create policy "admin_manage_custom"
  on public.custom_dishes for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- AUTO-UPDATE updated_at / updated_by
-- ---------------------------------------------------------------------
create or replace function public._touch_custom_dishes()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_touch_custom_dishes on public.custom_dishes;
create trigger trg_touch_custom_dishes
  before insert or update on public.custom_dishes
  for each row execute function public._touch_custom_dishes();

-- ---------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'custom_dishes'
  ) then
    execute 'alter publication supabase_realtime add table public.custom_dishes';
  end if;
end $$;
