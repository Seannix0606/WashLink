-- J17 / spec I (W12): no private text in any notification (W12 PLAN P82). The marker test_helpers.notification_marker()
-- goes into the worker and owner full names, a cover note, training notes, suspension / revocation reasons, review and
-- dispute statements, review decision reasons, contract clause text and pay, a decline note, a termination reason, a
-- report statement, the WashLink owner message and admin note and a dispute closing note; every event then runs through
-- its REAL RPC. No notification contains the marker, an '@' or a phone-shaped run; dynamic labels come only from the
-- allow-list (shop name, opening title, program title; all carry W12LABEL here); the table has no payload column; a
-- recipient reads only own notifications. Local Docker stack only; backdating a shop request is a TEST-ONLY time shift.
-- Fix cycle 1 (S1 / C5 / C4): the scheduler-written notices are swept too. k7 (marker clauses and pay, parties with
-- marker names) gets an amendment proposal ("Contract change proposed") and is backdated past its end date; c3 / c4
-- (marker-named workers, W12LABEL program) expire within 30 days / have expired; then run_workforce_scheduled_job runs
-- the notices and contract expiry jobs (job flag cleared between calls, as D13) before the sweep. Every assertion has its
-- own name. Producers this file does NOT trigger, and the earlier file that asserts their fixed notice text:
--   shop_verification.status_changed, roster.linked / .unlinked: j17_w3_idempotency_and_leaks (leak scan over every W3
--     producer), j17_w3_notifications; shop_verification.rereviewed: j3_w14_unreviewed_approved_shops;
--   job_application.withdrawn / .removed: j5_application_audit_and_notifications; job_application.closed:
--     j17_w5_fix1_closed_drafts_and_current_owner;
--   training.schedule_changed / .trainer_role / .invited / .response / .cancelled: j6_w6_training_audit_and_notifications;
--   certification.renewed / .reinstated / .training_record_changed: j6_w7_certification_audit_and_notifications;
--   job_opening_moderation.closed / .pause_kept / .lifted: j17_w14_moderation_audit_and_notifications;
--   worker_contract titles not triggered here (offer withdrawn, started, party removed, change accepted / declined /
--     withdrawn; every w9j body is fixed copy plus the shop label): j9_w9_worker_contract_audit (W3 text safety checks
--     on every notice of its fixtures).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------- fixtures ----------
create temporary table j17p_ids (label text primary key, id uuid) on commit drop;
grant all on j17p_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17p_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j17p-' || p_label || '@local.test' $$;
create function pg_temp.m(p_text text) returns text language sql immutable as $$ select test_helpers.notification_marker() || ' ' || p_text $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.run(p_job text) returns jsonb language plpgsql as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('washlink.scheduled_job', '', true);   -- TEST-ONLY: a new transaction for each scheduled run (as D13)
  return public.run_workforce_scheduled_job(p_job);
end $$;
insert into j17p_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j17p_ids values ('o1', test_helpers.create_user(pg_temp.email('o1'), 'owner', pg_temp.m('Owner Fullname')));
insert into j17p_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_user(pg_temp.email('w' || n), 'worker', pg_temp.m('Worker Fullname')))
from generate_series(1, 8) n;
insert into j17p_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
update public.shops set name = 'W12LABEL Shop' where id = pg_temp.id('s1');
update public.profiles set phone_number = '0917 555 0212' where id = pg_temp.id('o1');

