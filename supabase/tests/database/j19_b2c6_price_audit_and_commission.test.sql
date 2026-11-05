-- B2C-6: prices at or above 10,000 pesos save and are audited in pesos (D-103), the audit rule itself is unchanged, and commission
-- no longer overflows int4. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table ids on commit drop as
  select test_helpers.create_super_admin('b2c6-price-admin@local.test') as admin,
         test_helpers.create_customer('b2c6-price-customer@local.test') as customer,
         (select id from public.services where key = 'full_wash') as svc,
         (select id from public.service_addons where key = 'wax') as addon;
grant select on ids to public;
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, commission_bps = 1000;

create function pg_temp.save_price(p_cents integer) returns void language sql as $$
  select public.admin_save_service(s.id, s.key, s.category, s.name, s.description, s.image_url, s.requirements, p_cents,
    s.duration_minutes, s.is_active, false, s.sort_order) from public.services s where s.key = 'full_wash';
$$;
create function pg_temp.save_addon(p_cents integer) returns void language sql as $$
  select public.admin_save_addon(a.id, a.key, a.name, a.description, p_cents, a.duration_minutes, a.is_active, false, a.sort_order)
    from public.service_addons a where a.key = 'wax';
$$;

select test_helpers.act_as((select admin from ids));
select lives_ok($$ select pg_temp.save_price(1000000) $$, 'price_ten_thousand_pesos_saves');
select lives_ok($$ select pg_temp.save_addon(1000000) $$, 'addon_ten_thousand_pesos_saves');
select lives_ok($$ select public.admin_set_service_vehicle_price((select svc from ids), 'suv', 1000000) $$, 'vehicle_adjustment_one_million_cents_saves');

select test_helpers.act_as_service();
select is((select (select (payload ->> 'base_price_pesos') || ',' || (payload ? 'base_price_cents')::text from public.workforce_audit_events
                   where action = 'service.saved' order by id desc limit 1)
                  || '|' || (select (payload ->> 'price_pesos') || ',' || (payload ? 'price_cents')::text from public.workforce_audit_events
                             where action = 'service_addon.saved' order by id desc limit 1)
                  || '|' || (select (payload ->> 'adjustment_pesos') || ',' || (payload ? 'adjustment_cents')::text from public.workforce_audit_events
                             where action = 'service.vehicle_price_set' order by id desc limit 1)),
          '10000.00,false|10000.00,false|10000.00,false', 'audit_records_price_in_pesos');
select ok(not public.workforce_audit_payload_is_safe('{"price_cents": 1000000}'::jsonb)
          and public.workforce_audit_payload_is_safe('{"price_cents": 999999}'::jsonb), 'audit_rule_still_rejects_large_number');

-- 30,000 pesos at 10 percent: the int4 product 3,000,000 * 1000 overflowed before.
select test_helpers.act_as((select admin from ids));
select pg_temp.save_price(3000000);
select test_helpers.act_as((select customer from ids));
select results_eq($$ select customer_total_cents, platform_fee_cents, worker_earnings_cents
                     from public.service_booking_quote((select svc from ids), 'sedan') $$,
                  $$ values (3000000, 300000, 2700000) $$, 'commission_30000_pesos_at_10_percent_exact');
create temporary table made on commit drop as
  select * from public.create_service_booking((select svc from ids), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', true, null, 'key-b2c6-price-1');
grant select on made to public;
select results_eq($$ select b.customer_total_cents, b.platform_fee_cents, b.worker_earnings_cents from public.service_bookings b
                     where b.id = (select booking_id from made) $$,
                  $$ values (3000000, 300000, 2700000) $$, 'booking_above_int4_product_created');

-- The largest price every column allows, at 100 percent.
select test_helpers.act_as((select admin from ids));
select lives_ok($$ select pg_temp.save_price(10000000) $$, 'price_maximum_saves');
select public.admin_set_service_vehicle_price((select svc from ids), 'suv', 10000000);
select pg_temp.save_addon(10000000);
select public.admin_update_platform_rules(true, 10000, 180, 30, 30);
select test_helpers.act_as((select customer from ids));
select results_eq($$ select customer_total_cents, platform_fee_cents, worker_earnings_cents
                     from public.service_booking_quote((select svc from ids), 'suv', array[(select addon from ids)]) $$,
                  $$ values (30000000, 30000000, 0) $$, 'commission_maximum_price_at_100_percent_exact');

select * from finish();
rollback;
