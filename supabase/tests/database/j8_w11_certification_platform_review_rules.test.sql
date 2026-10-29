-- J8 (W11): the independent WashLink certification review (D-44, D-45; W11 PLAN P66, P67). Only the certificate worker
-- opens one, only on a basis (shop upheld within 30 days, no shop decision within 14 days, issuer unavailable); an
-- open shop request is withdrawn by the escalation; only a super_admin decides (reinstate without issuer verification,
-- expiry / snapshots unchanged; or uphold, certificate unchanged); one decision per suspension / revocation event.
-- Local Docker stack only; synthetic fixtures; backdating is a TEST-ONLY time shift (W7 R7 technique).
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j8r-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j8r-cu@local.test')::text, true);
create temporary table j8r_ids (label text primary key, id uuid) on commit drop;
grant all on j8r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j8r_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j8r_ids select 'o' || n, test_helpers.create_owner('j8r-o' || n || '@local.test') from generate_series(1, 6) n;
insert into j8r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j8r-w' || n || '@local.test')) from generate_series(1, 9) n;
insert into j8r_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 6) n;
select test_helpers.act_as_owner('j8r-o2@local.test');
select (public.set_shop_certification_validity(pg_temp.id('s2'), 1)).validity_months as s2_validity;
select test_helpers.act_as_service();
insert into j8r_ids select 'c' || v.n, test_helpers.issue_test_certification(pg_temp.id('s' || v.s), pg_temp.id('w' || v.n), 'j8r-o' || v.s || '@local.test')
from (values (1, 1), (2, 1), (3, 3), (4, 4), (5, 5), (6, 6), (7, 1), (8, 2)) v(n, s);
select count(test_helpers.suspend_test_certification(pg_temp.id('c' || v.n), 'j8r-o' || v.s || '@local.test')) as suspended
from (values (1, 1), (2, 1), (3, 3), (4, 4), (5, 5)) v(n, s);
insert into j8r_ids values ('r1', test_helpers.request_test_shop_review(pg_temp.id('c1'), 'j8r-w1@local.test'));
insert into j8r_ids values ('roster9', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('w9')));
select test_helpers.designate_trainer(c.program_id, pg_temp.id('roster9')) is not null as trainer_designated
from public.certifications c where c.id = pg_temp.id('c1');
select test_helpers.act_as_owner('j8r-o1@local.test');
select (public.decide_certification_review(pg_temp.id('r1'), 'uphold', 'The shop keeps the suspension after checking')).status as r1_status;
select test_helpers.act_as_owner('j8r-o6@local.test');
select (public.transition_certification(pg_temp.id('c6'), 'active', 'revoked', 'Revoked after a serious local test incident')).status as c6_status;
select test_helpers.act_as_service();
create function pg_temp.open(p_label text, p_expected text, p_statement text default 'Please review the shop decision on my certificate')
returns text language sql as $$ select (public.open_certification_platform_review(pg_temp.id(p_label), p_expected, p_statement)).basis $$;
create function pg_temp.open_sql(p_label text, p_expected text, p_statement text default 'Please review the shop decision on my certificate')
returns text language sql stable as $$ select format('select pg_temp.open(%L, %L, %L)', p_label, p_expected, p_statement) $$;
create function pg_temp.decide_sql(p_label text, p_revision int, p_decision text, p_reason text default 'WashLink checked the record and decided')
returns text language sql stable
as $$ select format('select public.decide_certification_platform_review(%L, %s, %L, %L)', pg_temp.id(p_label), p_revision, p_decision, p_reason) $$;
create function pg_temp.review(p_label text) returns public.certification_platform_reviews language sql stable security definer
as $$ select p from public.certification_platform_reviews p where p.certification_id = pg_temp.id(p_label) order by p.opened_at desc, p.created_at desc limit 1 $$;
create function pg_temp.save_review(p_cert text) returns uuid language sql
as $$ insert into j8r_ids values ('rv' || substr(p_cert, 2), (pg_temp.review(p_cert)).id) returning id $$;
select set_config('fx.not_yet', 'Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, '
                  || 'has not decided within 14 days, or can no longer decide.', true);

-- ---------- open after the shop upheld ----------
select test_helpers.act_as_worker('j8r-w1@local.test');
select is(pg_temp.open('c1', 'suspended'), 'upheld_by_shop', 'w11_worker_opens_review_after_shop_upheld');
select is((select row(r.can_open, r.basis, r.open_review_id is not null, r.latest_status)::text from public.my_certification_platform_reviews() r
           where r.certification_id = pg_temp.id('c1')), '(f,upheld_by_shop,t,open)', 'w11_worker_opens_review_after_shop_upheld');
