-- D-18 (orchestrator override of the W6 plan 4.4; consistent with W5-L10): deleting a shop or an
-- owner account still succeeds (also in an untrusted session, like GoTrue), but worker-facing
-- training records are RETAINED: enrollments, attendance and assessments stay, shop_id / owner_id
-- become null through ON DELETE SET NULL (W2 is_orphaned_fk_set_null path), the shop name, program
-- title, owner and recorder display names stay as snapshots, and the worker keeps reading them.
-- Programs without enrollments go with the shop. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('d18-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('d18-o1@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('d18-c1@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('d18-by@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('d18-' || l || '@local.test'))) from unnest(array['w1', 'w2', 'w3', 't1']) l;
create function pg_temp.u(p_label text) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'd18-' || p_label || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s1b', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s1_name', (select name from public.shops where id = current_setting('fx.s1')::uuid), true);
create temporary table d18_ids (label text primary key, id uuid) on commit drop;
grant all on d18_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from d18_ids where label = p_label $$;
insert into d18_ids values ('p', test_helpers.create_training_program(current_setting('fx.s1')::uuid)),
  ('p_draft', test_helpers.create_training_program(current_setting('fx.s1')::uuid)),
  ('p_empty', test_helpers.create_training_program(current_setting('fx.s1')::uuid));
insert into d18_ids select 'd' || n, test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - n) from generate_series(1, 3) n;
select count(test_helpers.add_training_session(pg_temp.id(l), test_helpers.manila_today() + 2)) from unnest(array['p', 'p_draft', 'p_empty']) l;
select test_helpers.open_training_program(pg_temp.id('p')), test_helpers.open_training_program(pg_temp.id('p_empty'));
insert into d18_ids values ('r_t1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u('t1'))),
  ('r_w2', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u('w2')));
select test_helpers.designate_trainer(pg_temp.id(l), pg_temp.id('r_t1')) from unnest(array['p', 'p_empty']) l;
insert into d18_ids values ('e1', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.u('w1'))),
  ('e2', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.u('w2')));
insert into public.training_enrollments (program_id, shop_id, owner_id, worker_id, shop_name_snapshot, program_title_snapshot, owner_display_name_snapshot)
select id, shop_id, owner_id, pg_temp.u('w3'), current_setting('fx.s1_name'), title, 'Local Test Owner' from public.training_programs where id = pg_temp.id('p');
insert into d18_ids select 'e3', id from public.training_enrollments where worker_id = pg_temp.u('w3');
select test_helpers.act_as(pg_temp.u('t1'));
select count(public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('d' || n), 'present', 'Day note')) from generate_series(1, 3) n;
select count(public.record_training_assessment(pg_temp.id('e1'), array[true, true], 'passed'));
select test_helpers.act_as_owner('d18-o1@local.test');
select count(public.record_training_attendance(pg_temp.id('e2'), pg_temp.id('d1'), 'present'));
select test_helpers.act_as_service();
select set_config('fx.b1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1b')::uuid)::text, true);
create temporary table d18_before on commit drop as
  select e.id, to_jsonb(e) - array['shop_id', 'owner_id', 'job_application_id', 'updated_at'] as row_json from public.training_enrollments e;
create temporary table d18_counts on commit drop as select (select count(*) from public.notifications where category like 'training%') as notes;
create function pg_temp.untrusted() returns void language sql as $$
  select test_helpers.act_as_service();
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.progress(p_label text) returns text language sql stable security definer
as $$ select public.training_enrollment_progress_status_of(pg_temp.id(p_label)) $$;

-- ---------- the owner deletes the shop ----------
select test_helpers.act_as_owner('d18-o1@local.test');
select lives_ok(format('delete from public.shops where id = %L', current_setting('fx.s1')), 'd18_shop_deletion_succeeds_and_retains_worker_training_records');
select test_helpers.act_as_service();
select is((select count(*)::int from public.shops where id = current_setting('fx.s1')::uuid), 0, 'd18_shop_deletion_succeeds_and_retains_worker_training_records');
select is((select count(*)::int from public.training_programs where id in (pg_temp.id('p_draft'), pg_temp.id('p_empty'))), 0,
          'd18_unenrolled_programs_removed_with_shop');
select is((select count(*)::int from public.workforce_audit_events where action = 'training_program.deleted' and payload ->> 'deleted_by' = 'shop_removed'), 2,
          'd18_unenrolled_programs_removed_with_shop');
select is((select row(shop_id is null, owner_id, status)::text from public.training_programs where id = pg_temp.id('p')),
          row(true, current_setting('fx.o1')::uuid, 'open')::text, 'd18_shop_deletion_succeeds_and_retains_worker_training_records');
select is((select count(*)::int from public.training_enrollments where program_id = pg_temp.id('p') and shop_id is null), 3,
          'd18_shop_deletion_succeeds_and_retains_worker_training_records');
select is((select count(*)::int from d18_before b join public.training_enrollments e on e.id = b.id
           where b.row_json = to_jsonb(e) - array['shop_id', 'owner_id', 'job_application_id', 'updated_at']), 3,
          'd18_retained_records_keep_snapshots_and_evidence');
