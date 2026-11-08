-- W6 lifecycle: the program state machine (open needs a verified shop, >= 3 distinct upcoming
-- supervised days and the owner attestation; frozen content; archive only when nothing is
-- unfinished), sessions, invitations from accepted applications, acceptance with the notice and
-- the current schedule, the write-once terms snapshot and the enrollment state machine per actor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w6l-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w6l-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('w6l-o2@local.test')::text, true);
select set_config('fx.o3', test_helpers.create_owner('w6l-o3@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('w6l-w' || n || '@local.test'))) from generate_series(1, 7) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'w6l-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_shop(current_setting('fx.o2')::uuid, 'pending')::text, true);
select set_config('fx.s3', test_helpers.create_verified_shop(current_setting('fx.o3')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'W6L one'))::text, true);
select set_config('fx.j3', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s3')::uuid, 'W6L three'))::text, true);
create temporary table w6l_ids (label text primary key, id uuid) on commit drop;
grant all on w6l_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w6l_ids where label = p_label $$;
insert into w6l_ids select 'app' || n, test_helpers.create_job_application(current_setting('fx.j1')::uuid, pg_temp.w(n),
  case when n = 4 then 'submitted' else 'accepted' end) from generate_series(1, 6) n where n <> 5;
insert into w6l_ids values ('app5', test_helpers.create_job_application(current_setting('fx.j3')::uuid, pg_temp.w(5), 'accepted'));
create function pg_temp.program(p_id uuid) returns public.training_programs language sql stable security definer
as $$ select * from public.training_programs where id = p_id $$;
create function pg_temp.enrollment(p_id uuid) returns public.training_enrollments language sql stable security definer
as $$ select * from public.training_enrollments where id = p_id $$;
create function pg_temp.today() returns date language sql stable as $$ select test_helpers.manila_today() $$;

-- ---------- draft editing and stale edits ----------
select test_helpers.act_as_owner('w6l-o1@local.test');
insert into w6l_ids select 'p1', (public.create_training_program(current_setting('fx.s1')::uuid, 'Basic washing')).id;
select throws_ok($$ select public.update_training_program_draft(pg_temp.id('p1'), 'Basic washing', 'Learn the basics', array['Rinse'],
                    'Three supervised days', 3, array['Rinses correctly'], 500, 'PHP', 'day', 'Paid each day', 'Jeepney fare', now() - interval '1 day') $$,
                 '55000', 'This training program changed. Refresh and try again.', 'w6_stale_program_edit_rejected');
select lives_ok($$ select public.update_training_program_draft(pg_temp.id('p1'), 'Basic washing', 'Learn the basics', array['Rinse'],
                   'Three supervised days', 3, array['Rinses correctly', 'Dries without streaks'], 500, 'PHP', 'day', 'Paid each day',
                   'Jeepney fare', (pg_temp.program(pg_temp.id('p1'))).updated_at) $$, 'w6_stale_program_edit_rejected');

-- ---------- opening ----------
select count(public.add_training_session(pg_temp.id('p1'), pg_temp.today() + n, 'supervised_training')) from generate_series(1, 2) n;
select lives_ok($$ select public.add_training_session(pg_temp.id('p1'), pg_temp.today() + 3, 'competency_assessment') $$,
                'w6_program_cannot_open_with_fewer_than_three_distinct_days');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'draft', 'open', 'w6_owner_v1') $$,
                 '23514', 'Schedule at least 3 upcoming supervised training days (and no past sessions) before opening.',
                 'w6_program_cannot_open_with_fewer_than_three_distinct_days');
select throws_ok($$ select public.add_training_session(pg_temp.id('p1'), pg_temp.today() - 1, 'supervised_training') $$,
                 '23514', 'Choose a session date from today up to one year ahead.', 'w6_session_dates_not_in_past_and_cancel_refused_after_attendance');
select lives_ok($$ select public.add_training_session(pg_temp.id('p1'), pg_temp.today() + 4, 'supervised_training', '08:00', '12:00', 'Bay 2') $$,
                'w6_program_cannot_open_with_fewer_than_three_distinct_days');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'draft', 'open') $$,
                 '23514', 'Confirm the free-training statement before opening.', 'w6_open_requires_verified_shop_and_attestation');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'draft', 'open', 'w6_owner_v0') $$,
                 '23514', 'Confirm the free-training statement before opening.', 'w6_open_requires_verified_shop_and_attestation');
