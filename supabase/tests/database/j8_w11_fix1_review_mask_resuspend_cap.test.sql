-- J8 / J12 / J17 (W11 fix cycle 1): N1 the deciding administrator's profile id is masked in the raw W7 rows the
-- issuing owner can read (accountability stays in decided_by and the super_admin audit); N2 an issuing-owner suspension
-- within 30 days after a review closed as resolved_by_shop is eligible at once (resuspended_after_shop_resolution); N5 at
-- most 3 WashLink reviews per suspension / revocation event, withdrawn ones counting; N8 removing the escalated shop
-- request sets the link null; N4 the admin dispute queue hides contract fields unless open; C4 the stranded count skips
-- certificates WashLink already decided for the current event; C5 the worker open-openings count skips
-- certification-required openings without a current certificate (D-20).
-- Local Docker stack only; synthetic fixtures; disabling a guard for one statement is a TEST-ONLY shift (W7 R7 technique).
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j8f-a1@local.test')::text, true);
create temporary table j8f_ids (label text primary key, id uuid) on commit drop;
grant all on j8f_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j8f_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j8f_ids select 'o' || n, test_helpers.create_owner('j8f-o' || n || '@local.test') from generate_series(1, 3) n;
insert into j8f_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j8f-w' || n || '@local.test')) from generate_series(1, 7) n;
insert into j8f_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 3) n;
insert into j8f_ids select 'c' || v.n, test_helpers.issue_test_certification(pg_temp.id('s' || v.s), pg_temp.id('w' || v.n), 'j8f-o' || v.s || '@local.test')
from (values (1, 1), (2, 2), (3, 3), (4, 1), (7, 1)) v(n, s);
select count(test_helpers.suspend_test_certification(pg_temp.id('c' || v.n), 'j8f-o' || v.s || '@local.test')) as suspended
from (values (1, 1), (2, 2), (3, 3), (4, 1)) v(n, s);
insert into j8f_ids select 'r' || n, test_helpers.request_test_shop_review(pg_temp.id('c' || n), 'j8f-w' || n || '@local.test') from unnest(array[1, 4]) n;
select count(test_helpers.backdate_shop_review_request(pg_temp.id('r' || n), 15)) as overdue from unnest(array[1, 4]) n;
create function pg_temp.open(p_n int, p_expected text default 'suspended') returns public.certification_platform_reviews language plpgsql as $$
begin
  return public.open_certification_platform_review(pg_temp.id('c' || p_n), p_expected, 'Please review the shop decision on my certificate');
end $$;
create function pg_temp.open_sql(p_n int) returns text language sql stable as $$ select format('select pg_temp.open(%s)', p_n) $$;
create function pg_temp.mine(p_n int) returns text language sql stable
as $$ select row(r.can_open, r.basis)::text from public.my_certification_platform_reviews() r where r.certification_id = pg_temp.id('c' || p_n) $$;
create function pg_temp.move(p_n int, p_from text, p_to text) returns text language sql
as $$ select (public.transition_certification(pg_temp.id('c' || p_n), p_from, p_to, 'A reason that is long enough for this local test')).status $$;
select set_config('fx.not_yet', 'Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, '
                  || 'has not decided within 14 days, or can no longer decide.', true);

-- ---------- N2: reinstate during a WashLink review, then suspend again ----------
select test_helpers.act_as_worker('j8f-w1@local.test');
insert into j8f_ids values ('rv1', (pg_temp.open(1)).id);
select test_helpers.act_as_owner('j8f-o1@local.test');
select is(pg_temp.move(1, 'suspended', 'active'), 'active', 'w11_fix1_resuspend_after_shop_resolution_is_eligible');
select is(pg_temp.move(1, 'active', 'suspended'), 'suspended', 'w11_fix1_resuspend_after_shop_resolution_is_eligible');
select test_helpers.act_as_worker('j8f-w1@local.test');
select is(pg_temp.mine(1), '(t,resuspended_after_shop_resolution)', 'w11_fix1_resuspend_after_shop_resolution_is_eligible');
insert into j8f_ids select 'rv1b', r.id from pg_temp.open(1) r;
select test_helpers.act_as_service();
select is((select row(p.basis, p.status, p.escalated_from_request_id is null)::text from public.certification_platform_reviews p where p.id = pg_temp.id('rv1b')),
          '(resuspended_after_shop_resolution,open,t)', 'w11_fix1_resuspend_after_shop_resolution_is_eligible');
select is((select count(*)::int from public.certification_review_requests where certification_id = pg_temp.id('c1') and status = 'open'), 0,
          'w11_fix1_resuspend_after_shop_resolution_is_eligible');