select test_helpers.act_as_service();
select is((select row(r.status, r.revision, r.escalated_from_request_id is null, r.certification_status_at_open, r.worker_id = pg_temp.id('w1'))::text
           from pg_temp.review('c1') r), '(open,1,t,suspended,t)', 'w11_worker_opens_review_after_shop_upheld');
select pg_temp.save_review('c1') is not null as saved;
select test_helpers.act_as_worker('j8r-w1@local.test');
select throws_ok(pg_temp.open_sql('c1', 'suspended'), '23505', 'WashLink is already reviewing this certification.', 'w11_second_open_review_23505');

-- ---------- 14-day shop decision period ----------
select test_helpers.act_as_worker('j8r-w2@local.test');
select throws_ok(pg_temp.open_sql('c2', 'suspended'), '23514', current_setting('fx.not_yet'), 'w11_open_refused_before_shop_decides_within_14_days');
select test_helpers.act_as_service();
insert into j8r_ids values ('r2', test_helpers.request_test_shop_review(pg_temp.id('c2'), 'j8r-w2@local.test'));
select test_helpers.backdate_shop_review_request(pg_temp.id('r2'), 13) is not null as r2_backdated;
select test_helpers.act_as_worker('j8r-w2@local.test');
select throws_ok(pg_temp.open_sql('c2', 'suspended'), '23514', current_setting('fx.not_yet'), 'w11_open_refused_before_shop_decides_within_14_days');
select test_helpers.act_as_owner('j8r-o1@local.test');
select throws_ok(pg_temp.open_sql('c2', 'suspended'), '42501', 'Certification not found.', 'w11_open_refused_before_shop_decides_within_14_days');
select test_helpers.act_as_worker('j8r-w2@local.test');
select throws_ok(pg_temp.open_sql('c2', 'active'), '55000', 'This certification changed. Refresh and try again.', 'w11_open_stale_status_55000');
select throws_ok(pg_temp.open_sql('c2', 'revoked'), '55000', 'This certification changed. Refresh and try again.', 'w11_open_stale_status_55000');
select test_helpers.act_as_service();
select test_helpers.backdate_shop_review_request(pg_temp.id('r2'), 2) is not null as r2_backdated_again;
select test_helpers.act_as_worker('j8r-w2@local.test');
select is(pg_temp.open('c2', 'suspended'), 'shop_decision_overdue', 'w11_open_allowed_when_shop_request_overdue_and_withdraws_it');
select test_helpers.act_as_service();
select is((select status from public.certification_review_requests where id = pg_temp.id('r2')), 'withdrawn',
          'w11_open_allowed_when_shop_request_overdue_and_withdraws_it');
select is((pg_temp.review('c2')).escalated_from_request_id, pg_temp.id('r2'), 'w11_open_allowed_when_shop_request_overdue_and_withdraws_it');

