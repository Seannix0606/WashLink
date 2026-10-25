-- J6 (certification part, W7; closes W0 C1): a shop-issued certification exists only after >= 3 distinct
-- attended supervised days and a CURRENT passed assessment, re-checked under the issue locks; it records the
-- approver, assessor, enrollment, time and frozen evidence; stamps and validity are server-set. Local Docker
-- stack only; synthetic fixtures; backdated sessions / acceptance are trusted test-only time shifts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j6c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j6c-o1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j6c-w' || n || '@local.test'))) from generate_series(1, 12) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j6c-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j6c_ids (label text primary key, id uuid) on commit drop;
grant all on j6c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j6c_ids where label = p_label $$;
insert into j6c_ids values ('p', test_helpers.create_training_program(current_setting('fx.s1')::uuid));
insert into j6c_ids select 'd' || n, test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - (7 - n))
from generate_series(1, 4) n;   -- d1..d4 = today-6 .. today-3
select test_helpers.open_training_program(pg_temp.id('p'));
insert into j6c_ids select 'e' || n, test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.w(n)) from generate_series(1, 11) n;
insert into j6c_ids values ('e_removed', test_helpers.complete_training(current_setting('fx.s2')::uuid, pg_temp.w(12), 'j6c-o1@local.test'));
create function pg_temp.cur(p_enrollment uuid) returns uuid language sql stable security definer
as $$ select public.current_training_assessment_id(p_enrollment) $$;
create function pg_temp.issue(p_label text, p_attestation text default 'w7_issuer_v1') returns public.certifications language sql
as $$ select public.issue_certification(pg_temp.id(p_label), pg_temp.cur(pg_temp.id(p_label)), p_attestation) $$;
create function pg_temp.present(p_label text, variadic p_days text[]) returns int language sql
as $$ select count(public.record_training_attendance(pg_temp.id(p_label), pg_temp.id(d), 'present'))::int from unnest(p_days) d $$;
create function pg_temp.pass(p_label text) returns uuid language sql
as $$ select (public.record_training_assessment(pg_temp.id(p_label), array[true, true], 'passed')).id $$;
select set_config('fx.not_done', 'This training is not completed. A certification needs at least 3 attended training days and a passed assessment.', true);

-- ---------- not completed: no certification ----------
select test_helpers.act_as_owner('j6c-o1@local.test');
select throws_ok($$ select pg_temp.issue('e1') $$, '23514', current_setting('fx.not_done'), 'j6_no_certification_for_enrollment_only');
select is((select count(*)::int from public.certifications), 0, 'j6_no_certification_for_enrollment_only');
select is(pg_temp.present('e2', 'd1', 'd2'), 2, 'j6_no_certification_with_two_attended_days');
select throws_ok($$ select pg_temp.issue('e2') $$, '23514', current_setting('fx.not_done'), 'j6_no_certification_with_two_attended_days');
select is(pg_temp.present('e3', 'd1', 'd2', 'd3'), 3, 'j6_no_certification_while_awaiting_assessment');
select throws_ok($$ select pg_temp.issue('e3') $$, '23514', current_setting('fx.not_done'), 'j6_no_certification_while_awaiting_assessment');
select is(pg_temp.present('e4', 'd1', 'd2', 'd3'), 3, 'j6_no_certification_after_failed_assessment');
select ok((public.record_training_assessment(pg_temp.id('e4'), array[true, false], 'failed', null, 'Soap step was missed')).id is not null,
          'j6_no_certification_after_failed_assessment');
select throws_ok($$ select pg_temp.issue('e4') $$, '23514', current_setting('fx.not_done'), 'j6_no_certification_after_failed_assessment');

-- ---------- corrections after completion ----------
select is(pg_temp.present('e5', 'd1', 'd2', 'd3') + (pg_temp.pass('e5') is not null)::int, 4, 'j6_no_certification_after_attendance_corrected_to_absent');
select ok((public.correct_training_attendance((select r.id from public.training_attendance_records r where r.enrollment_id = pg_temp.id('e5')
           and r.session_id = pg_temp.id('d1')), 'absent', null, 'Recorded on the wrong day')).id is not null,
          'j6_no_certification_after_attendance_corrected_to_absent');
select throws_ok($$ select pg_temp.issue('e5') $$, '23514', current_setting('fx.not_done'), 'j6_no_certification_after_attendance_corrected_to_absent');
select is(pg_temp.present('e6', 'd1', 'd2', 'd3'), 3, 'j6_no_certification_after_pass_corrected_to_fail');
select ok((public.correct_training_assessment(pg_temp.pass('e6'), array[true, false], 'failed', null, 'The pass was recorded in error',
           'Soap step was missed')).id is not null, 'j6_no_certification_after_pass_corrected_to_fail');
select throws_ok($$ select pg_temp.issue('e6') $$, '23514', current_setting('fx.not_done'), 'j6_no_certification_after_pass_corrected_to_fail');

