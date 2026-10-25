-- J17 / J6 (W6 review polish): unlinking a trainer's roster row revokes the designation for good (a re-link
-- does not revive it, D-16); the shop-removal trigger locks programs first; the booking gate is scoped to the
-- booking shop owner's roster and fires after the W2 guard (no training message to a non-owner); completed /
-- failed enrollments do not count toward the live limits; a failed trainee may leave and the owner may cancel
-- or close; a fail needs a reason; the worker reads the per-item checklist results of their own assessments.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17rp-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17rp-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17rp-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j17rp-c1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j17rp-' || l || '@local.test')))
from unnest(array['w', 't', 'x']) l;
create function pg_temp.u(p_label text) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j17rp-' || p_label || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j17rp_ids (label text primary key, id uuid) on commit drop;
grant all on j17rp_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17rp_ids where label = p_label $$;
-- p1..p10: open programs with three past days, worker w accepted in each (10 live); pt: the invite target.
insert into j17rp_ids select 'p' || n, test_helpers.create_training_program(current_setting('fx.s1')::uuid) from generate_series(1, 10) n;
insert into j17rp_ids select 'p' || n || 'd' || d, test_helpers.add_training_session(pg_temp.id('p' || n), test_helpers.manila_today() - d)
from generate_series(1, 10) n, generate_series(1, 3) d;
insert into j17rp_ids values ('pt', test_helpers.create_training_program(current_setting('fx.s1')::uuid));
select count(test_helpers.add_training_session(pg_temp.id('pt'), test_helpers.manila_today() + d)) from generate_series(1, 3) d;
select count(test_helpers.open_training_program(pg_temp.id(l))) from unnest(array['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'pt']) l;
insert into j17rp_ids select 'e' || n, test_helpers.create_accepted_enrollment(pg_temp.id('p' || n), pg_temp.u('w')) from generate_series(1, 10) n;
insert into j17rp_ids values ('ex', test_helpers.create_accepted_enrollment(pg_temp.id('p1'), pg_temp.u('x')));
insert into j17rp_ids values ('job', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Washer')));
insert into j17rp_ids values ('app', test_helpers.create_job_application(pg_temp.id('job'), pg_temp.u('w'), 'accepted'));
insert into j17rp_ids values ('r_t', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u('t'))),
  ('r_w', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u('w')));
insert into j17rp_ids values ('des', test_helpers.designate_trainer(pg_temp.id('p10'), pg_temp.id('r_t')));
insert into j17rp_ids values ('b1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)),
  ('b2', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s2')::uuid)),
  ('b3', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid));
create function pg_temp.live(p_label text) returns boolean language sql stable security definer
as $$ select public.training_enrollment_is_live(pg_temp.id(p_label)) $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'succeeded';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

-- ---------- live limits: completed / failed do not count ----------
select test_helpers.act_as_owner('j17rp-o1@local.test');
select throws_ok(format('select public.invite_to_training(%L, %L)', pg_temp.id('pt'), pg_temp.id('app')), '23514',
                 'This worker has reached the limit of 10 live trainings.', 'w6rp_ten_live_trainings_block_an_invite');
select count(public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('p1d' || d), 'present')) from generate_series(1, 3) d;
select count(public.record_training_attendance(pg_temp.id('e2'), pg_temp.id('p2d' || d), 'present')) from generate_series(1, 3) d;
select count(public.record_training_attendance(pg_temp.id('e3'), pg_temp.id('p3d' || d), 'present')) from generate_series(1, 3) d;

-- ---------- a fail needs a reason (10..300), DB-enforced ----------
select throws_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, false], 'failed') $$, '23514',
                 'Give a reason for the fail of 10 to 300 characters.', 'w6rp_failed_assessment_requires_reason');
select throws_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, false], 'failed', null, 'Too short') $$, '23514',
                 'Give a reason for the fail of 10 to 300 characters.', 'w6rp_failed_assessment_requires_reason');
select lives_ok($$ select public.record_training_assessment(pg_temp.id('e1'), array[true, false], 'failed', 'Keep practising',
                                                            'Soap was not diluted correctly') $$, 'w6rp_failed_assessment_requires_reason');
