-- J17 / spec I (W12): the notification category registry (W12 PLAN 3.2, P80, D-61). The registry holds exactly the 37
-- categories the W3..W14 producers emit, with their key prefixes and subject types; a scan of every producer body fails
-- this file when a producer emits a category, category family or key prefix the registry lacks (R1 / R2: an
-- unregistered notice can never be dropped silently in tests). Every insert must match the registry (23514), after the
-- W3 writer guard (42501 first); enqueue_notification_safely skips a mismatch and the business action still succeeds;
-- external delivery is fixed to never; the registry is not client readable / writable, changed only by trusted SQL and
-- not in Realtime; W4, W8 and W10 actions notify nobody. The `test.*` rows are the LOCAL TEST BASELINE registration of
-- the W3 writer tests (test_helpers_scheduling.sql), never a migration. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------- fixtures ----------
create temporary table j17r_ids (label text primary key, id uuid) on commit drop;
grant all on j17r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17r_ids where label = p_label $$;
insert into j17r_ids values ('a1', test_helpers.create_super_admin('j17r-a1@local.test'));
insert into j17r_ids values ('o1', test_helpers.create_owner('j17r-o1@local.test'));
insert into j17r_ids values ('w1', test_helpers.create_worker_profile(test_helpers.create_worker('j17r-w1@local.test')));
insert into j17r_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
create function pg_temp.notes() returns integer language sql stable security definer as $$ select count(*)::int from public.notifications $$;

-- Expected registry (copied from the producers; any drift fails here).
create temporary table j17r_expected (category text, src text, prefixes text[], subjects text[], kind text) on commit drop;
insert into j17r_expected values
  ('shop_verification.status_changed', 'W3', '{shop_verification}', '{shop}', 'owner'), ('roster.linked', 'W3', '{roster_link}', '{roster_entry}', 'owner'),
  ('roster.unlinked', 'W3', '{roster_link}', '{roster_entry}', 'either_party'),
  ('job_application.submitted', 'W5', '{job_application}', '{job_application}', 'owner'),
  ('job_application.status_changed', 'W5', '{job_application}', '{job_application}', 'worker'),
  ('job_application.withdrawn', 'W5', '{job_application}', '{job_application}', 'owner'),
  ('job_application.closed', 'W5', '{job_application}', '{job_application}', 'worker'),
  ('job_application.removed', 'W5', '{job_application}', '{job_opening,job_application}', 'either_party'),
  ('job_opening.paused', 'W5', '{job_opening}', '{job_application}', 'worker'),
  ('training.schedule_changed', 'W6', '{training_schedule}', '{training_enrollment}', 'worker'),
  ('training.trainer_role', 'W6', '{training_trainer}', '{training_program}', 'trainer'),
  ('training.invited', 'W6', '{training_invite}', '{training_enrollment}', 'worker'),
  ('training.response', 'W6', '{training_response}', '{training_enrollment}', 'owner'),
  ('training.cancelled', 'W6', '{training_cancel}', '{training_enrollment}', 'worker'),
  ('training.record_corrected', 'W6', '{training_attendance,training_assessment}', '{training_enrollment}', 'worker'),
  ('training.assessment', 'W6', '{training_assessment}', '{training_enrollment}', 'either_party'),
  ('certification.issued', 'W7', '{certification}', '{certification}', 'worker'), ('certification.renewed', 'W7', '{certification}', '{certification}', 'worker'),
  ('certification.suspended', 'W7', '{certification}', '{certification}', 'worker'), ('certification.revoked', 'W7', '{certification}', '{certification}', 'worker'),
  ('certification.reinstated', 'W7', '{certification}', '{certification}', 'worker'),
  ('certification.review_requested', 'W7', '{certification}', '{certification}', 'owner'),
  ('certification.review_decided', 'W7', '{certification}', '{certification}', 'worker'),
  ('certification.training_record_changed', 'W7', '{certification}', '{certification}', 'owner'),
  ('certification.expiring', 'W7', '{certification_expiry}', '{certification}', 'worker'),
  ('certification.expired', 'W7', '{certification_expiry}', '{certification}', 'worker'),
  ('worker_contract', 'W9', '{worker_contract}', '{worker_contract}', 'either_party'),
  ('certification_platform_review.opened', 'W11', '{certification_platform_review}', '{certification}', 'owner'),
  ('certification_platform_review.decided', 'W11', '{certification_platform_review}', '{certification}', 'either_party'),
  ('worker_contract_dispute.raised', 'W11', '{contract_dispute}', '{worker_contract}', 'either_party'),
  ('worker_contract_dispute.closed', 'W11', '{contract_dispute}', '{worker_contract}', 'either_party'),
  ('job_opening_moderation.paused', 'W14', '{job_opening_moderation}', '{job_opening}', 'owner'),
  ('job_opening_moderation.closed', 'W14', '{job_opening_moderation}', '{job_opening}', 'owner'),
  ('job_opening_moderation.pause_kept', 'W14', '{job_opening_moderation}', '{job_opening}', 'owner'),
  ('job_opening_moderation.lifted', 'W14', '{job_opening_moderation}', '{job_opening}', 'owner'),
  ('job_opening_report.closed', 'W14', '{job_opening_report}', '{job_opening}', 'reporter'),
  ('shop_verification.rereviewed', 'W14', '{shop_rereview}', '{shop}', 'owner');

