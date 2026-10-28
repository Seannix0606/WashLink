-- W10 (D-37, P60): workforce policy governance. Seeded minimum_distinct_owners = 3 (informational); changed only by a
-- super_admin through set_workforce_policy_value with the expected revision and a 10..300 character reason; range
-- 1..10; same value refused; policy_key, default_value and enforcement immutable; never deleted; a trusted SQL session
-- may update (audited trusted_session); the audit carries from / to values, never the reason. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w10p-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w10p-o1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('w10p-w1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('w10p-cu@local.test')::text, true);
create function pg_temp.rev() returns integer language sql stable security definer
as $$ select revision from public.workforce_policies where policy_key = 'minimum_distinct_owners' $$;
create function pg_temp.set_sql(p_value integer, p_reason text, p_revision integer default null) returns text language sql stable as $$
  select format('select public.set_workforce_policy_value(%L, %s, %s, %L)', 'minimum_distinct_owners', coalesce(p_value::text, 'null'),
                coalesce(p_revision, pg_temp.rev()), p_reason) $$;
create function pg_temp.as_service_role_jwt() returns void language plpgsql as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

-- ---------- seed ----------
select is((select row(count(*), min(integer_value), min(default_value), min(enforcement), min(revision), bool_and(last_change_reason is null))::text
           from public.workforce_policies), '(1,3,3,informational,1,t)', 'w10_policy_seeded_minimum_three_informational');
select ok((select description ~ 'Informational only' from public.workforce_policies where policy_key = 'minimum_distinct_owners'),
          'w10_policy_seeded_minimum_three_informational');

-- ---------- refused callers ----------
select test_helpers.act_as_owner('w10p-o1@local.test');
select throws_ok(pg_temp.set_sql(4, 'Owner tries to change it.'), '42501', 'Only a platform administrator can change workforce policies.',
                 'w10_policy_change_refused_for_owner_worker_customer_anon');
select test_helpers.act_as_worker('w10p-w1@local.test');
select is(test_helpers.attempt(pg_temp.set_sql(4, 'Worker tries to change it.')), '42501', 'w10_policy_change_refused_for_owner_worker_customer_anon');
select test_helpers.act_as_customer('w10p-cu@local.test');
select is(test_helpers.attempt(pg_temp.set_sql(4, 'Customer tries to change it.')), '42501', 'w10_policy_change_refused_for_owner_worker_customer_anon');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select public.set_workforce_policy_value(''minimum_distinct_owners'', 4, 1, ''Anonymous change attempt.'')'), '42501',
          'w10_policy_change_refused_for_owner_worker_customer_anon');
select pg_temp.as_service_role_jwt();
select throws_ok($$ select public.set_workforce_policy_value('minimum_distinct_owners', 4, 1, 'Service role change attempt.') $$, '42501', null,
                 'w10_policy_change_refused_for_owner_worker_customer_anon');
select set_config('role', 'none', true);
select test_helpers.act_as_service();
select is(pg_temp.rev() || ',' || (select integer_value from public.workforce_policies), '1,3', 'w10_policy_change_refused_for_owner_worker_customer_anon');

-- ---------- validation (super_admin) ----------
select test_helpers.act_as_admin('w10p-a1@local.test');
select throws_ok(pg_temp.set_sql(4, 'A stale revision is used here.', 7), '55000', 'This policy changed. Reload it and try again.',
                 'w10_policy_stale_revision_55000');
select is(array[test_helpers.attempt(pg_temp.set_sql(0, 'Zero is outside the range.')), test_helpers.attempt(pg_temp.set_sql(11, 'Eleven is outside the range.')),
                test_helpers.attempt(pg_temp.set_sql(null, 'A missing value is refused.')), test_helpers.attempt(pg_temp.set_sql(4, ' too short ')),
                test_helpers.attempt(pg_temp.set_sql(4, repeat('x', 301))), test_helpers.attempt(pg_temp.set_sql(4, null))],
          array_fill('23514'::text, array[6]), 'w10_policy_range_and_reason_23514');
select throws_ok(pg_temp.set_sql(4, 'Too short'), '23514', 'Give a reason of 10 to 300 characters.', 'w10_policy_range_and_reason_23514');
select throws_ok(pg_temp.set_sql(3, 'Setting the same value again.'), '23514', 'This is already the current value.', 'w10_policy_same_value_refused');
select throws_ok($$ select public.set_workforce_policy_value('maximum_hours', 4, 1, 'Unknown policy key used.') $$, '22023', 'Unknown workforce policy.',
                 'w10_policy_default_enforcement_and_key_immutable');

-- ---------- the change ----------
select is((select row(p.integer_value, p.default_value, p.revision, p.last_change_reason, p.updated_by = pg_temp_fx_a1.id)::text
           from public.set_workforce_policy_value('minimum_distinct_owners', 4, 1, '  Pilot with four owners in Cebu.  ') p,
                (select current_setting('fx.a1')::uuid as id) pg_temp_fx_a1),
          '(4,3,2,"Pilot with four owners in Cebu.",t)', 'w10_super_admin_changes_policy_with_reason');
select test_helpers.act_as_service();
select is((select row(actor_kind, actor_role, subject_type, subject_profile_id is null, payload)::text from public.workforce_audit_events
           where action = 'workforce_policy.changed' order by id desc limit 1),
          row('user', 'super_admin', 'workforce_policy', true,
              jsonb_build_object('policy_key', 'minimum_distinct_owners', 'from_value', 3, 'to_value', 4, 'revision', 2, 'changed_by', 'super_admin'))::text,
          'w10_policy_change_audited_without_reason_text');
select ok((select bool_and(strpos(payload::text, 'Cebu') = 0 and strpos(payload::text, 'Pilot') = 0) from public.workforce_audit_events
           where subject_type = 'workforce_policy'), 'w10_policy_change_audited_without_reason_text');

-- ---------- immutable columns, no delete ----------
select is(array[test_helpers.attempt('update public.workforce_policies set default_value = 4'),
                test_helpers.attempt('update public.workforce_policies set enforcement = ''blocking'''),
                test_helpers.attempt('update public.workforce_policies set policy_key = ''minimum_distinct_owners_v2''')],
          array_fill('42501'::text, array[3]), 'w10_policy_default_enforcement_and_key_immutable');
select throws_ok('delete from public.workforce_policies', '42501', 'Workforce policies cannot be deleted.', 'w10_policy_cannot_be_deleted');
select test_helpers.act_as_admin('w10p-a1@local.test');
select is(test_helpers.attempt('delete from public.workforce_policies')
          || ',' || test_helpers.attempt('update public.workforce_policies set integer_value = 5'), '42501,42501', 'w10_policy_cannot_be_deleted');

-- ---------- trusted SQL update (audited) ----------
select test_helpers.act_as_service();
update public.workforce_policies set integer_value = 6, last_change_reason = 'Trusted repair for a local test.' where policy_key = 'minimum_distinct_owners';
select is((select row(e.actor_kind, e.payload ->> 'changed_by', e.payload ->> 'from_value', e.payload ->> 'to_value', e.payload ->> 'revision',
                      p.updated_by is null)::text
           from public.workforce_audit_events e cross join public.workforce_policies p
           where e.action = 'workforce_policy.changed' order by e.id desc limit 1),
          '(trusted_session,trusted_session,4,6,3,t)', 'w10_trusted_session_policy_update_audited');

select * from finish();
rollback;
