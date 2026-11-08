-- J19 (W7 review polish): certificate history survives a worker-profile delete attempt (account deletion still
-- works); a direct reinstate closes the open review request and nothing is "upheld" against an active certificate;
-- a revoke keeps the review decidable; the worker reads no raw certification rows; a legacy approved shop without a
-- recorded reviewer gets 23514 (never 23502); the applicant read shows whether the issuer is currently verified.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j19c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j19c-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j19c-o2@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j19c-by@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j19c-w' || n || '@local.test'))) from generate_series(1, 6) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j19c-w' || n || '@local.test' $$;
create temporary table j19c_ids (label text primary key, id uuid) on commit drop;
grant all on j19c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j19c_ids where label = p_label $$;
insert into j19c_ids values ('s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)),
  ('s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)),
  ('s_legacy', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid));
insert into j19c_ids values ('c1', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.w(1), 'j19c-o1@local.test')),
  ('c3', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.w(3), 'j19c-o1@local.test')),
  ('c4', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.w(4), 'j19c-o1@local.test')),
  ('c5', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.w(5), 'j19c-o1@local.test')),
  ('e_legacy', test_helpers.complete_training(pg_temp.id('s_legacy'), pg_temp.w(6), 'j19c-o1@local.test')),
  ('job', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s2'), 'J19C opening')));
create function pg_temp.untrusted() returns void language sql as $$
  select test_helpers.act_as_service();
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.kept(p_label text) returns text language sql stable security definer
as $$ select (select count(*) from public.certifications where id = pg_temp.id(p_label)) || '/'
          || (select count(*) from public.certification_status_events where certification_id = pg_temp.id(p_label)) $$;

-- ---------- 1) certificate history survives a worker-profile delete ----------
select test_helpers.act_as_owner('j19c-o1@local.test');
select (public.transition_certification(pg_temp.id('c1'), 'active', 'suspended', 'Suspended while a complaint is checked')).status as c1;
select test_helpers.act_as(pg_temp.w(1));
select throws_ok(format('delete from public.worker_profiles where profile_id = %L', pg_temp.w(1)), '23503',
                 'A worker profile with certifications cannot be deleted. Delete the account instead.',
                 'j19_certified_worker_profile_delete_refused');
select test_helpers.act_as_service();
select is(pg_temp.kept('c1'), '1/2', 'j19_certified_worker_profile_delete_refused');
select is((select count(*)::int from public.worker_profiles where profile_id = pg_temp.w(1)), 1, 'j19_certified_worker_profile_delete_refused');
select throws_ok(format('delete from public.worker_profiles where profile_id = %L', pg_temp.w(1)), '23503',
                 'A worker profile with certifications cannot be deleted. Delete the account instead.',
                 'j19_certified_worker_profile_delete_refused_for_trusted_session');
select test_helpers.act_as(pg_temp.w(2));
select lives_ok(format('delete from public.worker_profiles where profile_id = %L', pg_temp.w(2)), 'j19_uncertified_worker_profile_delete_still_works');
select test_helpers.act_as_service();
select is((select count(*)::int from public.worker_profiles where profile_id = pg_temp.w(2)), 0, 'j19_uncertified_worker_profile_delete_still_works');
select pg_temp.untrusted();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.w(1)), 'j19_certified_worker_account_deletion_still_works');
select test_helpers.act_as_service();
select is(pg_temp.kept('c1'), '0/0', 'j19_certified_worker_account_deletion_still_works');

-- ---------- 2) direct reinstate closes the open review; revoke keeps it decidable ----------
select test_helpers.act_as_owner('j19c-o1@local.test');
select (public.transition_certification(pg_temp.id(l), 'active', 'suspended', 'Suspended while a complaint is checked')).status
from unnest(array['c3', 'c4']) l;
select test_helpers.act_as(pg_temp.w(3));
insert into j19c_ids select 'r3', id from public.request_certification_review(pg_temp.id('c3'), 'I always followed the safe washing steps.');
select test_helpers.act_as(pg_temp.w(4));
insert into j19c_ids select 'r4', id from public.request_certification_review(pg_temp.id('c4'), 'The complaint was about someone else.');
select test_helpers.act_as_owner('j19c-o1@local.test');
select is((public.transition_certification(pg_temp.id('c3'), 'suspended', 'active', 'The complaint was checked and is closed')).status,
          'active', 'j19_direct_reinstate_closes_open_review');
select test_helpers.act_as_service();
select is((select row(status, decision_reason, decider_display_name is not null, decided_at is not null, decided_by = current_setting('fx.o1')::uuid)::text
           from public.certification_review_requests where id = pg_temp.id('r3')),
          row('reinstated', 'The complaint was checked and is closed', true, true, true)::text, 'j19_direct_reinstate_closes_open_review');
select is((select row(event, from_status, to_status, review_request_id = pg_temp.id('r3'))::text from public.certification_status_events
           where certification_id = pg_temp.id('c3') order by id desc limit 1),
          row('reinstated', 'suspended', 'active', true)::text, 'j19_direct_reinstate_closes_open_review');
