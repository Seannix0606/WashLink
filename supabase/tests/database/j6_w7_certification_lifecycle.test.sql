-- W7 certification lifecycle (D-5, D-21, D-22, D-24, D-25): suspend / revoke / reinstate with reasons by the
-- issuing owner only; review requests by the worker; derived expiry; renewal by re-assessment inside the window;
-- append-only history; corrected evidence flags but never suspends; idempotent expiry notices. Local Docker
-- stack only; synthetic fixtures; test_helpers.backdate_certification is a TEST-ONLY time shift (W7 R7).
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w7l-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w7l-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('w7l-o2@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('w7l-cu@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('w7l-w' || n || '@local.test'))) from generate_series(1, 9) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'w7l-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table w7l_ids (label text primary key, id uuid) on commit drop;
grant all on w7l_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w7l_ids where label = p_label $$;
create function pg_temp.validity(p_months int) returns int language plpgsql as $$
begin
  perform test_helpers.act_as_owner('w7l-o1@local.test');
  perform public.set_shop_certification_validity(current_setting('fx.s1')::uuid, p_months);
  perform test_helpers.act_as_service();
  return p_months;
end $$;
select pg_temp.validity(1);
insert into w7l_ids select 'c' || n, test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(n), 'w7l-o1@local.test')
from unnest(array[4, 5, 7]) n;
select pg_temp.validity(12);
insert into w7l_ids select 'c' || n, test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(n), 'w7l-o1@local.test')
from unnest(array[1, 2, 3, 6]) n;
insert into w7l_ids values ('c8', test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(9), 'w7l-o1@local.test'));
select test_helpers.backdate_certification(pg_temp.id('c8'), 400) is not null as c8_backdated;
insert into w7l_ids values ('roster_t', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.w(8)));
select test_helpers.designate_trainer(c.program_id, pg_temp.id('roster_t')) is not null as trainer_designated
from public.certifications c where c.id = pg_temp.id('c4');
create function pg_temp.move(p_label text, p_from text, p_to text, p_reason text) returns text language sql
as $$ select (public.transition_certification(pg_temp.id(p_label), p_from, p_to, p_reason)).status $$;
create function pg_temp.move_sql(p_label text, p_from text, p_to text, p_reason text default 'A reason that is long enough here') returns text
language sql stable as $$ select format('select pg_temp.move(%L, %L, %L, %L)', p_label, p_from, p_to, p_reason) $$;
create function pg_temp.reassess(p_label text, p_result text default 'passed', p_items boolean[] default array[true, true],
  p_failure text default null) returns uuid language sql
as $$ select (public.record_certification_reassessment(pg_temp.id(p_label), p_items, p_result, null, p_failure)).id $$;
select set_config('fx.reason_msg', 'Give a reason of 20 to 500 characters.', true);
select set_config('fx.not_allowed', 'This certification status change is not allowed.', true);

-- ---------- suspend / revoke / reinstate ----------
select test_helpers.act_as_owner('w7l-o1@local.test');
select throws_ok(pg_temp.move_sql('c1', 'active', 'suspended', null), '23514', current_setting('fx.reason_msg'), 'w7_suspend_and_revoke_require_reason');
select throws_ok(pg_temp.move_sql('c1', 'active', 'suspended', '   too short   '), '23514', current_setting('fx.reason_msg'), 'w7_suspend_and_revoke_require_reason');
select throws_ok(pg_temp.move_sql('c1', 'active', 'revoked', repeat('x', 501)), '23514', current_setting('fx.reason_msg'), 'w7_suspend_and_revoke_require_reason');
select is(pg_temp.move('c1', 'active', 'suspended', '  Suspended while a complaint is checked  '), 'suspended', 'w7_suspend_and_revoke_require_reason');
select is((select status_reason from public.certifications where id = pg_temp.id('c1')), 'Suspended while a complaint is checked',
          'w7_suspend_and_revoke_require_reason');
