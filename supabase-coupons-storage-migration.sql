-- =====================================================================
--  WOK!N · COUPONS + DISH-IMAGES MIGRATION
--  ---------------------------------------------------------------------
--  Run this ONCE in Supabase SQL Editor, AFTER the previous migrations.
--
--  Adds:
--   1. coupons table  + validate_coupon() RPC  + usage-count trigger
--   2. dish-images storage bucket (public read, admin write)
--   3. image_path column on custom_dishes
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COUPONS
-- ---------------------------------------------------------------------
create table if not exists public.coupons (
  code            text primary key,                                      -- always uppercase
  label           text not null,                                         -- user-facing label
  description     text,
  discount_type   text not null check (discount_type in ('percent','flat')),
  discount_value  numeric not null check (discount_value > 0),
  min_order       numeric not null default 0,
  max_discount    numeric,                                               -- cap for percent type
  valid_from      timestamptz,
  valid_until     timestamptz,
  usage_limit     int,                                                   -- null = unlimited
  used_count      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id)
);

create index if not exists idx_coupons_active on public.coupons(is_active);

-- RLS: anon CANNOT list coupons (prevents harvesting all codes)
--      only the RPC below validates a specific code
alter table public.coupons enable row level security;

drop policy if exists "admin_full_coupons" on public.coupons;
create policy "admin_full_coupons"
  on public.coupons for all
  to authenticated
  using (true) with check (true);

-- updated_at + updated_by auto-set
create or replace function public._touch_coupons()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.code       := upper(new.code);
  return new;
end $$;

drop trigger if exists trg_touch_coupons on public.coupons;
create trigger trg_touch_coupons
  before insert or update on public.coupons
  for each row execute function public._touch_coupons();

-- Server-side validator. Customers call this via RPC; they never see
-- the coupons table directly. Returns ONE row:
--   valid, label, discount_amount, message
create or replace function public.validate_coupon(p_code text, p_order_total numeric)
returns table(valid boolean, label text, discount_amount numeric, message text)
language plpgsql security definer
as $$
declare
  c record;
  d numeric;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return query select false, ''::text, 0::numeric, 'Enter a code';
    return;
  end if;

  select * into c from public.coupons where code = upper(p_code);
  if not found then
    return query select false, ''::text, 0::numeric, 'Invalid coupon code';
    return;
  end if;
  if not c.is_active then
    return query select false, c.label, 0::numeric, 'This coupon is no longer active';
    return;
  end if;
  if c.valid_from is not null and now() < c.valid_from then
    return query select false, c.label, 0::numeric, 'Coupon not valid yet';
    return;
  end if;
  if c.valid_until is not null and now() > c.valid_until then
    return query select false, c.label, 0::numeric, 'Coupon has expired';
    return;
  end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then
    return query select false, c.label, 0::numeric, 'Coupon usage limit reached';
    return;
  end if;
  if coalesce(p_order_total, 0) < c.min_order then
    return query select false, c.label, 0::numeric,
      'Minimum order Rs. ' || c.min_order::text || ' required';
    return;
  end if;

  if c.discount_type = 'percent' then
    d := p_order_total * c.discount_value / 100;
    if c.max_discount is not null then d := least(d, c.max_discount); end if;
  else
    d := c.discount_value;
  end if;
  d := least(d, p_order_total);

  return query select true, c.label, round(d, 0)::numeric, 'Coupon applied';
end $$;

grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;

-- Increment used_count whenever an order with a coupon is placed
create or replace function public._bump_coupon_used()
returns trigger language plpgsql security definer as $$
begin
  if new.coupon_code is not null and length(new.coupon_code) > 0 then
    update public.coupons
       set used_count = used_count + 1, updated_at = now()
     where code = upper(new.coupon_code);
  end if;
  return new;
end $$;

drop trigger if exists trg_bump_coupon_used on public.orders;
create trigger trg_bump_coupon_used
  after insert on public.orders
  for each row execute function public._bump_coupon_used();

-- Realtime so admin's coupon dashboard updates live
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'coupons'
  ) then
    execute 'alter publication supabase_realtime add table public.coupons';
  end if;
end $$;

-- Seed a few default coupons (idempotent)
insert into public.coupons (code, label, description, discount_type, discount_value, min_order, max_discount)
values
  ('WOKIN10',  '10% off your first order',  'Welcome offer',           'percent', 10, 0,    500),
  ('FRESH15',  '15% off your meal',          'Mid-week pick-me-up',     'percent', 15, 1000, 800),
  ('WOKHOUSE', 'Rs. 250 off',                'House coupon',            'flat',    250, 1500, null)
on conflict (code) do nothing;


-- ---------------------------------------------------------------------
-- 2. STORAGE BUCKET  for custom dish photos
-- ---------------------------------------------------------------------
-- create the bucket as PUBLIC so the customer site can read images
insert into storage.buckets (id, name, public)
values ('dish-images', 'dish-images', true)
on conflict (id) do nothing;

-- Drop & recreate policies for the bucket
drop policy if exists "dish_images_public_read" on storage.objects;
drop policy if exists "dish_images_admin_write" on storage.objects;
drop policy if exists "dish_images_admin_delete" on storage.objects;

create policy "dish_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'dish-images');

create policy "dish_images_admin_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'dish-images');

create policy "dish_images_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'dish-images');


