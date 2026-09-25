-- =====================================================================
--  WOK!N · delivery deals  (table: public.delivery_deals)
--  ---------------------------------------------------------------------
--  The bundles shown in DELIVERY DEALS on the customer menu and on the
--  in-restaurant QR page. Managed from Admin → DELIVERY.
--
--  items is an ordered JSON array. Each entry is either
--     "Fish crackers"                                  — plain text, or
--     {"pick":"poultry","label":"Half chicken dish"}   — the customer
--       chooses a dish, from the category named by "pick". Which dishes
--       that dropdown may offer is set in deal_dish_options.
--
--  AN EMPTY TABLE IS FINE: both pages fall back to the five deals built
--  into delivery-deals.js, so nothing breaks before anyone edits them.
--  Admin → DELIVERY has a button to write those five in as a starting
--  point.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

create table if not exists public.delivery_deals (
  id          text primary key,              -- slug: duo / trio / family …
  name        text not null,
  price       numeric not null default 0,    -- excludes tax, as the menu does
  serves      text,                          -- "For 2 people"
  hero        text,                          -- menu dish whose photo fronts the card
  items       jsonb not null default '[]'::jsonb,
  note        text,                          -- e.g. "Selected dishes apply"
  is_popular  boolean not null default false,
  is_active   boolean not null default true,
  position    int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

create index if not exists delivery_deals_position_idx on public.delivery_deals (position);

alter table public.delivery_deals enable row level security;

drop policy if exists "anon_read_delivery_deals"    on public.delivery_deals;
drop policy if exists "admin_manage_delivery_deals" on public.delivery_deals;

-- Customers need to read them to see the deals.
create policy "anon_read_delivery_deals"
  on public.delivery_deals for select
  to anon, authenticated
  using (true);

-- Only signed-in staff can add, edit or remove a deal.
create policy "admin_manage_delivery_deals"
  on public.delivery_deals for all
  to authenticated
  using (true) with check (true);

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'delivery_deals'
  ) then
    execute 'alter publication supabase_realtime add table public.delivery_deals';
  end if;
end $$;
