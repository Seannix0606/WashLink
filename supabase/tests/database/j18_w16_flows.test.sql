-- J18 / W16 (PLAN section 5; D-83, D-86): shop deletion with openings, applications and a trainee still works, ordinary
-- booking flows around a deleted shop are unchanged, owner account deletion still cascades with a held enrollment, and the
-- documented W16-L4 data loss of a shop deletion is pinned. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temporary table j18w16_ids (label text primary key, id uuid) on commit drop;
grant all on j18w16_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18w16_ids where label = p_label $$;
create function pg_temp.email(p_tag text) returns text language sql immutable as $$ select 'j18w16-' || p_tag || '@local.test' $$;
create function pg_temp.trainee(p_tag text, p_owner text default 'o1') returns void language plpgsql as $$
begin
  insert into j18w16_ids values ('s_' || p_tag, test_helpers.create_verified_shop(pg_temp.id(p_owner), pg_temp.id('a1')));
  insert into j18w16_ids values ('p_' || p_tag, test_helpers.create_training_program(pg_temp.id('s_' || p_tag)));
  perform test_helpers.add_training_session(pg_temp.id('p_' || p_tag), test_helpers.manila_today() - n) from generate_series(1, 3) n;
  perform test_helpers.open_training_program(pg_temp.id('p_' || p_tag));
  insert into j18w16_ids values ('w_' || p_tag, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email(p_tag))));
  insert into j18w16_ids values ('r_' || p_tag, test_helpers.create_roster_worker(pg_temp.id(p_owner), pg_temp.id('w_' || p_tag)));
  insert into j18w16_ids values ('e_' || p_tag, test_helpers.create_accepted_enrollment(pg_temp.id('p_' || p_tag), pg_temp.id('w_' || p_tag)));
end $$;
create function pg_temp.set_status(p_booking text, p_status text) returns text language sql as $$
  select test_helpers.attempt(format('update public.bookings set booking_status = %L where id = %L', p_status, pg_temp.id(p_booking))) $$;

-- ---------- fixtures ----------
insert into j18w16_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1'))), ('c1', test_helpers.create_customer(pg_temp.email('c1'))),
                              ('by', test_helpers.create_customer(pg_temp.email('by'))),
                              ('o1', test_helpers.create_owner(pg_temp.email('o1'))), ('o3', test_helpers.create_owner(pg_temp.email('o3')));
insert into j18w16_ids select l, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email(l))) from unnest(array['wa', 'wn', 'wk']) l;
insert into j18w16_ids values ('s_main', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
select pg_temp.trainee('t');
insert into j18w16_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s_t'), 'J18 W16 opening')));
insert into j18w16_ids values ('app_a', test_helpers.create_job_application(pg_temp.id('j1'), pg_temp.id('wa'), 'accepted')),
                              ('app_n', test_helpers.create_job_application(pg_temp.id('j1'), pg_temp.id('wn'), 'submitted'));
insert into j18w16_ids values ('b_del_p', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s_t'))),
                              ('b_del_c', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s_t'), 'completed'));

-- ---------- the owner deletes a shop that has an opening, applications and a trainee ----------
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(test_helpers.attempt(format('delete from public.shops where id = %L', pg_temp.id('s_t'))), 'succeeded', 'j18_w16_owner_deletes_shop_with_openings_applications_and_trainee');
select test_helpers.act_as_service();
select is((select count(*)::int from public.shops where id = pg_temp.id('s_t')) || ',' || (select count(*)::int from public.job_openings where id = pg_temp.id('j1'))
           || ',' || (select count(*)::int from public.shops where id = pg_temp.id('s_main')), '0,0,1', 'j18_w16_owner_deletes_shop_with_openings_applications_and_trainee');
select is((select status || ',' || (shop_id is null)::text from public.training_enrollments where id = pg_temp.id('e_t')), 'accepted,true',
          'j18_w16_owner_deletes_shop_with_openings_applications_and_trainee');
select is((select count(*)::int from public.bookings where id in (pg_temp.id('b_del_p'), pg_temp.id('b_del_c')) and shop_id is null), 2,
          'j18_w16_owner_deletes_shop_with_openings_applications_and_trainee');

-- ---------- W16-L4 pinned: the not-accepted application goes, the accepted one keeps a copy with no cover note ----------
select is((select count(*)::int from public.job_applications where id in (pg_temp.id('app_a'), pg_temp.id('app_n'))), 0,
          'w16_limitation_shop_delete_removes_not_accepted_application_keeps_accepted_copy');
select is((select string_agg((r.application_id = pg_temp.id('app_a'))::text || ',' || r.status, '|') from public.retained_job_application_records r
           where r.worker_id in (pg_temp.id('wa'), pg_temp.id('wn'))), 'true,accepted',
          'w16_limitation_shop_delete_removes_not_accepted_application_keeps_accepted_copy');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'retained_job_application_records' and column_name ~* 'note'), 0,
          'w16_limitation_shop_delete_removes_not_accepted_application_keeps_accepted_copy');
select is((select (r.opening_snapshot::text ~* 'cover')::text from public.retained_job_application_records r where r.application_id = pg_temp.id('app_a')), 'false',
          'w16_limitation_shop_delete_removes_not_accepted_application_keeps_accepted_copy');

-- ---------- a non-trainee row on the owner's other shop works exactly as before ----------
insert into j18w16_ids values ('r_k', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('wk'))),
                              ('b_k', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s_main'), 'accepted'));
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('r_k'), pg_temp.id('b_k'))), 'succeeded',
          'j18_w16_non_trainee_assign_on_other_shop_unchanged');