select test_helpers.act_as_owner('w6l-o2@local.test');
insert into w6l_ids select 'p2', (public.create_training_program(current_setting('fx.s2')::uuid, 'Unverified shop training')).id;
select throws_ok($$ select public.transition_training_program(pg_temp.id('p2'), 'draft', 'open', 'w6_owner_v1') $$,
                 '42501', 'Only a verified shop can open training programs.', 'w6_open_requires_verified_shop_and_attestation');
select test_helpers.act_as_owner('w6l-o1@local.test');
select is((public.transition_training_program(pg_temp.id('p1'), 'draft', 'open', 'w6_owner_v1')).status, 'open',
          'w6_open_requires_verified_shop_and_attestation');
select is((select row(owner_attestation_version, owner_attested_at is not null, opened_at is not null)::text from public.training_programs where id = pg_temp.id('p1')),
          row('w6_owner_v1', true, true)::text, 'w6_open_requires_verified_shop_and_attestation');
select throws_ok($$ select public.update_training_program_draft(pg_temp.id('p1'), 'Changed', 'Changed', null, 'Changed', 3, array['Item one'],
                    null, null, null, null, null, (pg_temp.program(pg_temp.id('p1'))).updated_at) $$,
                 '42501', 'An open training program cannot be edited.', 'w6_open_program_content_is_frozen');
select is(test_helpers.attempt(format($$ update public.training_programs set terms = 'Rewritten terms' where id = %L $$, pg_temp.id('p1'))),
          '42501', 'w6_open_program_content_is_frozen');
select throws_ok($$ select public.delete_training_program_draft(pg_temp.id('p1')) $$, '42501', 'Only draft training programs can be deleted.',
                 'w6_open_program_content_is_frozen');

-- ---------- disallowed program transitions ----------
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'open', 'draft') $$, '42501',
                 'This training program status change is not allowed.', 'w6_disallowed_program_transitions_rejected');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'open', 'archived') $$, '42501',
                 'This training program status change is not allowed.', 'w6_disallowed_program_transitions_rejected');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'open', 'open') $$, '42501',
                 'This training program status change is not allowed.', 'w6_disallowed_program_transitions_rejected');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'draft', 'open', 'w6_owner_v1') $$, '55000',
                 'This training program changed. Refresh and try again.', 'w6_disallowed_program_transitions_rejected');
select test_helpers.act_as_admin('w6l-a1@local.test');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'open', 'closed') $$, '42501',
                 'Training program not found.', 'w6_disallowed_program_transitions_rejected');
select test_helpers.act_as_owner('w6l-o2@local.test');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p2'), 'draft', 'closed') $$, '42501',
                 'This training program status change is not allowed.', 'w6_disallowed_program_transitions_rejected');

-- ---------- invitations ----------
select test_helpers.act_as_owner('w6l-o1@local.test');
select throws_ok($$ select public.invite_to_training(pg_temp.id('p1'), pg_temp.id('app4')) $$, '23514',
                 'Invite only an applicant you accepted for this shop.', 'w6_invite_requires_accepted_application_same_shop');
select throws_ok($$ select public.invite_to_training(pg_temp.id('p1'), pg_temp.id('app5')) $$, '23514',
                 'Invite only an applicant you accepted for this shop.', 'w6_invite_requires_accepted_application_same_shop');
insert into w6l_ids select 'e' || n, (public.invite_to_training(pg_temp.id('p1'), pg_temp.id('app' || n))).id from generate_series(1, 3) n;
select is((pg_temp.enrollment(pg_temp.id('e1'))).status, 'invited', 'w6_invite_requires_accepted_application_same_shop');
select throws_ok($$ select public.invite_to_training(pg_temp.id('p1'), pg_temp.id('app1')) $$, '23505',
                 'This worker already has a live enrollment in this program.', 'w6_duplicate_live_enrollment_rejected');
select test_helpers.act_as_owner('w6l-o3@local.test');
select throws_ok($$ select public.invite_to_training(pg_temp.id('p1'), pg_temp.id('app5')) $$, '42501', 'Training program not found.',
                 'w6_invite_requires_accepted_application_same_shop');

