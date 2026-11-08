-- J6 (training part, W6; closes C2): completion is DERIVED only from >= 3 distinct attended
-- supervised days plus a passed assessment recorded by an authorised recorder. Local Docker stack
-- only; synthetic fixtures; backdated sessions / acceptance are trusted test-only time shifts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j6t-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j6t-o1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j6t-w' || n || '@local.test'))) from generate_series(1, 6) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j6t-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j6t_ids (label text primary key, id uuid) on commit drop;
grant all on j6t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j6t_ids where label = p_label $$;
insert into j6t_ids values ('p', test_helpers.create_training_program(current_setting('fx.s1')::uuid));
insert into j6t_ids select 'd' || n, test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - (7 - n))
from generate_series(1, 4) n;   -- d1..d4 = today-6 .. today-3
insert into j6t_ids values
  ('assess', test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - 2, 'competency_assessment')),
  ('today', test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today())),
  ('future', test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() + 5));
select test_helpers.open_training_program(pg_temp.id('p'));
insert into j6t_ids select 'e' || n, test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.w(n)) from generate_series(1, 3) n;
insert into j6t_ids values
  ('e4', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.w(4), now() - interval '400 days')),
  ('e5', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.w(5), now()));
insert into public.training_enrollments (program_id, shop_id, owner_id, worker_id, shop_name_snapshot, program_title_snapshot,
  owner_display_name_snapshot, status)
select p.id, p.shop_id, p.owner_id, pg_temp.w(6), 'Shop', p.title, 'Owner', 'invited' from public.training_programs p where p.id = pg_temp.id('p');
insert into j6t_ids select 'e6', id from public.training_enrollments where worker_id = pg_temp.w(6);
create function pg_temp.progress(p_enrollment uuid) returns text language sql stable security definer
as $$ select progress_status from public.training_enrollment_progress where enrollment_id = p_enrollment $$;
create function pg_temp.attended(p_enrollment uuid) returns int language sql stable security definer
as $$ select attended_training_days from public.training_enrollment_progress where enrollment_id = p_enrollment $$;
create function pg_temp.completed(p_enrollment uuid) returns boolean language sql stable security definer
as $$ select public.training_enrollment_is_completed(p_enrollment) $$;

-- ---------- enrollment / time alone ----------
select is(pg_temp.progress(pg_temp.id('e1')), 'scheduled', 'j6_enrollment_alone_is_scheduled_not_completed');
select ok(not pg_temp.completed(pg_temp.id('e1')), 'j6_enrollment_alone_is_scheduled_not_completed');
select is(pg_temp.progress(pg_temp.id('e4')), 'scheduled', 'j6_calendar_time_alone_does_not_complete');
select ok(not pg_temp.completed(pg_temp.id('e4')), 'j6_calendar_time_alone_does_not_complete');

-- ---------- two days are not enough ----------
select test_helpers.act_as_owner('j6t-o1@local.test');
select lives_ok($$ select public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d1'), 'present') $$, 'j6_two_attended_days_cannot_be_assessed');
select lives_ok($$ select public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d2'), 'present', 'Learned the pre-rinse') $$,
                'j6_two_attended_days_cannot_be_assessed');
select is(pg_temp.progress(pg_temp.id('e1')), 'in_progress', 'j6_two_attended_days_cannot_be_assessed');
select throws_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, true], 'passed') $$,
                 '23514', 'The worker has not attended the required training days yet.', 'j6_two_attended_days_cannot_be_assessed');

-- ---------- one row per day ----------
select throws_ok($$ select public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d1'), 'present') $$,
                 '23505', 'Attendance for this day is already recorded. Record a correction instead.', 'j6_same_day_counts_once');
select test_helpers.act_as_service();
select is(test_helpers.attempt(format('select test_helpers.add_training_session(%L, %L)', pg_temp.id('p'), test_helpers.manila_today() - 6)),
          '23505', 'j6_same_day_counts_once');
select test_helpers.act_as_owner('j6t-o1@local.test');
select throws_ok($$ select public.add_training_session(pg_temp.id('p'), test_helpers.manila_today() + 5, 'supervised_training') $$,
                 '23505', 'A session is already scheduled on this date.', 'j6_same_day_counts_once');
select is(pg_temp.attended(pg_temp.id('e1')), 2, 'j6_same_day_counts_once');

-- ---------- absent and assessment days do not count ----------
select lives_ok($$ select public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d3'), 'absent') $$, 'j6_absent_days_do_not_count');
select is(pg_temp.attended(pg_temp.id('e1')), 2, 'j6_absent_days_do_not_count');
select lives_ok($$ select public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('assess'), 'present') $$,
                'j6_assessment_sessions_do_not_count_as_training_days');
select is(pg_temp.attended(pg_temp.id('e1')), 2, 'j6_assessment_sessions_do_not_count_as_training_days');
select throws_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, true], 'passed') $$,
                 '23514', 'The worker has not attended the required training days yet.', 'j6_assessment_sessions_do_not_count_as_training_days');