select is((select count(*)::int from public.certification_review_requests where certification_id = pg_temp.id('c3') and status = 'open'), 0,
          'j19_direct_reinstate_closes_open_review');
select is((select array_agg(category order by category) from public.notifications where recipient_id = pg_temp.w(3) and category like 'certification%'),
          array['certification.issued', 'certification.review_decided', 'certification.suspended'], 'j19_direct_reinstate_closes_open_review');
select test_helpers.act_as_owner('j19c-o1@local.test');
select throws_ok(format('select public.decide_certification_review(%L, %L, %L)', pg_temp.id('r3'), 'uphold', 'Keeping the earlier decision in place'),
                 '23514', 'This review request is no longer open.', 'j19_no_uphold_against_active_certificate');
select test_helpers.act_as_service();
select is((select count(*)::int from public.certification_status_events ev join public.certifications c on c.id = ev.certification_id
           where ev.event = 'review_upheld' and ev.to_status = 'active'), 0, 'j19_no_uphold_against_active_certificate');
select test_helpers.act_as_owner('j19c-o1@local.test');
select is((public.transition_certification(pg_temp.id('c4'), 'suspended', 'revoked', 'The complaint was confirmed by two staff')).status,
          'revoked', 'j19_revoke_keeps_review_decidable');
select test_helpers.act_as_service();
select is((select status from public.certification_review_requests where id = pg_temp.id('r4')), 'open', 'j19_revoke_keeps_review_decidable');
select test_helpers.act_as_owner('j19c-o1@local.test');
select is((public.decide_certification_review(pg_temp.id('r4'), 'uphold', 'The complaint was confirmed by two staff')).status, 'upheld',
          'j19_revoke_keeps_review_decidable');
select test_helpers.act_as_service();
select is((select row(event, from_status, to_status)::text from public.certification_status_events
           where certification_id = pg_temp.id('c4') order by id desc limit 1), row('review_upheld', 'revoked', 'revoked')::text,
          'j19_revoke_keeps_review_decidable');

-- ---------- 3) worker reads only through the read functions; owner raw reads keep working ----------
select test_helpers.act_as(pg_temp.w(5));
select is((select count(*)::int from public.certifications) + (select count(*)::int from public.certification_status_events), 0,
          'j19_worker_reads_no_raw_certification_rows');
select is((select array_agg(certification_id) from public.my_certifications()), array[pg_temp.id('c5')], 'j19_worker_reads_no_raw_certification_rows');
select is((select count(*)::int from public.certification_history(pg_temp.id('c5'))), 1, 'j19_worker_reads_no_raw_certification_rows');
select test_helpers.act_as_owner('j19c-o1@local.test');
select is((select count(*)::int from public.certifications where id = pg_temp.id('c5')), 1, 'j19_issuing_owner_raw_reads_unchanged');

-- ---------- 6) legacy approved shop without a recorded reviewer: 23514 ----------
select test_helpers.act_as_service();
update public.shops set verification_reviewed_by = null where id = pg_temp.id('s_legacy');
select set_config('fx.legacy_issue', format('select public.issue_certification(%L, %L, %L)', pg_temp.id('e_legacy'),
                  public.current_training_assessment_id(pg_temp.id('e_legacy')), 'w7_issuer_v1'), true);
select test_helpers.act_as_owner('j19c-o1@local.test');
select throws_ok(current_setting('fx.legacy_issue'),
                 '23514', 'Only a verified shop can issue certifications.', 'j19_legacy_approved_shop_without_reviewer_is_23514');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.o1'), 'role', 'authenticated')::text, true);
select throws_ok(format('select public.insert_certification((select e from public.training_enrollments e where e.id = %1$L),
                           (select p from public.training_programs p join public.training_enrollments e on e.program_id = p.id where e.id = %1$L),
                           (select a from public.training_assessments a where a.id = public.current_training_assessment_id(%1$L)),
                           null::public.certifications, null::uuid, %2$L::jsonb)', pg_temp.id('e_legacy'), '{}'),
                 '23514', 'Only a verified shop can issue certifications.', 'j19_legacy_approved_shop_without_reviewer_is_23514');

-- ---------- 8) applicant read: issuer currently verified (boolean only) ----------
select test_helpers.act_as(pg_temp.w(5));
insert into j19c_ids select 'app', id from public.create_job_application(pg_temp.id('job'), null, true, 'w5_v1');
select test_helpers.act_as_owner('j19c-o2@local.test');
select is((select array_agg(row(certification_id, issuing_shop_currently_verified)::text) from public.applicant_verified_certifications(pg_temp.id('app'))),
          array[row(pg_temp.id('c5'), true)::text], 'j19_applicant_read_shows_issuer_currently_verified');
select test_helpers.act_as_service();
update public.shops set is_active = false where id = pg_temp.id('s1');
select test_helpers.act_as_owner('j19c-o2@local.test');
select is((select array_agg(row(certification_id, issuing_shop_currently_verified)::text) from public.applicant_verified_certifications(pg_temp.id('app'))),
          array[row(pg_temp.id('c5'), false)::text], 'j19_applicant_read_shows_issuer_currently_verified');

select * from finish();
rollback;
