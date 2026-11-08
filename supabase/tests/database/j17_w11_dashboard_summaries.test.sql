-- J17 (W11): role-aware dashboard summaries (D-42, D-43; W11 PLAN P65). Counts come from the database, one row for the
-- right role and none otherwise, each equal to the read it summarises (search_job_openings, my_* / owner_* reads, the
-- W5 / W6 table predicates); owners see only their own shops; the super_admin summary counts open WashLink reviews,
-- open / unviewed disputes, overdue shop review requests and stranded suspensions; no text, names or ids in any
-- column. Local Docker stack only; backdating a shop request is a TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17d-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j17d-cu@local.test')::text, true);
create temporary table j17d_ids (label text primary key, id uuid) on commit drop;
grant all on j17d_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17d_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j17d_ids select 'o' || n, test_helpers.create_owner('j17d-o' || n || '@local.test') from generate_series(1, 3) n;
insert into j17d_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j17d-w' || n || '@local.test')) from generate_series(1, 5) n;
insert into j17d_ids values ('w6', test_helpers.create_worker('j17d-w6@local.test'));
insert into j17d_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1'))), ('s2', test_helpers.create_shop(pg_temp.id('o1'), 'pending')),
  ('s3', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.fx('a1'))), ('s4', test_helpers.create_verified_shop(pg_temp.id('o3'), pg_temp.fx('a1')));
