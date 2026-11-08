-- J17 / spec I (W12): no duplicate notices within or across events (W12 PLAN P81, D-66). Per-event keys end with the
-- audit event id (at most one notice per recipient and event); cross-event pairs send one notice each: a WashLink or
-- owner review reinstatement sends the review decision only (no extra certification.reinstated); a termination or a
-- scheduled expiry with an open amendment sends one notice per party (no "withdrawn"); a WashLink close sends the owner
-- one notice and each applicant only the W5 job_application.closed; a relationship change notifies nobody; a superseded
-- certificate gets no expiry notice; due then expired once each; repeated scheduler runs create nothing; a notice marked
-- read is never sent again. The scheduler is called as pg_cron would (trusted session); between two runs the test clears
-- the per-transaction job flag (TEST-ONLY: pgTAP runs in one transaction). Local Docker stack only; backdating is a
-- TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---------- fixtures ----------
create temporary table j17d_ids (label text primary key, id uuid) on commit drop;
grant all on j17d_ids to public;
create temporary table j17d_seen (id uuid) on commit drop;
grant all on j17d_seen to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17d_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j17d-' || p_label || '@local.test' $$;
create function pg_temp.notes() returns integer language sql stable security definer as $$ select count(*)::int from public.notifications $$;
create function pg_temp.run(p_job text) returns jsonb language plpgsql as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('washlink.scheduled_job', '', true);   -- TEST-ONLY: a new transaction for each scheduled run
  return public.run_workforce_scheduled_job(p_job);
end $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.amend(p_label text) returns uuid language plpgsql as $$
begin
  perform test_helpers.act_as_owner(pg_temp.email('o1'));
  perform public.create_worker_contract_amendment(pg_temp.id(p_label), pg_temp.rev(p_label));
  perform test_helpers.act_as_service();
  perform test_helpers.fill_test_contract_draft(pg_temp.id(p_label), pg_temp.email('o1'), '{"schedule": "Weekends only for the season."}');
  return test_helpers.send_test_contract(pg_temp.id(p_label), pg_temp.email('o1'));
end $$;
-- New notices (after fx.mark) of one recipient: 'category' list in order.
create function pg_temp.new_for(p_label text) returns text language sql stable security definer as $$
  select coalesce(string_agg(n.category, ',' order by n.created_at, n.category), '-') from public.notifications n
  where n.recipient_id = pg_temp.id(p_label) and n.id not in (select x.id from j17d_seen x) $$;
create function pg_temp.mark() returns integer language sql security definer as $$
  insert into j17d_seen select n.id from public.notifications n where n.id not in (select x.id from j17d_seen x) returning 1 $$;

insert into j17d_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j17d_ids values ('o1', test_helpers.create_owner(pg_temp.email('o1')));
insert into j17d_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('w' || n))) from generate_series(1, 10) n;
insert into j17d_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
  ('s2', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.set_shop_certification_validity(pg_temp.id('s2'), 1)).validity_months as s2_validity;
select test_helpers.act_as_service();
insert into j17d_ids select 'c' || n, test_helpers.issue_test_certification(pg_temp.id(case when n <= 2 then 's1' else 's2' end), pg_temp.id('w' || n),
                                                                            pg_temp.email('o1')) from generate_series(1, 4) n;
insert into j17d_ids values ('k1', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w5'), pg_temp.email('w5'))),
  ('k2', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w6'), pg_temp.email('w6'), test_helpers.manila_today())),
  ('k3', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w7'), pg_temp.email('w7'), test_helpers.manila_today()));
insert into j17d_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'W12D washer opening')));
select count(test_helpers.create_job_application(pg_temp.id('j1'), pg_temp.id('w' || n))) as applied from generate_series(8, 9) n;
insert into j17d_ids values ('rp', test_helpers.report_test_job_opening(pg_temp.id('j1'), pg_temp.email('w10'), 'worker_fee_or_deposit'));
select set_config('fx.first_event', (select coalesce(max(id), 0)::text from public.workforce_audit_events), true);
select pg_temp.mark() is not null as marked;

