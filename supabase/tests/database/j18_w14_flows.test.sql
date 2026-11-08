-- J18 (W14): existing flows and retention with the W14 objects in place (W14 PLAN 3.2, 3.3, 3.6; P11, P74). An owner
-- account deletion keeps the moderation case with a null opening; a reporter account deletion removes its reports with an
-- audit row; a platform publish leaves owner template versions and sent contract hashes unchanged; the W4 / W5 lifecycles
-- run unchanged without moderation; bookings, quotes, ratings and the W2b / W3 shop decision path are unchanged. Local
-- Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table j18m_ids (label text primary key, id uuid) on commit drop;
grant all on j18m_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18m_ids where label = p_label $$;
insert into j18m_ids values ('a1', test_helpers.create_super_admin('j18m-a1@local.test'));
insert into j18m_ids values ('cu', test_helpers.create_customer('j18m-cu@local.test'));
insert into j18m_ids select 'o' || n, test_helpers.create_owner('j18m-o' || n || '@local.test') from generate_series(1, 3) n;
insert into j18m_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j18m-w' || n || '@local.test')) from generate_series(1, 3) n;
insert into j18m_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.id('a1')) from generate_series(1, 3) n;
insert into j18m_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test opening one')));
insert into j18m_ids values ('j2', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s2'), 'Local test opening two')));
insert into j18m_ids values ('r1', test_helpers.report_test_job_opening(pg_temp.id('j1'), 'j18m-w1@local.test'));
insert into j18m_ids values ('r2', test_helpers.report_test_job_opening(pg_temp.id('j2'), 'j18m-w1@local.test'));
insert into j18m_ids values ('r3', test_helpers.report_test_job_opening(pg_temp.id('j2'), 'j18m-w2@local.test', 'other', 'A second worker also reports this posting'));
insert into j18m_ids select 'c' || n, (select case_id from public.job_opening_reports where id = pg_temp.id('r' || n)) from generate_series(1, 2) n;
select test_helpers.act_as_admin('j18m-a1@local.test');
select (public.moderate_job_opening(pg_temp.id('c1'), 1, 'pause', 'other', 'Please describe the duties of this opening.', null)).status;
select test_helpers.act_as_service();

-- ---------- owner account deletion keeps the case ----------
delete from auth.users where id = pg_temp.id('o1');
select is((select status || ',' || (job_opening_id is null)::text || ',' || (shop_id is null)::text || ',' || (owner_id is null)::text || ',' || opening_title_snapshot
           from public.job_opening_moderation_cases where id = pg_temp.id('c1')), 'paused_by_washlink,true,true,true,Local test opening one',
          'j18_w14_owner_account_deletion_keeps_case_with_null_opening');
select is((select count(*)::int from public.job_opening_moderation_actions where case_id = pg_temp.id('c1')) || ','
          || (select status || ',' || (job_opening_id is null)::text from public.job_opening_reports where id = pg_temp.id('r1')), '1,closed,true',
          'j18_w14_owner_account_deletion_keeps_case_with_null_opening');
select test_helpers.act_as_admin('j18m-a1@local.test');
select is((select opening_present::text || ',' || coalesce(opening_status, '-') from public.admin_job_opening_moderation_queue('active') where case_id = pg_temp.id('c1')),
          'false,-', 'j18_w14_owner_account_deletion_keeps_case_with_null_opening');
select is((select status from public.moderate_job_opening(pg_temp.id('c1'), 2, 'dismiss', null, null, 'The owner account and the posting are gone now.')),
          'dismissed', 'j18_w14_owner_account_deletion_keeps_case_with_null_opening');

-- ---------- reporter account deletion ----------
select test_helpers.act_as_service();
delete from auth.users where id = pg_temp.id('w1');
select is((select count(*)::int from public.job_opening_reports where reporter_id = pg_temp.id('w1')) || ','
          || (select count(*) from public.job_opening_reports where case_id = pg_temp.id('c2')), '0,1', 'j18_w14_worker_deletion_cascades_reports_and_audits');
select is((select string_agg(payload ->> 'changed_by', ',') from public.workforce_audit_events
           where action = 'job_opening_report.deleted' and subject_profile_id = pg_temp.id('w1')), 'worker_profile_deleted,worker_profile_deleted',
          'j18_w14_worker_deletion_cascades_reports_and_audits');
select is((select status from public.job_opening_moderation_cases where id = pg_temp.id('c2')), 'open', 'j18_w14_worker_deletion_cascades_reports_and_audits');

-- ---------- platform publish leaves owner versions and sent contracts unchanged ----------
insert into j18m_ids values ('t3', test_helpers.create_test_contract_template('j18m-o3@local.test', 'Owner three template'));
insert into j18m_ids values ('k3', test_helpers.create_accepted_test_contract('j18m-o3@local.test', pg_temp.id('s3'), pg_temp.id('w3'), 'j18m-w3@local.test'));
create temporary table j18m_before on commit drop as
  select v.id, v.content_hash from public.contract_template_versions v where v.template_id = pg_temp.id('t3')
  union all select v.id, v.content_hash from public.contract_versions v where v.contract_id = pg_temp.id('k3') and v.rendered_text is not null;
grant all on j18m_before to public;
insert into j18m_ids values ('p1', test_helpers.latest_platform_contract_version());
select test_helpers.act_as_admin('j18m-a1@local.test');
select (public.publish_platform_contract_template_version(
  (select current_version_number from public.contract_templates where scope = 'platform'),
  (select jsonb_agg(jsonb_build_object('section_number', c.section_number, 'clause_key', c.clause_key, 'kind', c.kind, 'heading', c.heading,
                                       'requires_owner_input', c.requires_owner_input,
                                       'body', case when c.clause_key = 'attachments_list' then '[Shop: list each attachment by its title, or write "None".]'
                                                    else c.body end) order by c.section_number, c.position)
   from public.contract_template_version_clauses(pg_temp.id('p1')) c))).id is not null as published;
select test_helpers.act_as_service();
select isnt(test_helpers.latest_platform_contract_version(), pg_temp.id('p1'), 'j18_w14_platform_publish_leaves_owner_versions_and_contract_hashes_unchanged');
select is((select count(*)::int from j18m_before b where b.content_hash is not distinct from coalesce(
             (select v.content_hash from public.contract_template_versions v where v.id = b.id), (select v.content_hash from public.contract_versions v where v.id = b.id)))
          || ',' || (select count(*) from j18m_before), (select count(*) from j18m_before) || ',' || (select count(*) from j18m_before),
          'j18_w14_platform_publish_leaves_owner_versions_and_contract_hashes_unchanged');

-- ---------- W4 / W5 lifecycles without moderation ----------
select test_helpers.act_as_owner('j18m-o3@local.test');
insert into j18m_ids select 'j3', id from public.job_openings where shop_id = pg_temp.id('s3') and status = 'published' limit 1;
insert into public.job_openings (shop_id, owner_id, title, description, work_location, openings_count, job_type, applicant_requirement)
values (pg_temp.id('s3'), pg_temp.id('o3'), 'Local test lifecycle', 'Lifecycle description', 'Local test location', 1, 'part_time', 'trainees_welcome');
insert into j18m_ids select 'j4', id from public.job_openings where title = 'Local test lifecycle';
select is((select string_agg(x, ',') from (
             select (public.transition_job_opening(pg_temp.id('j4'), 'draft', 'published')).status as x
             union all select (public.transition_job_opening(pg_temp.id('j4'), 'published', 'paused')).status
             union all select (public.transition_job_opening(pg_temp.id('j4'), 'paused', 'published')).status) s), 'published,paused,published',
          'j18_w14_w4_w5_lifecycles_unchanged_without_moderation');
select test_helpers.act_as_service();
insert into j18m_ids values ('p4', test_helpers.create_job_application(pg_temp.id('j4'), pg_temp.id('w2')));
select test_helpers.act_as_owner('j18m-o3@local.test');
update public.job_openings set benefits = 'Free lunch' where id = pg_temp.id('j4');
select is((public.transition_job_opening(pg_temp.id('j4'), 'published', 'closed')).status || ',' || (public.transition_job_opening(pg_temp.id('j4'), 'closed', 'archived')).status,
          'closed,archived', 'j18_w14_w4_w5_lifecycles_unchanged_without_moderation');
select test_helpers.act_as_service();
select is((select status from public.job_applications where id = pg_temp.id('p4')) || ',' || (select benefits from public.job_openings where id = pg_temp.id('j4'))
          || ',' || (select count(*) from public.job_opening_moderation_cases where job_opening_id = pg_temp.id('j4')), 'closed,Free lunch,0',
          'j18_w14_w4_w5_lifecycles_unchanged_without_moderation');
select test_helpers.act_as_owner('j18m-o3@local.test');
select throws_ok(format($$ update public.job_openings set status = 'published' where id = %L $$, pg_temp.id('j4')), '42501',
                 'This job opening status change is not allowed.', 'j18_w14_w4_w5_lifecycles_unchanged_without_moderation');

-- ---------- bookings, quotes, ratings and shop decisions ----------
select test_helpers.act_as_service();
insert into j18m_ids values ('b1', test_helpers.create_booking_fixture(pg_temp.id('cu'), pg_temp.id('s3')));
select is((select quoted_price::text from public.bookings where id = pg_temp.id('b1')), '250.00', 'j18_w14_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_admin('j18m-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Please upload a clearer permit photo here' where id = pg_temp.id('s2');
select test_helpers.act_as_service();
select is((select verification_status || ',' || (verification_reviewed_by = pg_temp.id('a1'))::text from public.shops where id = pg_temp.id('s2')) || ','
          || (select string_agg(action, ',' order by action) from public.workforce_audit_events where subject_id = pg_temp.id('s2') and action like 'shop.%'),
          'changes_requested,true,shop.verification_decided', 'j18_w14_booking_quote_rating_and_verification_unchanged');

select * from finish();
rollback;