insert into j17d_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Dashboard test washer'))),
  ('j2', test_helpers.create_job_opening(pg_temp.id('s1'), 'Dashboard draft opening')),
  ('j3', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s3'), 'Dashboard open opening'))),
  ('j4', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s3'), 'Dashboard unapplied opening'))),
  ('j5', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s2'), 'Dashboard unverified shop opening')));
select test_helpers.create_job_application(pg_temp.id('j1'), pg_temp.id('w1'), 'submitted') is not null as applied,
       test_helpers.create_job_application(pg_temp.id('j3'), pg_temp.id('w1'), 'draft') is not null as drafted;
insert into j17d_ids values ('c1', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('w1'), 'j17d-o1@local.test')),
  ('c2', test_helpers.issue_test_certification(pg_temp.id('s3'), pg_temp.id('w1'), 'j17d-o2@local.test')),
  ('c4', test_helpers.issue_test_certification(pg_temp.id('s3'), pg_temp.id('w4'), 'j17d-o2@local.test')),
  ('c5', test_helpers.issue_test_certification(pg_temp.id('s4'), pg_temp.id('w5'), 'j17d-o3@local.test'));
select count(test_helpers.suspend_test_certification(pg_temp.id(c), o)) as suspended
from (values ('c2', 'j17d-o2@local.test'), ('c4', 'j17d-o2@local.test'), ('c5', 'j17d-o3@local.test')) v(c, o);
insert into j17d_ids values ('r2', test_helpers.request_test_shop_review(pg_temp.id('c2'), 'j17d-w1@local.test')),
  ('r4', test_helpers.request_test_shop_review(pg_temp.id('c4'), 'j17d-w4@local.test'));
select test_helpers.act_as_owner('j17d-o2@local.test');
select (public.decide_certification_review(pg_temp.id('r2'), 'uphold', 'The shop keeps the suspension after checking')).status as r2_status;
select test_helpers.act_as_service();
select test_helpers.backdate_shop_review_request(pg_temp.id('r4'), 15) is not null as r4_overdue;
select test_helpers.complete_training(pg_temp.id('s1'), pg_temp.id('w3'), 'j17d-o1@local.test') is not null as w3_ready;
insert into j17d_ids values ('k1', test_helpers.create_active_test_contract('j17d-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j17d-w1@local.test'));
select test_helpers.create_accepted_application(pg_temp.id('s3'), pg_temp.id('w1')) is not null as w1_accepted_at_s3;
insert into j17d_ids values ('k2', test_helpers.create_test_contract_draft('j17d-o2@local.test', pg_temp.id('s3'), pg_temp.id('w1')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k2'), 'j17d-o2@local.test') is not null as k2_filled,
       test_helpers.send_test_contract(pg_temp.id('k2'), 'j17d-o2@local.test') is not null as k2_sent;
insert into j17d_ids values ('d1', test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j17d-o1@local.test'));
create function pg_temp.worker() returns jsonb language sql as $$ select to_jsonb(s) from public.my_worker_dashboard_summary() s $$;
create function pg_temp.owner() returns jsonb language sql as $$ select to_jsonb(s) from public.owner_dashboard_summary() s $$;
create function pg_temp.admin() returns jsonb language sql as $$ select to_jsonb(s) from public.admin_dashboard_summary() s $$;
create function pg_temp.pick(p_json jsonb, p_keys text[]) returns text language sql immutable
as $$ select string_agg(k || '=' || coalesce(p_json ->> k, 'null'), ',' order by ord) from unnest(p_keys) with ordinality u(k, ord) $$;

-- ---------- worker ----------
select test_helpers.act_as_worker('j17d-w1@local.test');
select is(pg_temp.pick(pg_temp.worker(), array['has_worker_profile', 'profile_missing_fields', 'draft_application_count', 'active_application_count',
            'accepted_application_count', 'current_certification_count', 'suspended_or_revoked_certification_count', 'platform_review_available_count',
            'open_platform_review_count', 'contract_offer_count', 'active_contract_count', 'open_dispute_count', 'dispute_response_needed_count']),
          'has_worker_profile=true,profile_missing_fields=["experience_summary", "preferred_locations"],draft_application_count=1,'
          || 'active_application_count=1,accepted_application_count=2,current_certification_count=1,suspended_or_revoked_certification_count=1,'
          || 'platform_review_available_count=1,open_platform_review_count=0,contract_offer_count=1,active_contract_count=1,open_dispute_count=1,'
          || 'dispute_response_needed_count=1', 'w11_worker_summary_counts_match_reads');
select is(pg_temp.pick(pg_temp.worker(), array['current_certification_count', 'suspended_or_revoked_certification_count', 'platform_review_available_count',
            'contract_offer_count', 'amendment_offer_count', 'accepted_not_started_count', 'active_contract_count', 'open_dispute_count',
            'dispute_response_needed_count', 'draft_application_count', 'accepted_application_count']),
          pg_temp.pick(jsonb_build_object(
            'current_certification_count', (select count(*) from public.my_certifications() where effective_status = 'active'),
            'suspended_or_revoked_certification_count', (select count(*) from public.my_certifications() where status in ('suspended', 'revoked')),
            'platform_review_available_count', (select count(*) from public.my_certification_platform_reviews() where can_open),
            'contract_offer_count', (select count(*) from public.my_worker_contracts() where 'accept' = any (allowed_actions)),
            'amendment_offer_count', (select count(*) from public.my_worker_contracts() where 'accept_amendment' = any (allowed_actions)),
            'accepted_not_started_count', (select count(*) from public.my_worker_contracts() where effective_status = 'accepted'),
            'active_contract_count', (select count(*) from public.my_worker_contracts() where effective_status = 'active'),
            'open_dispute_count', (select count(*) from public.my_contract_disputes() where status = 'open'),
            'dispute_response_needed_count', (select count(*) from public.my_contract_disputes() where can_respond),
            'draft_application_count', (select count(*) from public.job_applications where status = 'draft'),
            'accepted_application_count', (select count(*) from public.job_applications where status = 'accepted')),
            array['current_certification_count', 'suspended_or_revoked_certification_count', 'platform_review_available_count',
            'contract_offer_count', 'amendment_offer_count', 'accepted_not_started_count', 'active_contract_count', 'open_dispute_count',
            'dispute_response_needed_count', 'draft_application_count', 'accepted_application_count']), 'w11_worker_summary_counts_match_reads');
select is((pg_temp.worker() ->> 'open_opening_count')::int,
          (select count(*)::int from public.search_job_openings(p_limit => 50) s where s.my_application_status is null), 'w11_worker_open_opening_count_matches_search');
select is((pg_temp.worker() ->> 'open_opening_count') || ',' || (select string_agg(s.title, ',') from public.search_job_openings(p_limit => 50) s
           where s.my_application_status is null), '1,Dashboard unapplied opening', 'w11_worker_open_opening_count_matches_search');
select lives_ok(format('select public.open_certification_platform_review(%L, %L, %L)', pg_temp.id('c2'), 'suspended',
                       'Please review the shop decision on my certificate'), 'w11_worker_summary_counts_match_reads');
select is(pg_temp.pick(pg_temp.worker(), array['platform_review_available_count', 'open_platform_review_count']),
          'platform_review_available_count=0,open_platform_review_count=1', 'w11_worker_summary_counts_match_reads');
select test_helpers.act_as_worker('j17d-w6@local.test');
select is(pg_temp.pick(pg_temp.worker(), array['has_worker_profile', 'profile_missing_fields', 'current_certification_count']),
          'has_worker_profile=false,profile_missing_fields=["headline", "experience_summary", "skills", "preferred_locations", "availability"],'
          || 'current_certification_count=0', 'w11_worker_summary_counts_match_reads');

-- ---------- owners ----------
select test_helpers.act_as_owner('j17d-o1@local.test');
select is(pg_temp.pick(pg_temp.owner(), array['shop_count', 'verified_shop_count', 'shops_needing_verification_count', 'draft_opening_count',
            'new_application_count', 'in_review_application_count', 'ready_to_certify_count', 'active_contract_count', 'contract_draft_count',
            'offer_awaiting_worker_count', 'open_dispute_count', 'dispute_response_needed_count', 'open_platform_review_count', 'active_template_count']),
          'shop_count=2,verified_shop_count=1,shops_needing_verification_count=1,draft_opening_count=1,new_application_count=1,'
          || 'in_review_application_count=0,ready_to_certify_count=1,active_contract_count=1,contract_draft_count=0,offer_awaiting_worker_count=0,'
          || 'open_dispute_count=1,dispute_response_needed_count=0,open_platform_review_count=0,active_template_count=0',
          'w11_owner_summary_counts_match_owner_reads');
select is((pg_temp.owner() ->> 'published_opening_count')::int, (select count(*)::int from public.job_openings where status = 'published'),
          'w11_owner_summary_counts_match_owner_reads');
select is((pg_temp.owner() ->> 'new_application_count')::int, (select count(*)::int from public.job_applications where status = 'submitted'),
          'w11_owner_summary_counts_match_owner_reads');
select is((pg_temp.owner() ->> 'ready_to_certify_count')::int,
          (select count(*)::int from public.training_programs p, lateral public.certifiable_enrollments(p.id) e), 'w11_owner_summary_counts_match_owner_reads');
select is(pg_temp.pick(pg_temp.owner(), array['active_contract_count', 'open_dispute_count']),
          'active_contract_count=' || (select count(*) from public.owner_worker_contracts() where effective_status = 'active')
          || ',open_dispute_count=' || (select count(*) from public.my_contract_disputes() where status = 'open'), 'w11_owner_summary_counts_match_owner_reads');
select test_helpers.act_as_owner('j17d-o2@local.test');
select is(pg_temp.pick(pg_temp.owner(), array['shop_count', 'verified_shop_count', 'open_shop_review_request_count', 'open_platform_review_count',
            'offer_awaiting_worker_count', 'active_contract_count', 'open_dispute_count', 'ready_to_certify_count', 'draft_opening_count']),
          'shop_count=1,verified_shop_count=1,open_shop_review_request_count=1,open_platform_review_count=1,offer_awaiting_worker_count=1,'
          || 'active_contract_count=0,open_dispute_count=0,ready_to_certify_count=0,draft_opening_count=0', 'w11_owner_summary_counts_only_own_shops');
select is((pg_temp.owner() ->> 'open_shop_review_request_count')::int,
          (select count(*)::int from public.owner_certifications(pg_temp.id('s3')) where open_review_request_id is not null), 'w11_owner_summary_counts_only_own_shops');

-- ---------- super_admin ----------
select test_helpers.act_as_service();
select lives_ok(format('delete from public.shops where id = %L', pg_temp.id('s4')), 'w11_admin_summary_counts_reviews_disputes_overdue_stranded');
select test_helpers.act_as_admin('j17d-a1@local.test');
select is(pg_temp.pick(pg_temp.admin(), array['open_platform_review_count', 'overdue_shop_review_request_count', 'stranded_suspended_certification_count',
            'open_dispute_count', 'unviewed_dispute_count']),
          'open_platform_review_count=1,overdue_shop_review_request_count=1,stranded_suspended_certification_count=1,open_dispute_count=1,unviewed_dispute_count=1',
          'w11_admin_summary_counts_reviews_disputes_overdue_stranded');
select is((pg_temp.admin() ->> 'shops_pending_review_count')::int,
          (select count(*)::int from public.shops where verification_status in ('pending', 'changes_requested')), 'w11_admin_summary_counts_reviews_disputes_overdue_stranded');
select ok(public.admin_contract_dispute_case(pg_temp.id('d1')) is not null, 'w11_admin_summary_counts_reviews_disputes_overdue_stranded');
select is(pg_temp.pick(pg_temp.admin(), array['unviewed_dispute_count', 'open_dispute_count']) || ',' || (pg_temp.admin() ->> 'oldest_dispute_opened_at' is not null)
          || ',' || (pg_temp.admin() ->> 'oldest_platform_review_opened_at' is not null), 'unviewed_dispute_count=0,open_dispute_count=1,true,true',
          'w11_admin_summary_counts_reviews_disputes_overdue_stranded');

-- ---------- wrong role / anon ----------
select is((select count(*)::int from public.my_worker_dashboard_summary()) || ',' || (select count(*) from public.owner_dashboard_summary()),
          '0,0', 'w11_summaries_return_no_row_for_wrong_role_or_anon');
select test_helpers.act_as_worker('j17d-w1@local.test');
select is((select count(*)::int from public.admin_dashboard_summary()) || ',' || (select count(*) from public.owner_dashboard_summary()),
          '0,0', 'w11_summaries_return_no_row_for_wrong_role_or_anon');
select test_helpers.act_as_customer('j17d-cu@local.test');
select is((select count(*)::int from public.admin_dashboard_summary()) || ',' || (select count(*) from public.owner_dashboard_summary())
          || ',' || (select count(*) from public.my_worker_dashboard_summary()), '0,0,0', 'w11_summaries_return_no_row_for_wrong_role_or_anon');
select test_helpers.act_as_anon();
select is(array[test_helpers.attempt('select * from public.my_worker_dashboard_summary()'), test_helpers.attempt('select * from public.owner_dashboard_summary()'),
                test_helpers.attempt('select * from public.admin_dashboard_summary()')], array_fill('42501'::text, array[3]),
          'w11_summaries_return_no_row_for_wrong_role_or_anon');
select test_helpers.act_as_service();

-- ---------- column types ----------
select is((select count(*)::int from pg_proc p, unnest(p.proallargtypes, p.proargmodes, p.proargnames) a(t, m, n)
           where p.oid in ('public.my_worker_dashboard_summary()'::regprocedure, 'public.owner_dashboard_summary()'::regprocedure,
                           'public.admin_dashboard_summary()'::regprocedure) and a.m = 't'
             and format_type(a.t, null) not in ('integer', 'boolean', 'date', 'timestamp with time zone')
             and not (a.n = 'profile_missing_fields' and format_type(a.t, null) = 'text[]')), 0, 'w11_summary_columns_have_no_text_names');

select * from finish();
rollback;