select is((select row(count(*), count(*) filter (where recorder_display_name = 'Local Test Worker'))::text from public.training_attendance_records
           where enrollment_id in (pg_temp.id('e1'), pg_temp.id('e2'))), row(4, 3)::text, 'd18_retained_records_keep_snapshots_and_evidence');
select is((select row(shop_name_snapshot, terms_snapshot ->> 'shop_name')::text from public.training_enrollments where id = pg_temp.id('e1')),
          row(current_setting('fx.s1_name'), current_setting('fx.s1_name'))::text, 'd18_retained_records_keep_snapshots_and_evidence');
select is(array[pg_temp.progress('e1'), pg_temp.progress('e2'), pg_temp.progress('e3')], array['completed', 'shop_removed', 'shop_removed'],
          'd18_unfinished_training_shows_shop_removed_and_completed_stays_completed');
select is((select count(*)::int from public.workforce_audit_events where action = 'training_enrollment.shop_removed'
           and subject_id in (pg_temp.id('e1'), pg_temp.id('e2'), pg_temp.id('e3'))), 3, 'd18_shop_removal_audited');
select is((select count(*)::int from public.notifications where category like 'training%') - (select notes from d18_counts)::int, 0, 'd18_shop_removal_audited');

select test_helpers.act_as_owner('d18-o1@local.test');
select is(pg_temp.progress('e2'), 'shop_removed', 'd18_booking_gate_lifts_after_shop_removal');
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('r_w2'), current_setting('fx.b1'))),
          'succeeded', 'd18_booking_gate_lifts_after_shop_removal');

-- ---------- the worker keeps reading; nobody can record any more ----------
select test_helpers.act_as(pg_temp.u('w1'));
select is((select row(count(*), min(progress_status))::text from public.training_enrollment_progress), row(1, 'completed')::text,
          'd18_worker_still_reads_retained_training');
select is((select count(*)::int from public.training_programs where id = pg_temp.id('p'))
          + (select count(*)::int from public.training_sessions where program_id = pg_temp.id('p')), 5, 'd18_worker_still_reads_retained_training');
select is((select array_agg(distinct recorded_by_display_name) from public.training_evidence_for_enrollment(pg_temp.id('e1'))), array['Local Test Worker'],
          'd18_worker_still_reads_retained_training');
select test_helpers.act_as(pg_temp.u('w2'));
select is((public.withdraw_from_training(pg_temp.id('e2'))).status, 'withdrawn', 'd18_worker_still_reads_retained_training');
select test_helpers.act_as_owner('d18-o1@local.test');
select is((select count(*)::int from public.training_programs where id = pg_temp.id('p')), 0, 'd18_no_one_can_record_after_shop_removal');
select is(test_helpers.attempt(format('select public.record_training_attendance(%L, %L, %L)', pg_temp.id('e1'), pg_temp.id('d1'), 'absent')), '42501',
          'd18_no_one_can_record_after_shop_removal');
select test_helpers.act_as(pg_temp.u('t1'));
select is(test_helpers.attempt(format('select public.correct_training_attendance((select id from public.training_attendance_records where enrollment_id = %L limit 1), %L, null, %L)',
          pg_temp.id('e1'), 'absent', 'Trainer tries after removal')), '42501', 'd18_no_one_can_record_after_shop_removal');

-- ---------- owner account deletion (untrusted, like GoTrue) ----------
select pg_temp.untrusted();
select lives_ok(format('delete from auth.users where id = %L', current_setting('fx.o1')), 'd18_owner_account_deletion_retains_worker_training_records');
select test_helpers.act_as_service();
select is((select row(count(*), count(*) filter (where owner_id is null and shop_id is null))::text from public.training_enrollments
           where program_id = pg_temp.id('p')), row(3, 3)::text, 'd18_owner_account_deletion_retains_worker_training_records');
select is((select owner_id from public.training_programs where id = pg_temp.id('p')), null::uuid, 'd18_owner_account_deletion_retains_worker_training_records');
select is((select count(*)::int from public.training_attendance_records where enrollment_id in (pg_temp.id('e1'), pg_temp.id('e2')))
          + (select count(*)::int from public.training_assessments where enrollment_id = pg_temp.id('e1')), 5,
          'd18_owner_account_deletion_retains_worker_training_records');
select is((select owner_display_name_snapshot from public.training_enrollments where id = pg_temp.id('e1')), 'Local Test Owner',
          'd18_retained_records_keep_snapshots_and_evidence');
select pg_temp.untrusted();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.u('t1')), 'd18_owner_account_deletion_retains_worker_training_records');
select test_helpers.act_as(pg_temp.u('w1'));
select is((select array_agg(distinct recorded_by_display_name) from public.training_evidence_for_enrollment(pg_temp.id('e1'))), array['Local Test Worker'],
          'd18_worker_still_reads_retained_training');
select is(pg_temp.progress('e1'), 'completed', 'd18_unfinished_training_shows_shop_removed_and_completed_stays_completed');
select test_helpers.act_as_service();
select throws_ok(format('delete from public.training_programs where id = %L', pg_temp.id('p')), '23503', null,
                 'd18_trusted_program_delete_with_enrollments_restricted');

select * from finish();
rollback;