-- ---------- issuer unavailable (D-46: no time window for a suspension) ----------
select test_helpers.backdate_certification(pg_temp.id('c3'), 60) is not null as c3_backdated;
select test_helpers.act_as_worker('j8r-w3@local.test');
select throws_ok(pg_temp.open_sql('c3', 'suspended'), '23514', current_setting('fx.not_yet'), 'w11_open_allowed_for_stranded_suspension_after_shop_removed');
select test_helpers.act_as_service();
select lives_ok(format('delete from public.shops where id = %L', pg_temp.id('s3')), 'w11_open_allowed_for_stranded_suspension_after_shop_removed');
select test_helpers.act_as_worker('j8r-w3@local.test');
select throws_ok(pg_temp.open_sql('c3', 'suspended', 'Too short'), '23514', 'Write a statement of 20 to 1000 characters.', 'w11_statement_length_23514');
select throws_ok(pg_temp.open_sql('c3', 'suspended', repeat('x', 1001)), '23514', 'Write a statement of 20 to 1000 characters.', 'w11_statement_length_23514');
select throws_ok(pg_temp.open_sql('c3', 'suspended', '    '), '23514', 'Write a statement of 20 to 1000 characters.', 'w11_statement_length_23514');
select is(pg_temp.open('c3', 'suspended'), 'issuer_unavailable', 'w11_open_allowed_for_stranded_suspension_after_shop_removed');
select test_helpers.act_as_service();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('o4')), 'w11_open_allowed_when_owner_account_removed');
select is((select owner_id is null from public.certifications where id = pg_temp.id('c4')), true, 'w11_open_allowed_when_owner_account_removed');
select test_helpers.act_as_worker('j8r-w4@local.test');
select is(pg_temp.open('c4', 'suspended'), 'issuer_unavailable', 'w11_open_allowed_when_owner_account_removed');
select test_helpers.act_as_admin('j8r-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id in (pg_temp.id('s5'), pg_temp.id('s6'));
select test_helpers.act_as_worker('j8r-w5@local.test');
select is(pg_temp.open('c5', 'suspended'), 'issuer_unavailable', 'w11_open_allowed_when_issuer_lost_verification');
select test_helpers.act_as_service();
select test_helpers.backdate_certification(pg_temp.id('c6'), 40) is not null as c6_backdated;
select test_helpers.act_as_worker('j8r-w6@local.test');
select throws_ok(pg_temp.open_sql('c6', 'revoked'), '23514', current_setting('fx.not_yet'), 'w11_revoked_issuer_unavailable_needs_30_day_window');
select test_helpers.act_as_service();
select test_helpers.backdate_certification(pg_temp.id('c6'), -20) is not null as c6_moved_forward;
select test_helpers.act_as_worker('j8r-w6@local.test');
select is(pg_temp.open('c6', 'revoked'), 'issuer_unavailable', 'w11_revoked_issuer_unavailable_needs_30_day_window');
select test_helpers.act_as_service();
select pg_temp.save_review('c' || n) is not null as saved from generate_series(2, 6) n;

-- ---------- active / superseded ----------
select test_helpers.act_as_worker('j8r-w7@local.test');
select throws_ok(pg_temp.open_sql('c7', 'active'), '23514', 'Only a suspended or revoked certification can be reviewed.', 'w11_open_refused_for_active_or_superseded');
select test_helpers.act_as_owner('j8r-o2@local.test');
select (public.renew_certification(pg_temp.id('c8'), (public.record_certification_reassessment(pg_temp.id('c8'), array[true, true], 'passed')).id,
                                   'w7_issuer_v1')).status as c8_renewed;
select test_helpers.act_as_worker('j8r-w8@local.test');
select throws_ok(pg_temp.open_sql('c8', 'superseded'), '23514', 'Only a suspended or revoked certification can be reviewed.',
                 'w11_open_refused_for_active_or_superseded');
select is((select count(*)::int from public.my_certification_platform_reviews()), 0, 'w11_open_refused_for_active_or_superseded');

-- ---------- decisions: super_admin only ----------
select set_config('fx.admin_only', 'Only a platform administrator can decide WashLink reviews.', true);
select test_helpers.act_as_owner('j8r-o1@local.test');
select throws_ok(pg_temp.decide_sql('rv1', 1, 'reinstate'), '42501', current_setting('fx.admin_only'), 'w11_owner_worker_trainer_customer_cannot_decide');
select test_helpers.act_as_worker('j8r-w1@local.test');
select throws_ok(pg_temp.decide_sql('rv1', 1, 'reinstate'), '42501', current_setting('fx.admin_only'), 'w11_owner_worker_trainer_customer_cannot_decide');
select test_helpers.act_as_worker('j8r-w9@local.test');
select throws_ok(pg_temp.decide_sql('rv1', 1, 'reinstate'), '42501', current_setting('fx.admin_only'), 'w11_owner_worker_trainer_customer_cannot_decide');
select test_helpers.act_as_customer('j8r-cu@local.test');
select throws_ok(pg_temp.decide_sql('rv1', 1, 'reinstate'), '42501', current_setting('fx.admin_only'), 'w11_owner_worker_trainer_customer_cannot_decide');
select test_helpers.act_as_admin('j8r-a1@local.test');
select throws_ok(pg_temp.decide_sql('rv1', 2, 'uphold'), '55000', 'This review changed. Refresh and try again.', 'w11_decide_stale_revision_55000');
select throws_ok(pg_temp.decide_sql('rv1', 1, 'uphold', 'Too short'), '23514', 'Give a reason of 20 to 500 characters.',
                 'w11_decide_reason_23514_and_decision_22023');
select throws_ok(pg_temp.decide_sql('rv1', 1, 'revoke'), '22023', 'Choose reinstate or uphold.', 'w11_decide_reason_23514_and_decision_22023');
select throws_ok(pg_temp.decide_sql('rv1', 1, null), '22023', 'Choose reinstate or uphold.', 'w11_decide_reason_23514_and_decision_22023');
select test_helpers.act_as_service();
select set_config('fx.c1_before', (select md5(to_jsonb(c)::text) from public.certifications c where c.id = pg_temp.id('c1')), true);
select set_config('fx.c5_before', (select md5((to_jsonb(c) - array['status', 'status_reason', 'status_changed_at', 'status_changed_by', 'updated_at'])::text)
                                   from public.certifications c where c.id = pg_temp.id('c5')), true);
select test_helpers.act_as_admin('j8r-a1@local.test');
select is((public.decide_certification_platform_review(pg_temp.id('rv1'), 1, 'uphold', 'WashLink checked the record and keeps it')).status, 'upheld',
          'w11_super_admin_upholds_certificate_unchanged');
select is((public.decide_certification_platform_review(pg_temp.id('rv5'), 1, 'reinstate', 'WashLink found the suspension unsupported')).status,
          'reinstated', 'w11_super_admin_reinstates_without_issuer_verification');
select throws_ok(pg_temp.decide_sql('rv1', 2, 'uphold'), '23514', 'This review is no longer open.', 'w11_decide_stale_revision_55000');
select test_helpers.act_as_service();
select is((select md5(to_jsonb(c)::text) from public.certifications c where c.id = pg_temp.id('c1')), current_setting('fx.c1_before'),
          'w11_super_admin_upholds_certificate_unchanged');
select is((select row(status, status_reason is null, public.shop_has_recorded_verification(pg_temp.id('s5')))::text from public.certifications
           where id = pg_temp.id('c5')), '(active,t,f)', 'w11_super_admin_reinstates_without_issuer_verification');
select is((select md5((to_jsonb(c) - array['status', 'status_reason', 'status_changed_at', 'status_changed_by', 'updated_at'])::text)
           from public.certifications c where c.id = pg_temp.id('c5')), current_setting('fx.c5_before'), 'w11_reinstate_keeps_expiry_and_snapshots');
select is((select row((pg_temp.review('c5')).revision, (pg_temp.review('c5')).decided_by = pg_temp.fx('a1'), (pg_temp.review('c5')).closed_at is null)::text),
          '(2,t,t)', 'w11_reinstate_keeps_expiry_and_snapshots');

-- ---------- one decision per event ----------
select test_helpers.act_as_worker('j8r-w1@local.test');
select throws_ok(pg_temp.open_sql('c1', 'suspended'), '23514', 'WashLink already reviewed this decision.', 'w11_already_decided_event_refused');
select is((select row(r.can_open, r.latest_status, r.latest_decision_reason)::text from public.my_certification_platform_reviews() r
           where r.certification_id = pg_temp.id('c1')), '(f,upheld,"WashLink checked the record and keeps it")', 'w11_already_decided_event_refused');

-- ---------- status history ----------
select test_helpers.act_as_service();
select is((select array_agg(ev.event || ',' || ev.from_status || ',' || ev.to_status || ',' || ev.actor_display_name || ',' || ev.actor_role order by ev.id)
           from public.certification_status_events ev where ev.platform_review_id in (pg_temp.id('rv1'), pg_temp.id('rv5'))),
          array['review_upheld,suspended,suspended,WashLink review,super_admin', 'reinstated,suspended,active,WashLink review,super_admin'],
          'w11_status_event_labelled_washlink_review');
select test_helpers.act_as_worker('j8r-w5@local.test');
select is((select h.actor_display_name || ',' || h.to_status from public.certification_history(pg_temp.id('c5')) h
           where h.entry_kind = 'status_event' order by h.occurred_at desc, h.entry_id desc limit 1), 'WashLink review,active',
          'w11_status_event_labelled_washlink_review');
select is((select count(*)::int from public.my_certification_platform_reviews() r, unnest(array[r.basis, r.latest_status]) v
           where v ~* 'admin|j8r'), 0, 'w11_status_event_labelled_washlink_review');

-- ---------- withdraw ----------
select test_helpers.act_as_worker('j8r-w5@local.test');
select throws_ok(format('select public.withdraw_certification_platform_review(%L)', pg_temp.id('rv4')), '42501', 'WashLink review not found.',
                 'w11_worker_withdraws_open_review');
select test_helpers.act_as_worker('j8r-w4@local.test');
select is((public.withdraw_certification_platform_review(pg_temp.id('rv4'))).status, 'withdrawn', 'w11_worker_withdraws_open_review');
select throws_ok(format('select public.withdraw_certification_platform_review(%L)', pg_temp.id('rv4')), '23514', 'This review is no longer open.',
                 'w11_worker_withdraws_open_review');
select test_helpers.act_as_service();
select is((select row(status, closed_at is not null, decided_at is null, revision)::text from public.certification_platform_reviews
           where id = pg_temp.id('rv4')), '(withdrawn,t,t,2)', 'w11_worker_withdraws_open_review');

select * from finish();
rollback;