-- Producer scan: every function body that calls enqueue_notification(_safely) (the writers themselves excluded).
-- Literal second arguments, `'family.' || ...` families, `category := case ... end` literals and key prefixes.
create temporary table j17r_scan (kind text, value text, fn text) on commit drop;
insert into j17r_scan
with producers as (
  select p.oid::regprocedure::text as fn, p.prosrc from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosrc ~ 'enqueue_notification(_safely)?\('
    and p.proname not in ('enqueue_notification', 'enqueue_notification_safely')
), calls as (
  select fn, prosrc, split_part(c.chunk, ');', 1) as call
  from producers, regexp_split_to_table(prosrc, 'enqueue_notification(_safely)?\(') with ordinality as c(chunk, n) where c.n > 1
), args as (
  select fn, prosrc, call, (regexp_match(call, '^\s*[^,]+,\s*([^,]+?)\s*,'))[1] as arg from calls
)
select 'category', (regexp_match(arg, '^''([a-z_]+(\.[a-z_]+)*)''$'))[1], fn from args
union all select 'family', (regexp_match(arg, '^''([a-z_]+\.)''\s*\|\|'))[1], fn from args
union all
select 'category', m[1], fn from args,
  regexp_matches(coalesce((regexp_match(prosrc, arg || '\s*:=\s*(case.*?end)\s*;'))[1], ''), '''([a-z_]+\.[a-z_]+)''', 'g') as m
where arg ~ '^[a-z_]+$'
union all select 'key', m[1], fn from calls, regexp_matches(call, '(?:format\(\s*''|'')([a-z_]+):(?:%s|''\s*\|\|)', 'g') as m
union all select 'key', m[1], fn from producers, regexp_matches(prosrc, '[a-z_]*key\s*:=\s*format\(\s*''([a-z_]+):', 'g') as m;
delete from j17r_scan where value is null;
grant all on j17r_expected, j17r_scan to public;

-- ---------- 1) the registry matches the producers ----------
select is((select count(*)::int from public.notification_categories where category !~ '^test\.'), 37, 'w12_registry_has_37_categories_matching_producers');
select is((select count(*)::int from (
             (select category, source_increment, key_prefixes, subject_types, recipient_kind from public.notification_categories where category !~ '^test\.'
              except select * from j17r_expected)
             union all
             (select * from j17r_expected
              except select category, source_increment, key_prefixes, subject_types, recipient_kind from public.notification_categories)) d), 0,
          'w12_registry_has_37_categories_matching_producers');
select is((select count(distinct value)::int || ',' || (select count(distinct value) from j17r_scan where kind = 'family')
                  || ',' || (select count(distinct value) from j17r_scan where kind = 'key')
           from j17r_scan where kind = 'category'), '31,2,19', 'w12_registry_has_37_categories_matching_producers');
select is((select array_agg(distinct s.kind || ':' || s.value || ' in ' || s.fn) from j17r_scan s
           where (s.kind = 'category' and not exists (select 1 from public.notification_categories c where c.category = s.value))
              or (s.kind = 'family' and not exists (select 1 from public.notification_categories c where starts_with(c.category, s.value)))
              or (s.kind = 'key' and not exists (select 1 from public.notification_categories c where s.value = any (c.key_prefixes)))),
          null, 'w12_registry_has_37_categories_matching_producers');
select is((select array_agg(c.category order by c.category) from public.notification_categories c
           where c.category !~ '^test\.'
             and not exists (select 1 from j17r_scan s where (s.kind = 'category' and s.value = c.category)
                                                          or (s.kind = 'family' and starts_with(c.category, s.value)))),
          null, 'w12_registry_has_37_categories_matching_producers');
select is((select count(*)::int from public.notification_categories where category ~ '^test\.' and (key_prefixes <> '{test}' or subject_types is not null)),
          0, 'w12_registry_has_37_categories_matching_producers');