select test_helpers.act_as_owner('w7l-o2@local.test');
select throws_ok(pg_temp.move_sql('c1', 'suspended', 'active'), '42501', 'Certification not found.', 'w7_reinstate_only_from_suspended_by_issuing_owner');
select test_helpers.act_as(pg_temp.w(1));
select throws_ok(pg_temp.move_sql('c1', 'suspended', 'active'), '42501', current_setting('fx.not_allowed'), 'w7_reinstate_only_from_suspended_by_issuing_owner');
select test_helpers.act_as_owner('w7l-o1@local.test');
select set_config('fx.c1_expiry', (select expires_at::text from public.certifications where id = pg_temp.id('c1')), true);
select is(pg_temp.move('c1', 'suspended', 'active', 'The complaint was not confirmed by the shop'), 'active', 'w7_reinstate_only_from_suspended_by_issuing_owner');
select is((select row(status_reason, expires_at = current_setting('fx.c1_expiry')::timestamptz)::text from public.certifications where id = pg_temp.id('c1')),
          row(null, true)::text, 'w7_reinstate_only_from_suspended_by_issuing_owner');
select throws_ok(pg_temp.move_sql('c1', 'active', 'active'), '42501', current_setting('fx.not_allowed'), 'w7_reinstate_only_from_suspended_by_issuing_owner');

select is(pg_temp.move('c2', 'active', 'revoked', 'Revoked after repeated unsafe washing'), 'revoked', 'w7_revoked_is_final_without_review');
select throws_ok(pg_temp.move_sql('c2', 'revoked', 'active'), '42501', current_setting('fx.not_allowed'), 'w7_revoked_is_final_without_review');
select throws_ok(pg_temp.move_sql('c2', 'revoked', 'suspended'), '42501', current_setting('fx.not_allowed'), 'w7_revoked_is_final_without_review');

select is((select count(*)::int from (values ('active', 'superseded'), ('active', 'expired'), ('active', 'issued'), ('active', null)) v(f, t)
           where test_helpers.attempt(pg_temp.move_sql('c3', v.f, v.t)) = '42501'), 4, 'w7_disallowed_transitions_rejected');
select throws_ok(pg_temp.move_sql('c8', 'active', 'suspended'), '42501', current_setting('fx.not_allowed'), 'w7_disallowed_transitions_rejected');
select is(pg_temp.move('c8', 'active', 'revoked', 'Revoked although it had already expired'), 'revoked', 'w7_disallowed_transitions_rejected');
create function pg_temp.as_other(p_who text) returns text language plpgsql as $$
begin
  if p_who = 'trainer' then perform test_helpers.act_as(pg_temp.w(8));
  elsif p_who = 'admin' then perform test_helpers.act_as_admin('w7l-a1@local.test');
  else perform test_helpers.act_as_customer('w7l-cu@local.test'); end if;
  return test_helpers.attempt(pg_temp.move_sql('c3', 'active', 'suspended'));
end $$;
select is((select array_agg(pg_temp.as_other(x) order by x) from unnest(array['admin', 'customer', 'trainer']) x),
          array['42501', '42501', '42501'], 'w7_disallowed_transitions_rejected');
select test_helpers.act_as_owner('w7l-o1@local.test');
select throws_ok(pg_temp.move_sql('c3', 'suspended', 'revoked'), '55000', 'This certification changed. Refresh and try again.', 'w7_stale_status_rejected');
select is((select status from public.certifications where id = pg_temp.id('c3')), 'active', 'w7_stale_status_rejected');

-- ---------- review requests ----------
select test_helpers.act_as(pg_temp.w(2));
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c2'), 'Too short'), '23514',
                 'Write a statement of 20 to 1000 characters.', 'w7_review_request_by_worker_within_30_days');
insert into w7l_ids select 'r1', id from public.request_certification_review(pg_temp.id('c2'), '  I always followed the safe washing steps.  ');
select is((select row(review_status, worker_statement)::text from public.certification_history(pg_temp.id('c2'))
           where entry_kind = 'review_request' and entry_id = pg_temp.id('r1')::text),
          row('open', 'I always followed the safe washing steps.')::text, 'w7_review_request_by_worker_within_30_days');
select test_helpers.act_as_owner('w7l-o1@local.test');
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c2'), 'The owner cannot ask for a review.'),
                 '42501', 'Certification not found.', 'w7_review_request_by_worker_within_30_days');
select test_helpers.act_as(pg_temp.w(3));
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c2'), 'Another worker cannot ask either.'),
                 '42501', 'Certification not found.', 'w7_review_request_by_worker_within_30_days');
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c3'), 'This one is still active though.'),
                 '23514', 'Only a suspended or revoked certification can be reviewed.', 'w7_review_request_by_worker_within_30_days');
