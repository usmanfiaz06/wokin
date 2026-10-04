-- =====================================================================
--  WOK!N · Site text settings
--  Lets admin edit the homepage ticker strip and the key numbers it
--  references (free-delivery threshold + delivery ETA) from Admin → Site Text.
--  One row, id = 'home'. Managed from the admin; read by the public site.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- =====================================================================

create table if not exists public.site_settings (
  id                      text primary key default 'home',
  ticker_messages         jsonb  not null default '[]'::jsonb,   -- array of strings; {threshold} and {eta} are substituted live
  free_delivery_threshold integer,                               -- Rs. — null = use site default (1800)
  eta_minutes             integer,                               -- minutes — null = use site default (45)
  updated_at              timestamptz not null default now()
);

-- Seed the single 'home' row with the current (hard-coded) copy so nothing
-- changes until an admin edits it. {threshold}/{eta} are filled in at render.
insert into public.site_settings (id, ticker_messages, free_delivery_threshold, eta_minutes)
values (
  'home',
  '["★ NEW · HOUSE COUPON WOKIN10 · 10% OFF YOUR FIRST ORDER","★ FREE DELIVERY OVER {threshold}","★ CASH ON DELIVERY ONLY","★ APPROX. {eta} MIN TO YOUR DOOR"]'::jsonb,
  1800,
  45
)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;
drop policy if exists "anon_read_settings"    on public.site_settings;
drop policy if exists "admin_manage_settings" on public.site_settings;
create policy "anon_read_settings"    on public.site_settings for select to anon, authenticated using (true);
create policy "admin_manage_settings" on public.site_settings for all    to authenticated using (true) with check (true);

-- Realtime so an admin edit shows on open storefronts without a reload.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='site_settings')
  then execute 'alter publication supabase_realtime add table public.site_settings'; end if;
end $$;
