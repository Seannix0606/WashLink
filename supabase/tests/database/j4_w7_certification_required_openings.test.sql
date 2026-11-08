-- J4 / D-20 (W7, decides D-12): certification_required openings refuse create and draft -> submit unless the
-- worker holds a CURRENT shop-issued certification from any shop; trainees_welcome openings are unaffected;
-- existing applications are untouched; applicant_verified_certifications returns current certificates only with
-- the W5 authorisation; every W5 apply check keeps its order and message. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j4c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j4c-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j4c-o2@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j4c-w' || n || '@local.test'))) from generate_series(1, 8) n;
select set_config('fx.w9', test_helpers.create_worker('j4c-w9@local.test')::text, true);   -- no worker profile
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j4c-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j4c_ids (label text primary key, id uuid) on commit drop;
grant all on j4c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j4c_ids where label = p_label $$;
insert into j4c_ids select l, test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J4C ' || l)
from unnest(array['cr', 'tw', 'cr_past', 'cr_paused']) l;
update public.job_openings set applicant_requirement = 'certification_required'
where id in (pg_temp.id('cr'), pg_temp.id('cr_past'), pg_temp.id('cr_paused'));
select count(test_helpers.publish_job_opening(id)) from j4c_ids;
update public.job_openings set application_deadline = (now() at time zone 'Asia/Manila')::date - 1 where id = pg_temp.id('cr_past');
update public.job_openings set status = 'paused' where id = pg_temp.id('cr_paused');
-- Certificates are issued by the OTHER shop (s2): recognition is cross-shop.
insert into j4c_ids select 'c' || n, test_helpers.issue_test_certification(current_setting('fx.s2')::uuid, pg_temp.w(n), 'j4c-o2@local.test')
from generate_series(2, 8) n;
select test_helpers.act_as_owner('j4c-o2@local.test');
select (public.transition_certification(pg_temp.id('c3'), 'active', 'suspended', 'Suspended while a complaint is checked')).status as c3;
select (public.transition_certification(pg_temp.id('c4'), 'active', 'revoked', 'Revoked after the complaint was confirmed')).status as c4;
select test_helpers.act_as_service();
select test_helpers.backdate_certification(pg_temp.id('c5'), 400) is not null as c5_expired;
select test_helpers.backdate_certification(pg_temp.id('c6'), 340) is not null as c6_in_renewal_window;
select test_helpers.act_as_owner('j4c-o2@local.test');
insert into j4c_ids select 'ra6', id from public.record_certification_reassessment(pg_temp.id('c6'), array[true, true], 'passed');
insert into j4c_ids select 'c6_new', id from public.renew_certification(pg_temp.id('c6'), pg_temp.id('ra6'), 'w7_issuer_v1');
select (public.transition_certification(pg_temp.id('c6_new'), 'active', 'revoked', 'Revoked right after the renewal')).status as c6_new;
select test_helpers.act_as_service();
select test_helpers.backdate_certification(pg_temp.id('c8'), 400) is not null as c8_old_expired;   -- w8 then gets a second, current one
insert into j4c_ids values ('c8b', test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(8), 'j4c-o1@local.test'));
create function pg_temp.apply_sql(p_opening text, p_submit boolean default true, p_notice text default 'w5_v1') returns text language sql stable
as $$ select format('select public.create_job_application(%L, null, %L, %L)', pg_temp.id(p_opening), p_submit, p_notice) $$;
select set_config('fx.needs_cert', 'This opening needs a current shop-issued certification recorded on WashLink.', true);

-- ---------- create refused / allowed ----------
select test_helpers.act_as(pg_temp.w(1));
select throws_ok(pg_temp.apply_sql('cr'), '23514', current_setting('fx.needs_cert'), 'w7_certification_required_create_refused_without_current_certification');
select throws_ok(pg_temp.apply_sql('cr', false), '23514', current_setting('fx.needs_cert'), 'w7_certification_required_create_refused_without_current_certification');
select is((select count(*)::int from public.job_applications where worker_id = pg_temp.w(1)), 0,
          'w7_certification_required_create_refused_without_current_certification');