select test_helpers.act_as_service();
select test_helpers.backdate_certification(pg_temp.id('c8'), 31) is not null as c8_decision_31_days_ago;
select test_helpers.act_as(pg_temp.w(9));
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c8'), 'The revocation was more than a month ago.'),
                 '23514', 'The review period for this decision has ended.', 'w7_review_request_by_worker_within_30_days');

select test_helpers.act_as(pg_temp.w(2));
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c2'), 'A second open request is not allowed.'),
                 '23505', 'A review request is already open for this certification.', 'w7_one_open_review_and_at_most_three');
select is((public.withdraw_certification_review(pg_temp.id('r1'))).status, 'withdrawn', 'w7_one_open_review_and_at_most_three');
insert into w7l_ids select 'r2', id from public.request_certification_review(pg_temp.id('c2'), 'Second request after the withdrawal.');
select test_helpers.act_as_owner('w7l-o1@local.test');
select throws_ok(format('select public.decide_certification_review(%L, %L, %L)', pg_temp.id('r2'), 'approve', 'Not a valid decision word at all'),
                 '22023', 'Choose reinstate or uphold.', 'w7_review_decision_reinstate_or_uphold_with_reason');
select throws_ok(format('select public.decide_certification_review(%L, %L, %L)', pg_temp.id('r2'), 'uphold', 'Too short'),
                 '23514', current_setting('fx.reason_msg'), 'w7_review_decision_reinstate_or_uphold_with_reason');
select is((public.decide_certification_review(pg_temp.id('r2'), 'uphold', 'The unsafe washing was seen twice by staff')).status, 'upheld',
          'w7_review_decision_reinstate_or_uphold_with_reason');
select is((select row(c.status, ev.event, ev.from_status, ev.to_status, ev.review_request_id = pg_temp.id('r2'))::text
           from public.certifications c join public.certification_status_events ev on ev.certification_id = c.id
           where c.id = pg_temp.id('c2') order by ev.id desc limit 1),
          row('revoked', 'review_upheld', 'revoked', 'revoked', true)::text, 'w7_review_decision_reinstate_or_uphold_with_reason');
select throws_ok(format('select public.decide_certification_review(%L, %L, %L)', pg_temp.id('r2'), 'reinstate', 'Changing my mind after deciding'),
                 '23514', 'This review request is no longer open.', 'w7_review_decision_reinstate_or_uphold_with_reason');
select test_helpers.act_as(pg_temp.w(2));
insert into w7l_ids select 'r3', id from public.request_certification_review(pg_temp.id('c2'), 'Third request with new information.');
select throws_ok(format('select public.decide_certification_review(%L, %L, %L)', pg_temp.id('r3'), 'reinstate', 'Workers cannot decide their own'),
                 '42501', 'Certification not found.', 'w7_review_decision_reinstate_or_uphold_with_reason');
select is((public.withdraw_certification_review(pg_temp.id('r3'))).status, 'withdrawn', 'w7_one_open_review_and_at_most_three');
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c2'), 'A fourth request is over the limit.'),
                 '23514', 'A certification can be reviewed at most 3 times.', 'w7_one_open_review_and_at_most_three');
select test_helpers.act_as_owner('w7l-o1@local.test');
select is(pg_temp.move('c1', 'active', 'suspended', 'Suspended again for a second complaint'), 'suspended', 'w7_review_decision_reinstate_or_uphold_with_reason');
select test_helpers.act_as(pg_temp.w(1));
insert into w7l_ids select 'r4', id from public.request_certification_review(pg_temp.id('c1'), 'The second complaint was about someone else.');
select test_helpers.act_as_owner('w7l-o1@local.test');
select is((public.decide_certification_review(pg_temp.id('r4'), 'reinstate', 'Confirmed the complaint was about someone else')).status,
          'reinstated', 'w7_review_decision_reinstate_or_uphold_with_reason');
select is((select row(c.status, c.status_reason, ev.event, ev.review_request_id = pg_temp.id('r4'))::text
           from public.certifications c join public.certification_status_events ev on ev.certification_id = c.id
           where c.id = pg_temp.id('c1') order by ev.id desc limit 1), row('active', null, 'reinstated', true)::text,
          'w7_review_decision_reinstate_or_uphold_with_reason');

-- ---------- derived expiry ----------
select is(public.certification_effective_status('active', now() + interval '1 day', now()), 'active', 'w7_effective_status_expired_after_expiry');
select is(public.certification_effective_status('active', now() + interval '1 day', now() + interval '2 days'), 'expired',
          'w7_effective_status_expired_after_expiry');
