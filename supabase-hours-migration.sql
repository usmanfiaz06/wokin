-- =====================================================================
--  WOK!N · BUSINESS HOURS + APP SETTINGS MIGRATION
--  ---------------------------------------------------------------------
--  Run this ONCE in Supabase SQL Editor.  All times are interpreted in
--  Pakistan Standard Time (Asia/Karachi, UTC+5, no DST).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. business_hours  — one row per weekday (0=Sun..6=Sat)
-- ---------------------------------------------------------------------
create table if not exists public.business_hours (
  day_of_week   int primary key check (day_of_week between 0 and 6),
  opens_at      time not null default '10:00',
  closes_at     time not null default '23:00',
  is_closed     boolean not null default false,        -- closed all day
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

-- Seed all 7 days (idempotent)
insert into public.business_hours (day_of_week, opens_at, closes_at, is_closed)
select g.day, '10:00'::time, '23:00'::time, false
from generate_series(0, 6) as g(day)
on conflict (day_of_week) do nothing;

alter table public.business_hours enable row level security;

drop policy if exists "anon_read_hours"     on public.business_hours;
drop policy if exists "admin_write_hours"   on public.business_hours;

create policy "anon_read_hours"
  on public.business_hours for select
  to anon, authenticated
  using (true);

create policy "admin_write_hours"
  on public.business_hours for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 2. app_settings  — single-row global toggles (force-closed etc.)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id              int primary key default 1 check (id = 1),  -- enforce single row
  force_closed    boolean not null default false,
  closed_message  text default 'We''re taking a quick break. Please check back soon.',
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "anon_read_settings"   on public.app_settings;
drop policy if exists "admin_write_settings" on public.app_settings;

create policy "anon_read_settings"
  on public.app_settings for select
  to anon, authenticated
  using (true);

create policy "admin_write_settings"
  on public.app_settings for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 3. Auto-touch updated_at + updated_by
-- ---------------------------------------------------------------------
create or replace function public._touch_hours()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_touch_hours on public.business_hours;
create trigger trg_touch_hours
  before insert or update on public.business_hours
  for each row execute function public._touch_hours();

drop trigger if exists trg_touch_settings on public.app_settings;
create trigger trg_touch_settings
  before insert or update on public.app_settings
  for each row execute function public._touch_hours();

-- ---------------------------------------------------------------------
-- 4. Realtime — so the customer banner updates the moment an admin
--    flips the force-closed toggle or edits hours.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'business_hours'
  ) then
    execute 'alter publication supabase_realtime add table public.business_hours';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'app_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.app_settings';
  end if;
end $$;
