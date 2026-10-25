-- W7 audit and notifications (spec I; W3 pattern; W7 PLAN 3.8, P36): every certification action writes one
-- audit row whose payload holds ids, status words, booleans and counts only; workers and owners get one in-app
-- notification per event with no reasons, statements, person names or dates; refused actions write nothing.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w7n-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w7n-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('w7n-o2@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('w7n-w' || n || '@local.test'))) from generate_series(1, 3) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'w7n-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table w7n_ids (label text primary key, id uuid) on commit drop;
grant all on w7n_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w7n_ids where label = p_label $$;
select test_helpers.act_as_owner('w7n-o1@local.test');
select (public.set_shop_certification_validity(current_setting('fx.s1')::uuid, 1)).validity_months as validity;
select test_helpers.act_as_service();
insert into w7n_ids select 'c' || n, test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(n), 'w7n-o1@local.test')
from generate_series(1, 3) n;

select test_helpers.act_as_owner('w7n-o1@local.test');
insert into w7n_ids select 'ra1', id from public.record_certification_reassessment(pg_temp.id('c1'), array[true, true], 'passed');
insert into w7n_ids select 'c1n', id from public.renew_certification(pg_temp.id('c1'), pg_temp.id('ra1'), 'w7_issuer_v1');
select (public.transition_certification(pg_temp.id('c1n'), 'active', 'suspended', 'Complaint ZEBRA about unsafe washing')).status;
select (public.transition_certification(pg_temp.id('c1n'), 'suspended', 'active', 'Complaint ZEBRA was not confirmed')).status;
select (public.transition_certification(pg_temp.id('c1n'), 'active', 'revoked', 'Complaint QUOKKA confirmed by staff')).status;
select test_helpers.act_as(pg_temp.w(1));
insert into w7n_ids select 'r1', id from public.request_certification_review(pg_temp.id('c1n'), 'Statement WOMBAT: I was not at work.');
select (public.withdraw_certification_review(pg_temp.id('r1'))).status;
insert into w7n_ids select 'r1b', id from public.request_certification_review(pg_temp.id('c1n'), 'Statement WOMBAT again with more detail.');
select test_helpers.act_as_owner('w7n-o1@local.test');
select (public.decide_certification_review(pg_temp.id('r1b'), 'uphold', 'Decision NUMBAT: staff saw it twice')).status;
select (public.transition_certification(pg_temp.id('c2'), 'active', 'suspended', 'Complaint ZEBRA for the second worker')).status;
select test_helpers.act_as(pg_temp.w(2));
insert into w7n_ids select 'r2', id from public.request_certification_review(pg_temp.id('c2'), 'Statement WOMBAT from the second worker.');
select test_helpers.act_as_owner('w7n-o1@local.test');
select (public.decide_certification_review(pg_temp.id('r2'), 'reinstate', 'Decision NUMBAT: the complaint was wrong')).status;
select (public.correct_training_attendance((select r.id from public.training_attendance_records r join public.certifications c
        on c.enrollment_id = r.enrollment_id where c.id = pg_temp.id('c3') order by r.session_date limit 1), 'absent', null,
        'Recorded for the wrong worker')).attendance_status;
select test_helpers.act_as_service();
create temporary table w7n_events on commit drop as
  select * from public.workforce_audit_events where action like 'certification.%' or action like 'shop\_certification\_policy.%';
create temporary table w7n_notes on commit drop as select * from public.notifications where category like 'certification.%';

-- ---------- audit ----------
select is((select array_agg(distinct action order by action) from w7n_events),
          array['certification.issued', 'certification.reassessment_recorded', 'certification.renewed', 'certification.review_decided',
                'certification.review_requested', 'certification.review_withdrawn', 'certification.status_changed',
                'certification.training_record_changed', 'shop_certification_policy.updated'], 'w7_audit_written_for_every_certification_action');
select is((select array_agg(payload ->> 'from_status' || '>' || (payload ->> 'to_status') || ':' || (payload ->> 'changed_by') order by id)
           from w7n_events where action = 'certification.status_changed'),
          array['active>superseded:owner', 'active>suspended:owner', 'suspended>active:owner', 'active>revoked:owner', 'active>suspended:owner',
                'suspended>active:review_decision'], 'w7_audit_written_for_every_certification_action');
select is((select array_agg(action || ':' || coalesce(payload ->> 'decision', '') order by id) from w7n_events where action like 'certification.review%'),
          array['certification.review_requested:', 'certification.review_withdrawn:', 'certification.review_requested:', 'certification.review_decided:upheld',
                'certification.review_requested:', 'certification.review_decided:reinstated'], 'w7_audit_written_for_every_certification_action');
select is((select row(count(*), count(*) filter (where actor_kind = 'user' and actor_id = current_setting('fx.o1')::uuid),
                      count(*) filter (where subject_type = 'certification' and subject_profile_id is not null))::text
           from w7n_events where action in ('certification.issued', 'certification.renewed')), row(4, 4, 4)::text,
          'w7_audit_written_for_every_certification_action');