-- Certificates (w1 suspended -> shop review uphold -> WashLink review uphold; w2 revoked) with a W12LABEL program.
insert into j17p_ids select 'c' || n, test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('w' || n), pg_temp.email('o1')) from generate_series(1, 2) n;
alter table public.certifications disable trigger certifications_guard_write;   -- TEST-ONLY label rename (snapshot), rolled back
update public.certifications set program_title_snapshot = 'W12LABEL Program' where id in (pg_temp.id('c1'), pg_temp.id('c2'));
alter table public.certifications enable trigger certifications_guard_write;
select test_helpers.suspend_test_certification(pg_temp.id('c1'), pg_temp.email('o1'), pg_temp.m('suspension reason text'));
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.transition_certification(pg_temp.id('c2'), 'active', 'revoked', pg_temp.m('revocation reason text'))).status;
select test_helpers.act_as_service();
insert into j17p_ids values ('r1', test_helpers.request_test_shop_review(pg_temp.id('c1'), pg_temp.email('w1'), pg_temp.m('shop review statement')));
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.decide_certification_review(pg_temp.id('r1'), 'uphold', pg_temp.m('review decision reason'))).status;
select test_helpers.act_as_worker(pg_temp.email('w1'));
insert into j17p_ids values ('rv1', (public.open_certification_platform_review(pg_temp.id('c1'), 'suspended', pg_temp.m('platform review statement'))).id);
select test_helpers.act_as_admin(pg_temp.email('a1'));
select (public.decide_certification_platform_review(pg_temp.id('rv1'), 1, 'uphold', pg_temp.m('platform decision reason'))).status;
-- Training notes: an attendance correction of w1's completed training (notifies the worker and the issuing owner).
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.correct_training_attendance((select r.id from public.training_attendance_records r join public.certifications c on c.enrollment_id = r.enrollment_id
                                            where c.id = pg_temp.id('c1') order by r.id limit 1),
                                           'present', pg_temp.m('progress note text'), pg_temp.m('correction reason text'))).attendance_status;
select test_helpers.act_as_service();

-- Applications: a cover note through the real RPC; an opening with a W12LABEL title.
insert into j17p_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'W12LABEL Opening')));
select test_helpers.act_as_worker(pg_temp.email('w3'));
insert into j17p_ids values ('ap3', (public.create_job_application(pg_temp.id('j1'), pg_temp.m('cover note text'), true, 'w5_v1')).id);
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.transition_job_application(pg_temp.id('ap3'), 'submitted', 'under_review')).status;
select test_helpers.act_as_service();

-- Contracts: clause text and pay (k4 terminated by the owner with a reason; dispute with statement and closing note),
-- a declined offer with a note (k5).
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w4')) is not null as w4_applied;
insert into j17p_ids values ('k4', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w4')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k4'), pg_temp.email('o1'), jsonb_build_object('schedule', pg_temp.m('clause text body here')),
                                             null, jsonb_build_object('pay_details', pg_temp.m('pay of 900 per day')));
select test_helpers.send_test_contract(pg_temp.id('k4'), pg_temp.email('o1'));
select test_helpers.accept_test_contract(pg_temp.id('k4'), pg_temp.email('w4'));
insert into j17p_ids values ('d4', test_helpers.raise_test_contract_dispute(pg_temp.id('k4'), pg_temp.email('w4'), 'other', pg_temp.m('dispute statement text')));
select test_helpers.act_as_admin(pg_temp.email('a1'));
select (public.close_contract_dispute(pg_temp.id('d4'), 1, 'information_shared', pg_temp.m('dispute closing note text'))).status;
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.terminate_worker_contract(pg_temp.id('k4'), pg_temp.rev('k4'), pg_temp.m('termination reason text'))).status;
select test_helpers.act_as_service();
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w5')) is not null as w5_applied;
insert into j17p_ids values ('k5', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w5')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k5'), pg_temp.email('o1'));
insert into j17p_ids values ('k5v1', test_helpers.send_test_contract(pg_temp.id('k5'), pg_temp.email('o1')));
select test_helpers.act_as_worker(pg_temp.email('w5'));
select (public.decline_worker_contract_version(pg_temp.id('k5'), pg_temp.id('k5v1'), pg_temp.m('decline note text'))).status;
select test_helpers.act_as_service();

