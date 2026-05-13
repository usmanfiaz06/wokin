-- =====================================================================
--  WOK!N · V2 MIGRATION
--    1. Default open hours: 12:00 PM → 01:00 AM (next day)
--    2. Multi-target coupon scope  (arrays of categories / dish slugs / custom dish ids)
--    3. Cart-aware validate_coupon RPC rewritten for arrays
--    4. orders.customer_message  (admin note visible on tracking page)
--    5. RLS allows anon to look up ONE order by order_number+phone (tracking)
--  ---------------------------------------------------------------------
--  Safe to run on top of the previous migrations — every change is
--  idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.  DEFAULT HOURS: 12:00 → 01:00
-- ---------------------------------------------------------------------
update public.business_hours
   set opens_at  = '12:00'::time,
       closes_at = '01:00'::time
 where (opens_at = '10:00'::time and closes_at = '23:00'::time)
    or updated_at is null;

-- For any future seeded row
alter table public.business_hours
  alter column opens_at  set default '12:00',
  alter column closes_at set default '01:00';


-- ---------------------------------------------------------------------
-- 2. MULTI-SCOPE on coupons (arrays)
--    Add new array columns alongside the existing singular ones so old
--    rows keep working. The RPC will prefer arrays when populated.
-- ---------------------------------------------------------------------
alter table public.coupons
  add column if not exists scope_categories       text[] not null default '{}',
  add column if not exists scope_dish_slugs       text[] not null default '{}',
  add column if not exists scope_custom_dish_ids  uuid[] not null default '{}';

-- Backfill the arrays from the singular columns (idempotent)
update public.coupons
   set scope_categories      = array[scope_category]
 where scope_category is not null and array_length(scope_categories, 1) is null;

update public.coupons
   set scope_dish_slugs      = array[scope_dish_slug]
 where scope_dish_slug is not null and array_length(scope_dish_slugs, 1) is null;

update public.coupons
   set scope_custom_dish_ids = array[scope_custom_dish_id]
 where scope_custom_dish_id is not null and array_length(scope_custom_dish_ids, 1) is null;


-- ---------------------------------------------------------------------
-- 3. CART-AWARE validate_coupon RPC  (array-aware)
-- ---------------------------------------------------------------------
drop function if exists public.validate_coupon(text, jsonb);
drop function if exists public.validate_coupon(text, numeric);

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
  cats           text[];
  slugs          text[];
  customs        uuid[];
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return query select false, ''::text, 0::numeric, 'order'::text, 'Enter a code';
    return;
  end if;

  select * into c from public.coupons where code = upper(p_code);
  if not found then
    return query select false, ''::text, 0::numeric, 'order'::text, 'Invalid coupon code'; return;
  end if;
  if not c.is_active then
    return query select false, c.label, 0::numeric, c.scope, 'This coupon is no longer active'; return;
  end if;
  if c.valid_from is not null and now() < c.valid_from then
    return query select false, c.label, 0::numeric, c.scope, 'Coupon not valid yet'; return;
  end if;
  if c.valid_until is not null and now() > c.valid_until then
    return query select false, c.label, 0::numeric, c.scope, 'Coupon has expired'; return;
  end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then
    return query select false, c.label, 0::numeric, c.scope, 'Coupon usage limit reached'; return;
  end if;

  -- Effective targets — array overrides legacy singular column
  cats    := case when array_length(c.scope_categories,1) > 0 then c.scope_categories
                  when c.scope_category is not null         then array[c.scope_category]
                  else '{}'::text[] end;
  slugs   := case when array_length(c.scope_dish_slugs,1) > 0 then c.scope_dish_slugs
                  when c.scope_dish_slug is not null         then array[c.scope_dish_slug]
                  else '{}'::text[] end;
  customs := case when array_length(c.scope_custom_dish_ids,1) > 0 then c.scope_custom_dish_ids
                  when c.scope_custom_dish_id is not null         then array[c.scope_custom_dish_id]
                  else '{}'::uuid[] end;

  for it in select * from jsonb_array_elements(coalesce(p_cart, '[]'::jsonb))
  loop
    declare
      line  numeric;
      cat    text := it->>'category_id';
      slug   text := it->>'dish_slug';
      cust   text := it->>'custom_id';
      price  numeric := coalesce((it->>'price')::numeric, 0);
      qty    int     := coalesce((it->>'qty')::int, 1);
    begin
      line := price * qty;
      order_sum := order_sum + line;

      if c.scope = 'order' then
        applicable_sum := applicable_sum + line;
      elsif c.scope = 'category' and cat = any(cats) then
        applicable_sum := applicable_sum + line;
      elsif c.scope = 'dish_static' and slug is not null and slug = any(slugs) then
        applicable_sum := applicable_sum + line;
      elsif c.scope = 'dish_custom' and cust is not null and cust::uuid = any(customs) then
        applicable_sum := applicable_sum + line;
      end if;
    end;
  end loop;

  if order_sum < c.min_order then
    return query select false, c.label, 0::numeric, c.scope,
      'Minimum order Rs. ' || c.min_order::text || ' required'; return;
  end if;

  if applicable_sum <= 0 then
    return query select false, c.label, 0::numeric, c.scope,
      case
        when c.scope = 'category'  then 'Add an item from the right category to use this code'
        when c.scope in ('dish_static','dish_custom') then 'This code only works on specific dishes'
        else 'No items match this code'
      end; return;
  end if;

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


-- ---------------------------------------------------------------------
-- 4. orders.customer_message  (admin-set note shown to customer)
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists customer_message text;


-- ---------------------------------------------------------------------
-- 5. ORDER TRACKING RPC  (so anon can fetch ONE order by number+phone)
--     Avoids opening up SELECT on the whole orders table.
-- ---------------------------------------------------------------------
create or replace function public.track_order(p_order_number text, p_phone text)
returns table(
  order_number          text,
  status                text,
  order_type            text,
  area                  text,
  customer_name         text,
  delivery_address      text,
  delivery_instructions text,
  estimated_minutes     int,
  created_at            timestamptz,
  accepted_at           timestamptz,
  cooking_at            timestamptz,
  ready_at              timestamptz,
  out_at                timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,
  customer_message      text,
  total                 numeric,
  subtotal              numeric,
  tax                   numeric,
  delivery_fee          numeric,
  coupon_code           text,
  coupon_discount       numeric,
  items                 jsonb
)
language plpgsql security definer
as $$
declare
  cleaned_phone text;
begin
  cleaned_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if length(cleaned_phone) < 8 then
    return;
  end if;

  return query
  select
    o.order_number, o.status, o.order_type, o.area,
    o.customer_name, o.delivery_address, o.delivery_instructions,
    o.estimated_minutes,
    o.created_at, o.accepted_at, o.cooking_at, o.ready_at,
    o.out_at, o.delivered_at, o.cancelled_at, o.cancel_reason,
    o.customer_message,
    o.total, o.subtotal, o.tax, o.delivery_fee,
    o.coupon_code, o.coupon_discount,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'dish_name',  i.dish_name,
        'quantity',   i.quantity,
        'unit_price', i.unit_price,
        'line_total', i.line_total,
        'variant',    i.variant
      ) order by i.position) from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb) as items
  from public.orders o
  where o.order_number = upper(p_order_number)
    and regexp_replace(o.customer_phone, '\D', '', 'g') = cleaned_phone
  limit 1;
end $$;

grant execute on function public.track_order(text, text) to anon, authenticated;
