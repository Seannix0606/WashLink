-- J8 (training part, W6; D-4, D-16; closes C-W3-1): only the current shop owner or a designated,
-- still-linked trainer records attendance and assessments; the trainee, other owners, revoked or
-- unlinked trainers, customers, super_admin and anon cannot. Evidence is append-only for every
-- session; corrections need a reason and form a linear chain. (The certification half is W7.)
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j8t-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j8t-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j8t-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j8t-c1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j8t-' || label || '@local.test')))
from unnest(array['w1', 'w2', 'w3', 't1', 't2', 't3', 't4']) label;
create function pg_temp.u(p_label text) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j8t-' || p_label || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j8t_ids (label text primary key, id uuid) on commit drop;
grant all on j8t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j8t_ids where label = p_label $$;
insert into j8t_ids select 'r_' || label, test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u(label))
from unnest(array['w2', 'w3', 't1', 't2', 't3', 't4']) label;
insert into j8t_ids values ('p', test_helpers.create_training_program(current_setting('fx.s1')::uuid)),
                           ('p2', test_helpers.create_training_program(current_setting('fx.s1')::uuid));
insert into j8t_ids select 'd' || n, test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - n) from generate_series(1, 4) n;
select count(test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() + n)) from generate_series(1, 3) n;
insert into j8t_ids values ('p2d1', test_helpers.add_training_session(pg_temp.id('p2'), test_helpers.manila_today() - 1));
select test_helpers.open_training_program(pg_temp.id('p')), test_helpers.open_training_program(pg_temp.id('p2'));
insert into j8t_ids select 'des_' || label, test_helpers.designate_trainer(pg_temp.id('p'), pg_temp.id('r_' || label))
from unnest(array['t1', 't2', 't3', 't4']) label;
insert into j8t_ids values ('e1', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.u('w1'))),
                           ('e2', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.u('w2'))),
                           ('p2e1', test_helpers.create_accepted_enrollment(pg_temp.id('p2'), pg_temp.u('w3')));
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J8 opening'))::text, true);
select set_config('fx.app_t4', test_helpers.create_job_application(current_setting('fx.j1')::uuid, pg_temp.u('t4'), 'accepted')::text, true);
select set_config('fx.app_w2', test_helpers.create_job_application(current_setting('fx.j1')::uuid, pg_temp.u('w2'), 'accepted')::text, true);
create function pg_temp.rec(p_enrollment text, p_session text) returns text language sql
as $$ select test_helpers.attempt(format('select public.record_training_attendance(%L, %L, %L)', pg_temp.id(p_enrollment), pg_temp.id(p_session), 'present')) $$;

-- ---------- who may record ----------
select test_helpers.act_as_owner('j8t-o1@local.test');
select is((public.revoke_training_trainer(pg_temp.id('des_t2'))).revoked_by, current_setting('fx.o1')::uuid, 'j8_revoked_trainer_cannot_record');
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('r_t3'))), 'succeeded', 'j8_unlinked_trainer_cannot_record');
select test_helpers.act_as_owner('j8t-o2@local.test');
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_other_owner_cannot_record_or_correct');
select throws_ok($$ select public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d1'), 'present') $$, '42501',
                 'Only the shop owner or a designated trainer can record training.', 'j8_other_owner_cannot_record_or_correct');
select test_helpers.act_as(pg_temp.u('w1'));
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_trainee_cannot_record_own_attendance_or_assessment');
select is(test_helpers.attempt(format('select public.record_training_assessment(%L, array[true, true], %L)', pg_temp.id('e1'), 'passed')),
          '42501', 'j8_trainee_cannot_record_own_attendance_or_assessment');
select test_helpers.act_as(pg_temp.u('w3'));
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_undesignated_worker_cannot_record');
select test_helpers.act_as(pg_temp.u('t2'));
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_revoked_trainer_cannot_record');
select test_helpers.act_as(pg_temp.u('t3'));
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_unlinked_trainer_cannot_record');
select test_helpers.act_as_customer('j8t-c1@local.test');
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_customer_super_admin_anon_cannot_record');
select test_helpers.act_as_admin('j8t-a1@local.test');
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_customer_super_admin_anon_cannot_record');
select is(test_helpers.attempt(format('select public.record_training_assessment(%L, array[true, true], %L)', pg_temp.id('e1'), 'passed')),
          '42501', 'j8_customer_super_admin_anon_cannot_record');
select test_helpers.act_as_anon();
select is(pg_temp.rec('e1', 'd1'), '42501', 'j8_customer_super_admin_anon_cannot_record');
select test_helpers.act_as_service();
select is((select count(*)::int from public.training_attendance_records), 0, 'j8_customer_super_admin_anon_cannot_record');