select test_helpers.act_as_worker(pg_temp.email('wk'));
select is(pg_temp.set_status('b_k', 'in_progress') || ',' || pg_temp.set_status('b_k', 'completed'), 'succeeded,succeeded', 'j18_w16_non_trainee_assign_on_other_shop_unchanged');
select test_helpers.act_as_service();
select is((select booking_status from public.bookings where id = pg_temp.id('b_k')), 'completed', 'j18_w16_non_trainee_assign_on_other_shop_unchanged');

-- ---------- the customer's own actions on a booking whose shop was deleted ----------
select test_helpers.act_as_customer(pg_temp.email('c1'));
select is((select count(*)::int from public.bookings where id in (pg_temp.id('b_del_p'), pg_temp.id('b_del_c'))), 2, 'j18_w16_customer_actions_on_deleted_shop_booking_unchanged');
select is(pg_temp.set_status('b_del_p', 'cancelled'), 'succeeded', 'j18_w16_customer_actions_on_deleted_shop_booking_unchanged');
select is(test_helpers.attempt(format('update public.bookings set customer_rating_stars = 5, customer_rating_comment = %L where id = %L', 'Clean work', pg_temp.id('b_del_c'))),
          'succeeded', 'j18_w16_customer_actions_on_deleted_shop_booking_unchanged');
select test_helpers.act_as_service();
select is((select string_agg(booking_status || ':' || coalesce(customer_rating_stars::text, '-'), ',' order by booking_status) from public.bookings
           where id in (pg_temp.id('b_del_p'), pg_temp.id('b_del_c'))), 'cancelled:-,completed:5', 'j18_w16_customer_actions_on_deleted_shop_booking_unchanged');

-- ---------- REVIEW N4: an accepted booking at a deleted shop, assigned to a held trainee, moves only after the trainee leaves ----------
select pg_temp.trainee('n4');
insert into j18w16_ids values ('b_n4', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s_n4'), 'accepted'));
update public.bookings set assigned_worker_id = pg_temp.id('r_n4') where id = pg_temp.id('b_n4');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(test_helpers.attempt(format('delete from public.shops where id = %L', pg_temp.id('s_n4'))), 'succeeded', 'j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves');
select is((select count(*)::int from public.bookings where id = pg_temp.id('b_n4')), 0, 'j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves');
select test_helpers.act_as_customer(pg_temp.email('c1'));
select is(pg_temp.set_status('b_n4', 'cancelled'), '42501', 'j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves');
select test_helpers.act_as_worker(pg_temp.email('n4'));
select is(pg_temp.set_status('b_n4', 'in_progress'), '23514', 'j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves');
select is((public.withdraw_from_training(pg_temp.id('e_n4'))).status, 'withdrawn', 'j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves');
select is(pg_temp.set_status('b_n4', 'in_progress'), 'succeeded', 'j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves');
select test_helpers.act_as_service();
select is((select booking_status || ',' || (shop_id is null)::text from public.bookings where id = pg_temp.id('b_n4')), 'in_progress,true',
          'j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves');

-- ---------- owner account deletion (untrusted, like GoTrue) with an enrollment the gate holds ----------
select pg_temp.trainee('h', 'o3');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('by'), 'role', 'authenticated')::text, true);
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('o3')), 'j18_w16_owner_account_delete_cascades_with_held_enrollment');
select test_helpers.act_as_service();
select is((select count(*)::int from public.shops where id = pg_temp.id('s_h')) || ',' || (select count(*)::int from public.workers where id = pg_temp.id('r_h'))
           || ',' || (select status || ',' || (owner_id is null)::text from public.training_enrollments where id = pg_temp.id('e_h')), '0,0,accepted,true',
          'j18_w16_owner_account_delete_cascades_with_held_enrollment');
select test_helpers.act_as_worker(pg_temp.email('h'));
select is((public.withdraw_from_training(pg_temp.id('e_h'))).status, 'withdrawn', 'j18_w16_owner_account_delete_cascades_with_held_enrollment');

select * from finish();
rollback;
