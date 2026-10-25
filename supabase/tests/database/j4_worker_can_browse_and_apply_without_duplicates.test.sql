-- J4 (W5): a worker browses published openings of verified shops, applies once, and every
-- refusal (profile, notice, duplicates, limits, deadline, status, P15 shop) holds; the opening
-- snapshot is write-once. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(90);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j4-a1@local.test')::text, true);
select set_config('fx.a2', test_helpers.create_super_admin('j4-a2@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j4-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j4-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j4-c1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('j4-w1@local.test')::text, true);
select set_config('fx.w2', test_helpers.create_worker('j4-w2@local.test')::text, true);
select set_config('fx.w3', test_helpers.create_worker('j4-w3@local.test')::text, true);
select set_config('fx.w4', test_helpers.create_worker('j4-w4@local.test')::text, true);
select test_helpers.create_worker_profile(current_setting('fx.w1')::uuid) is not null as w1_profile;
select test_helpers.create_worker_profile(current_setting('fx.w2')::uuid) is not null as w2_profile;
select test_helpers.create_worker_profile(current_setting('fx.w4')::uuid) is not null as w4_profile;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s_cr', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s_in', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s_rv', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a2')::uuid)::text, true);
select set_config('fx.s_s6', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.today', (now() at time zone 'Asia/Manila')::date::text, true);

create temporary table j4_openings (label text primary key, id uuid) on commit drop;
grant all on j4_openings to public;
insert into j4_openings
select label, test_helpers.create_job_opening(current_setting('fx.' || shop)::uuid, 'J4 ' || label)
from (values ('a', 's1'), ('b', 's2'), ('c', 's2'), ('paused', 's1'), ('closed', 's1'), ('archived', 's1'),
             ('draft', 's1'), ('past', 's1'), ('today', 's1'), ('cr', 's_cr'), ('in', 's_in'), ('rv', 's_rv'),
             ('s6', 's_s6')) v(label, shop);
update public.job_openings set title = 'J4 Car wash attendant', description = 'Wash and dry cars',
  work_location = 'Quezon City branch', required_skills = array['Hand wash', 'Waxing'], compensation_min_amount = 600,
  compensation_max_amount = 800, compensation_currency = 'PHP', compensation_period = 'day',
  schedule_details = 'Weekends', other_terms = 'J4 original terms'
where id = (select id from j4_openings where label = 'a');
update public.job_openings set title = 'J4 Detailer', work_location = 'Makati', job_type = 'full_time',
  applicant_requirement = 'certification_required', required_skills = array['Polishing'],
  compensation_min_amount = 20000, compensation_currency = 'PHP', compensation_period = 'month'
where id = (select id from j4_openings where label = 'b');
update public.job_openings set title = 'J4 100% clean_wash crew', work_location = 'Pasig', job_type = 'temporary'
where id = (select id from j4_openings where label = 'c');
update public.job_openings set application_deadline = current_setting('fx.today')::date
where id = (select id from j4_openings where label = 'today');
select count(test_helpers.publish_job_opening(id)) from j4_openings where label <> 'draft';
update public.job_openings set status = 'paused' where id = (select id from j4_openings where label = 'paused');
update public.job_openings set status = 'closed' where id = (select id from j4_openings where label = 'closed');
update public.job_openings set status = 'archived' where id = (select id from j4_openings where label = 'archived');
update public.job_openings set application_deadline = current_setting('fx.today')::date - 1
where id = (select id from j4_openings where label = 'past');
-- Four ways a shop loses its recorded verification (published openings stay published).
select test_helpers.act_as_admin('j4-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Local test: retake photo'
where id = current_setting('fx.s_cr')::uuid;
select test_helpers.act_as_owner('j4-o1@local.test');
update public.shops set is_active = false where id = current_setting('fx.s_in')::uuid;
update public.shops set name = 'J4 renamed shop' where id = current_setting('fx.s_s6')::uuid;
select test_helpers.act_as_service();
delete from auth.users where id = current_setting('fx.a2')::uuid;

-- ---------- browse ----------
select test_helpers.act_as_worker('j4-w1@local.test');
select is((select array_agg(o.label order by o.label) from public.job_openings j join j4_openings o on o.id = j.id),
          array['a', 'b', 'c', 'past', 'today'], 'j4_worker_sees_published_openings_of_verified_shops_only');
select is((select array_agg(o.label order by o.label) from public.search_job_openings() r join j4_openings o on o.id = r.job_opening_id),
          array['a', 'b', 'c', 'today'], 'j4_worker_sees_published_openings_of_verified_shops_only');
select is((select shop_name from public.search_job_openings(p_query => 'attendant')),
          (select name from public.shops where id = current_setting('fx.s1')::uuid), 'j4_worker_sees_published_openings_of_verified_shops_only');

create function pg_temp.j4_search_labels(r_ids uuid[]) returns text[] language sql
as $$ select coalesce(array_agg(o.label order by o.label), '{}') from j4_openings o where o.id = any(r_ids) $$;
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_query => 'attendant'))), array['a'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_query => 'DRY'))), array['a'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_query => 'weekends'))), array['a'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_location => ' makati '))), array['b'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_job_type => 'full_time'))), array['b'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_required_skill => 'hand WASH'))), array['a'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_required_skill => 'hand'))), '{}'::text[],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_applicant_requirement => 'certification_required'))),
          array['b'], 'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_pay_stated => true))), array['a', 'b'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_pay_stated => false))), array['c', 'today'],
          'j4_search_filters_by_text_location_job_type_skill_requirement_and_pay');

