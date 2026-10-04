-- =====================================================================
--  WOK!N · admin-managed delivery areas
--  Powers the area list in the location pop-up and checkout, managed
--  from Admin → Areas. If no rows exist, the site falls back to its
--  built-in area list.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

create table if not exists public.delivery_areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.delivery_areas enable row level security;

drop policy if exists "anon_read_areas"    on public.delivery_areas;
drop policy if exists "admin_manage_areas" on public.delivery_areas;

create policy "anon_read_areas"
  on public.delivery_areas for select
  to anon, authenticated
  using (true);

create policy "admin_manage_areas"
  on public.delivery_areas for all
  to authenticated
  using (true) with check (true);

-- Seed with the current areas (only if the table is empty)
insert into public.delivery_areas (name, position)
select name, ord from (values
  ('Gulberg Greens',0),('Ghauri Town',1),('Naval Anchorage',2),('Koral Town',3),
  ('Soan Garden',4),('CBR Town',5),('PWD',6),('Pakistan Town',7),
  ('Airport Housing Society',8),('Khanna Pul',9)
) as seed(name,ord)
where not exists (select 1 from public.delivery_areas);