-- ---------------------------------------------------------------------
-- 3. CUSTOM DISHES — image_path column
-- ---------------------------------------------------------------------
alter table public.custom_dishes
  add column if not exists image_path text;        -- e.g. "1736-special.jpg"


-- ---------------------------------------------------------------------
-- 4. SCOPE + AUTO-APPLY on coupons
--    A coupon (or "promotion") can either:
--      - require a CODE (typed at checkout)  OR
--      - apply AUTOMATICALLY (no code; shown as crossed-out price)
--    And it can be scoped to:
--      - 'order'        — whole subtotal
--      - 'category'     — only matching items
--      - 'dish_static'  — only one static menu dish
--      - 'dish_custom'  — only one custom_dishes row
-- ---------------------------------------------------------------------
alter table public.coupons
  add column if not exists scope text not null default 'order'
    check (scope in ('order','category','dish_static','dish_custom')),
  add column if not exists scope_category text,
  add column if not exists scope_dish_slug text,
  add column if not exists scope_custom_dish_id uuid references public.custom_dishes(id) on delete set null,
  add column if not exists is_auto_apply boolean not null default false;

-- Let the customer site read AUTO-APPLY coupons so it can render the
-- crossed-out original / discounted price on the menu.  We deliberately
-- NEVER expose code-required coupons to anon (prevents harvesting).
drop policy if exists "anon_read_auto_promos" on public.coupons;
create policy "anon_read_auto_promos"
  on public.coupons for select
  to anon, authenticated
  using (is_auto_apply = true and is_active = true);

-- ---------------------------------------------------------------------
-- 5. CART-AWARE validate_coupon RPC
--    Takes the whole cart so it can compute matching subtotal for scoped
--    coupons. Cart shape:
--      [{"category_id":"poultry","dish_slug":"kung-pao-chicken",
--        "custom_id":null,"price":1500,"qty":1}, ...]
-- ---------------------------------------------------------------------
drop function if exists public.validate_coupon(text, numeric);
drop function if exists public.validate_coupon(text, jsonb);

create or replace function public.validate_coupon(p_code text, p_cart jsonb)
returns table(
  valid           boolean,
  label           text,
  discount_amount numeric,
  scope           text,
  message         text
)
language plpgsql security definer
as $$
declare
  c              record;
  applicable_sum numeric := 0;
  order_sum      numeric := 0;
  d              numeric;
  it             jsonb;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return query select false, ''::text, 0::numeric, 'order'::text, 'Enter a code';
    return;
  end if;

  select * into c from public.coupons where code = upper(p_code);
  if not found then
    return query select false, ''::text, 0::numeric, 'order'::text, 'Invalid coupon code';
    return;
  end if;
  if not c.is_active then
    return query select false, c.label, 0::numeric, c.scope, 'This coupon is no longer active';
    return;
  end if;
  if c.valid_from is not null and now() < c.valid_from then
    return query select false, c.label, 0::numeric, c.scope, 'Coupon not valid yet';
    return;
  end if;
  if c.valid_until is not null and now() > c.valid_until then
    return query select false, c.label, 0::numeric, c.scope, 'Coupon has expired';
    return;
  end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then
    return query select false, c.label, 0::numeric, c.scope, 'Coupon usage limit reached';
    return;
  end if;

  -- Walk the cart, accumulate totals
  for it in select * from jsonb_array_elements(coalesce(p_cart, '[]'::jsonb))
  loop
    declare
      line numeric;
      cat   text := it->>'category_id';
      slug  text := it->>'dish_slug';
      cust  text := it->>'custom_id';
      price numeric := (it->>'price')::numeric;
      qty   int     := coalesce((it->>'qty')::int, 1);
    begin
      line := price * qty;
      order_sum := order_sum + line;

      if c.scope = 'order' then
        applicable_sum := applicable_sum + line;
      elsif c.scope = 'category' and cat = c.scope_category then
        applicable_sum := applicable_sum + line;
      elsif c.scope = 'dish_static' and slug is not null and slug = c.scope_dish_slug then
        applicable_sum := applicable_sum + line;
      elsif c.scope = 'dish_custom' and cust is not null and cust::uuid = c.scope_custom_dish_id then
        applicable_sum := applicable_sum + line;
      end if;
    end;
  end loop;

  if order_sum < c.min_order then
    return query select false, c.label, 0::numeric, c.scope,
      'Minimum order Rs. ' || c.min_order::text || ' required';
    return;
  end if;

  if applicable_sum <= 0 then
    return query select false, c.label, 0::numeric, c.scope,
      case
        when c.scope = 'category'     then 'Add an item from ' || coalesce(c.scope_category, 'the right category') || ' to use this code'
        when c.scope in ('dish_static','dish_custom') then 'This code only works on a specific dish'
        else 'No items match this code'
      end;
    return;
  end if;

  -- Compute discount on the applicable subtotal
  if c.discount_type = 'percent' then
    d := applicable_sum * c.discount_value / 100;
    if c.max_discount is not null then d := least(d, c.max_discount); end if;
  else
    d := c.discount_value;
  end if;
  d := least(d, applicable_sum);

  return query select true, c.label, round(d, 0)::numeric, c.scope, 'Coupon applied';
end $$;

grant execute on function public.validate_coupon(text, jsonb) to anon, authenticated;