select is((select count(*)::int from public.search_job_openings(p_limit => 50) r join j4_openings o on o.id = r.job_opening_id
           where o.label in ('past', 'paused', 'closed', 'archived', 'draft', 'cr', 'in', 'rv', 's6')),
          0, 'j4_search_excludes_past_deadline_paused_and_unverified');
select is((select count(*)::int from public.job_openings j join j4_openings o on o.id = j.id
           where o.label in ('paused', 'closed', 'archived', 'draft', 'cr', 'in', 'rv', 's6')),
          0, 'j4_search_excludes_past_deadline_paused_and_unverified');

select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_min_pay_amount => 700, p_pay_period => 'day'))),
          array['a'], 'j4_search_pay_filter_uses_stated_values_without_conversion');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_min_pay_amount => 900, p_pay_period => 'day'))),
          '{}'::text[], 'j4_search_pay_filter_uses_stated_values_without_conversion');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_min_pay_amount => 700, p_pay_period => 'month'))),
          array['b'], 'j4_search_pay_filter_uses_stated_values_without_conversion');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_pay_period => 'hour'))),
          '{}'::text[], 'j4_search_pay_filter_uses_stated_values_without_conversion');
select throws_ok($$ select * from public.search_job_openings(p_min_pay_amount => 700) $$, '22023',
                 'Choose a pay period to filter by pay amount.', 'j4_search_pay_filter_uses_stated_values_without_conversion');

select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_query => '%'))), array['c'],
          'j4_search_escapes_wildcards_and_limits_input');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_query => '_'))), array['c'],
          'j4_search_escapes_wildcards_and_limits_input');