-- ---------- three days, then the assessment ----------
select lives_ok($$ select public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d4'), 'present') $$,
                'j6_three_days_without_assessment_awaits_assessment');
select is(pg_temp.progress(pg_temp.id('e1')), 'awaiting_assessment', 'j6_three_days_without_assessment_awaits_assessment');
select ok(not pg_temp.completed(pg_temp.id('e1')), 'j6_three_days_without_assessment_awaits_assessment');
select throws_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, false], 'passed') $$,
                 '23514', 'A pass needs every checklist item met.', 'j6_pass_requires_every_checklist_item_met');
select throws_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true], 'passed') $$,
                 '22023', 'Mark every checklist item as met or not met.', 'j6_pass_requires_every_checklist_item_met');
select lives_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, true], 'passed', 'Ready') $$,
                'j6_three_days_and_passed_assessment_completes');
select is(pg_temp.progress(pg_temp.id('e1')), 'completed', 'j6_three_days_and_passed_assessment_completes');
select ok(pg_temp.completed(pg_temp.id('e1')), 'j6_three_days_and_passed_assessment_completes');
select is((select row(assessor_role, assessed_by, assessed_on, signed_off_at = now(), assessor_designation_id is null)::text
           from public.training_assessments where enrollment_id = pg_temp.id('e1')),
          row('owner', current_setting('fx.o1')::uuid, test_helpers.manila_today(), true, true)::text,
          'j6_assessment_records_assessor_role_and_time');

-- ---------- failed, then re-assessment by correction ----------
select count(public.record_training_attendance(pg_temp.id('e2'), pg_temp.id('d' || n), 'present')) from generate_series(1, 3) n;
select lives_ok($$ select public.record_training_assessment(pg_temp.id('e2'), array[true, false], 'failed', 'Needs practice',
                                                            'Drying left water marks') $$,
                'j6_failed_assessment_is_failed');
select is(pg_temp.progress(pg_temp.id('e2')), 'failed', 'j6_failed_assessment_is_failed');
select throws_ok(format('select public.correct_training_assessment(%L, array[true, true], %L, null, %L)',
                        (select id from public.training_assessments where enrollment_id = pg_temp.id('e2')), 'passed', 'short'),
                 '23514', 'Give a correction reason of 10 to 300 characters.', 'j6_reassessment_correction_with_reason_completes');
select lives_ok(format('select public.correct_training_assessment(%L, array[true, true], %L, null, %L)',
                       (select id from public.training_assessments where enrollment_id = pg_temp.id('e2')), 'passed',
                       'Re-assessed after extra practice'), 'j6_reassessment_correction_with_reason_completes');
select is(pg_temp.progress(pg_temp.id('e2')), 'completed', 'j6_reassessment_correction_with_reason_completes');

-- ---------- a correction to absent removes completion ----------
select lives_ok(format('select public.correct_training_attendance(%L, %L, null, %L)',
                       (select id from public.training_attendance_records where enrollment_id = pg_temp.id('e1') and session_id = pg_temp.id('d4')),
                       'absent', 'Worker left before the session started'), 'j6_attendance_correction_to_absent_removes_completion');
select is(pg_temp.progress(pg_temp.id('e1')), 'in_progress', 'j6_attendance_correction_to_absent_removes_completion');
select ok(not pg_temp.completed(pg_temp.id('e1')), 'j6_attendance_correction_to_absent_removes_completion');

-- ---------- recording windows ----------
select throws_ok($$ select public.record_training_attendance(pg_temp.id('e3'), pg_temp.id('future'), 'present') $$,
                 '23514', 'This session has not happened yet.', 'j6_attendance_not_recordable_for_future_session');
select throws_ok($$ select public.record_training_attendance(pg_temp.id('e5'), pg_temp.id('d1'), 'present') $$,
                 '23514', 'This session was before the worker enrolled.', 'j6_attendance_not_recordable_before_enrollment');
select throws_ok($$ select public.record_training_attendance(pg_temp.id('e6'), pg_temp.id('today'), 'present') $$,
                 '23514', 'Attendance can be recorded only for an accepted enrollment.', 'j6_attendance_requires_accepted_enrollment');

-- ---------- structure ----------
select test_helpers.act_as_service();
select ok(position('completed' in pg_get_constraintdef((select oid from pg_constraint where conname = 'te_status_check'))) = 0
          and position('failed' in pg_get_constraintdef((select oid from pg_constraint where conname = 'te_status_check'))) = 0
          and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname ~ 'complet' and has_function_privilege('authenticated', p.oid, 'execute')) = 0,
          'j6_status_has_no_completed_value_and_no_completion_rpc');
select is((select count(*)::int from public.training_enrollment_progress v
           where v.program_id = pg_temp.id('p') and (v.progress_status = 'completed') <> public.training_enrollment_is_completed(v.enrollment_id)),
          0, 'j6_completion_predicate_matches_progress_view');
select throws_ok(format('update public.training_programs set min_training_days = 2 where id = %L', pg_temp.id('p')),
                 '23514', null, 'j6_min_training_days_cannot_be_below_three');

select * from finish();
rollback;