-- ---------- stale record, attestation, issue ----------
select is(pg_temp.present('e7', 'd1', 'd2', 'd3', 'd4'), 4, 'j6_stale_assessment_id_rejected');
select set_config('fx.old_assessment', pg_temp.pass('e7')::text, true);
select ok((public.correct_training_assessment(current_setting('fx.old_assessment')::uuid, array[true, true], 'passed', 'Clean work',
           'Adding the assessor comment')).id is not null, 'j6_stale_assessment_id_rejected');
select throws_ok(format('select public.issue_certification(%L, %L, %L)', pg_temp.id('e7'), current_setting('fx.old_assessment'), 'w7_issuer_v1'),
                 '55000', 'The training record changed. Review it again.', 'j6_stale_assessment_id_rejected');
select throws_ok(format('select public.issue_certification(%L, gen_random_uuid(), %L)', pg_temp.id('e7'), 'w7_issuer_v1'),
                 '55000', 'The training record changed. Review it again.', 'j6_stale_assessment_id_rejected');
select throws_ok($$ select pg_temp.issue('e7', null) $$, '23514', 'Confirm the certification statement before issuing.', 'j6_issue_requires_attestation');
select throws_ok($$ select pg_temp.issue('e7', 'w6_owner_v1') $$, '23514', 'Confirm the certification statement before issuing.',
                 'j6_issue_requires_attestation');
insert into j6c_ids select 'c7', id from pg_temp.issue('e7');
select is((select count(*)::int from public.certifications where enrollment_id = pg_temp.id('e7')), 1,
          'j6_certification_issued_after_three_days_and_pass');
select is((select status from public.certifications where id = pg_temp.id('c7')), 'active', 'j6_certification_issued_after_three_days_and_pass');

select test_helpers.act_as_service();
select is((select row(c.worker_id = pg_temp.w(7), c.enrollment_id = pg_temp.id('e7'), c.program_id = pg_temp.id('p'),
                      c.assessment_id = pg_temp.cur(pg_temp.id('e7')), c.approved_by = current_setting('fx.o1')::uuid, c.approved_by_role,
                      c.approver_display_name, c.assessor_id = current_setting('fx.o1')::uuid, c.assessor_role, c.assessor_display_name,
                      c.approved_at = c.issued_at, c.issued_at = now(), c.attended_training_days, c.required_training_days)::text
           from public.certifications c where c.id = pg_temp.id('c7')),
          row(true, true, true, true, true, 'owner', 'Local Test Owner', true, 'owner', 'Local Test Owner', true, true, 4, 3)::text,
          'j6_certification_records_approver_assessor_enrollment_and_time');
select is((select row(c.evidence_snapshot ->> 'assessment_id' = c.assessment_id::text, c.evidence_snapshot ->> 'assessment_result',
                      (c.evidence_snapshot ->> 'attended_training_days')::int, jsonb_array_length(c.evidence_snapshot -> 'attended_dates'),
                      (c.evidence_snapshot ->> 'snapshot_version')::int, c.evidence_snapshot -> 'items_met')::text
           from public.certifications c where c.id = pg_temp.id('c7')),
          row(true, 'passed', 4, 4, 1, '[true, true]'::jsonb)::text, 'j6_evidence_snapshot_matches_current_records');
select is((select array_agg(x order by x) from public.certifications c, jsonb_array_elements_text(c.evidence_snapshot -> 'attendance_record_ids') x
           where c.id = pg_temp.id('c7')),
          (select array_agg(r.id::text order by r.id::text) from public.training_attendance_records r where r.enrollment_id = pg_temp.id('e7')
           and not exists (select 1 from public.training_attendance_records n where n.supersedes_id = r.id)),
          'j6_evidence_snapshot_matches_current_records');
select is((select row(validity_months, expires_at = ((issued_at at time zone 'Asia/Manila') + interval '12 months') at time zone 'Asia/Manila')::text
           from public.certifications where id = pg_temp.id('c7')), row(12, true)::text, 'j6_default_validity_is_twelve_months');
select is((select count(*)::int from pg_proc p, unnest(p.proargtypes::oid[]::regtype[]) t
           where p.oid in ('public.issue_certification(uuid, uuid, text)'::regprocedure, 'public.renew_certification(uuid, uuid, text)'::regprocedure,
                           'public.transition_certification(uuid, text, text, text)'::regprocedure)
             and t in ('date'::regtype, 'timestamptz'::regtype, 'timestamp'::regtype, 'integer'::regtype, 'interval'::regtype)),
          0, 'j6_issue_and_expiry_stamps_server_set_no_backdating');
-- A trusted session that sets the flag still cannot choose the stamps, validity or status (P32).
create function pg_temp.forged_insert(p_enrollment uuid) returns uuid language plpgsql as $$
declare
  new_id uuid := gen_random_uuid();