select is(pg_temp.j4_search_labels(array(select job_opening_id from public.search_job_openings(p_query => '\'))), '{}'::text[],
          'j4_search_escapes_wildcards_and_limits_input');
select throws_ok($$ select * from public.search_job_openings(p_query => repeat('x', 81)) $$, '22023',
                 'Search filters must be 80 characters or fewer.', 'j4_search_escapes_wildcards_and_limits_input');
select is(test_helpers.attempt($$ select * from public.search_job_openings(p_limit => 0) $$), '22023', 'j4_search_escapes_wildcards_and_limits_input');
select is(test_helpers.attempt($$ select * from public.search_job_openings(p_limit => 51) $$), '22023', 'j4_search_escapes_wildcards_and_limits_input');
select is(test_helpers.attempt($$ select * from public.search_job_openings(p_offset => 1001) $$), '22023', 'j4_search_escapes_wildcards_and_limits_input');
select is((select count(*)::int from public.search_job_openings(p_limit => 1)), 1, 'j4_search_escapes_wildcards_and_limits_input');

select test_helpers.act_as_owner('j4-o1@local.test');
select is((select count(*)::int from public.search_job_openings()), 0, 'j4_search_returns_nothing_for_owner_customer');
select test_helpers.act_as_customer('j4-c1@local.test');
select is((select count(*)::int from public.search_job_openings()), 0, 'j4_search_returns_nothing_for_owner_customer');
select test_helpers.act_as_admin('j4-a1@local.test');
select is((select count(*)::int from public.search_job_openings()), 0, 'j4_search_returns_nothing_for_owner_customer');

-- ---------- apply ----------
select test_helpers.act_as_worker('j4-w1@local.test');
select set_config('fx.app1', (select id from public.create_job_application((select id from j4_openings where label = 'a'),
                  '  I have washed cars for two years.  ', true, 'w5_v1'))::text, true);
select is((select row(status, cover_note, submitted_at is not null, notice_version)::text from public.job_applications
           where id = current_setting('fx.app1')::uuid),
          row('submitted', 'I have washed cars for two years.', true, 'w5_v1')::text, 'j4_worker_can_apply_with_optional_cover_note');
select is((select my_application_status from public.search_job_openings() where job_opening_id = (select id from j4_openings where label = 'a')),
          'submitted', 'j4_search_marks_my_application_status');
select is((select my_application_status from public.search_job_openings() where job_opening_id = (select id from j4_openings where label = 'b')),
          null, 'j4_search_marks_my_application_status');

select test_helpers.act_as_worker('j4-w2@local.test');
select set_config('fx.app2', (select id from public.create_job_application((select id from j4_openings where label = 'a'),
                  null, true, 'w5_v1'))::text, true);
select is((select row(status, cover_note is null)::text from public.job_applications where id = current_setting('fx.app2')::uuid),
          row('submitted', true)::text, 'j4_worker_can_apply_without_cover_note');

select test_helpers.act_as_worker('j4-w3@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'a'), null, true, 'w5_v1') $$,
                 '23514', 'Create your worker profile before applying.', 'j4_application_requires_worker_profile');

select test_helpers.act_as_worker('j4-w1@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'b'), null, true, null) $$,
                 '23514', 'Review the training and work notice before applying.', 'j4_application_requires_current_notice_version');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'b'), null, true, 'w4_v1') $$,
                 '23514', 'Review the training and work notice before applying.', 'j4_application_requires_current_notice_version');
select is(public.job_application_notice_version(), 'w5_v1', 'j4_application_requires_current_notice_version');

select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'a'), null, true, 'w5_v1') $$,
                 '23505', 'You have already applied to this job opening.', 'j4_duplicate_application_rejected');
select is((select count(*)::int from public.job_applications where worker_id = auth.uid()
           and job_opening_id = (select id from j4_openings where label = 'a')), 1, 'j4_duplicate_application_rejected');

select set_config('fx.draft1', (select id from public.create_job_application((select id from j4_openings where label = 'b'),
                  'Draft note', false))::text, true);
select is((select row(status, submitted_at, opening_snapshot, opening_snapshot_taken_at, notice_version)::text
           from public.job_applications where id = current_setting('fx.draft1')::uuid),
          row('draft', null::timestamptz, null::jsonb, null::timestamptz, null::text)::text, 'j4_draft_has_no_snapshot_until_submitted');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'b'), null, false) $$,
                 '23505', 'You have already applied to this job opening.', 'j4_second_draft_or_draft_plus_submitted_rejected');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'b'), null, true, 'w5_v1') $$,
                 '23505', 'You have already applied to this job opening.', 'j4_second_draft_or_draft_plus_submitted_rejected');
select is((select status from public.transition_job_application(current_setting('fx.draft1')::uuid, 'draft', 'submitted', 'w5_v1')),
          'submitted', 'j4_draft_has_no_snapshot_until_submitted');
select is((select row(opening_snapshot ->> 'title', opening_snapshot_taken_at = submitted_at, notice_acknowledged_at = submitted_at)::text
           from public.job_applications where id = current_setting('fx.draft1')::uuid),
          row('J4 Detailer', true, true)::text, 'j4_draft_has_no_snapshot_until_submitted');

