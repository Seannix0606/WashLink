-- =============================================================
-- WashLink B2C e - super_admin operations: catalog, prices, settings, worker verification and monitoring.
-- Every function checks the caller's profile role and audits changes without free text. Local proof only (D-10, D-11).
-- =============================================================

create or replace function public.b2c_require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Only a platform administrator can do this.' using errcode = '42501';
  end if;
end;
$$;

-- A saved price is final unless the admin keeps it as a draft; draft prices cannot be booked.
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
    jsonb_build_object('base_price_cents', result.base_price_cents, 'is_active', result.is_active, 'price_is_draft', result.price_is_draft));
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
    jsonb_build_object('vehicle_category', p_vehicle_category, 'adjustment_cents', p_adjustment_cents));
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
    jsonb_build_object('price_cents', result.price_cents, 'is_active', result.is_active, 'price_is_draft', result.price_is_draft));
  return result;
end;
$$;

create or replace function public.admin_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.b2c_require_super_admin();
  return jsonb_build_object(
    'services', (select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]') from public.services s),
    'addons', (select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order), '[]') from public.service_addons a),
    'vehiclePrices', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.service_vehicle_prices v),
    'settings', (select to_jsonb(p) from public.platform_settings p));
end;
$$;

-- Opening bookings is refused while any active service still has a draft price, so draft numbers can't reach a customer.
create or replace function public.admin_update_platform_rules(p_bookings_open boolean, p_commission_bps integer,
  p_request_ttl_seconds integer, p_search_window_minutes integer, p_travel_buffer_minutes integer)
returns public.platform_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.platform_settings;
begin
  perform public.b2c_require_super_admin();
  if p_bookings_open and exists (select 1 from public.services s where s.is_active and s.price_is_draft) then
    raise exception 'Set final prices for every active service before opening bookings.' using errcode = '23514';
  end if;
  update public.platform_settings set bookings_open = p_bookings_open, commission_bps = p_commission_bps,
      request_ttl_seconds = p_request_ttl_seconds, search_window_minutes = p_search_window_minutes,
      travel_buffer_minutes = p_travel_buffer_minutes, updated_at = now()
    where id returning * into result;
  perform public.record_workforce_audit_event('platform_settings.updated', 'platform_settings', null, null,
    jsonb_build_object('bookings_open', result.bookings_open, 'commission_bps', result.commission_bps));
  return result;
end;
$$;