-- ---------- WashLink reinstatement (c1) and owner review reinstatement (c2) ----------
select count(test_helpers.suspend_test_certification(pg_temp.id('c' || n), pg_temp.email('o1'))) from generate_series(1, 2) n;
insert into j17d_ids select 'r' || n, test_helpers.request_test_shop_review(pg_temp.id('c' || n), pg_temp.email('w' || n)) from generate_series(1, 2) n;
select test_helpers.backdate_shop_review_request(pg_temp.id('r1'), 15) is not null as overdue;
select pg_temp.mark() is not null as marked;
select test_helpers.act_as_worker(pg_temp.email('w1'));
insert into j17d_ids values ('rv1', (public.open_certification_platform_review(pg_temp.id('c1'), 'suspended', 'Please look at this decision again')).id);
select test_helpers.act_as_service();
select pg_temp.mark() is not null as marked;
select test_helpers.act_as_admin(pg_temp.email('a1'));
select (public.decide_certification_platform_review(pg_temp.id('rv1'), 1, 'reinstate', 'The shop decision was not supported by evidence')).status;
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.decide_certification_review(pg_temp.id('r2'), 'reinstate', 'We checked again and the complaint was not confirmed')).status;
select test_helpers.act_as_service();
select is((select status from public.certifications where id = pg_temp.id('c1')) || ':' || pg_temp.new_for('w1') || '|' || pg_temp.new_for('o1') like
          'active:certification_platform_review.decided|%', true, 'w12_washlink_reinstate_sends_review_decided_only');
select is((select count(*)::int from public.notifications n where n.subject_id = pg_temp.id('c1') and n.id not in (select id from j17d_seen)
           and n.category <> 'certification_platform_review.decided'), 0, 'w12_washlink_reinstate_sends_review_decided_only');
select is((select status from public.certifications where id = pg_temp.id('c2')) || ':' || pg_temp.new_for('w2'), 'active:certification.review_decided',
          'w12_owner_review_reinstate_sends_review_decided_only');
select is((select count(*)::int from public.notifications n where n.category = 'certification.reinstated' and n.id not in (select id from j17d_seen)), 0,
          'w12_owner_review_reinstate_sends_review_decided_only');

-- ---------- termination with an open amendment (k1) ----------
select pg_temp.amend('k1') is not null as k1_amendment_sent;
select pg_temp.mark() is not null as marked;
select test_helpers.act_as_worker(pg_temp.email('w5'));
select (public.terminate_worker_contract(pg_temp.id('k1'), pg_temp.rev('k1'), 'I am moving to another city soon.')).status;
select test_helpers.act_as_service();
select is(pg_temp.new_for('w5') || '|' || (select count(*) from public.notifications n where n.recipient_id = pg_temp.id('o1') and n.subject_id = pg_temp.id('k1')
                                           and n.id not in (select id from j17d_seen)),
          '-|1', 'w12_termination_with_open_amendment_one_notice_per_party');
select is((select count(*)::int from public.notifications n where n.subject_id = pg_temp.id('k1') and n.id not in (select id from j17d_seen)
           and split_part(n.idempotency_key, ':', 3)::bigint
               = (select max(e.id) from public.workforce_audit_events e where e.subject_id = pg_temp.id('k1') and e.action = 'worker_contract.terminated')),
          1, 'w12_termination_with_open_amendment_one_notice_per_party');

-- ---------- scheduled expiry with an open amendment (k2) ----------
select pg_temp.amend('k2') is not null as k2_amendment_sent;
select test_helpers.backdate_test_worker_contract(pg_temp.id('k2'), 1);
select pg_temp.mark() is not null as marked;
select is((pg_temp.run('worker_contract_expiry') ->> 'processed')::int, 1, 'w12_scheduled_expiry_with_open_amendment_one_notice_per_party');
select is((select status from public.worker_contracts where id = pg_temp.id('k2')) || ':' || pg_temp.new_for('w6') || '|'
          || (select count(*) from public.notifications n where n.recipient_id = pg_temp.id('o1') and n.subject_id = pg_temp.id('k2')
              and n.id not in (select id from j17d_seen)) || '|'
          || (select count(*) from public.contract_versions v where v.contract_id = pg_temp.id('k2') and v.state = 'withdrawn'),
          'expired:worker_contract|1|1', 'w12_scheduled_expiry_with_open_amendment_one_notice_per_party');

-- ---------- WashLink close (j1): owner one, each applicant one, reporter one ----------
select pg_temp.mark() is not null as marked;
insert into j17d_ids select 'case', case_id from public.job_opening_reports where id = pg_temp.id('rp');
select test_helpers.act_as_admin(pg_temp.email('a1'));
select (public.moderate_job_opening(pg_temp.id('case'), 1, 'close', 'worker_fee_or_deposit',
                                    'Workers must never pay a deposit for this job.', null)).status;
select test_helpers.act_as_service();
select is(pg_temp.new_for('o1') || '|' || pg_temp.new_for('w8') || '|' || pg_temp.new_for('w9') || '|' || pg_temp.new_for('w10'),
          'job_opening_moderation.closed|job_application.closed|job_application.closed|job_opening_report.closed',
          'w12_washlink_close_owner_one_applicants_one_each');