-- Amendment and scheduled contract expiry (S1 / C5): k7 has marker clauses and pay, an end date of today and parties
-- with marker names; after acceptance the owner proposes an amendment with marker clause text (notice to the worker),
-- then the contract is backdated past its end date for the scheduled expiry job below.
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w7')) is not null as w7_applied;
insert into j17p_ids values ('k7', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w7')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k7'), pg_temp.email('o1'), jsonb_build_object('schedule', pg_temp.m('expiring clause text body')),
                                             null, jsonb_build_object('pay_details', pg_temp.m('pay of 900 per day')));
create function pg_temp.set_k7_end_today() returns void language plpgsql as $$
declare
  v public.contract_versions;
begin
  select * into strict v from public.contract_versions x where x.contract_id = pg_temp.id('k7') and x.state = 'draft';
  perform test_helpers.act_as_owner(pg_temp.email('o1'));
  perform public.save_worker_contract_draft(v.contract_id, v.draft_revision, v.classification_key, v.start_date, test_helpers.manila_today(),
                                            v.owner_values, v.editable_bodies, v.shop_terms);
  perform test_helpers.act_as_service();
end $$;
select pg_temp.set_k7_end_today();
select test_helpers.send_test_contract(pg_temp.id('k7'), pg_temp.email('o1'));
select test_helpers.accept_test_contract(pg_temp.id('k7'), pg_temp.email('w7'));
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.create_worker_contract_amendment(pg_temp.id('k7'), pg_temp.rev('k7'))).kind;
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('k7'), pg_temp.email('o1'), jsonb_build_object('schedule', pg_temp.m('amended clause text body')),
                                             null, jsonb_build_object('pay_details', pg_temp.m('pay of 900 per day amended')));
select test_helpers.send_test_contract(pg_temp.id('k7'), pg_temp.email('o1'));
select test_helpers.backdate_test_worker_contract(pg_temp.id('k7'), 3);

-- Scheduled certificate notices (S1 / C5): a 1-month W12LABEL shop; c3 (w7) expires within 30 days, c4 (w8) has expired.
insert into j17p_ids values ('s2', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
update public.shops set name = 'W12LABEL Shop' where id = pg_temp.id('s2');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.set_shop_certification_validity(pg_temp.id('s2'), 1)).validity_months as s2_validity;
select test_helpers.act_as_service();
insert into j17p_ids select 'c' || n, test_helpers.issue_test_certification(pg_temp.id('s2'), pg_temp.id('w' || (n + 4)), pg_temp.email('o1'))
from generate_series(3, 4) n;
alter table public.certifications disable trigger certifications_guard_write;   -- TEST-ONLY label rename (snapshot), rolled back
update public.certifications set program_title_snapshot = 'W12LABEL Program' where id in (pg_temp.id('c3'), pg_temp.id('c4'));
alter table public.certifications enable trigger certifications_guard_write;
select test_helpers.backdate_certification(pg_temp.id('c3'), 5) is not null and test_helpers.backdate_certification(pg_temp.id('c4'), 40) is not null as shifted;

-- Moderation: a report statement, the owner message and the admin note.
insert into j17p_ids values ('rp', test_helpers.report_test_job_opening(pg_temp.id('j1'), pg_temp.email('w6'), 'other', pg_temp.m('report statement text')));
insert into j17p_ids select 'case', case_id from public.job_opening_reports where id = pg_temp.id('rp');
select test_helpers.act_as_admin(pg_temp.email('a1'));
select (public.moderate_job_opening(pg_temp.id('case'), 1, 'pause', 'other', pg_temp.m('owner message text'), pg_temp.m('admin note text'))).status;
select test_helpers.act_as_service();

-- The scheduler-written notices, through the single scheduled entry point as pg_cron would call it (flag cleared
-- between and after the runs, as in D13).
select is(array[(pg_temp.run('certification_expiry_notices') ->> 'processed')::int, (pg_temp.run('worker_contract_expiry') ->> 'processed')::int],
          array[2, 1], 'w12_privacy_fixture_scheduled_jobs_wrote_notices');
select set_config('washlink.scheduled_job', '', true);