-- More than 30 days between the shop resolution and the new suspension: no basis (TEST-ONLY shift of closed_at).
select test_helpers.act_as_worker('j8f-w4@local.test');
insert into j8f_ids select 'rv4', r.id from pg_temp.open(4) r;
select test_helpers.act_as_owner('j8f-o1@local.test');
select is(pg_temp.move(4, 'suspended', 'active'), 'active', 'w11_fix1_resuspend_after_30_days_not_eligible');
select test_helpers.act_as_service();
alter table public.certification_platform_reviews disable trigger certification_platform_reviews_guard_write;
update public.certification_platform_reviews set closed_at = closed_at - interval '31 days' where id = pg_temp.id('rv4');
alter table public.certification_platform_reviews enable trigger certification_platform_reviews_guard_write;
select test_helpers.act_as_owner('j8f-o1@local.test');
select is(pg_temp.move(4, 'active', 'suspended'), 'suspended', 'w11_fix1_resuspend_after_30_days_not_eligible');
select test_helpers.act_as_worker('j8f-w4@local.test');
select is(pg_temp.mine(4), '(f,)', 'w11_fix1_resuspend_after_30_days_not_eligible');
select throws_ok(pg_temp.open_sql(4), '23514', current_setting('fx.not_yet'), 'w11_fix1_resuspend_after_30_days_not_eligible');

-- ---------- N1: the deciding administrator's id is masked in the owner's raw W7 rows ----------
select test_helpers.act_as_admin('j8f-a1@local.test');
select is((public.decide_certification_platform_review(pg_temp.id('rv1b'), 1, 'reinstate', 'WashLink found the suspension unsupported')).status,
          'reinstated', 'w11_fix1_admin_id_masked_in_owner_raw_rows');
select test_helpers.act_as_owner('j8f-o1@local.test');
select is((select row(c.status, c.status_changed_by is null, c.status_changed_at is not null)::text from public.certifications c where c.id = pg_temp.id('c1')),
          '(active,t,t)', 'w11_fix1_admin_id_masked_in_owner_raw_rows');
select is((select string_agg(row(ev.event, ev.actor_id is null, ev.actor_role, ev.actor_display_name)::text, ';') from public.certification_status_events ev
           where ev.certification_id = pg_temp.id('c1') and ev.platform_review_id is not null),
          '(reinstated,t,super_admin,"WashLink review")', 'w11_fix1_admin_id_masked_in_owner_raw_rows');
select is((select count(*)::int from public.certification_status_events ev where ev.certification_id = pg_temp.id('c1')
           and ev.actor_id = pg_temp.fx('a1')), 0, 'w11_fix1_admin_id_masked_in_owner_raw_rows');
select test_helpers.act_as_service();
select is((select (p.decided_by = pg_temp.fx('a1'))::text || ',' || (select count(*) from public.workforce_audit_events e
             where e.action = 'certification_platform_review.decided' and e.actor_id = pg_temp.fx('a1') and e.subject_id = pg_temp.id('c1'))
           from public.certification_platform_reviews p where p.id = pg_temp.id('rv1b')), 'true,1', 'w11_fix1_decider_kept_in_review_and_audit');
-- An owner's own change is not masked.
select test_helpers.act_as_owner('j8f-o1@local.test');
select is(pg_temp.move(1, 'active', 'suspended'), 'suspended', 'w11_fix1_owner_change_not_masked');
select test_helpers.act_as_service();
select is((select (c.status_changed_by = pg_temp.id('o1'))::text || ',' || (select (ev.actor_id = pg_temp.id('o1'))::text from public.certification_status_events ev
             where ev.certification_id = c.id order by ev.id desc limit 1) from public.certifications c where c.id = pg_temp.id('c1')),
          'true,true', 'w11_fix1_owner_change_not_masked');

-- ---------- N8: removing the escalated shop request keeps the review (link set null) ----------
select is((select escalated_from_request_id from public.certification_platform_reviews where id = pg_temp.id('rv1')), pg_temp.id('r1'),
          'w11_fix1_escalated_request_removed_sets_link_null');
alter table public.certification_review_requests disable trigger certification_review_requests_guard_write;
delete from public.certification_review_requests where id = pg_temp.id('r1');
alter table public.certification_review_requests enable trigger certification_review_requests_guard_write;
select is((select row(status, escalated_from_request_id is null, revision)::text from public.certification_platform_reviews where id = pg_temp.id('rv1')),
          '(resolved_by_shop,t,2)', 'w11_fix1_escalated_request_removed_sets_link_null');
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('w1')), 'w11_fix1_escalated_request_removed_sets_link_null');
select is((select count(*)::int from public.certification_platform_reviews where certification_id = pg_temp.id('c1')), 0,
          'w11_fix1_escalated_request_removed_sets_link_null');