-- ---------- 2) external delivery ----------
select is((select count(*)::int from public.notification_categories where external_delivery <> 'never'), 0,
          'w12_external_delivery_is_never_and_check_refuses_other');
select is(test_helpers.attempt($$ update public.notification_categories set external_delivery = 'email' where category = 'worker_contract' $$)
          || ',' || test_helpers.attempt($$ insert into public.notification_categories (category, source_increment, key_prefixes, recipient_kind,
                                            external_delivery, description) values ('w12.mail', 'W12', '{w12}', 'owner', 'sms', 'Refused') $$),
          '23514,23514', 'w12_external_delivery_is_never_and_check_refuses_other');

-- ---------- 3..5) inserts must match the registry ----------
select set_config('fx.notes0', pg_temp.notes()::text, true);
select is(test_helpers.attempt(format($$ select public.enqueue_notification(%L, 'unknown.category', 'Title', 'Body', 'unknown:1') $$, pg_temp.id('o1'))),
          '23514', 'w12_unregistered_category_refused_23514');
select is(test_helpers.attempt(format($$ select public.enqueue_notification(%L, 'roster', 'Title', 'Body', 'roster_link:1', 'roster_entry', %L) $$,
                                      pg_temp.id('o1'), pg_temp.id('s1'))), '23514', 'w12_unregistered_category_refused_23514');
select is(test_helpers.attempt(format($$ select public.enqueue_notification(%L, 'roster.linked', 'Title', 'Body', 'shop_verification:%s:1', 'roster_entry', %L) $$,
                                      pg_temp.id('o1'), pg_temp.id('s1'), pg_temp.id('s1'))), '23514', 'w12_wrong_key_prefix_refused_23514');
select is(test_helpers.attempt(format($$ select public.enqueue_notification(%L, 'certification.expired', 'Title', 'Body', 'certification:%s:1', 'certification', %L) $$,
                                      pg_temp.id('o1'), pg_temp.id('s1'), pg_temp.id('s1'))), '23514', 'w12_wrong_key_prefix_refused_23514');
select is(test_helpers.attempt(format($$ select public.enqueue_notification(%L, 'roster.linked', 'Title', 'Body', 'roster_link:%s:1', 'shop', %L) $$,
                                      pg_temp.id('o1'), pg_temp.id('s1'), pg_temp.id('s1')))
          || ',' || test_helpers.attempt(format($$ select public.enqueue_notification(%L, 'roster.linked', 'Title', 'Body', 'roster_link:%s:2') $$,
                                      pg_temp.id('o1'), pg_temp.id('s1'))), '23514,23514', 'w12_wrong_subject_type_refused_23514');
select is(pg_temp.notes(), current_setting('fx.notes0')::int, 'w12_wrong_subject_type_refused_23514');
select is(test_helpers.attempt(format($$ select public.enqueue_notification(%L, 'roster.linked', 'Title', 'Body', 'roster_link:%s:3', 'roster_entry', %L) $$,
                                      pg_temp.id('o1'), pg_temp.id('s1'), pg_temp.id('s1'))), 'succeeded', 'w12_wrong_subject_type_refused_23514');
select is(pg_temp.notes() - current_setting('fx.notes0')::int, 1, 'w12_wrong_subject_type_refused_23514');

-- ---------- 6) safe enqueue skips a mismatch; the business action still succeeds ----------
select is(public.enqueue_notification_safely(pg_temp.id('o1'), 'unknown.category', 'Title', 'Body', 'unknown:2'), null::uuid,
          'w12_safe_enqueue_skips_unregistered_and_action_succeeds');
delete from public.notification_categories where category = 'roster.linked';   -- trusted SQL, rolled back with the test
select test_helpers.act_as_owner('j17r-o1@local.test');
insert into public.workers (owner_id, name) values (auth.uid(), 'W12R Roster Ana');
insert into j17r_ids values ('r1', (select id from public.workers where name = 'W12R Roster Ana'));
select set_config('fx.code', (select link_code from public.create_roster_link_code(pg_temp.id('r1'))), true);
select test_helpers.act_as_worker('j17r-w1@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code'))), 'linked',
          'w12_safe_enqueue_skips_unregistered_and_action_succeeds');
select test_helpers.act_as_service();
select is((select count(*)::int from public.notifications where category = 'roster.linked' and subject_id = pg_temp.id('r1')) || ','
          || (select count(*) from public.workforce_audit_events where action = 'roster.linked' and subject_id = pg_temp.id('r1')),
          '0,1', 'w12_safe_enqueue_skips_unregistered_and_action_succeeds');