create or replace function public.admin_independent_workers()
returns table (profile_id uuid, full_name text, phone_number text, verification_status text, verification_note text, bio text,
  skills text[], has_service_area boolean, service_radius_km numeric, is_online boolean, last_seen_at timestamptz,
  completed_count integer, average_rating numeric, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.b2c_require_super_admin();
  return query
    select w.profile_id, p.full_name, p.phone_number, w.verification_status, w.verification_note, w.bio, w.skills,
      w.base_latitude is not null, w.service_radius_km, w.is_online, w.last_seen_at,
      (select count(*)::int from public.service_bookings b where b.worker_id = w.profile_id and b.status = 'completed'),
      (select round(avg(r.rating), 2) from public.service_booking_reviews r where r.worker_id = w.profile_id), w.created_at
    from public.independent_workers w join public.profiles p on p.id = w.profile_id
    order by case w.verification_status when 'pending' then 0 else 1 end, w.created_at desc limit 500;
end;
$$;

create or replace function public.admin_review_independent_worker(p_worker uuid, p_status text, p_note text default null)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.independent_workers;
begin
  perform public.b2c_require_super_admin();
  if p_status not in ('verified', 'rejected', 'suspended', 'pending') then
    raise exception 'Choose a verification status.' using errcode = '22023';
  end if;
  update public.independent_workers set verification_status = p_status, verification_note = nullif(btrim(coalesce(p_note, '')), ''),
      verified_at = case when p_status = 'verified' then now() end, verified_by = auth.uid(),
      is_online = case when p_status = 'verified' then is_online else false end, updated_at = now()
    where profile_id = p_worker returning * into result;
  if result.profile_id is null then
    raise exception 'Worker not found.' using errcode = '42501';
  end if;
  perform public.record_workforce_audit_event('independent_worker.reviewed', 'independent_worker', p_worker, p_worker,
    jsonb_build_object('verification_status', p_status));
  return result;
end;
$$;

-- Case reads are audited because they include a customer's address.
create or replace function public.admin_service_bookings(p_status text default null)
returns table (booking_id uuid, reference text, status text, service_name text, vehicle_category text, is_immediate boolean,
  scheduled_at timestamptz, customer_total_cents integer, platform_fee_cents integer, worker_earnings_cents integer,
  payment_status text, customer_name text, worker_name text, open_offers integer, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.b2c_require_super_admin();
  return query
    select b.id, b.reference, b.status, b.service_name, b.vehicle_category, b.is_immediate, b.scheduled_at, b.customer_total_cents,
      b.platform_fee_cents, b.worker_earnings_cents, b.payment_status, c.full_name, w.full_name,
      (select count(*)::int from public.dispatch_requests d where d.booking_id = b.id and d.status = 'offered'), b.created_at
    from public.service_bookings b
    left join public.profiles c on c.id = b.customer_id
    left join public.profiles w on w.id = b.worker_id
    where p_status is null or b.status = p_status
    order by b.created_at desc limit 200;
end;
$$;

create or replace function public.admin_service_booking_case(p_booking uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.b2c_require_super_admin();
  select jsonb_build_object(
      'booking', to_jsonb(b) - 'submission_key',
      'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]') from public.service_booking_status_events e where e.booking_id = b.id),
      'dispatch', (select coalesce(jsonb_agg(to_jsonb(d) order by d.offered_at), '[]') from public.dispatch_requests d where d.booking_id = b.id),
      'review', (select to_jsonb(r) from public.service_booking_reviews r where r.booking_id = b.id))
    into result from public.service_bookings b where b.id = p_booking;
  if result is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  perform public.record_workforce_audit_event('service_booking.case_viewed', 'service_booking', p_booking, null, '{}'::jsonb);
  return result;
end;
$$;

create or replace function public.admin_b2c_summary()
returns table (customers integer, workers_pending integer, workers_verified integer, workers_online integer, bookings_searching integer,
  bookings_active integer, bookings_completed integer, bookings_no_worker integer, customer_total_cents bigint, platform_fee_cents bigint,
  worker_earnings_cents bigint, bookings_open boolean, draft_prices integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.b2c_require_super_admin();
  return query select
    (select count(*)::int from public.profiles where role = 'customer'),
    (select count(*)::int from public.independent_workers where verification_status = 'pending'),
    (select count(*)::int from public.independent_workers where verification_status = 'verified'),
    (select count(*)::int from public.independent_workers w cross join public.platform_settings s
       where w.is_online and w.last_seen_at >= now() - make_interval(mins => s.heartbeat_stale_minutes)),
    (select count(*)::int from public.service_bookings where status = 'searching_for_worker'),
    (select count(*)::int from public.service_bookings where status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress')),
    (select count(*)::int from public.service_bookings where status = 'completed'),
    (select count(*)::int from public.service_bookings where status = 'no_worker_available'),
    (select coalesce(sum(b.customer_total_cents), 0)::bigint from public.service_bookings b where b.status = 'completed'),
    (select coalesce(sum(b.platform_fee_cents), 0)::bigint from public.service_bookings b where b.status = 'completed'),
    (select coalesce(sum(b.worker_earnings_cents), 0)::bigint from public.service_bookings b where b.status = 'completed'),
    (select p.bookings_open from public.platform_settings p),
    (select count(*)::int from public.services s where s.is_active and s.price_is_draft);
end;
$$;

-- Lets the public site show whether booking is open without exposing the settings table.
create or replace function public.b2c_public_status()
returns table (bookings_open boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.bookings_open from public.platform_settings p
$$;

revoke all on function public.b2c_require_super_admin() from public, anon, authenticated, service_role;
revoke all on function public.admin_save_service(uuid, text, text, text, text, text, text, integer, integer, boolean, boolean, integer),
  public.admin_set_service_vehicle_price(uuid, text, integer),
  public.admin_save_addon(uuid, text, text, text, integer, integer, boolean, boolean, integer), public.admin_catalog(),
  public.admin_update_platform_rules(boolean, integer, integer, integer, integer), public.admin_independent_workers(),
  public.admin_review_independent_worker(uuid, text, text), public.admin_service_bookings(text),
  public.admin_service_booking_case(uuid), public.admin_b2c_summary(), public.b2c_public_status()
  from public, anon, service_role;
grant execute on function public.admin_save_service(uuid, text, text, text, text, text, text, integer, integer, boolean, boolean, integer),
  public.admin_set_service_vehicle_price(uuid, text, integer),
  public.admin_save_addon(uuid, text, text, text, integer, integer, boolean, boolean, integer), public.admin_catalog(),
  public.admin_update_platform_rules(boolean, integer, integer, integer, integer), public.admin_independent_workers(),
  public.admin_review_independent_worker(uuid, text, text), public.admin_service_bookings(text),
  public.admin_service_booking_case(uuid), public.admin_b2c_summary(), public.b2c_public_status()
  to authenticated;
grant execute on function public.b2c_public_status() to anon;

notify pgrst, 'reload schema';

-- ROLLBACK (first of the B2C blocks):
-- begin;
-- drop function if exists public.b2c_public_status(), public.admin_b2c_summary(), public.admin_service_booking_case(uuid),
--   public.admin_service_bookings(text), public.admin_review_independent_worker(uuid, text, text), public.admin_independent_workers(),
--   public.admin_update_platform_rules(boolean, integer, integer, integer, integer), public.admin_catalog(),
--   public.admin_save_addon(uuid, text, text, text, integer, integer, boolean, boolean, integer),
--   public.admin_set_service_vehicle_price(uuid, text, integer),
--   public.admin_save_service(uuid, text, text, text, text, text, text, integer, integer, boolean, boolean, integer),
--   public.b2c_require_super_admin();
-- commit;