select test_helpers.act_as_service();
select ok((select i.indisunique and pg_get_expr(i.indpred, i.indrelid) = '(status <> ''withdrawn''::text)'
                  and pg_get_indexdef(i.indexrelid) like '%(job_opening_id, worker_id)%'
           from pg_index i where i.indexrelid = 'public.job_applications_one_live_per_worker_opening'::regclass),
          'j4_live_application_unique_index_is_partial_unique');

-- withdraw frees the pair; at most 3 rows per pair
select test_helpers.act_as_worker('j4-w2@local.test');
select is((select status from public.transition_job_application(current_setting('fx.app2')::uuid, 'submitted', 'withdrawn')),
          'withdrawn', 'j4_withdrawn_application_allows_reapply');
select set_config('fx.app2b', (select id from public.create_job_application((select id from j4_openings where label = 'a'),
                  null, true, 'w5_v1'))::text, true);
select is((select array_agg(status order by created_at, status) from public.job_applications
           where worker_id = auth.uid() and job_opening_id = (select id from j4_openings where label = 'a')),
          array['submitted', 'withdrawn'], 'j4_withdrawn_application_allows_reapply');
select is((select status from public.transition_job_application(current_setting('fx.app2b')::uuid, 'submitted', 'withdrawn')),
          'withdrawn', 'j4_reapply_limit_per_opening');
select set_config('fx.app2c', (select id from public.create_job_application((select id from j4_openings where label = 'a'),
                  null, true, 'w5_v1'))::text, true);
select is((select status from public.transition_job_application(current_setting('fx.app2c')::uuid, 'submitted', 'withdrawn')),
          'withdrawn', 'j4_reapply_limit_per_opening');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'a'), null, true, 'w5_v1') $$,
                 '23514', 'You cannot apply to this job opening again.', 'j4_reapply_limit_per_opening');

select test_helpers.act_as_service();
select test_helpers.create_job_application((select id from j4_openings where label = 'c'), current_setting('fx.w2')::uuid, 'rejected') is not null as rejected_fixture;
select test_helpers.create_job_application((select id from j4_openings where label = 'today'), current_setting('fx.w2')::uuid, 'closed') is not null as closed_fixture;
select test_helpers.act_as_worker('j4-w2@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'c'), null, true, 'w5_v1') $$,
                 '23505', 'You have already applied to this job opening.', 'j4_rejected_or_closed_application_blocks_reapply');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'today'), null, true, 'w5_v1') $$,
                 '23505', 'You have already applied to this job opening.', 'j4_rejected_or_closed_application_blocks_reapply');

-- 50 open applications per worker (bulk openings inserted by a trusted session)
select test_helpers.act_as_service();
insert into public.job_openings (shop_id, owner_id, title, description, work_location, openings_count, job_type,
                                 applicant_requirement, status, first_published_at, status_changed_at)
select current_setting('fx.s2')::uuid, current_setting('fx.o2')::uuid, 'J4 bulk ' || n, 'Bulk', 'Bulk', 1, 'other',
       'trainees_welcome', 'published', now(), now()
from generate_series(1, 50) n;
select is((select count(test_helpers.create_job_application(id, current_setting('fx.w4')::uuid, 'submitted'))::int
           from public.job_openings where title like 'J4 bulk %'), 50, 'j4_open_application_limit_per_worker');
select test_helpers.act_as_worker('j4-w4@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'a'), null, true, 'w5_v1') $$,
                 '23514', 'You have reached the limit of 50 open applications.', 'j4_open_application_limit_per_worker');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'c'), null, false) $$,
                 '23514', 'You have reached the limit of 50 open applications.', 'j4_open_application_limit_per_worker');

-- ---------- refusals ----------
select test_helpers.act_as_worker('j4-w1@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'past'), null, true, 'w5_v1') $$,
                 '23514', 'The application deadline for this opening has passed.', 'j4_cannot_apply_after_deadline');
