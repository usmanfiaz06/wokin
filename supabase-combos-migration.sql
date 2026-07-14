-- =====================================================================
--  WOK!N · combo deals
--  Bundle offers shown in the "COMBO DEALS" section of the customer menu,
--  managed from Admin → Combos. Each combo is added to the cart as a
--  single line item at its combo price.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

create table if not exists public.combos (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric not null default 0,
  image_path  text,
  is_active   boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.combos enable row level security;

drop policy if exists "anon_read_combos"    on public.combos;
drop policy if exists "admin_manage_combos" on public.combos;

create policy "anon_read_combos"
  on public.combos for select
  to anon, authenticated
  using (true);

create policy "admin_manage_combos"
  on public.combos for all
  to authenticated
  using (true) with check (true);

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'combos'
  ) then
    execute 'alter publication supabase_realtime add table public.combos';
  end if;
end $$;
