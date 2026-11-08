-- J17 (W13): super_admin audit reads only through the audited RPC (W13 PLAN 3.2, section 6 test 3; D-70; closes W14 N1).
-- The W3 raw select policy is gone: every client role (super_admin included) reads 0 rows from workforce_audit_events;
-- the review-log view is denied (42501) to every client role and stays readable by trusted SQL; admin_workforce_audit_log
-- returns rows and records workforce_audit.log_searched; my_workforce_activity is unchanged; the only select policy is
-- deny-all; audit rows stay append-only. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temporary table j17w13_ids (label text primary key, id uuid) on commit drop;
grant all on j17w13_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17w13_ids where label = p_label $$;
insert into j17w13_ids values ('a1', test_helpers.create_super_admin('j17w13-a1@local.test'));
insert into j17w13_ids values ('o1', test_helpers.create_owner('j17w13-o1@local.test'));
insert into j17w13_ids values ('w1', test_helpers.create_worker('j17w13-w1@local.test'));
insert into j17w13_ids values ('c1', test_helpers.create_customer('j17w13-c1@local.test'));
insert into j17w13_ids values ('s1', test_helpers.create_shop(pg_temp.id('o1'), 'pending'));
select test_helpers.act_as_admin('j17w13-a1@local.test');
update public.shops set verification_status = 'approved' where id = pg_temp.id('s1');
select test_helpers.act_as_service();
select set_config('fx.decided', (select id::text from public.workforce_audit_events
                                 where subject_id = pg_temp.id('s1') and action = 'shop.verification_decided'), true);
create function pg_temp.view_read() returns text language sql as $$
  select test_helpers.attempt('select count(*) from public.shop_verification_review_log') $$;

-- ---------- raw table: 0 rows for super_admin ----------
select ok((select count(*) from public.workforce_audit_events) > 0, 'w13_super_admin_raw_audit_select_returns_zero_rows');
select test_helpers.act_as_admin('j17w13-a1@local.test');
select is((select count(*)::int from public.workforce_audit_events), 0, 'w13_super_admin_raw_audit_select_returns_zero_rows');
select is((select count(*)::int from public.workforce_audit_events where id = current_setting('fx.decided')::bigint), 0,
          'w13_super_admin_raw_audit_select_returns_zero_rows');

-- ---------- review-log view: 42501 for every client role ----------
select is(pg_temp.view_read(), '42501', 'w13_review_log_view_denied_42501_for_every_client');
select test_helpers.act_as_owner('j17w13-o1@local.test');
select is(pg_temp.view_read(), '42501', 'w13_review_log_view_denied_42501_for_every_client');
select test_helpers.act_as_worker('j17w13-w1@local.test');
select is(pg_temp.view_read(), '42501', 'w13_review_log_view_denied_42501_for_every_client');
select test_helpers.act_as_customer('j17w13-c1@local.test');
select is(pg_temp.view_read(), '42501', 'w13_review_log_view_denied_42501_for_every_client');
select test_helpers.act_as_anon();
select is(pg_temp.view_read(), '42501', 'w13_review_log_view_denied_42501_for_every_client');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('role', 'service_role', true);
select throws_ok('select count(*) from public.shop_verification_review_log', '42501', null, 'w13_review_log_view_denied_42501_for_every_client');
select set_config('role', 'none', true);
select test_helpers.act_as_service();

-- ---------- trusted SQL still reads the view ----------
select is((select jsonb_build_object('event_id', event_id, 'to_status', to_status, 'reviewed_by', reviewed_by)
           from public.shop_verification_review_log where shop_id = pg_temp.id('s1')),
          jsonb_build_object('event_id', current_setting('fx.decided')::bigint, 'to_status', 'approved', 'reviewed_by', pg_temp.id('a1')),
          'w13_review_log_view_readable_by_trusted_sql');

-- ---------- the audited RPC returns rows and records the search first ----------
select set_config('fx.searches', (select count(*)::text from public.workforce_audit_events where action = 'workforce_audit.log_searched'), true);
create temporary table j17w13_log (event_id bigint, action text) on commit drop;
grant all on j17w13_log to public;
select test_helpers.act_as_admin('j17w13-a1@local.test');
insert into j17w13_log select l.event_id, l.action
  from public.admin_workforce_audit_log(null, 'shop', pg_temp.id('s1'), null, null, null, null, null, 50) l;
select is((select string_agg(action, ',' order by event_id) from j17w13_log), 'shop.verification_decided',
          'w13_admin_audit_log_returns_rows_and_records_search');