select is((public.create_job_application(pg_temp.id('tw'), null, true, 'w5_v1')).status, 'submitted', 'w7_trainees_welcome_openings_unaffected');
create function pg_temp.apply_as(p_worker int, p_opening text) returns text language plpgsql as $$
begin
  perform test_helpers.act_as(pg_temp.w(p_worker));
  return test_helpers.attempt(pg_temp.apply_sql(p_opening));
end $$;
select is((select array_agg(pg_temp.apply_as(n, 'cr') order by n) from unnest(array[3, 4, 5, 6]) n), array['23514', '23514', '23514', '23514'],
          'w7_suspended_revoked_or_superseded_certification_does_not_allow_apply');
select is((select array_agg(pg_temp.apply_as(n, 'tw') order by n) from unnest(array[3, 4, 5, 6]) n),
          array['succeeded', 'succeeded', 'succeeded', 'succeeded'], 'w7_trainees_welcome_openings_unaffected');
select test_helpers.act_as_service();
select is((select array_agg(c.status order by c.status) from public.certifications c where c.worker_id = pg_temp.w(6)), array['revoked', 'superseded'],
          'w7_suspended_revoked_or_superseded_certification_does_not_allow_apply');
select test_helpers.act_as(pg_temp.w(2));
insert into j4c_ids select 'app2', id from public.create_job_application(pg_temp.id('cr'), null, true, 'w5_v1');
select is((select status from public.job_applications where id = pg_temp.id('app2')), 'submitted', 'w7_current_certification_from_any_shop_allows_apply');
select test_helpers.act_as(pg_temp.w(8));
insert into j4c_ids select 'app8', id from public.create_job_application(pg_temp.id('cr'), null, true, 'w5_v1');
select is((select status from public.job_applications where id = pg_temp.id('app8')), 'submitted', 'w7_current_certification_from_any_shop_allows_apply');

-- ---------- draft -> submit ----------
select test_helpers.act_as(pg_temp.w(7));
insert into j4c_ids select 'draft7', id from public.create_job_application(pg_temp.id('cr'), 'Draft note', false);
select test_helpers.act_as_owner('j4c-o2@local.test');
select (public.transition_certification(pg_temp.id('c7'), 'active', 'suspended', 'Suspended before the draft was sent')).status as c7;
select test_helpers.act_as(pg_temp.w(7));
select throws_ok(format('select public.transition_job_application(%L, %L, %L, %L)', pg_temp.id('draft7'), 'draft', 'submitted', 'w5_v1'),
                 '23514', current_setting('fx.needs_cert'), 'w7_certification_required_draft_submit_refused_without_current_certification');
select is((select status from public.job_applications where id = pg_temp.id('draft7')), 'draft',
          'w7_certification_required_draft_submit_refused_without_current_certification');

-- ---------- applicant reads: current certificates only, W5 authorisation ----------
select test_helpers.act_as_owner('j4c-o1@local.test');
select is((select row(count(*), min(certification_title), min(issuing_shop_name) = (select name from public.shops where id = current_setting('fx.s2')::uuid))::text
           from public.applicant_verified_certifications(pg_temp.id('app2'))), row(1, 'Local test training', true)::text,
          'w7_applicant_verified_certifications_returns_current_only');
select is((select array_agg(certification_id) from public.applicant_verified_certifications(pg_temp.id('app8'))), array[pg_temp.id('c8b')],
          'w7_applicant_verified_certifications_returns_current_only');
select is((select count(*)::int from public.applicant_verified_certifications(
            (select id from public.job_applications where worker_id = pg_temp.w(3) and job_opening_id = pg_temp.id('tw')))), 0,
          'w7_applicant_verified_certifications_returns_current_only');