select is(public.certification_effective_status('suspended', now() - interval '1 day', now()), 'suspended', 'w7_effective_status_expired_after_expiry');
select is((select public.certification_effective_status(status, expires_at, now() + interval '400 days') from public.certifications
           where id = pg_temp.id('c3')), 'expired', 'w7_effective_status_expired_after_expiry');

-- ---------- re-assessment and renewal ----------
select throws_ok($$ select pg_temp.reassess('c6') $$, '23514', 'Re-assessment opens 60 days before expiry and closes 90 days after it.',
                 'w7_reassessment_only_in_renewal_window_and_by_authorised_recorder');
select throws_ok($$ select pg_temp.reassess('c4', 'passed', array[true]) $$, '22023', 'Mark every checklist item as met or not met.',
                 'w7_reassessment_only_in_renewal_window_and_by_authorised_recorder');
select throws_ok($$ select pg_temp.reassess('c4', 'passed', array[true, false]) $$, '23514', 'A pass needs every checklist item met.',
                 'w7_reassessment_only_in_renewal_window_and_by_authorised_recorder');
select test_helpers.act_as(pg_temp.w(4));
select throws_ok($$ select pg_temp.reassess('c4') $$, '42501', 'Only the shop owner or a designated trainer can record training.',
                 'w7_reassessment_only_in_renewal_window_and_by_authorised_recorder');
select test_helpers.act_as_owner('w7l-o2@local.test');
select throws_ok($$ select pg_temp.reassess('c4') $$, '42501', 'Only the shop owner or a designated trainer can record training.',
                 'w7_reassessment_only_in_renewal_window_and_by_authorised_recorder');
select test_helpers.act_as(pg_temp.w(8));
insert into w7l_ids values ('ra1', pg_temp.reassess('c4'));
select test_helpers.act_as_service();
select is((select row(assessor_role, assessed_by = pg_temp.w(8), result)::text from public.certification_reassessments where id = pg_temp.id('ra1')),
          row('trainer', true, 'passed')::text, 'w7_reassessment_only_in_renewal_window_and_by_authorised_recorder');
select test_helpers.act_as_owner('w7l-o1@local.test');
insert into w7l_ids values ('ra2', pg_temp.reassess('c4', 'failed', array[true, false], 'Drying was not finished'));
create function pg_temp.renew_sql(p_cert text, p_reassessment text) returns text language sql stable
as $$ select format('select public.renew_certification(%L, %L, %L)', pg_temp.id(p_cert), pg_temp.id(p_reassessment), 'w7_issuer_v1') $$;
select throws_ok(pg_temp.renew_sql('c4', 'ra1'), '55000', 'The training record changed. Review it again.', 'w7_renewal_requires_latest_recent_passed_reassessment');
select throws_ok(pg_temp.renew_sql('c4', 'ra2'), '23514', 'Record a passed re-assessment first.', 'w7_renewal_requires_latest_recent_passed_reassessment');
insert into w7l_ids values ('ra3', pg_temp.reassess('c4'));
select test_helpers.act_as_service();
select test_helpers.backdate_certification(pg_temp.id('c4'), 31) is not null as c4_shifted;
select test_helpers.act_as_owner('w7l-o1@local.test');
select throws_ok(pg_temp.renew_sql('c4', 'ra3'), '23514', 'Record a passed re-assessment first.', 'w7_renewal_requires_latest_recent_passed_reassessment');
insert into w7l_ids values ('ra4', pg_temp.reassess('c4'));
insert into w7l_ids select 'c4_new', id from public.renew_certification(pg_temp.id('c4'), pg_temp.id('ra4'), 'w7_issuer_v1');
select is((select row(n.renews_certification_id = o.id, n.reassessment_id = pg_temp.id('ra4'), n.issued_at = now(), n.status, n.validity_months,
                      n.enrollment_id = o.enrollment_id, n.evidence_snapshot ->> 'reassessment_id' = pg_temp.id('ra4')::text, o.status)::text
           from public.certifications n join public.certifications o on o.id = pg_temp.id('c4') where n.id = pg_temp.id('c4_new')),
          row(true, true, true, 'active', 12, true, true, 'superseded')::text, 'w7_renewal_supersedes_old_and_starts_now');