-- ---------- designated trainer: own program only; identity server-stamped ----------
select test_helpers.act_as(pg_temp.u('t1'));
select is(pg_temp.rec('e1', 'd1'), 'succeeded', 'j8_designated_trainer_can_record_for_own_program_only');
select is(pg_temp.rec('p2e1', 'p2d1'), '42501', 'j8_designated_trainer_can_record_for_own_program_only');
select test_helpers.act_as_service();
select is((select row(recorded_by, recorder_role, recorder_designation_id, recorder_display_name, session_date, recorded_at = now(), supersedes_id is null)::text
           from public.training_attendance_records where enrollment_id = pg_temp.id('e1')),
          row(pg_temp.u('t1'), 'trainer', pg_temp.id('des_t1'), 'Local Test Worker', test_helpers.manila_today() - 1, true, true)::text,
          'j8_recorder_identity_and_dates_server_stamped');
select test_helpers.act_as_owner('j8t-o1@local.test');
select count(public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d' || n), 'present')) from generate_series(2, 3) n;
select is((select row(recorded_by, recorder_role, recorder_designation_id is null, recorder_display_name)::text
           from public.training_attendance_records where enrollment_id = pg_temp.id('e1') and session_id = pg_temp.id('d2')),
          row(current_setting('fx.o1')::uuid, 'owner', true, 'Local Test Owner')::text, 'j8_recorder_identity_and_dates_server_stamped');
select test_helpers.act_as(pg_temp.u('t1'));
select lives_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, true], 'passed') $$,
                'j8_designated_trainer_can_record_for_own_program_only');
select test_helpers.act_as_service();
select is((select row(assessed_by, assessor_role, assessor_designation_id, assessed_on)::text from public.training_assessments where enrollment_id = pg_temp.id('e1')),
          row(pg_temp.u('t1'), 'trainer', pg_temp.id('des_t1'), test_helpers.manila_today())::text, 'j8_recorder_identity_and_dates_server_stamped');

-- ---------- trainer vs trainee of the same program ----------
select test_helpers.act_as_owner('j8t-o1@local.test');
select throws_ok($$ select public.invite_to_training(pg_temp.id('p'), current_setting('fx.app_t4')::uuid) $$, '23514',
                 'A trainer of this program cannot be enrolled in it.', 'j8_trainer_cannot_be_trainee_of_same_program');
select throws_ok($$ select public.designate_training_trainer(pg_temp.id('p'), pg_temp.id('r_w2')) $$, '23514',
                 'A worker enrolled in this program cannot be its trainer.', 'j8_trainer_cannot_be_trainee_of_same_program');
select throws_ok($$ select public.designate_training_trainer(pg_temp.id('p'), pg_temp.id('r_t1')) $$, '23505',
                 'This worker is already a trainer for this program.', 'j8_trainer_cannot_be_trainee_of_same_program');

-- ---------- corrections ----------
create function pg_temp.att(p_session text) returns uuid language sql stable
as $$ select id from public.training_attendance_records where enrollment_id = pg_temp.id('e1') and session_id = pg_temp.id(p_session)
      and supersedes_id is null $$;
select throws_ok($$ select public.correct_training_attendance(pg_temp.att('d1'), 'absent', null, null) $$, '23514',
                 'Give a correction reason of 10 to 300 characters.', 'j8_correction_requires_reason_and_authorised_recorder');
select throws_ok($$ select public.correct_training_attendance(pg_temp.att('d1'), 'present', null, 'Nothing actually changed here') $$, '23514',
                 'A correction must change the attendance or the note.', 'j8_correction_requires_reason_and_authorised_recorder');
select test_helpers.act_as_owner('j8t-o2@local.test');
select throws_ok($$ select public.correct_training_attendance(pg_temp.att('d1'), 'absent', null, 'Other owner tries to correct') $$, '42501',
                 'Only the shop owner or a designated trainer can record training.', 'j8_correction_requires_reason_and_authorised_recorder');
select test_helpers.act_as(pg_temp.u('w1'));
select throws_ok($$ select public.correct_training_attendance(pg_temp.att('d1'), 'present', 'I was there', 'Trainee edits own record') $$, '42501',
                 'Only the shop owner or a designated trainer can record training.', 'j8_correction_requires_reason_and_authorised_recorder');