-- ---------- acceptance, notice, schedule, snapshot ----------
select test_helpers.act_as(pg_temp.w(1));
select throws_ok($$ select public.respond_to_training_invitation(pg_temp.id('e1'), true, null, (pg_temp.program(pg_temp.id('p1'))).schedule_changed_at) $$,
                 '23514', 'Review the free-training notice before enrolling.', 'w6_accept_requires_notice_and_current_schedule');
select throws_ok($$ select public.respond_to_training_invitation(pg_temp.id('e1'), true, 'w6_v1', now() - interval '1 day') $$,
                 '55000', 'This training program changed. Review it again.', 'w6_accept_requires_notice_and_current_schedule');
select is((public.respond_to_training_invitation(pg_temp.id('e1'), true, 'w6_v1', (pg_temp.program(pg_temp.id('p1'))).schedule_changed_at)).status,
          'accepted', 'w6_accept_requires_notice_and_current_schedule');
select is((select row(terms_snapshot ->> 'terms', terms_snapshot ->> 'shop_name' = s.name, terms_snapshot ->> 'title',
                      jsonb_array_length(terms_snapshot -> 'sessions'), terms_snapshot -> 'sessions' -> 3 ->> 'location')::text
           from public.training_enrollments e join public.shops s on s.id = current_setting('fx.s1')::uuid where e.id = pg_temp.id('e1')),
          row('Three supervised days', true, 'Basic washing', 4, 'Bay 2')::text, 'w6_terms_snapshot_records_dates_shop_terms_and_pay');
select is((select row(terms_snapshot ->> 'worker_fee', terms_snapshot ->> 'training_pay_amount', terms_snapshot ->> 'training_pay_period',
                      terms_snapshot ->> 'reimbursement_details', terms_snapshot -> 'sessions' -> 0 ->> 'session_date')::text
           from public.training_enrollments where id = pg_temp.id('e1')),
          row('0.00', '500.00', 'day', 'Jeepney fare', (pg_temp.today() + 1)::text)::text, 'w6_terms_snapshot_records_dates_shop_terms_and_pay');
select is((select row(notice_version, notice_acknowledged_at is not null, accepted_at is not null)::text from public.training_enrollments where id = pg_temp.id('e1')),
          row('w6_v1', true, true)::text, 'w6_terms_snapshot_records_dates_shop_terms_and_pay');
select test_helpers.act_as_service();
select throws_ok(format($$ update public.training_enrollments set terms_snapshot = '{}'::jsonb where id = %L $$, pg_temp.id('e1')),
                 '42501', 'The training terms snapshot cannot be changed.', 'w6_terms_snapshot_write_once_for_every_session');
select throws_ok(format($$ update public.training_enrollments set terms_snapshot_taken_at = now() - interval '1 hour' where id = %L $$, pg_temp.id('e1')),
                 '42501', 'The training terms snapshot cannot be changed.', 'w6_terms_snapshot_write_once_for_every_session');
select test_helpers.act_as_owner('w6l-o1@local.test');
select is(test_helpers.attempt(format($$ update public.training_enrollments set terms_snapshot = '{}'::jsonb where id = %L $$, pg_temp.id('e1'))),
          '42501', 'w6_terms_snapshot_write_once_for_every_session');

-- ---------- decline, withdraw, cancel ----------
select test_helpers.act_as(pg_temp.w(2));
select is((public.respond_to_training_invitation(pg_temp.id('e2'), false)).status, 'declined', 'w6_worker_can_decline_or_withdraw_unfinished_training');
select throws_ok($$ select public.respond_to_training_invitation(pg_temp.id('e2'), true, 'w6_v1', (pg_temp.program(pg_temp.id('p1'))).schedule_changed_at) $$,
                 '42501', 'This training enrollment change is not allowed.', 'w6_disallowed_enrollment_transitions_rejected');
select test_helpers.act_as(pg_temp.w(3));
select throws_ok($$ select public.withdraw_from_training(pg_temp.id('e3')) $$, '42501', 'This training enrollment change is not allowed.',
                 'w6_disallowed_enrollment_transitions_rejected');
select lives_ok($$ select public.respond_to_training_invitation(pg_temp.id('e3'), true, 'w6_v1', (pg_temp.program(pg_temp.id('p1'))).schedule_changed_at) $$,
                'w6_worker_can_decline_or_withdraw_unfinished_training');