select is((select array_agg(ev.event order by ev.id) from public.certification_status_events ev
           where ev.certification_id in (pg_temp.id('c4'), pg_temp.id('c4_new'))), array['issued', 'superseded', 'renewed'],
          'w7_renewal_supersedes_old_and_starts_now');
select throws_ok(pg_temp.renew_sql('c4', 'ra4'), '23514', 'This certification cannot be renewed.', 'w7_renewal_supersedes_old_and_starts_now');
select throws_ok($$ select pg_temp.reassess('c2') $$, '23514', 'This certification cannot be renewed.', 'w7_suspended_or_revoked_cannot_be_renewed');
select throws_ok(pg_temp.renew_sql('c2', 'ra4'), '23514', 'This certification cannot be renewed.', 'w7_suspended_or_revoked_cannot_be_renewed');

insert into w7l_ids values ('ra5', pg_temp.reassess('c5'));
select ok((public.correct_training_attendance((select r.id from public.training_attendance_records r join public.certifications c
           on c.enrollment_id = r.enrollment_id where c.id = pg_temp.id('c5') order by r.session_date limit 1), 'absent', null,
           'Recorded for the wrong worker')).id is not null, 'w7_evidence_correction_after_issue_flags_and_never_suspends');
select throws_ok(pg_temp.renew_sql('c5', 'ra5'), '23514', 'The training record no longer shows completion.', 'w7_renewal_refused_when_training_no_longer_completed');
select test_helpers.act_as_service();
select is((select status from public.certifications where id = pg_temp.id('c5')), 'active', 'w7_evidence_correction_after_issue_flags_and_never_suspends');
select is((select count(*)::int from public.workforce_audit_events where action = 'certification.training_record_changed'
           and subject_id = pg_temp.id('c5')), 1, 'w7_evidence_correction_after_issue_flags_and_never_suspends');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('fx.o1')::uuid
           and category = 'certification.training_record_changed' and subject_id = pg_temp.id('c5')), 1,
          'w7_evidence_correction_after_issue_flags_and_never_suspends');
select test_helpers.act_as_owner('w7l-o1@local.test');
select is((select training_record_changed_after_issue from public.owner_certifications(current_setting('fx.s1')::uuid)
           where certification_id = pg_temp.id('c5')), true, 'w7_evidence_correction_after_issue_flags_and_never_suspends');

-- ---------- history is append-only ----------
select test_helpers.act_as_service();
select is((select count(*)::int from (values
  (format('update public.certification_status_events set reason = %L where certification_id = %L', 'Edited reason that is long enough', pg_temp.id('c2'))),
  (format('delete from public.certification_status_events where certification_id = %L', pg_temp.id('c2'))),
  (format('update public.certification_review_requests set decision_reason = %L where id = %L', 'Edited decision reason text', pg_temp.id('r2'))),
  (format('delete from public.certification_review_requests where id = %L', pg_temp.id('r1'))),
  (format('update public.certification_reassessments set result = %L where id = %L', 'failed', pg_temp.id('ra1'))),
  (format('delete from public.certification_reassessments where id = %L', pg_temp.id('ra1')))) v(q)
  where test_helpers.attempt(v.q) = '42501'), 6, 'w7_status_history_append_only');

-- ---------- expiry notices (D-25) ----------
select throws_ok($$ select public.enqueue_certification_expiry_notices(now() - interval '1 minute') $$, '22023', 'A past time cannot be used.',
                 'w7_expiry_notice_function_idempotent_and_refuses_past');
select is(public.enqueue_certification_expiry_notices(now() + interval '2 days'), 2, 'w7_expiry_notice_function_idempotent_and_refuses_past');
select is(public.enqueue_certification_expiry_notices(now() + interval '2 days'), 0, 'w7_expiry_notice_function_idempotent_and_refuses_past');
select is(public.enqueue_certification_expiry_notices(now() + interval '40 days'), 2, 'w7_expiry_notice_function_idempotent_and_refuses_past');
select is((select array_agg(n.category || ':' || (n.subject_id = pg_temp.id('c7'))::text order by n.category, n.subject_id = pg_temp.id('c7'))
           from public.notifications n where n.idempotency_key like 'certification\_expiry:%'),
          array['certification.expired:false', 'certification.expired:true', 'certification.expiring:false', 'certification.expiring:true'],
          'w7_expiry_notice_function_idempotent_and_refuses_past');

select * from finish();
rollback;
