-- =====================================================================
--  WOK!N · QR dine-in / tables
--  Powers per-table (and takeaway/delivery) QR codes, scan tracking,
--  dine-in orders, and the "call waiter" button. Managed from Admin → Tables.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

-- 1) Tables / QR targets ------------------------------------------------
create table if not exists public.restaurant_tables (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,                         -- "Table 1", "Takeaway", …
  kind       text not null default 'dine-in' check (kind in ('dine-in','takeaway','delivery')),
  token      text unique not null default encode(gen_random_bytes(6), 'hex'),
  is_active  boolean not null default true,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.restaurant_tables enable row level security;
drop policy if exists "anon_read_tables"    on public.restaurant_tables;
drop policy if exists "admin_manage_tables" on public.restaurant_tables;
create policy "anon_read_tables"    on public.restaurant_tables for select to anon, authenticated using (true);
create policy "admin_manage_tables" on public.restaurant_tables for all    to authenticated using (true) with check (true);

-- 2) Scan log (one row per QR scan) ------------------------------------
create table if not exists public.qr_scans (
  id         uuid primary key default gen_random_uuid(),
  token      text not null,
  created_at timestamptz not null default now()
);
create index if not exists qr_scans_token_idx on public.qr_scans (token);
alter table public.qr_scans enable row level security;
drop policy if exists "anon_insert_scans" on public.qr_scans;
drop policy if exists "admin_read_scans"  on public.qr_scans;
create policy "anon_insert_scans" on public.qr_scans for insert to anon, authenticated with check (true);
create policy "admin_read_scans"  on public.qr_scans for select to authenticated using (true);

-- 3) Waiter calls -------------------------------------------------------
create table if not exists public.waiter_calls (
  id          uuid primary key default gen_random_uuid(),
  table_label text not null,
  note        text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.waiter_calls enable row level security;
drop policy if exists "anon_insert_calls"  on public.waiter_calls;
drop policy if exists "admin_manage_calls" on public.waiter_calls;
create policy "anon_insert_calls"  on public.waiter_calls for insert to anon, authenticated with check (true);
create policy "admin_manage_calls" on public.waiter_calls for all    to authenticated using (true) with check (true);

-- 4) Orders: allow dine-in + remember the table -------------------------
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check
  check (order_type in ('delivery','pickup','dine-in'));
alter table public.orders add column if not exists table_label text;

-- 5) Realtime for the admin board --------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='waiter_calls')
  then execute 'alter publication supabase_realtime add table public.waiter_calls'; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='restaurant_tables')
  then execute 'alter publication supabase_realtime add table public.restaurant_tables'; end if;
end $$;