-- ---------- N5: at most 3 WashLink reviews per suspension / revocation event, withdrawn ones counting ----------
select test_helpers.act_as_admin('j8f-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = pg_temp.id('s2');
select test_helpers.act_as_worker('j8f-w2@local.test');
select is((select string_agg((public.withdraw_certification_platform_review((pg_temp.open(2)).id)).status, ',') from generate_series(1, 3)),
          'withdrawn,withdrawn,withdrawn', 'w11_fix1_review_cap_three_per_event');
select is(pg_temp.mine(2), '(f,issuer_unavailable)', 'w11_fix1_review_cap_three_per_event');
select throws_ok(pg_temp.open_sql(2), '23514', 'You can ask WashLink to review this decision at most 3 times.', 'w11_fix1_review_cap_three_per_event');
select test_helpers.act_as_service();
select is((select count(*)::int || ',' || count(distinct status_event_id) || ',' || bool_and(status_event_id = public.certification_platform_review_current_event(certification_id))
           from public.certification_platform_reviews where certification_id = pg_temp.id('c2')), '3,1,true', 'w11_fix1_review_cap_three_per_event');

-- ---------- C4: the stranded count skips certificates WashLink decided for the current event ----------
select lives_ok(format('delete from public.shops where id = %L', pg_temp.id('s3')), 'w11_fix1_stranded_count_skips_decided');
select test_helpers.act_as_worker('j8f-w3@local.test');
insert into j8f_ids select 'rv3', r.id from pg_temp.open(3) r;
select test_helpers.act_as_admin('j8f-a1@local.test');
select is((public.decide_certification_platform_review(pg_temp.id('rv3'), 1, 'uphold', 'WashLink checked the record and keeps it')).status, 'upheld',
          'w11_fix1_stranded_count_skips_decided');
-- c2 (issuer unavailable, 3 reviews used) stays counted; c3 (decided for this event) does not.
select is((select stranded_suspended_certification_count from public.admin_dashboard_summary()), 1, 'w11_fix1_stranded_count_skips_decided');

-- ---------- N4: admin dispute queue shows contract fields only while open ----------
select test_helpers.act_as_service();
insert into j8f_ids values ('k5', test_helpers.create_active_test_contract('j8f-o1@local.test', pg_temp.id('s1'), pg_temp.id('w5'), 'j8f-w5@local.test'));
insert into j8f_ids values ('d5', test_helpers.raise_test_contract_dispute(pg_temp.id('k5'), 'j8f-w5@local.test'));
select test_helpers.act_as_admin('j8f-a1@local.test');
select is((select row(q.contract_status is not null, q.effective_status is not null, q.shop_name_snapshot is not null)::text
           from public.admin_contract_dispute_queue('open') q where q.dispute_id = pg_temp.id('d5')), '(t,t,t)', 'w11_fix1_closed_dispute_queue_hides_contract');
select is((public.close_contract_dispute(pg_temp.id('d5'), 1, 'information_shared', 'WashLink shared where both parties can get help')).status, 'closed',
          'w11_fix1_closed_dispute_queue_hides_contract');
select is((select row(q.contract_id = pg_temp.id('k5'), q.contract_status, q.effective_status, q.shop_name_snapshot)::text
           from public.admin_contract_dispute_queue('closed') q where q.dispute_id = pg_temp.id('d5')), '(t,,,)', 'w11_fix1_closed_dispute_queue_hides_contract');

-- ---------- C5: open-openings count skips certification-required openings without a current certificate ----------
select test_helpers.act_as_service();
insert into j8f_ids values ('jt', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Fix1 trainees opening'))),
  ('jc', test_helpers.create_job_opening(pg_temp.id('s1'), 'Fix1 certified opening'));
update public.job_openings set applicant_requirement = 'certification_required' where id = pg_temp.id('jc');
select test_helpers.publish_job_opening(pg_temp.id('jc')) is not null as jc_published;
select test_helpers.act_as_worker('j8f-w6@local.test');
select is((select open_opening_count from public.my_worker_dashboard_summary()),
          (select count(*)::int from public.search_job_openings(p_applicant_requirement => 'trainees_welcome', p_limit => 50) s where s.my_application_status is null),
          'w11_fix1_worker_open_openings_only_applicable');
select test_helpers.act_as_worker('j8f-w7@local.test');
select is((select open_opening_count from public.my_worker_dashboard_summary()),
          (select count(*)::int from public.search_job_openings(p_limit => 50) s where s.my_application_status is null),
          'w11_fix1_worker_open_openings_only_applicable');
select test_helpers.act_as_service();

select * from finish();
rollback;