select is((select status from public.create_job_application((select id from j4_openings where label = 'today'), null, true, 'w5_v1')),
          'submitted', 'j4_can_apply_on_deadline_day_manila');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'paused'), null, true, 'w5_v1') $$,
                 '23514', 'This job opening is paused and is not accepting applications.', 'j4_cannot_apply_to_paused_closed_or_archived_opening');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'closed'), null, true, 'w5_v1') $$,
                 '23514', 'This job opening is closed.', 'j4_cannot_apply_to_paused_closed_or_archived_opening');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'archived'), null, true, 'w5_v1') $$,
                 '23514', 'This job opening is closed.', 'j4_cannot_apply_to_paused_closed_or_archived_opening');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'draft'), null, true, 'w5_v1') $$,
                 '42501', 'Job opening not found.', 'j4_cannot_apply_to_draft_or_unknown_opening');
select throws_ok($$ select public.create_job_application(gen_random_uuid(), null, true, 'w5_v1') $$,
                 '42501', 'Job opening not found.', 'j4_cannot_apply_to_draft_or_unknown_opening');
select is((select count(*)::int from j4_openings o
           where o.label in ('cr', 'in', 'rv', 's6')
             and test_helpers.attempt(format('select public.create_job_application(%L, null, true, %L)', o.id, 'w5_v1')) = '23514'),
          4, 'j4_cannot_apply_when_shop_loses_verification');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'rv'), null, true, 'w5_v1') $$,
                 '23514', 'This shop cannot receive applications until its verification is reviewed.', 'j4_cannot_apply_when_shop_loses_verification');
select test_helpers.act_as_customer('j4-c1@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'c'), null, true, 'w5_v1') $$,
                 '42501', 'Only worker accounts can apply to job openings.', 'j4_non_worker_roles_cannot_apply');
select test_helpers.act_as_owner('j4-o2@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'a'), null, true, 'w5_v1') $$,
                 '42501', 'Only worker accounts can apply to job openings.', 'j4_non_worker_roles_cannot_apply');
select test_helpers.act_as_admin('j4-a1@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'a'), null, true, 'w5_v1') $$,
                 '42501', 'Only worker accounts can apply to job openings.', 'j4_non_worker_roles_cannot_apply');
select test_helpers.act_as_anon();
select throws_ok($$ select public.create_job_application(gen_random_uuid(), null, true, 'w5_v1') $$,
                 '42501', null, 'j4_non_worker_roles_cannot_apply');

-- ---------- snapshot ----------
select test_helpers.act_as_service();
select is((select row(a.opening_snapshot ->> 'title', a.opening_snapshot ->> 'other_terms', (a.opening_snapshot ->> 'compensation_min_amount')::numeric,
                      a.opening_snapshot ->> 'shop_name', (a.opening_snapshot ->> 'snapshot_version')::int,
                      (a.opening_snapshot ->> 'job_opening_updated_at')::timestamptz = j.updated_at,
                      a.opening_snapshot_taken_at = a.submitted_at)::text
           from public.job_applications a join public.job_openings j on j.id = a.job_opening_id
           join public.shops s on s.id = j.shop_id where a.id = current_setting('fx.app1')::uuid),
          row('J4 Car wash attendant', 'J4 original terms', 600.00::numeric,
              (select name from public.shops where id = current_setting('fx.s1')::uuid), 1, true, true)::text,
          'j4_snapshot_taken_at_submit_matches_opening');
select is((select count(*)::int from public.job_applications a, jsonb_object_keys(a.opening_snapshot) k
           where a.id = current_setting('fx.app1')::uuid), 29, 'j4_snapshot_taken_at_submit_matches_opening');

select test_helpers.act_as_owner('j4-o1@local.test');
update public.job_openings set other_terms = 'J4 edited terms', title = 'J4 Car wash attendant edited'
where id = (select id from j4_openings where label = 'a');
select test_helpers.act_as_worker('j4-w1@local.test');
select is((select row(a.opening_snapshot ->> 'other_terms', a.opening_snapshot ->> 'title', j.other_terms)::text
           from public.job_applications a join public.job_openings j on j.id = a.job_opening_id
           where a.id = current_setting('fx.app1')::uuid),
          row('J4 original terms', 'J4 Car wash attendant', 'J4 edited terms')::text, 'j4_snapshot_unchanged_after_owner_edits_published_opening');

select is(test_helpers.attempt(format($$ update public.job_applications set opening_snapshot = '{}' where id = %L $$, current_setting('fx.app1'))),
          '42501', 'j4_snapshot_write_once_for_every_session');
