-- =====================================================================
--  WOK!N · SUPABASE SCHEMA
--  ---------------------------------------------------------------------
--  Run this ONCE in Supabase SQL Editor:
--    1.  Supabase dashboard → SQL Editor → New query
--    2.  Paste the entire contents of this file
--    3.  Click "Run"
--
--  After running, also enable real-time:
--    Database → Replication → enable "supabase_realtime" for both tables.
--    (The ALTER PUBLICATION statements at the bottom do this for you.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ORDERS
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id                      uuid primary key default gen_random_uuid(),
  order_number            text unique not null
                          default ('WK' || upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 6))),
  created_at              timestamptz not null default now(),

  -- order type / location
  order_type              text not null check (order_type in ('delivery','pickup')),
  area                    text,

  -- customer
  customer_name           text not null,
  customer_phone          text not null,
  customer_phone_alt      text,
  customer_email          text,

  -- delivery details
  delivery_address        text,
  delivery_landmark       text,
  delivery_map_link       text,
  delivery_gps_lat        numeric,
  delivery_gps_lng        numeric,
  delivery_instructions   text,

  -- payment
  payment_method          text not null default 'cash-on-delivery',
  change_request          text,

  -- monetary snapshot at time of order (Rs.)
  subtotal                numeric not null,
  tax                     numeric not null,
  delivery_fee            numeric not null default 0,
  coupon_code             text,
  coupon_discount         numeric not null default 0,
  total                   numeric not null,

  -- status workflow
  status                  text not null default 'new'
                          check (status in ('new','accepted','cooking','ready',
                                            'out_for_delivery','delivered','cancelled')),
  estimated_minutes       int not null default 45,
  accepted_at             timestamptz,
  cooking_at              timestamptz,
  ready_at                timestamptz,
  out_at                  timestamptz,
  delivered_at            timestamptz,
  cancelled_at            timestamptz,
  cancel_reason           text,

  -- internal notes (kitchen / rider)
  staff_notes             text
);

create index if not exists idx_orders_status     on public.orders(status);
create index if not exists idx_orders_created    on public.orders(created_at desc);
create index if not exists idx_orders_phone      on public.orders(customer_phone);

-- ---------------------------------------------------------------------
-- 2. ORDER ITEMS
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  dish_name       text not null,
  dish_category   text,
  variant         text,
  unit_price      numeric not null,
  quantity        int not null check (quantity > 0),
  line_total      numeric not null,
  notes           text,
  position        int
);

create index if not exists idx_items_order on public.order_items(order_id);

-- ---------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY
--     anon  = customer placing an order (browser)
--     auth  = admin signed in via Supabase Auth
-- ---------------------------------------------------------------------
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- Customers can place orders (INSERT) but cannot read or modify them
drop policy if exists "anon_can_place_orders"      on public.orders;
drop policy if exists "anon_can_add_order_items"   on public.order_items;
drop policy if exists "admin_full_orders"          on public.orders;
drop policy if exists "admin_full_order_items"     on public.order_items;

create policy "anon_can_place_orders"
  on public.orders for insert
  to anon, authenticated
  with check (true);

create policy "anon_can_add_order_items"
  on public.order_items for insert
  to anon, authenticated
  with check (true);

-- Admin (authenticated users) can do everything
create policy "admin_full_orders"
  on public.orders for all
  to authenticated
  using (true) with check (true);

create policy "admin_full_order_items"
  on public.order_items for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4. REAL-TIME  (admin dashboard auto-updates when new orders arrive)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'order_items'
  ) then
    execute 'alter publication supabase_realtime add table public.order_items';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. SMALL HELPERS
-- ---------------------------------------------------------------------

-- "Today's revenue / order count / avg ticket" rolled up
create or replace view public.today_summary as
  select
    count(*)                                 as order_count,
    coalesce(sum(total), 0)::numeric         as revenue,
    coalesce(round(avg(total), 0), 0)::numeric as avg_ticket,
    count(*) filter (where status = 'delivered') as delivered_count,
    count(*) filter (where status = 'cancelled') as cancelled_count
  from public.orders
  where created_at >= date_trunc('day', now() at time zone 'Asia/Karachi');

grant select on public.today_summary to authenticated;