select is((public.withdraw_from_training(pg_temp.id('e3'))).status, 'withdrawn', 'w6_worker_can_decline_or_withdraw_unfinished_training');
select throws_ok($$ select public.cancel_training_enrollment(pg_temp.id('e1'), 'Worker asked to stop the training') $$, '42501',
                 'Training enrollment not found.', 'w6_disallowed_enrollment_transitions_rejected');
select test_helpers.act_as(pg_temp.w(1));
select throws_ok($$ select public.cancel_training_enrollment(pg_temp.id('e1'), 'Worker cancels instead') $$, '42501',
                 'This training enrollment change is not allowed.', 'w6_disallowed_enrollment_transitions_rejected');
select test_helpers.act_as_admin('w6l-a1@local.test');
select throws_ok($$ select public.withdraw_from_training(pg_temp.id('e1')) $$, '42501', 'Training enrollment not found.',
                 'w6_disallowed_enrollment_transitions_rejected');
select test_helpers.act_as_owner('w6l-o1@local.test');
select throws_ok($$ select public.respond_to_training_invitation(pg_temp.id('e1'), false) $$, '42501',
                 'This training enrollment change is not allowed.', 'w6_disallowed_enrollment_transitions_rejected');
select throws_ok($$ select public.cancel_training_enrollment(pg_temp.id('e1')) $$, '23514', 'Give a reason of 10 to 300 characters.',
                 'w6_owner_cancel_needs_reason');
select throws_ok($$ select public.cancel_training_enrollment(pg_temp.id('e1'), 'Too short') $$, '23514', 'Give a reason of 10 to 300 characters.',
                 'w6_owner_cancel_needs_reason');
insert into w6l_ids select 'e6', (public.invite_to_training(pg_temp.id('p1'), pg_temp.id('app6'))).id;
select is((public.cancel_training_enrollment(pg_temp.id('e6'))).status, 'cancelled', 'w6_owner_cancel_needs_reason');

-- ---------- archive only when nothing is unfinished ----------
select is((public.transition_training_program(pg_temp.id('p1'), 'open', 'closed')).status, 'closed', 'w6_archive_refused_with_training_in_progress');
select throws_ok($$ select public.transition_training_program(pg_temp.id('p1'), 'closed', 'archived') $$, '23514',
                 'Training is still in progress in this program.', 'w6_archive_refused_with_training_in_progress');
select is((public.cancel_training_enrollment(pg_temp.id('e1'), 'The shop closed this training run')).cancel_reason,
          'The shop closed this training run', 'w6_owner_cancel_needs_reason');
select is((public.transition_training_program(pg_temp.id('p1'), 'closed', 'archived')).status, 'archived', 'w6_archive_refused_with_training_in_progress');

-- ---------- session cancel after attendance ----------
select test_helpers.act_as_service();
insert into w6l_ids values ('p3', test_helpers.create_training_program(current_setting('fx.s1')::uuid));
insert into w6l_ids values ('past', test_helpers.add_training_session(pg_temp.id('p3'), pg_temp.today() - 2)),
                           ('next', test_helpers.add_training_session(pg_temp.id('p3'), pg_temp.today() + 2));
select test_helpers.open_training_program(pg_temp.id('p3'));
insert into w6l_ids values ('e7', test_helpers.create_accepted_enrollment(pg_temp.id('p3'), pg_temp.w(7)));
select test_helpers.act_as_owner('w6l-o1@local.test');
select count(public.record_training_attendance(pg_temp.id('e7'), pg_temp.id('past'), 'present'));
select throws_ok($$ select public.cancel_training_session(pg_temp.id('past'), 'Rain stopped the training day') $$, '42501',
                 'Attendance was recorded for this session; it cannot be cancelled.', 'w6_session_dates_not_in_past_and_cancel_refused_after_attendance');
select throws_ok($$ select public.cancel_training_session(pg_temp.id('next'), 'Rain') $$, '23514', 'Give a reason of 10 to 300 characters.',
                 'w6_session_dates_not_in_past_and_cancel_refused_after_attendance');
select is((public.cancel_training_session(pg_temp.id('next'), 'Rain stopped the training day')).status, 'cancelled',
          'w6_session_dates_not_in_past_and_cancel_refused_after_attendance');

select * from finish();
rollback;