select test_helpers.act_as_owner('j8t-o1@local.test');
select is((public.correct_training_attendance(pg_temp.att('d1'), 'present', 'Arrived late', 'Adding a progress note after review')).correction_reason,
          'Adding a progress note after review', 'j8_correction_requires_reason_and_authorised_recorder');
select throws_ok($$ select public.correct_training_attendance(pg_temp.att('d1'), 'absent', null, 'Second correction of the original') $$, '23505',
                 'This record was already corrected.', 'j8_correction_chain_is_linear');
select test_helpers.act_as_service();
select is(test_helpers.attempt(format($$ select set_config('washlink.training_write', %L, true);
            insert into public.training_attendance_records (id, enrollment_id, session_id, session_date, attendance_status, recorded_by, recorder_role,
              recorder_display_name, supersedes_id, correction_reason)
            select %L, enrollment_id, session_id, session_date, 'absent', %L, 'owner', 'Owner', id, 'Forked correction attempt'
            from public.training_attendance_records where id = %L $$, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1',
            current_setting('fx.o1'), pg_temp.att('d1'))), '23505', 'j8_correction_chain_is_linear');

-- ---------- direct writes and append-only ----------
select is((select count(*)::int from unnest(array['insert', 'update', 'delete', 'truncate']) p
           cross join unnest(array['anon', 'authenticated', 'service_role']) r
           cross join unnest(array['public.training_attendance_records', 'public.training_assessments']) t
           where has_table_privilege(r, t, p)), 0, 'j8_direct_writes_denied_for_clients_and_service_role');
select test_helpers.act_as_owner('j8t-o1@local.test');
select is(test_helpers.attempt(format($$ insert into public.training_attendance_records (enrollment_id, session_id, session_date, attendance_status,
            recorded_by, recorder_role, recorder_display_name) values (%L, %L, %L, 'present', %L, 'owner', 'Owner') $$,
            pg_temp.id('e1'), pg_temp.id('d4'), test_helpers.manila_today() - 4, current_setting('fx.o1'))), '42501',
          'j8_direct_writes_denied_for_clients_and_service_role');
select is(test_helpers.attempt(format($$ update public.training_assessments set result = 'failed' where enrollment_id = %L $$, pg_temp.id('e1'))),
          '42501', 'j8_owner_cannot_rewrite_assessment_result_in_place');
select test_helpers.act_as_service();
select throws_ok(format($$ update public.training_assessments set result = 'failed', items_met = array[false, false] where enrollment_id = %L $$, pg_temp.id('e1')),
                 '42501', 'Training records cannot be edited. Record a correction instead.', 'j8_owner_cannot_rewrite_assessment_result_in_place');
select is((select result from public.training_assessments where enrollment_id = pg_temp.id('e1')), 'passed', 'j8_owner_cannot_rewrite_assessment_result_in_place');
select throws_ok(format($$ update public.training_attendance_records set attendance_status = 'absent' where id = %L $$, pg_temp.att('d2')),
                 '42501', 'Training records cannot be edited. Record a correction instead.', 'j8_evidence_append_only_for_every_session');
select throws_ok(format($$ delete from public.training_attendance_records where enrollment_id = %L $$, pg_temp.id('e1')),
                 '42501', 'Training records cannot be deleted. Record a correction instead.', 'j8_evidence_append_only_for_every_session');
select throws_ok(format($$ delete from public.training_assessments where enrollment_id = %L $$, pg_temp.id('e1')),
                 '42501', 'Training records cannot be deleted. Record a correction instead.', 'j8_evidence_append_only_for_every_session');
select throws_ok(format($$ insert into public.training_attendance_records (enrollment_id, session_id, session_date, attendance_status,
                    recorded_by, recorder_role, recorder_display_name) values (%L, %L, %L, 'present', %L, 'owner', 'Owner') $$,
                    pg_temp.id('e1'), pg_temp.id('d4'), test_helpers.manila_today() - 4, current_setting('fx.o1')),
                 '42501', 'Training records are written only through the training actions.', 'j8_evidence_append_only_for_every_session');
select test_helpers.act_as_owner('j8t-o1@local.test');
select count(public.record_training_attendance(pg_temp.id('e2'), pg_temp.id('d1'), 'present'));
select test_helpers.act_as_service();
delete from auth.users where id = pg_temp.u('w2');
select is((select count(*)::int from public.training_attendance_records r where not exists (select 1 from public.training_enrollments e where e.id = r.enrollment_id)),
          0, 'j8_evidence_deleted_only_by_cascade');
select is((select count(*)::int from public.training_attendance_records where enrollment_id = pg_temp.id('e1')), 4, 'j8_evidence_deleted_only_by_cascade');

select * from finish();
rollback;
