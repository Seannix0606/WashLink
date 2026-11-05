-- =============================================================
-- WashLink B2C g (B2C-6) - prices at or above 10,000 pesos could not be saved, and large bookings overflowed commission.
-- Audit payloads refuse numbers of 1e6 or more (w3b, to catch phone-shaped values), and prices were recorded in cents. The rule
-- stays as it is: payloads now record pesos with 2 decimals under new key names (D-103). Older audit rows keep the old keys.
-- service_booking_price multiplied int4 values, which overflowed at 1000 bps from 21,474.84 pesos; it now multiplies as bigint.
-- Signatures are unchanged, so create or replace keeps each function's ACL. Local proof only (D-10, D-11).
-- =============================================================

create or replace function public.admin_save_service(p_id uuid, p_key text, p_category text, p_name text, p_description text,
  p_image_url text, p_requirements text, p_base_price_cents integer, p_duration_minutes integer, p_is_active boolean,
  p_price_is_draft boolean, p_sort_order integer)
returns public.services
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.services;
begin
  perform public.b2c_require_super_admin();
  if p_id is null then
    insert into public.services (key, category, name, description, image_url, requirements, base_price_cents, duration_minutes,
        is_active, price_is_draft, sort_order)
      values (p_key, p_category, btrim(p_name), btrim(coalesce(p_description, '')), p_image_url, btrim(coalesce(p_requirements, '')),
        p_base_price_cents, p_duration_minutes, p_is_active, p_price_is_draft, coalesce(p_sort_order, 0))
      returning * into result;
  else
    update public.services set category = p_category, name = btrim(p_name), description = btrim(coalesce(p_description, '')),
        image_url = p_image_url, requirements = btrim(coalesce(p_requirements, '')), base_price_cents = p_base_price_cents,
        duration_minutes = p_duration_minutes, is_active = p_is_active, price_is_draft = p_price_is_draft,
        sort_order = coalesce(p_sort_order, sort_order), updated_at = now()
      where id = p_id returning * into result;
    if result.id is null then
      raise exception 'Service not found.' using errcode = '42501';
    end if;
  end if;
  perform public.record_workforce_audit_event('service.saved', 'service', result.id, null,
    jsonb_build_object('base_price_pesos', round(result.base_price_cents / 100.0, 2), 'is_active', result.is_active,
      'price_is_draft', result.price_is_draft));
  return result;
end;
$$;

create or replace function public.admin_set_service_vehicle_price(p_service uuid, p_vehicle_category text, p_adjustment_cents integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.b2c_require_super_admin();
  if p_adjustment_cents is null then
    delete from public.service_vehicle_prices where service_id = p_service and vehicle_category = p_vehicle_category;
  else
    insert into public.service_vehicle_prices (service_id, vehicle_category, adjustment_cents)
      values (p_service, p_vehicle_category, p_adjustment_cents)
      on conflict (service_id, vehicle_category) do update set adjustment_cents = excluded.adjustment_cents;
  end if;
  perform public.record_workforce_audit_event('service.vehicle_price_set', 'service', p_service, null,
    jsonb_build_object('vehicle_category', p_vehicle_category, 'adjustment_pesos', round(p_adjustment_cents / 100.0, 2)));
end;
$$;

create or replace function public.admin_save_addon(p_id uuid, p_key text, p_name text, p_description text, p_price_cents integer,
  p_duration_minutes integer, p_is_active boolean, p_price_is_draft boolean, p_sort_order integer)
returns public.service_addons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.service_addons;
begin
  perform public.b2c_require_super_admin();
  if p_id is null then
    insert into public.service_addons (key, name, description, price_cents, duration_minutes, is_active, price_is_draft, sort_order)
      values (p_key, btrim(p_name), btrim(coalesce(p_description, '')), p_price_cents, coalesce(p_duration_minutes, 0), p_is_active,
              p_price_is_draft, coalesce(p_sort_order, 0))
      returning * into result;
  else
    update public.service_addons set name = btrim(p_name), description = btrim(coalesce(p_description, '')), price_cents = p_price_cents,
        duration_minutes = coalesce(p_duration_minutes, 0), is_active = p_is_active, price_is_draft = p_price_is_draft,
        sort_order = coalesce(p_sort_order, sort_order), updated_at = now()
      where id = p_id returning * into result;
    if result.id is null then
      raise exception 'Add-on not found.' using errcode = '42501';
    end if;
  end if;
  perform public.record_workforce_audit_event('service_addon.saved', 'service_addon', result.id, null,
    jsonb_build_object('price_pesos', round(result.price_cents / 100.0, 2), 'is_active', result.is_active,
      'price_is_draft', result.price_is_draft));
  return result;
end;
$$;

-- One calculation for quotes and bookings, so what a customer reviews is what they are charged.
create or replace function public.service_booking_price(p_service uuid, p_vehicle_category text, p_addons uuid[],
  p_require_final boolean)
returns table (service_name text, addon_names text[], base_price_cents integer, vehicle_adjustment_cents integer,
  addons_total_cents integer, customer_total_cents integer, commission_bps integer, platform_fee_cents integer,
  worker_earnings_cents integer, duration_minutes integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  svc public.services;
  adjustment integer;
  addon_total integer;
  addon_minutes integer;
  names text[];
  draft_addons integer;
  matched integer;
  bps integer;
  total integer;
  fee integer;
  wanted uuid[] := coalesce(p_addons, '{}');
begin
  select * into svc from public.services s where s.id = p_service and s.is_active;
  if svc.id is null then
    raise exception 'This service is not available.' using errcode = '23514';
  end if;
  select v.adjustment_cents into adjustment from public.service_vehicle_prices v
    where v.service_id = p_service and v.vehicle_category = p_vehicle_category;
  if adjustment is null then
    raise exception 'This service is not available for that vehicle type.' using errcode = '23514';
  end if;
  select coalesce(sum(a.price_cents), 0), coalesce(sum(a.duration_minutes), 0),
         coalesce(array_agg(a.name order by a.sort_order) filter (where a.id is not null), '{}'),
         count(*) filter (where a.price_is_draft), count(*)
    into addon_total, addon_minutes, names, draft_addons, matched
    from public.service_addons a where a.is_active and a.id = any (wanted);
  if matched <> (select count(distinct x) from unnest(wanted) x) then
    raise exception 'One of those add-ons is not available.' using errcode = '23514';
  end if;
  if p_require_final and (svc.price_is_draft or draft_addons > 0) then
    raise exception 'WashLink has not set final prices for this service yet.' using errcode = '23514';
  end if;
  select s.commission_bps into bps from public.platform_settings s;
  total := greatest(0, svc.base_price_cents + adjustment + addon_total);
  fee := round((total::bigint * bps) / 10000.0)::integer;
  return query select svc.name, names, svc.base_price_cents, total - svc.base_price_cents - addon_total, addon_total,
    total, bps, fee, total - fee, svc.duration_minutes + addon_minutes;
end;
$$;

notify pgrst, 'reload schema';

-- ROLLBACK (reverse order k to g; run after b2ch is rolled back):
-- Re-run the bodies of admin_save_service, admin_set_service_vehicle_price and admin_save_addon from
-- 2026_11_06_b2ce_admin_operations.sql, and service_booking_price from 2026_11_06_b2cc_booking_engine.sql. Prices of 10,000 pesos
-- or more then fail to save again. Audit rows written under the new key names stay, because audit rows are append-only.