create temporary table j17p_notes on commit drop as
  select n.* from public.notifications n where n.recipient_id in (select id from j17p_ids);
grant all on j17p_notes to public;
select is((select count(distinct category)::int >= 16 and count(*) >= 26
                  and count(*) filter (where category = 'certification.expiring') = 1 and count(*) filter (where category = 'certification.expired') = 1
                  and count(*) filter (where category = 'worker_contract' and title = 'Contract change proposed') = 1
                  and count(*) filter (where category = 'worker_contract' and title = 'Contract expired') = 2
           from j17p_notes), true, 'w12_privacy_fixture_covers_categories');

-- ---------- privacy sweeps ----------
select is((select count(*)::int from j17p_notes n
           where concat_ws(' ', n.title, n.body, n.category, n.subject_type, n.idempotency_key) ilike '%' || test_helpers.notification_marker() || '%'),
          0, 'w12_no_notification_contains_marker');
select is((select count(*)::int from j17p_notes n
           where concat_ws(' ', n.title, n.body) ~* '(fullname|cover note|progress note|reason text|statement|clause text|pay of|decline note|message text|note text|900)'),
          0, 'w12_no_notification_contains_private_field_words');
select is((select count(*)::int from j17p_notes n
           where strpos(n.title || n.body, '@') > 0 or not public.notification_text_is_safe(n.title) or not public.notification_text_is_safe(n.body)
              or (n.title || ' ' || n.body) ~ '0917|555 0212'), 0, 'w12_no_notification_has_at_sign_or_phone_shape');
-- Labels: every capitalised token run in a notice is fixed copy or a W12LABEL allow-listed label (no names or free text).
select is((select count(*)::int from j17p_notes n where regexp_replace(n.title || ' ' || n.body, 'W12LABEL (Shop|Opening|Program)', '', 'g') ~ '[A-Z0-9]{5,}'),
          0, 'w12_labels_only_from_allow_list');
select is((select count(*) filter (where n.body like '%W12LABEL Shop%') > 0 and count(*) filter (where n.body like '%W12LABEL Opening%') > 0
                  and count(*) filter (where n.body like '%W12LABEL Program%') > 0 from j17p_notes n), true, 'w12_allow_list_labels_present_in_notices');
select is((select array_agg(c.column_name::text order by c.ordinal_position) from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = 'notifications'),
          array['id', 'recipient_id', 'category', 'title', 'body', 'subject_type', 'subject_id', 'idempotency_key', 'created_at', 'read_at'],
          'w12_notification_columns_are_the_fixed_list');
select is((select count(*)::int from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'notifications'
           and c.data_type in ('json', 'jsonb', 'bytea')), 0, 'w12_notification_columns_have_no_json_or_binary_type');

-- ---------- a recipient reads only own notifications ----------
create function pg_temp.reads(p_email text, p_role text) returns text language plpgsql as $$
declare
  result text;
begin
  perform test_helpers.act_as_role(p_email, p_role);
  select count(*) filter (where n.recipient_id <> auth.uid()) || ',' || (count(*) = (select count(*) from j17p_notes x where x.recipient_id = auth.uid()))
  into result from public.notifications n;
  perform test_helpers.act_as_service();
  return result;
end $$;
select is(array[pg_temp.reads(pg_temp.email('o1'), 'owner'), pg_temp.reads(pg_temp.email('w1'), 'worker'), pg_temp.reads(pg_temp.email('w4'), 'worker'),
                pg_temp.reads(pg_temp.email('a1'), 'super_admin')],
          array['0,true', '0,true', '0,true', '0,true'], 'w12_recipient_reads_only_own_notifications');
select is(pg_temp.reads(pg_temp.email('w7'), 'worker') || '|' || pg_temp.reads(pg_temp.email('w8'), 'worker'), '0,true|0,true',
          'w12_recipients_of_scheduled_notices_read_only_own');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.notifications'), '42501', 'w12_anon_cannot_read_notifications');
select test_helpers.act_as_service();

select * from finish();
rollback;