select test_helpers.act_as_owner('j4-o1@local.test');
select is(test_helpers.attempt(format($$ update public.job_applications set opening_snapshot = '{}' where id = %L $$, current_setting('fx.app1'))),
          '42501', 'j4_snapshot_write_once_for_every_session');
select test_helpers.act_as_service();
select throws_ok(format($$ update public.job_applications set opening_snapshot = '{"title": "Forged"}' where id = %L $$, current_setting('fx.app1')),
                 '42501', 'The application snapshot cannot be changed.', 'j4_snapshot_write_once_for_every_session');
select throws_ok(format($$ update public.job_applications set opening_snapshot = null, opening_snapshot_taken_at = null where id = %L $$,
                        current_setting('fx.app1')),
                 '42501', 'The application snapshot cannot be changed.', 'j4_snapshot_write_once_for_every_session');
select throws_ok(format($$ update public.job_applications set opening_snapshot_taken_at = now() - interval '1 day' where id = %L $$,
                        current_setting('fx.app1')),
                 '42501', 'The application snapshot cannot be changed.', 'j4_snapshot_write_once_for_every_session');
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select set_config('role', 'service_role', true);
select throws_ok(format($$ update public.job_applications set opening_snapshot = '{}' where id = %L $$, current_setting('fx.app1')),
                 '42501', null, 'j4_snapshot_write_once_for_every_session');
select set_config('role', 'none', true);
select test_helpers.act_as_service();
select is((select opening_snapshot ->> 'title' from public.job_applications where id = current_setting('fx.app1')::uuid),
          'J4 Car wash attendant', 'j4_snapshot_write_once_for_every_session');

-- ---------- cover note, tracking, applicant reads, no certification claim ----------
select test_helpers.act_as_worker('j4-w1@local.test');
select throws_ok($$ select public.create_job_application((select id from j4_openings where label = 'c'), repeat('x', 1001), true, 'w5_v1') $$,
                 '23514', 'The cover note must be 1000 characters or fewer.', 'j4_cover_note_length_enforced');
select is((select char_length(cover_note) from public.create_job_application((select id from j4_openings where label = 'c'), repeat('x', 1000), true, 'w5_v1')),
          1000, 'j4_cover_note_length_enforced');
select is((select array_agg(o.label || ':' || a.status order by o.label) from public.job_applications a join j4_openings o on o.id = a.job_opening_id),
          array['a:submitted', 'b:submitted', 'c:submitted', 'today:submitted'], 'j4_worker_can_track_own_application_statuses');
select is((select count(*)::int from public.job_applications where worker_id <> auth.uid()), 0, 'j4_worker_can_track_own_application_statuses');

select test_helpers.act_as_owner('j4-o1@local.test');
select is((select status from public.transition_job_opening((select id from j4_openings where label = 'a'), 'published', 'paused')), 'paused',
          'j4_applicant_can_read_opening_after_pause_or_close');
select test_helpers.act_as_worker('j4-w1@local.test');
select is((select count(*)::int from public.job_openings where id = (select id from j4_openings where label = 'a')), 1,
          'j4_applicant_can_read_opening_after_pause_or_close');
select test_helpers.act_as_worker('j4-w3@local.test');
select is((select count(*)::int from public.job_openings where id = (select id from j4_openings where label = 'a')), 0,
          'j4_applicant_can_read_opening_after_pause_or_close');
select test_helpers.act_as_owner('j4-o1@local.test');
select is((select status from public.transition_job_opening((select id from j4_openings where label = 'a'), 'paused', 'closed')), 'closed',
          'j4_applicant_can_read_opening_after_pause_or_close');
select test_helpers.act_as_worker('j4-w1@local.test');
select is((select row(j.status, a.status)::text from public.job_openings j join public.job_applications a on a.job_opening_id = j.id
           where j.id = (select id from j4_openings where label = 'a')), row('closed', 'closed')::text,
          'j4_applicant_can_read_opening_after_pause_or_close');

select test_helpers.act_as_service();
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'job_applications'
           and (column_name like '%certif%' or column_name like '%qualif%' or column_name like '%skill%')),
          0, 'j4_application_has_no_certification_claim_column');

select * from finish();
rollback;
