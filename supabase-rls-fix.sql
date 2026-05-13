-- =====================================================================
--  WOK!N · RLS FIX — allow anonymous customers to place orders
--  Run this ONCE in Supabase SQL Editor if you see:
--  "new row violates row-level security policy for table orders"
-- =====================================================================

-- Allow anyone (unauthenticated / anon) to INSERT new orders
drop policy if exists "anon_insert_orders" on public.orders;
create policy "anon_insert_orders"
  on public.orders for insert
  to anon
  with check (true);

-- Allow anyone to INSERT order line-items
drop policy if exists "anon_insert_order_items" on public.order_items;
create policy "anon_insert_order_items"
  on public.order_items for insert
  to anon
  with check (true);

-- Allow anyone to read their own order (needed for track page / confirmation)
drop policy if exists "anon_read_orders" on public.orders;
create policy "anon_read_orders"
  on public.orders for select
  to anon
  using (true);

drop policy if exists "anon_read_order_items" on public.order_items;
create policy "anon_read_order_items"
  on public.order_items for select
  to anon
  using (true);
