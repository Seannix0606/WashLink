-- J8 (W11): holds while a WashLink review is open (D-46; W11 PLAN P68). The issuing owner cannot revoke and the worker
-- cannot open a shop review request (23514); an owner reinstatement closes the WashLink review as resolved_by_shop; the
-- holds lift after a decision or a withdrawal. The holds are NEW triggers: every W7 function body is still exactly the
-- body its W7 migration created (compared with the statements recorded in supabase_migrations.schema_migrations).
-- Local Docker stack only; backdating a shop request is a TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j8h-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j8h-o1@local.test')::text, true);
create temporary table j8h_ids (label text primary key, id uuid) on commit drop;
grant all on j8h_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j8h_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j8h_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1')));
insert into j8h_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j8h-w' || n || '@local.test')) from generate_series(1, 3) n;
insert into j8h_ids select 'c' || n, test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('w' || n), 'j8h-o1@local.test')
from generate_series(1, 3) n;
select count(test_helpers.suspend_test_certification(pg_temp.id('c' || n), 'j8h-o1@local.test')) as suspended from generate_series(1, 3) n;
insert into j8h_ids select 'r' || n, test_helpers.request_test_shop_review(pg_temp.id('c' || n), 'j8h-w' || n || '@local.test') from generate_series(1, 3) n;
select count(test_helpers.backdate_shop_review_request(pg_temp.id('r' || n), 15)) as backdated from generate_series(1, 3) n;
create function pg_temp.open(p_n int) returns uuid language plpgsql as $$
begin
  perform test_helpers.act_as_worker('j8h-w' || p_n || '@local.test');
  insert into j8h_ids values ('rv' || p_n, (public.open_certification_platform_review(pg_temp.id('c' || p_n), 'suspended',
                                             'Please review the shop decision on my certificate')).id);
  perform test_helpers.act_as_service();
  return pg_temp.id('rv' || p_n);
end $$;
select count(pg_temp.open(n)) as opened from generate_series(1, 3) n;
create function pg_temp.move_sql(p_label text, p_from text, p_to text) returns text language sql stable
as $$ select format('select public.transition_certification(%L, %L, %L, %L)', pg_temp.id(p_label), p_from, p_to, 'A reason that is long enough here') $$;
create function pg_temp.review_status(p_label text) returns text language sql stable security definer
as $$ select status || ',' || (closed_at is not null) || ',' || revision from public.certification_platform_reviews where id = pg_temp.id(p_label) $$;
select set_config('fx.hold', 'WashLink is reviewing this certification. Wait for its decision.', true);

-- ---------- holds ----------
select test_helpers.act_as_owner('j8h-o1@local.test');
select throws_ok(pg_temp.move_sql('c1', 'suspended', 'revoked'), '23514', current_setting('fx.hold'), 'w11_owner_revoke_refused_while_review_open');
select test_helpers.act_as_service();
select is((select status from public.certifications where id = pg_temp.id('c1')), 'suspended', 'w11_owner_revoke_refused_while_review_open');
select is(pg_temp.review_status('rv1'), 'open,false,1', 'w11_owner_revoke_refused_while_review_open');
select test_helpers.act_as_worker('j8h-w1@local.test');
select throws_ok(format('select public.request_certification_review(%L, %L)', pg_temp.id('c1'), 'Please review this decision once more'),
                 '23514', current_setting('fx.hold'), 'w11_worker_shop_request_refused_while_review_open');
select test_helpers.act_as_service();
select is((select count(*)::int || ',' || count(*) filter (where status = 'open') from public.certification_review_requests
           where certification_id = pg_temp.id('c1')), '1,0', 'w11_worker_shop_request_refused_while_review_open');
select throws_ok(format($s$ select test_helpers.request_test_shop_review(%L, 'j8h-w1@local.test') $s$, pg_temp.id('c1')), '23514',
                 current_setting('fx.hold'), 'w11_worker_shop_request_refused_while_review_open');

-- ---------- owner reinstatement resolves the review ----------
select test_helpers.act_as_owner('j8h-o1@local.test');
select is((public.transition_certification(pg_temp.id('c2'), 'suspended', 'active', 'The shop checked again and reinstates it')).status, 'active',
          'w11_owner_reinstate_resolves_review_by_shop');
