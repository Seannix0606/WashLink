-- B2C-6: search rounds (D-94), longer scheduled offers (D-95), stored distance bands (D-96) and the base location lock (D-97).
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('b2c6-rnd-c1@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;
-- w1 to w5 are the nearest; w6 is about 5.6 km away and only gets an offer once the first group has lapsed.
insert into ids select 'w' || n, test_helpers.create_worker('b2c6-rnd-w' || n || '@local.test') from generate_series(1, 6) n;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  select pg_temp.id('w' || n), 'verified', 14.5995 + case when n = 6 then 0.05 else n * 0.001 end, 120.9842, 20, true, now() from generate_series(1, 6) n;
insert into public.independent_worker_services select pg_temp.id('w' || n), pg_temp.id('svc') from generate_series(1, 6) n;
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('w' || n), d, 0, 1440 from generate_series(1, 6) n cross join generate_series(0, 6) d;

create function pg_temp.book(p_key text, p_at timestamptz default null) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id('c1'));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', p_at is null, p_at, 'key-b2c6-' || p_key) r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.row_status(p_key text, p_worker text) returns text language sql stable as $$
  select coalesce(string_agg(d.status, ',' order by d.offered_at, d.status), '-') from public.dispatch_requests d
  where d.booking_id = pg_temp.id(p_key) and d.worker_id = pg_temp.id(p_worker) $$;
create function pg_temp.lapse(p_key text, p_worker text default null) returns void language sql as $$
  update public.dispatch_requests d set expires_at = now() - interval '1 second'
    where d.booking_id = pg_temp.id(p_key) and d.status = 'offered' and (p_worker is null or d.worker_id = pg_temp.id(p_worker)) $$;

-- ---------- a round ----------
select pg_temp.book('b1');
select test_helpers.act_as(pg_temp.id('w1'));
select public.decline_dispatch_request((select d.id from public.dispatch_requests d where d.booking_id = pg_temp.id('b1') and d.worker_id = pg_temp.id('w1')));
select test_helpers.act_as_service();
select pg_temp.lapse('b1');
select public.service_dispatch_sweep(pg_temp.id('b1'));
select is(pg_temp.row_status('b1', 'w6'), 'offered', 'expired_offer_moves_outward');
select is(pg_temp.row_status('b1', 'w2'), 'expired', 'expired_washer_not_reoffered_same_round');
select is((select distance_km from public.dispatch_requests where booking_id = pg_temp.id('b1') and worker_id = pg_temp.id('w6')), 10.0, 'stored_distance_is_band');
select test_helpers.act_as(pg_temp.id('w6'));
select results_eq($$ select d.distance_km from public.dispatch_requests d where d.booking_id = pg_temp.id('b1')
                     union all select r.distance_km from public.my_dispatch_requests() r where r.booking_id = pg_temp.id('b1') $$,
                  $$ values (10.0), (10.0) $$, 'worker_table_read_shows_band');
select test_helpers.act_as_service();

-- ---------- retry starts a new round ----------
select pg_temp.lapse('b1');
update public.service_bookings set search_expires_at = now() - interval '1 second' where id = pg_temp.id('b1');
select public.service_dispatch_sweep(pg_temp.id('b1'));
select test_helpers.act_as(pg_temp.id('c1'));
select public.retry_service_booking_search(pg_temp.id('b1')) as retried;
select test_helpers.act_as_service();
select is(pg_temp.row_status('b1', 'w2'), 'offered,superseded', 'retry_reoffers_expired_washer');
select is(pg_temp.row_status('b1', 'w1'), 'declined', 'retry_does_not_reoffer_declined_washer');

-- ---------- release starts a new round ----------
select pg_temp.book('b2');
select pg_temp.lapse('b2', 'w1');
select public.service_dispatch_sweep(pg_temp.id('b2'));
select test_helpers.act_as(pg_temp.id('w2'));
select * from public.accept_dispatch_request((select d.id from public.dispatch_requests d where d.booking_id = pg_temp.id('b2') and d.worker_id = pg_temp.id('w2')));
select public.release_service_booking(pg_temp.id('b2'), 'My van broke down today');
select test_helpers.act_as_service();
select is(pg_temp.row_status('b2', 'w1'), 'offered,superseded', 'release_reoffers_other_expired_washer');

-- ---------- offer length ----------
select pg_temp.book('sch', ((now() at time zone 'Asia/Manila')::date + 2 + interval '10 hours') at time zone 'Asia/Manila');
select is((select min(expires_at) from public.dispatch_requests where booking_id = pg_temp.id('sch')), now() + interval '60 minutes', 'scheduled_offer_lasts_sixty_minutes');
select pg_temp.book('imm');
select is((select min(expires_at) from public.dispatch_requests where booking_id = pg_temp.id('imm')), now() + interval '180 seconds', 'immediate_offer_uses_request_ttl');

-- ---------- bands ----------
select is((select array_agg(public.service_dispatch_distance_band(km) order by km) from unnest(array[0, 2, 2.01, 5, 5.01, 10, 10.01, 20, 20.01, 50, 50.01, 200]::numeric[]) km),
          array[2, 2, 5, 5, 10, 10, 20, 20, 50, 50, 200, 200]::numeric[], 'each_band_boundary');

-- Runs the statement recorded for the real migration against a row holding the old precise value.
update public.dispatch_requests set distance_km = 3.7 where booking_id = pg_temp.id('imm') and worker_id = pg_temp.id('w3');
do $$
declare
  statement text;
begin
  select st into strict statement from supabase_migrations.schema_migrations m, unnest(m.statements) st
    where m.name = 'b2ch_search_rounds_and_dispatch' and st !~* 'create or replace function'
      and st ~* 'update public\.dispatch_requests set distance_km = public\.service_dispatch_distance_band';
  execute statement;
end $$;
select is((select distance_km from public.dispatch_requests where booking_id = pg_temp.id('imm') and worker_id = pg_temp.id('w3')), 5.0, 'backfill_coarsens_old_rows');

-- ---------- base location lock ----------
select test_helpers.act_as(pg_temp.id('w3'));
select throws_ok($$ select public.save_independent_worker_profile('', '{}', 14.70, 120.9842, 20) $$, '55000',
                 'Finish or decline your open requests before changing your base location.', 'base_change_refused_with_open_offer');
select lives_ok($$ select public.save_independent_worker_profile('New bio', '{}', 14.5995 + 3 * 0.001, 120.9842, 15) $$, 'bio_change_allowed_with_open_offer');
select test_helpers.act_as_service();
update public.platform_settings set bookings_open = false;
select test_helpers.act_as(pg_temp.id('w3'));
select lives_ok($$ select public.save_independent_worker_profile('New bio', '{}', 14.69, 120.9842, 15) $$, 'base_change_allowed_while_offers_hidden_by_closed_bookings');
select test_helpers.act_as_service();
update public.platform_settings set bookings_open = true;
select test_helpers.act_as_service();
update public.dispatch_requests set expires_at = now() - interval '1 second' where worker_id = pg_temp.id('w3') and status = 'offered';
select test_helpers.act_as(pg_temp.id('w3'));
select lives_ok($$ select public.save_independent_worker_profile('New bio', '{}', 14.70, 120.9842, 20) $$, 'base_change_allowed_after_offer_expires');

select * from finish();
rollback;
