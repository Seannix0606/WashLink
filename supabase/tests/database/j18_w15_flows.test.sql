-- J18 / W15 (PLAN section 6): ordinary roster and booking flows are unchanged by the W15 link history and the
-- history-keyed training gate. A trainee in live required training exists at the same shop throughout, so the gate is
-- active while non-trainee rows are added, edited, linked, unlinked, assigned, started, completed and deleted.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table j18w15_ids (label text primary key, id uuid) on commit drop;
grant all on j18w15_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18w15_ids where label = p_label $$;
create function pg_temp.booking(p_label text) returns text language sql stable security definer as $$
  select b.booking_status || ',' || coalesce(b.quoted_price::text, '-') || ',' || coalesce(b.assigned_worker_id::text, '-')
  from public.bookings b where b.id = pg_temp.id(p_label) $$;
create function pg_temp.row_of(p_label text) returns text language sql stable security definer as $$
  select w.name || ',' || coalesce(w.phone_number, '-') || ',' || coalesce(u.email, '-')
  from public.workers w left join auth.users u on u.id = w.user_id where w.id = pg_temp.id(p_label) $$;
create function pg_temp.assign(p_row text, p_booking text) returns text language sql as $$
  select test_helpers.attempt(format('update public.bookings set assigned_worker_id = %s where id = %L',
                                     coalesce(quote_literal(pg_temp.id(p_row)), 'null'), pg_temp.id(p_booking))) $$;

-- ---------- fixtures ----------
insert into j18w15_ids values ('a1', test_helpers.create_super_admin('j18w15-a1@local.test')), ('c1', test_helpers.create_customer('j18w15-c1@local.test')),
                              ('o1', test_helpers.create_owner('j18w15-o1@local.test'));
insert into j18w15_ids select l, test_helpers.create_worker_profile(test_helpers.create_worker('j18w15-' || l || '@local.test'))
from unnest(array['wk', 'wm', 'wt']) l;
insert into j18w15_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
select test_helpers.set_shop_price(pg_temp.id('s1'), 'Sedan', 'Basic Wash', 250.00);
insert into j18w15_ids values ('p1', test_helpers.create_training_program(pg_temp.id('s1')));
select count(test_helpers.add_training_session(pg_temp.id('p1'), test_helpers.manila_today() + n)) as sessions from generate_series(1, 3) n;
select test_helpers.open_training_program(pg_temp.id('p1')) is not null as opened;
insert into j18w15_ids values ('rt', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('wt'))),
                              ('rm', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('wm'))),
                              ('rn', test_helpers.create_roster_worker(pg_temp.id('o1')));
insert into j18w15_ids values ('et', test_helpers.create_accepted_enrollment(pg_temp.id('p1'), pg_temp.id('wt')));
insert into j18w15_ids values ('b1', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s1'), 'accepted')),
                              ('b2', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s1'), 'accepted')),
                              ('b3', gen_random_uuid());

-- ---------- the owner adds, edits, links and unlinks a non-trainee row ----------
select test_helpers.act_as_owner('j18w15-o1@local.test');
with x as (insert into public.workers (owner_id, name) values (auth.uid(), 'J18 W15 washer') returning id) insert into j18w15_ids select 'rk', id from x;
select lives_ok(format($$ update public.workers set name = 'J18 W15 washer (edited)', phone_number = '09170000015' where id = %L $$, pg_temp.id('rk')),
                'j18_w15_owner_adds_edits_and_unlinks_non_trainee_row');
select set_config('fx.code_k', (select link_code from public.create_roster_link_code(pg_temp.id('rk'))), true);
select test_helpers.act_as_worker('j18w15-wk@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_k'))), 'linked', 'j18_w15_owner_adds_edits_and_unlinks_non_trainee_row');
select test_helpers.act_as_owner('j18w15-o1@local.test');
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('rk'))), 'succeeded',
          'j18_w15_owner_adds_edits_and_unlinks_non_trainee_row');