select is((select count(*)::int from w7n_events e, jsonb_object_keys(e.payload) k
           where k not in ('certification_id', 'enrollment_id', 'program_id', 'shop_id', 'renews_certification_id', 'from_status', 'to_status',
                           'decision', 'result', 'validity_months', 'attended_training_days', 'required_training_days', 'items_met_count',
                           'items_total', 'changed_by', 'deleted_by')), 0, 'w7_audit_payload_has_no_reasons_names_or_dates');
select is((select count(*)::int from w7n_events where payload::text ~* '(zebra|quokka|wombat|numbat|local test|\d{4}-\d{2}-\d{2}|wrong worker)'), 0,
          'w7_audit_payload_has_no_reasons_names_or_dates');

-- ---------- notifications ----------
select is((select array_agg(category order by created_at, category) from w7n_notes where recipient_id = pg_temp.w(1)),
          (select array_agg(c order by c) from unnest(array['certification.issued', 'certification.renewed', 'certification.suspended',
           'certification.reinstated', 'certification.revoked', 'certification.review_decided']) c),
          'w7_worker_notified_on_issue_renew_suspend_revoke_reinstate_and_decision');
select is((select array_agg(category order by category) from w7n_notes where recipient_id = pg_temp.w(2)),
          array['certification.issued', 'certification.review_decided', 'certification.suspended'],
          'w7_worker_notified_on_issue_renew_suspend_revoke_reinstate_and_decision');
select is((select body from w7n_notes where recipient_id = pg_temp.w(2) and category = 'certification.review_decided'),
          format('%s reviewed your request for Local test training: reinstated.',
                 public.notification_safe_label((select name from public.shops where id = current_setting('fx.s1')::uuid), 'The shop')),
          'w7_worker_notified_on_issue_renew_suspend_revoke_reinstate_and_decision');
select is((select array_agg(category || ':' || subject_id::text order by category, subject_id::text) from w7n_notes where recipient_id = current_setting('fx.o1')::uuid),
          (select array_agg(x order by x) from unnest(array['certification.review_requested:' || pg_temp.id('c1n'),
           'certification.review_requested:' || pg_temp.id('c1n'), 'certification.review_requested:' || pg_temp.id('c2'),
           'certification.training_record_changed:' || pg_temp.id('c3')]) x), 'w7_owner_notified_on_review_request_and_record_change');
select is((select count(*)::int from w7n_notes where recipient_id = current_setting('fx.o2')::uuid), 0, 'w7_owner_notified_on_review_request_and_record_change');
select is((select count(*)::int from w7n_notes n where n.idempotency_key !~ '^certification:[0-9a-f-]{36}:[0-9]+$'
             or not exists (select 1 from w7n_events e where n.idempotency_key = format('certification:%s:%s', e.subject_id, e.id))), 0,
          'w7_notifications_idempotent_one_per_event');
select is((select count(distinct (recipient_id, idempotency_key))::int from w7n_notes), (select count(*)::int from w7n_notes),
          'w7_notifications_idempotent_one_per_event');
select is((select count(*)::int from w7n_notes where (title || ' ' || body) ~* '(zebra|quokka|wombat|numbat|local test owner|local test worker|\d{4}-\d{2}-\d{2}|wrong worker|unsafe|confirmed)'),
          0, 'w7_notification_text_has_no_reason_statement_or_name');

-- ---------- refused actions write nothing ----------
create temporary table w7n_before on commit drop as
  select (select count(*) from public.workforce_audit_events) as events, (select count(*) from public.notifications) as notes,
         (select count(*) from public.certification_status_events) as history, (select count(*) from public.certification_review_requests) as reviews;
create function pg_temp.refused() returns text[] language plpgsql as $$
declare
  outcomes text[] := '{}';
begin
  perform test_helpers.act_as(pg_temp.w(3));
  outcomes := outcomes || test_helpers.attempt(format('select public.transition_certification(%L, %L, %L, %L)', pg_temp.id('c3'), 'active', 'revoked',
                                                       'A worker cannot revoke their own'));
  outcomes := outcomes || test_helpers.attempt(format('select public.request_certification_review(%L, %L)', pg_temp.id('c3'), 'Active cannot be reviewed.'));
  perform test_helpers.act_as_owner('w7n-o2@local.test');
  outcomes := outcomes || test_helpers.attempt(format('select public.renew_certification(%L, gen_random_uuid(), %L)', pg_temp.id('c3'), 'w7_issuer_v1'));
  perform test_helpers.act_as_owner('w7n-o1@local.test');
  outcomes := outcomes || test_helpers.attempt(format('select public.transition_certification(%L, %L, %L, %L)', pg_temp.id('c3'), 'active', 'suspended', 'short'));
  outcomes := outcomes || test_helpers.attempt(format('select public.set_shop_certification_validity(%L, 40)', current_setting('fx.s1')));
  perform test_helpers.act_as_service();
  return outcomes;
end $$;
select is(pg_temp.refused(), array['42501', '23514', '42501', '23514', '23514'], 'w7_refused_action_writes_nothing');
select is((select row((select count(*) from public.workforce_audit_events) - events, (select count(*) from public.notifications) - notes,
                      (select count(*) from public.certification_status_events) - history,
                      (select count(*) from public.certification_review_requests) - reviews)::text from w7n_before),
          row(0, 0, 0, 0)::text, 'w7_refused_action_writes_nothing');

select * from finish();
rollback;