select test_helpers.act_as_owner('j17w13-o1@local.test');
select is(test_helpers.attempt('select count(*) from public.admin_workforce_audit_log()'), '42501',
          'w13_admin_audit_log_returns_rows_and_records_search');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events where action = 'workforce_audit.log_searched'),
          current_setting('fx.searches')::int + 1, 'w13_admin_audit_log_returns_rows_and_records_search');
select is((select jsonb_build_object('actor_id', actor_id, 'subject_id', payload ->> 'subject_id', 'subject_type', payload ->> 'subject_type',
                                     'result_count', payload -> 'result_count')
           from public.workforce_audit_events where action = 'workforce_audit.log_searched' order by id desc limit 1),
          jsonb_build_object('actor_id', pg_temp.id('a1'), 'subject_id', pg_temp.id('s1')::text, 'subject_type', 'shop', 'result_count', 1),
          'w13_admin_audit_log_returns_rows_and_records_search');

-- ---------- my_workforce_activity unchanged (definer, own events) ----------
select test_helpers.act_as_owner('j17w13-o1@local.test');
select ok((select bool_or(action = 'shop.verification_decided') from public.my_workforce_activity(null, 100)),
          'w13_my_workforce_activity_unchanged');
select test_helpers.act_as_service();
select is((select prosecdef::text || ':' || coalesce(obj_description(oid, 'pg_proc'), '') from pg_proc
           where oid = 'public.my_workforce_activity(bigint, integer)'::regprocedure),
          'true:W14: job opening moderation, unreviewed approved shops, relationship lookups and audit reads (created by the W14 migrations).',
          'w13_my_workforce_activity_unchanged');

-- ---------- policies: the only select policy is deny-all ----------
select is((select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, with_check, ''), ',' order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'workforce_audit_events'),
          'wae_no_client_delete:DELETE:false,wae_no_client_insert:INSERT:false,wae_no_client_select:SELECT:false,wae_no_client_update:UPDATE:false',
          'w13_audit_table_select_policies_are_deny_all');
select ok((select relrowsecurity from pg_class where oid = 'public.workforce_audit_events'::regclass)
          and not has_table_privilege('anon', 'public.workforce_audit_events', 'select')
          and not has_table_privilege('authenticated', 'public.shop_verification_review_log', 'select')
          and not has_table_privilege('service_role', 'public.shop_verification_review_log', 'select'),
          'w13_audit_table_select_policies_are_deny_all');

-- ---------- append-only ----------
select test_helpers.act_as_admin('j17w13-a1@local.test');
select is(test_helpers.attempt(format('update public.workforce_audit_events set action = %L where id = %s', 'test.tampered',
                                      current_setting('fx.decided'))), '42501', 'w13_audit_rows_still_append_only');
select is(test_helpers.attempt(format('delete from public.workforce_audit_events where id = %s', current_setting('fx.decided'))), '42501',
          'w13_audit_rows_still_append_only');
select test_helpers.act_as_service();
select is(test_helpers.attempt(format('update public.workforce_audit_events set action = %L where id = %s', 'test.tampered',
                                      current_setting('fx.decided'))), '42501', 'w13_audit_rows_still_append_only');

-- ---------- W13 S1: the deny-all select policy is RESTRICTIVE and holds against a planted permissive policy ----------
select is((select permissive || ':' || array_to_string(roles, ',') from pg_policies
           where schemaname = 'public' and tablename = 'workforce_audit_events' and policyname = 'wae_no_client_select'),
          'RESTRICTIVE:authenticated', 'w13_audit_select_deny_all_is_restrictive');
-- TEST-ONLY: an unknown production-style permissive select policy, planted inside this rolled-back transaction.
create policy "j17w13_planted_permissive_select" on public.workforce_audit_events for select to authenticated using (true);
select test_helpers.act_as_admin('j17w13-a1@local.test');
select is((select count(*)::int from public.workforce_audit_events), 0, 'w13_audit_select_deny_all_is_restrictive');
select test_helpers.act_as_owner('j17w13-o1@local.test');
select is((select count(*)::int from public.workforce_audit_events), 0, 'w13_audit_select_deny_all_is_restrictive');
-- The audited definer RPC is unaffected (it runs as the table owner).
select test_helpers.act_as_admin('j17w13-a1@local.test');
select is((select string_agg(l.action, ',') from public.admin_workforce_audit_log(null, 'shop', pg_temp.id('s1'), null, null, null, null, null, 50) l
           where l.action = 'shop.verification_decided'), 'shop.verification_decided', 'w13_audit_select_deny_all_is_restrictive');
select test_helpers.act_as_service();
drop policy "j17w13_planted_permissive_select" on public.workforce_audit_events;

select * from finish();
rollback;