select lives_ok($$ select public.record_training_assessment(pg_temp.id('e2'), array[true, false], 'failed', null,
                                                            'Pre-rinse skipped on two cars') $$, 'w6rp_failed_assessment_requires_reason');
select lives_ok($$ select public.record_training_assessment(pg_temp.id('e3'), array[true, true], 'passed', null, 'Ignored on a pass') $$,
                'w6rp_failed_assessment_requires_reason');
select is((select failure_reason from public.training_assessments where enrollment_id = pg_temp.id('e3')), null,
          'w6rp_failed_assessment_requires_reason');
select throws_ok(format('select public.correct_training_assessment(%L, array[false, false], %L, null, %L)',
                        (select id from public.training_assessments where enrollment_id = pg_temp.id('e3')), 'failed', 'Recount after review'),
                 '23514', 'Give a reason for the fail of 10 to 300 characters.', 'w6rp_failed_assessment_requires_reason');
select test_helpers.act_as_service();
select ok((select pg_get_constraintdef(oid) ~ 'failure_reason' and pg_get_constraintdef(oid) ~ '10' and pg_get_constraintdef(oid) ~ '300'
           from pg_constraint where conname = 'ta_failure_reason_check' and conrelid = 'public.training_assessments'::regclass),
          'w6rp_failed_assessment_requires_reason');
select is(array[pg_temp.live('e1'), pg_temp.live('e2'), pg_temp.live('e3'), pg_temp.live('e4')], array[false, false, false, true],
          'w6rp_completed_and_failed_are_not_live');
select ok((select count(*) = 2 from regexp_matches(pg_get_functiondef('public.invite_to_training(uuid, uuid)'::regprocedure),
                                                   'training_enrollment_is_live', 'g')), 'w6rp_completed_and_failed_are_not_live');
select test_helpers.act_as_owner('j17rp-o1@local.test');
select is((public.invite_to_training(pg_temp.id('pt'), pg_temp.id('app'))).status, 'invited', 'w6rp_completed_and_failed_are_not_live');

-- ---------- worker reads per-item results of own assessments ----------
select test_helpers.act_as(pg_temp.u('w'));
select is((select row(checklist_snapshot, items_met, result, failure_reason)::text from public.training_assessments
           where enrollment_id = pg_temp.id('e1')),
          row(array['Pre-rinse done', 'Soap diluted correctly'], array[true, false], 'failed', 'Soap was not diluted correctly')::text,
          'w6rp_worker_reads_own_checklist_items');
select is((select row(checklist_snapshot, items_met, failure_reason)::text from public.training_evidence_for_enrollment(pg_temp.id('e1'))
           where evidence_kind = 'assessment'),
          row(array['Pre-rinse done', 'Soap diluted correctly'], array[true, false], 'Soap was not diluted correctly')::text,
          'w6rp_worker_reads_own_checklist_items');
select test_helpers.act_as(pg_temp.u('x'));
select is((select count(*)::int from public.training_assessments where enrollment_id = pg_temp.id('e1')), 0,
          'w6rp_worker_reads_own_checklist_items');

-- ---------- failed: worker may leave, owner may cancel and close; completed stays locked ----------
select test_helpers.act_as(pg_temp.u('w'));
select is((public.withdraw_from_training(pg_temp.id('e1'))).status, 'withdrawn', 'w6rp_failed_trainee_can_leave');
select throws_ok($$ select public.withdraw_from_training(pg_temp.id('e3')) $$, '42501', 'This training enrollment change is not allowed.',
                 'w6rp_failed_trainee_can_leave');
select test_helpers.act_as_owner('j17rp-o1@local.test');
select is((public.cancel_training_enrollment(pg_temp.id('e2'), 'Training run ended after the fail')).status, 'cancelled',
          'w6rp_owner_can_cancel_or_close_after_fail');
select throws_ok($$ select public.cancel_training_enrollment(pg_temp.id('ex'), 'Short') $$, '23514', 'Give a reason of 10 to 300 characters.',
                 'w6rp_owner_can_cancel_or_close_after_fail');
select is((public.transition_training_program(pg_temp.id('p1'), 'open', 'closed')).status, 'closed', 'w6rp_owner_can_cancel_or_close_after_fail');