-- ---------- a relationship change notifies nobody (k3) ----------
select test_helpers.backdate_test_worker_contract(pg_temp.id('k3'), 1);
select pg_temp.mark() is not null as marked;
select is(test_helpers.relationship_row(pg_temp.id('w7'), pg_temp.id('o1')), 'active,contract_active,1', 'w12_relationship_change_sends_no_extra_notice');
select cmp_ok((pg_temp.run('owner_relationship_refresh') ->> 'changed')::int, '>=', 1, 'w12_relationship_change_sends_no_extra_notice');
select is(test_helpers.relationship_row(pg_temp.id('w7'), pg_temp.id('o1')) || '|' || (select count(*) from public.notifications where id not in (select id from j17d_seen)),
          'ended,contract_expired,0|0', 'w12_relationship_change_sends_no_extra_notice');

-- ---------- certificates: superseded (c3) gets nothing; due then expired once each (c4) ----------
select test_helpers.act_as_owner(pg_temp.email('o1'));
insert into j17d_ids select 'ra3', id from public.record_certification_reassessment(pg_temp.id('c3'), array[true, true], 'passed');
insert into j17d_ids select 'c3n', id from public.renew_certification(pg_temp.id('c3'), pg_temp.id('ra3'), 'w7_issuer_v1');
select test_helpers.act_as_service();
select test_helpers.backdate_certification(pg_temp.id('c3'), 20) is not null as c3_old_within_30_days;
select test_helpers.backdate_certification(pg_temp.id('c4'), 5) is not null as c4_due;
select pg_temp.mark() is not null as marked;
select pg_temp.run('certification_expiry_notices') ->> 'outcome';
select is((select string_agg(split_part(n.idempotency_key, ':', 3), ',') from public.notifications n where n.subject_id = pg_temp.id('c4')
           and n.category like 'certification.expir%') || '|'
          || (select count(*) from public.notifications n where n.idempotency_key like 'certification_expiry:' || pg_temp.id('c3') || ':%'),
          'due|0', 'w12_superseded_certificate_gets_no_expiry_notice');
select test_helpers.backdate_certification(pg_temp.id('c4'), 40) is not null as c4_expired;
select pg_temp.run('certification_expiry_notices') ->> 'outcome';
select pg_temp.run('certification_expiry_notices') ->> 'outcome';
select is((select string_agg(n.category || ':' || split_part(n.idempotency_key, ':', 3), ',' order by n.created_at, n.idempotency_key)
           from public.notifications n where n.subject_id = pg_temp.id('c4') and n.category like 'certification.expir%'),
          'certification.expiring:due,certification.expired:expired', 'w12_expiry_due_then_expired_once_each');
select is((select count(*)::int from public.notifications n where n.idempotency_key like 'certification_expiry:' || pg_temp.id('c3') || ':%'), 0,
          'w12_superseded_certificate_gets_no_expiry_notice');

-- ---------- repeated runs create nothing; a read notice is never sent again ----------
select pg_temp.run('worker_contract_expiry') ->> 'processed' as k3_recorded_expired;
select set_config('fx.notes_before', pg_temp.notes()::text, true);
select is(array[pg_temp.run('certification_expiry_notices') ->> 'processed', pg_temp.run('worker_contract_expiry') ->> 'processed',
                pg_temp.run('owner_relationship_refresh') ->> 'changed', pg_temp.run('worker_contract_expiry') ->> 'remaining'],
          array['0', '0', '0', '0'], 'w12_repeated_runs_create_nothing_new');
select is(pg_temp.notes(), current_setting('fx.notes_before')::int, 'w12_repeated_runs_create_nothing_new');
select test_helpers.act_as_worker(pg_temp.email('w4'));
select cmp_ok(public.mark_notifications_read(), '>=', 2, 'w12_mark_read_never_resends');
select test_helpers.act_as_service();
select pg_temp.run('certification_expiry_notices') ->> 'outcome';
select is((select count(*)::int || ',' || count(*) filter (where read_at is null) from public.notifications where recipient_id = pg_temp.id('w4')
           and category like 'certification.expir%') || '|' || (pg_temp.notes() - current_setting('fx.notes_before')::int),
          '2,0|0', 'w12_mark_read_never_resends');

-- ---------- at most one notice per recipient and audit event (every per-event key in this file) ----------
create temporary table j17d_notes on commit drop as
  select n.* from public.notifications n where n.recipient_id in (select id from j17d_ids) and n.idempotency_key ~ ':[0-9]+$';
select cmp_ok((select count(*)::int from j17d_notes), '>=', 10, 'w12_at_most_one_notice_per_recipient_per_audit_event');
select is((select count(*)::int from (select recipient_id, substring(idempotency_key from ':([0-9]+)$') from j17d_notes group by 1, 2 having count(*) > 1) d)
          + (select count(*)::int from j17d_notes n where not exists (select 1 from public.workforce_audit_events e
                                                                       where e.id = substring(n.idempotency_key from ':([0-9]+)$')::bigint)),
          0, 'w12_at_most_one_notice_per_recipient_per_audit_event');

select * from finish();
rollback;