select test_helpers.act_as_owner('j4c-o2@local.test');
select throws_ok(format('select * from public.applicant_verified_certifications(%L)', pg_temp.id('app2')), '42501', 'Job application not found.',
                 'w7_applicant_verified_certifications_authorisation_unchanged');
select test_helpers.act_as(pg_temp.w(1));
select throws_ok(format('select * from public.applicant_verified_certifications(%L)', pg_temp.id('app2')), '42501', 'Job application not found.',
                 'w7_applicant_verified_certifications_authorisation_unchanged');
select test_helpers.act_as(pg_temp.w(2));
select is((select count(*)::int from public.applicant_verified_certifications(pg_temp.id('app2'))), 1,
          'w7_applicant_verified_certifications_authorisation_unchanged');

-- ---------- existing application untouched by a later revocation ----------
select test_helpers.act_as_owner('j4c-o2@local.test');
select (public.transition_certification(pg_temp.id('c2'), 'active', 'revoked', 'Revoked after the application was sent')).status as c2;
select test_helpers.act_as_owner('j4c-o1@local.test');
select is((select row(status, submitted_at is not null)::text from public.job_applications where id = pg_temp.id('app2')), row('submitted', true)::text,
          'w7_existing_application_unchanged_after_certification_revoked');
select is((public.transition_job_application(pg_temp.id('app2'), 'submitted', 'under_review')).status, 'under_review',
          'w7_existing_application_unchanged_after_certification_revoked');
select is((select count(*)::int from public.applicant_verified_certifications(pg_temp.id('app2'))), 0,
          'w7_existing_application_unchanged_after_certification_revoked');
select is((public.transition_job_application(pg_temp.id('app2'), 'under_review', 'rejected')).status, 'rejected',
          'w7_applicant_verified_certifications_authorisation_unchanged');
select throws_ok(format('select * from public.applicant_verified_certifications(%L)', pg_temp.id('app2')), '42501', 'Job application not found.',
                 'w7_applicant_verified_certifications_authorisation_unchanged');

-- ---------- W5 checks keep their order and messages ----------
select test_helpers.act_as(pg_temp.w(1));
select throws_ok(pg_temp.apply_sql('cr_past'), '23514', 'The application deadline for this opening has passed.', 'w7_w5_apply_checks_keep_order_and_messages');
select throws_ok(pg_temp.apply_sql('cr_paused'), '23514', 'This job opening is paused and is not accepting applications.',
                 'w7_w5_apply_checks_keep_order_and_messages');
select throws_ok(pg_temp.apply_sql('cr', true, null), '23514', current_setting('fx.needs_cert'), 'w7_w5_apply_checks_keep_order_and_messages');
select test_helpers.act_as(current_setting('fx.w9')::uuid);
select throws_ok(pg_temp.apply_sql('cr'), '23514', 'Create your worker profile before applying.', 'w7_w5_apply_checks_keep_order_and_messages');
select test_helpers.act_as_service();
create function pg_temp.pos(p_text text) returns int language sql stable
as $$ select position(p_text in pg_get_functiondef('public.job_application_apply_checks(uuid, uuid, uuid)'::regprocedure)) $$;
select ok((select bool_and(a < b) from (select pg_temp.pos(x) a, lead(pg_temp.pos(x)) over (order by o) b
           from unnest(array['Job opening not found.', 'is paused', 'This job opening is closed.', 'until its verification is reviewed',
                             'deadline for this opening has passed', 'current shop-issued certification', '''job_applications:''',
                             'cannot apply to this job opening again', 'limit of 50 open applications', '''job_opening_apps:''',
                             'not accepting more applications']) with ordinality u(x, o)) s where b is not null)
          and pg_temp.pos('current shop-issued certification') > 0, 'w7_w5_apply_checks_keep_order_and_messages');

select * from finish();
rollback;