-- ---------- booking gate: scoped to the booking shop owner's roster, after the W2 guard ----------
select test_helpers.act_as_service();
select is((select array_agg(tgname::text order by tgname) from pg_trigger
           where tgrelid = 'public.bookings'::regclass and tgname in ('bookings_guard_update', 'bookings_guard_update_training_gate',
                                                                       'bookings_guard_training_assignment')),
          array['bookings_guard_update', 'bookings_guard_update_training_gate'], 'w6rp_gate_fires_after_w2_guard');
select test_helpers.act_as_owner('j17rp-o2@local.test');
select ok(pg_temp.err(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('r_w'), pg_temp.id('b1'))) !~* 'training',
          'w6rp_gate_message_not_returned_to_non_owner');
select is(pg_temp.err(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('r_w'), pg_temp.id('b2'))),
          '42501: Only a worker from your own roster can be assigned to this booking.', 'w6rp_gate_message_not_returned_to_non_owner');
select test_helpers.act_as_owner('j17rp-o1@local.test');
select is(pg_temp.err(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('r_w'), pg_temp.id('b3'))),
          '23514: This worker is in required training with your shop and cannot be assigned to customer bookings until the training ends.',
          'w6rp_gate_still_blocks_own_trainee');
select test_helpers.act_as_admin('j17rp-a1@local.test');
select is(pg_temp.err(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('r_w'), pg_temp.id('b2'))),
          'succeeded', 'w6rp_gate_scoped_to_booking_shop_owner');

-- ---------- shop-removal trigger locks programs before the check ----------
select test_helpers.act_as_service();
select ok(position('for update' in pg_get_functiondef('public.shops_remove_unenrolled_training_programs()'::regprocedure))
          between 1 and position('delete from' in pg_get_functiondef('public.shops_remove_unenrolled_training_programs()'::regprocedure)),
          'w6rp_shop_removal_locks_programs_first');

-- ---------- trainer: unlink revokes, re-link does not revive ----------
select test_helpers.act_as(pg_temp.u('t'));
select lives_ok($$ select public.record_training_attendance(pg_temp.id('e10'), pg_temp.id('p10d1'), 'present') $$,
                'w6rp_trainer_unlink_revokes_and_relink_does_not_revive');
select test_helpers.act_as_owner('j17rp-o1@local.test');
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('r_t'))), 'succeeded',
          'w6rp_trainer_unlink_revokes_and_relink_does_not_revive');
select test_helpers.act_as_service();
select ok((select revoked_at is not null and revoked_by = current_setting('fx.o1')::uuid from public.training_program_trainers
           where id = pg_temp.id('des')), 'w6rp_trainer_unlink_revokes_and_relink_does_not_revive');
select is((select payload ->> 'changed_by' from public.workforce_audit_events
           where action = 'training_trainer.revoked' and subject_id = pg_temp.id('p10')), 'roster_unlinked',
          'w6rp_trainer_unlink_revokes_and_relink_does_not_revive');
update public.workers set user_id = pg_temp.u('t') where id = pg_temp.id('r_t');   -- trusted re-link
select ok((select revoked_at is not null from public.training_program_trainers where id = pg_temp.id('des')),
          'w6rp_trainer_unlink_revokes_and_relink_does_not_revive');
select test_helpers.act_as(pg_temp.u('t'));
select throws_ok($$ select public.record_training_attendance(pg_temp.id('e10'), pg_temp.id('p10d2'), 'present') $$, '42501',
                 'Only the shop owner or a designated trainer can record training.', 'w6rp_trainer_unlink_revokes_and_relink_does_not_revive');
select ok(not public.is_designated_training_trainer(pg_temp.id('p10')), 'w6rp_trainer_unlink_revokes_and_relink_does_not_revive');
select test_helpers.act_as_service();
insert into j17rp_ids values ('des2', test_helpers.designate_trainer(pg_temp.id('p10'), pg_temp.id('r_t')));
delete from public.workers where id = pg_temp.id('r_t');
select ok((select revoked_at is not null and roster_worker_id is null from public.training_program_trainers where id = pg_temp.id('des2')),
          'w6rp_roster_row_delete_revokes_trainer');

select * from finish();
rollback;