select test_helpers.act_as_service();
select is(pg_temp.row_of('rk'), 'J18 W15 washer (edited),09170000015,-', 'j18_w15_owner_adds_edits_and_unlinks_non_trainee_row');

-- ---------- the owner assigns, reassigns and unassigns non-trainee rows (the trainee row stays refused) ----------
select test_helpers.act_as_owner('j18w15-o1@local.test');
select is(pg_temp.assign('rm', 'b1') || ',' || pg_temp.assign('rn', 'b1') || ',' || pg_temp.assign('rk', 'b1') || ',' || pg_temp.assign(null, 'b1'),
          'succeeded,succeeded,succeeded,succeeded', 'j18_w15_owner_assigns_reassigns_and_unassigns_non_trainee');
select is(pg_temp.assign('rt', 'b1'), '23514', 'j18_w15_owner_assigns_reassigns_and_unassigns_non_trainee');
select test_helpers.act_as_service();
select is(pg_temp.booking('b1'), 'accepted,250.00,-', 'j18_w15_owner_assigns_reassigns_and_unassigns_non_trainee');

-- ---------- the assigned (linked) worker starts and completes ----------
select test_helpers.act_as_owner('j18w15-o1@local.test');
select is(pg_temp.assign('rm', 'b1'), 'succeeded', 'j18_w15_assigned_worker_starts_and_completes');
select test_helpers.act_as_worker('j18w15-wm@local.test');
select lives_ok(format($$ update public.bookings set booking_status = 'in_progress' where id = %L $$, pg_temp.id('b1')), 'j18_w15_assigned_worker_starts_and_completes');
select lives_ok(format($$ update public.bookings set booking_status = 'completed' where id = %L $$, pg_temp.id('b1')), 'j18_w15_assigned_worker_starts_and_completes');
select test_helpers.act_as_service();
select is(pg_temp.booking('b1'), 'completed,250.00,' || pg_temp.id('rm'), 'j18_w15_assigned_worker_starts_and_completes');

-- ---------- deleting an assigned roster row unassigns the booking ----------
select test_helpers.act_as_owner('j18w15-o1@local.test');
select is(pg_temp.assign('rn', 'b2') || ',' || test_helpers.attempt(format('delete from public.workers where id = %L', pg_temp.id('rn'))),
          'succeeded,succeeded', 'j18_w15_owner_deletes_roster_row_booking_unassigned');
select test_helpers.act_as_service();
select is(pg_temp.booking('b2'), 'accepted,250.00,-', 'j18_w15_owner_deletes_roster_row_booking_unassigned');

-- ---------- the customer booking insert is unchanged (server quote, no worker; a worker in the insert is refused by w2c) ----------
select test_helpers.act_as_customer('j18w15-c1@local.test');
select is(test_helpers.attempt(format($$
  insert into public.bookings (customer_name, vehicle_type, service_type, address, time, booking_status, customer_id, shop_id, assigned_worker_id)
  values ('J18 W15 Customer', 'Sedan', 'Basic Wash', 'J18 W15 address', now() + interval '1 day', 'pending', auth.uid(), %L, %L)
$$, pg_temp.id('s1'), pg_temp.id('rt'))), '42501', 'j18_w15_customer_booking_insert_unchanged');
select lives_ok(format($$
  insert into public.bookings (id, customer_name, vehicle_type, service_type, address, time, booking_status, customer_id, shop_id,
                               latitude, longitude, customer_notes, quoted_price)
  values (%L, 'J18 W15 Customer', 'Sedan', 'Basic Wash', 'J18 W15 address', now() + interval '1 day', 'pending',
          auth.uid(), %L, 14.5995, 120.9842, 'Ring the bell', 1.00)
$$, pg_temp.id('b3'), pg_temp.id('s1')), 'j18_w15_customer_booking_insert_unchanged');
select test_helpers.act_as_service();
select is(pg_temp.booking('b3'), 'pending,250.00,-', 'j18_w15_customer_booking_insert_unchanged');

select * from finish();
rollback;