-- ---------- 7) trigger order: the W3 writer guard first ----------
select is((select array_agg(t.tgname::text order by t.tgname) from pg_trigger t
           where t.tgrelid = 'public.notifications'::regclass and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4),
          array['notifications_guard_insert', 'notifications_guard_registered_category'], 'w12_registry_trigger_runs_after_writer_guard');
select is(test_helpers.attempt(format($$ insert into public.notifications (recipient_id, category, title, body, idempotency_key)
                                         values (%L, 'unknown.category', 'T', 'B', 'unknown:3') $$, pg_temp.id('o1'))),
          '42501', 'w12_registry_trigger_runs_after_writer_guard');

-- ---------- 8, 9) not client readable / writable; changed only by trusted SQL ----------
select is((select count(*)::int from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['select', 'insert', 'update', 'delete']) p
           where has_table_privilege(r, 'public.notification_categories', p)), 0, 'w12_registry_not_client_readable_or_writable');
create function pg_temp.client_calls() returns text language sql as $$
  select test_helpers.attempt('select count(*) from public.notification_categories') || ','
      || test_helpers.attempt($i$ insert into public.notification_categories (category, source_increment, key_prefixes, recipient_kind, description)
                                 values ('w12.forged', 'W12', '{w12}', 'owner', 'Forged') $i$) || ','
      || test_helpers.attempt($i$ update public.notification_categories set description = 'Edited' $i$) || ','
      || test_helpers.attempt('delete from public.notification_categories') $$;
select test_helpers.act_as_anon();
select is(pg_temp.client_calls(), '42501,42501,42501,42501', 'w12_registry_not_client_readable_or_writable');
select test_helpers.act_as_owner('j17r-o1@local.test');
select is(pg_temp.client_calls(), '42501,42501,42501,42501', 'w12_registry_not_client_readable_or_writable');
select test_helpers.act_as_admin('j17r-a1@local.test');
select is(pg_temp.client_calls(), '42501,42501,42501,42501', 'w12_registry_not_client_readable_or_writable');
-- The guard itself (every session): a signed-in user or a service_role JWT is refused even with table privileges.
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('a1'), 'role', 'authenticated')::text, true);
select is(test_helpers.attempt($$ update public.notification_categories set description = 'Edited by a user' where category = 'worker_contract' $$),
          '42501', 'w12_registry_changed_only_by_trusted_sql');
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select is(test_helpers.attempt($$ delete from public.notification_categories where category = 'worker_contract' $$) || ','
          || test_helpers.attempt('truncate public.notification_categories'), '42501,42501', 'w12_registry_changed_only_by_trusted_sql');
select test_helpers.act_as_service();
select is(test_helpers.attempt($$ update public.notification_categories set description = 'Edited by trusted SQL' where category = 'worker_contract' $$),
          'succeeded', 'w12_registry_changed_only_by_trusted_sql');

-- ---------- 10) not in Realtime ----------
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
           and tablename in ('notification_categories', 'workforce_scheduled_jobs', 'notifications'))
          + (select count(*)::int from pg_publication where pubname = 'supabase_realtime' and puballtables), 0, 'w12_registry_not_in_realtime');

-- ---------- 11) W4, W8 and W10 actions notify nobody ----------
insert into j17r_ids values ('j1', test_helpers.create_job_opening(pg_temp.id('s1'), 'W12R opening'));
insert into j17r_ids values ('k1', test_helpers.create_active_test_contract('j17r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j17r-w1@local.test',
                                                                            test_helpers.manila_today()));
select set_config('fx.notes1', pg_temp.notes()::text, true);
select test_helpers.act_as_owner('j17r-o1@local.test');
select (public.transition_job_opening(pg_temp.id('j1'), 'draft', 'published')).status;
select (public.transition_job_opening(pg_temp.id('j1'), 'published', 'paused')).status;
select (public.transition_job_opening(pg_temp.id('j1'), 'paused', 'closed')).status;
select test_helpers.act_as_service();
select test_helpers.save_test_template_version(test_helpers.create_test_contract_template('j17r-o1@local.test'), 'j17r-o1@local.test',
                                               '{"schedule": "Mornings, as agreed each week."}');
select test_helpers.backdate_test_worker_contract(pg_temp.id('k1'), 2);
select is(public.refresh_worker_owner_relationships(), 1, 'w12_w4_w8_w10_actions_notify_nobody');
select is(pg_temp.notes() || ',' || (select count(*) from public.workforce_audit_events where action like 'job_opening.%' and subject_id = pg_temp.id('j1'))
          || ',' || (select count(*) from public.workforce_audit_events where action like 'contract_template%'),
          current_setting('fx.notes1') || ',4,5', 'w12_w4_w8_w10_actions_notify_nobody');

select * from finish();
rollback;
