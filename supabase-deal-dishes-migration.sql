-- =====================================================================
--  WOK!N · delivery-deal dish options  (table: public.deal_dish_options)
--  ---------------------------------------------------------------------
--  The delivery bundles say "half chicken dish" without naming one, so
--  the customer picks from a dropdown. This table is what decides which
--  dishes that dropdown may offer — the teeth behind "selected dishes
--  apply". Managed from Admin → DELIVERY.
--
--  One row per menu category the deals draw on (poultry, beef, rice,
--  noodles). dish_names holds the dishes a guest is allowed to choose.
--
--  NO ROW FOR A CATEGORY = every dish in it is allowed. So the deals
--  keep working exactly as they do today until staff narrow them down.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

create table if not exists public.deal_dish_options (
  category    text primary key,          -- menu category id: poultry / beef / rice / noodles
  dish_names  text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.deal_dish_options enable row level security;

drop policy if exists "anon_read_deal_dishes"    on public.deal_dish_options;
drop policy if exists "admin_manage_deal_dishes" on public.deal_dish_options;

-- Customers need to read it to build the dropdown.
create policy "anon_read_deal_dishes"
  on public.deal_dish_options for select
  to anon, authenticated
  using (true);

-- Only signed-in staff can change what's on offer.
create policy "admin_manage_deal_dishes"
  on public.deal_dish_options for all
  to authenticated
  using (true) with check (true);

-- Live updates, so a change in admin reaches open menus.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'deal_dish_options'
  ) then
    execute 'alter publication supabase_realtime add table public.deal_dish_options';
  end if;
end $$;