begin
  perform set_config('washlink.certification_write', new_id::text, true);
  insert into public.certifications
  select (jsonb_populate_record(null::public.certifications, to_jsonb(c) || jsonb_build_object('id', new_id, 'enrollment_id', p_enrollment,
          'issued_at', '2020-01-01T00:00:00Z', 'approved_at', '2020-01-01T00:00:00Z', 'expires_at', '2020-06-01T00:00:00Z',
          'validity_months', 36, 'status', 'active', 'issuer_kind', 'shop_issued'))).*
  from public.certifications c where c.id = pg_temp.id('c7');
  perform set_config('washlink.certification_write', '', true);
  return new_id;
end $$;
insert into j6c_ids values ('forged', pg_temp.forged_insert(pg_temp.id('e9')));
select is((select row(issued_at = now(), approved_at = now(), validity_months,
                      expires_at = ((now() at time zone 'Asia/Manila') + interval '12 months') at time zone 'Asia/Manila')::text
           from public.certifications where id = pg_temp.id('forged')), row(true, true, 12, true)::text,
          'j6_issue_and_expiry_stamps_server_set_no_backdating');

-- ---------- validity setting, duplicates, second current certificate ----------
select test_helpers.act_as_owner('j6c-o1@local.test');
select is((public.set_shop_certification_validity(current_setting('fx.s1')::uuid, 6)).validity_months::int, 6, 'j6_shop_validity_applies_to_new_issues_only');
select is(pg_temp.present('e8', 'd1', 'd2', 'd3') + (pg_temp.pass('e8') is not null)::int, 4, 'j6_shop_validity_applies_to_new_issues_only');
select is((select row(validity_months, expires_at = ((issued_at at time zone 'Asia/Manila') + interval '6 months') at time zone 'Asia/Manila')::text
           from pg_temp.issue('e8')), row(6, true)::text, 'j6_shop_validity_applies_to_new_issues_only');
select is((select validity_months::int from public.certifications where id = pg_temp.id('c7')), 12, 'j6_shop_validity_applies_to_new_issues_only');
select throws_ok($$ select pg_temp.issue('e7') $$, '23505', 'A certification was already issued for this training.', 'j6_one_original_certification_per_enrollment');

select test_helpers.act_as_service();
update public.training_enrollments set status = 'withdrawn', ended_at = now() where id = pg_temp.id('e7');
insert into j6c_ids values ('e7b', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.w(7)));
select test_helpers.record_training_completion(pg_temp.id('e7b'), 'j6c-o1@local.test') is not null as e7b_completed;
select test_helpers.act_as_owner('j6c-o1@local.test');
select throws_ok($$ select pg_temp.issue('e7b') $$, '23505', 'This worker already holds a current certification from this program.',
                 'j6_no_second_current_certification_for_same_program');

-- ---------- withdrawn / cancelled / shop removed ----------
select is(pg_temp.present('e10', 'd1', 'd2', 'd3') + (pg_temp.pass('e10') is not null)::int
          + pg_temp.present('e11', 'd1', 'd2', 'd3') + (pg_temp.pass('e11') is not null)::int, 8,
          'j6_withdrawn_cancelled_or_shop_removed_enrollment_cannot_be_certified');
select test_helpers.act_as_service();
update public.training_enrollments set status = 'withdrawn', ended_at = now() where id = pg_temp.id('e10');
update public.training_enrollments set status = 'cancelled', ended_at = now(), cancel_reason = 'Shop closed the program' where id = pg_temp.id('e11');
select test_helpers.act_as_owner('j6c-o1@local.test');
delete from public.shops where id = current_setting('fx.s2')::uuid;
select is((select count(*)::int from unnest(array['e10', 'e11']) l
           where test_helpers.attempt(format('select pg_temp.issue(%L)', l)) = '23514'), 2,
          'j6_withdrawn_cancelled_or_shop_removed_enrollment_cannot_be_certified');
select throws_ok($$ select pg_temp.issue('e_removed') $$, '42501', 'Training enrollment not found.',
                 'j6_withdrawn_cancelled_or_shop_removed_enrollment_cannot_be_certified');

-- ---------- label and write path ----------
select test_helpers.act_as_service();
select is((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.certifications'::regclass and conname = 'cert_issuer_kind_check'),
          'CHECK ((issuer_kind = ''shop_issued''::text))', 'j6_issuer_kind_is_shop_issued_only');
select is((select array_agg(distinct issuer_kind) from public.certifications), array['shop_issued'], 'j6_issuer_kind_is_shop_issued_only');
select throws_ok(format($$ insert into public.certifications select (jsonb_populate_record(null::public.certifications,
                   to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'enrollment_id', %L))).* from public.certifications c where c.id = %L $$,
                 pg_temp.id('e1'), pg_temp.id('c7')),
                 '42501', 'Certifications are issued only through the certification actions.', 'j6_no_issue_path_except_the_rpc');
select test_helpers.act_as_owner('j6c-o1@local.test');
select is(test_helpers.attempt(format($$ insert into public.certifications (worker_id, enrollment_id) values (%L, %L) $$, pg_temp.w(1), pg_temp.id('e1'))),
          '42501', 'j6_no_issue_path_except_the_rpc');

select * from finish();
rollback;
