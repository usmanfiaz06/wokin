-- =====================================================================
--  WOK!N · QR guest leads  (table: public.qr_leads)
--  ---------------------------------------------------------------------
--  Powers the in-restaurant QR landing page at /deals. A guest scans the
--  table QR, fills in name + mobile + email, and only then sees the
--  offers. Every submission lands here and shows up in
--  Admin → GUESTS (/admin/leads.html).
--
--  SECURITY MODEL
--    anon          → INSERT only. Cannot read back what it wrote, so the
--                    guest list can never be scraped from the browser.
--    authenticated → full read / delete for the staff dashboard.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

create table if not exists public.qr_leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  email       text not null default '',   -- no longer collected; kept for older rows
  source      text not null default 'qr-deals',   -- which QR / campaign
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists qr_leads_created_at_idx on public.qr_leads (created_at desc);
create index if not exists qr_leads_phone_idx      on public.qr_leads (phone);

alter table public.qr_leads enable row level security;

drop policy if exists "anon_insert_leads"  on public.qr_leads;
drop policy if exists "admin_read_leads"   on public.qr_leads;
drop policy if exists "admin_manage_leads" on public.qr_leads;

-- Guests (anonymous) can only drop a row in. No select, no update.
create policy "anon_insert_leads"
  on public.qr_leads for insert
  to anon, authenticated
  with check (true);

-- Signed-in staff can read the whole guest list…
create policy "admin_read_leads"
  on public.qr_leads for select
  to authenticated
  using (true);

-- …and delete junk entries.
create policy "admin_manage_leads"
  on public.qr_leads for delete
  to authenticated
  using (true);

-- Optional: live updates in the admin dashboard as guests scan.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'qr_leads'
  ) then
    execute 'alter publication supabase_realtime add table public.qr_leads';
  end if;
end $$;
