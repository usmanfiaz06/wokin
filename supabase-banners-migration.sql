-- =====================================================================
--  WOK!N · deals / promo banner
--  Powers the scrolling banner across the top of the customer menu,
--  managed from Admin → Deals.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

create table if not exists public.promo_banners (
  id          uuid primary key default gen_random_uuid(),
  message     text not null,
  is_active   boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.promo_banners enable row level security;

drop policy if exists "anon_read_banners"    on public.promo_banners;
drop policy if exists "admin_manage_banners" on public.promo_banners;

-- Anyone can read (the customer site shows active banners)
create policy "anon_read_banners"
  on public.promo_banners for select
  to anon, authenticated
  using (true);

-- Only signed-in staff can add / edit / delete
create policy "admin_manage_banners"
  on public.promo_banners for all
  to authenticated
  using (true) with check (true);

-- Optional: live updates
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'promo_banners'
  ) then
    execute 'alter publication supabase_realtime add table public.promo_banners';
  end if;
end $$;