select test_helpers.act_as_service();
select is(pg_temp.review_status('rv2'), 'resolved_by_shop,true,2', 'w11_owner_reinstate_resolves_review_by_shop');
select is((select decided_by is null and decision_reason is null from public.certification_platform_reviews where id = pg_temp.id('rv2')), true,
          'w11_owner_reinstate_resolves_review_by_shop');
select test_helpers.act_as_worker('j8h-w2@local.test');
select is((select row(r.open_review_id, r.latest_status)::text from public.my_certification_platform_reviews() r where r.certification_id = pg_temp.id('c2')),
          '(,resolved_by_shop)', 'w11_owner_reinstate_resolves_review_by_shop');

-- ---------- holds lift after a decision or a withdrawal ----------
select test_helpers.act_as_admin('j8h-a1@local.test');
select is((public.decide_certification_platform_review(pg_temp.id('rv1'), 1, 'uphold', 'WashLink checked the record and keeps it')).status, 'upheld',
          'w11_holds_lift_after_decision_or_withdrawal');
select test_helpers.act_as_owner('j8h-o1@local.test');
select is((public.transition_certification(pg_temp.id('c1'), 'suspended', 'revoked', 'Revoked after the review was completed')).status, 'revoked',
          'w11_holds_lift_after_decision_or_withdrawal');
select test_helpers.act_as_worker('j8h-w3@local.test');
select is((public.withdraw_certification_platform_review(pg_temp.id('rv3'))).status, 'withdrawn', 'w11_holds_lift_after_decision_or_withdrawal');
select is((public.request_certification_review(pg_temp.id('c3'), 'Please review this decision once more')).status, 'open',
          'w11_holds_lift_after_decision_or_withdrawal');
select test_helpers.act_as_owner('j8h-o1@local.test');
select is((public.transition_certification(pg_temp.id('c3'), 'suspended', 'revoked', 'Revoked after the review was withdrawn')).status, 'revoked',
          'w11_holds_lift_after_decision_or_withdrawal');

-- ---------- no W7 function body replaced ----------
select test_helpers.act_as_service();
create temporary table j8h_w7 on commit drop as
  select p.oid, p.proname from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('transition_certification', 'request_certification_review',
    'withdraw_certification_review', 'decide_certification_review', 'certifications_guard_write', 'certification_review_requests_guard_write',
    'certification_status_events_guard_write', 'certifications_audit', 'certification_review_requests_audit', 'lock_certification_for_owner',
    'my_certifications', 'certification_history', 'owner_certifications', 'issue_certification', 'renew_certification');
select is((select count(*)::int from j8h_w7 f where exists (
             select 1 from supabase_migrations.schema_migrations m, unnest(m.statements) st
             where m.name like 'w7%' and strpos(st, (select p.prosrc from pg_proc p where p.oid = f.oid)) > 0)),
          15, 'w11_no_w7_function_body_replaced');
select is((select count(*)::int from supabase_migrations.schema_migrations m, unnest(m.statements) st
           where m.name like 'w11%' and st ~* 'create (or replace )?function public\.(transition_certification|request_certification_review|withdraw_certification_review|decide_certification_review|certifications_guard_write|certification_review_requests_guard_write|certification_status_events_guard_write|certifications_audit|certification_review_requests_audit)\('),
          0, 'w11_no_w7_function_body_replaced');
select is((select array_agg(t.tgrelid::regclass::text || ':' || t.tgname order by t.tgrelid::regclass::text collate "C", t.tgname collate "C") from pg_trigger t
           where not t.tgisinternal and t.tgrelid in ('public.certifications'::regclass, 'public.certification_review_requests'::regclass,
                                                      'public.certification_status_events'::regclass)),
          array['certification_review_requests:certification_review_requests_audit', 'certification_review_requests:certification_review_requests_guard_write',
                'certification_review_requests:certification_review_requests_platform_hold',
                'certification_status_events:certification_status_events_guard_write',
                'certification_status_events:certification_status_events_zz_platform_review_mask', 'certifications:certifications_audit',
                'certifications:certifications_guard_write', 'certifications:certifications_normalize',
                'certifications:certifications_platform_review_hold', 'certifications:certifications_platform_review_resolve',
                'certifications:certifications_zz_platform_review_mask'],
          'w11_no_w7_function_body_replaced');

select * from finish();
rollback;
