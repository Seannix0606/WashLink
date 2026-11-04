-- J9 / W16 (PLAN section 5; D-87; FINAL_REVIEW F-C1; REVIEW N1, C-S8): a new platform version keeps every locked_safeguard
-- clause of the previous one unless a trusted migration changes them. The pin is a deferred constraint trigger, and pgTAP files
-- end in a rollback, so each check forces it with `set constraints ... immediate` under the acting identity. Owner templates
-- are unaffected. W16-L3 (added or changed editable clauses stay allowed) is pinned. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create temporary table j9w16_ids (label text primary key, id uuid) on commit drop;
grant all on j9w16_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j9w16_ids where label = p_label $$;
create function pg_temp.current_number() returns integer language sql stable security definer as $$
  select current_version_number from public.contract_templates where scope = 'platform' $$;
-- The clause list of the current platform version with p_changes ({clause_key: {field: value}}) applied.
create function pg_temp.input(p_changes jsonb default '{}') returns jsonb language sql stable security definer as $$
  select jsonb_agg(jsonb_build_object('section_number', c.section_number, 'clause_key', c.clause_key, 'kind', c.kind, 'heading', c.heading,
                                      'body', c.body, 'requires_owner_input', c.requires_owner_input) || coalesce(p_changes -> c.clause_key, '{}')
                   order by c.section_number, c.position)
  from public.contract_template_clauses c where c.version_id = test_helpers.latest_platform_contract_version() $$;
create function pg_temp.fire_pin() returns void language plpgsql as $$
begin
  set constraints public.contract_template_versions_zz_core_text_pin immediate;
  set constraints public.contract_template_versions_zz_core_text_pin deferred;
end $$;
-- Publishes through the real RPC as the current identity, then forces the pin.
create function pg_temp.publish(p_changes jsonb default '{}') returns integer language plpgsql as $$
declare
  saved public.contract_template_versions := public.publish_platform_contract_template_version(pg_temp.current_number(), pg_temp.input(p_changes));
begin
  perform pg_temp.fire_pin();
  return saved.version_number;
end $$;
-- The same with a clause list the test builds itself (added or removed clauses).
create function pg_temp.publish_list(p_clauses jsonb) returns integer language plpgsql as $$
declare
  saved public.contract_template_versions := public.publish_platform_contract_template_version(pg_temp.current_number(), p_clauses);
begin
  perform pg_temp.fire_pin();
  return saved.version_number;
end $$;
create function pg_temp.without(p_key text) returns jsonb language sql stable as $$
  select jsonb_agg(e order by o) from jsonb_array_elements(pg_temp.input()) with ordinality x(e, o) where e ->> 'clause_key' <> p_key $$;
create function pg_temp.new_clause(p_key text, p_kind text, p_body text) returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('section_number', 15, 'clause_key', p_key, 'kind', p_kind, 'heading', 'Added clause', 'body', p_body, 'requires_owner_input', false)) $$;
-- The human-run migration route (D-87): a trusted session writes the next platform version with the only version writer,
-- as the w8e seed does, and forces the validator and the pin.
create function pg_temp.trusted_publish(p_changes jsonb) returns integer language plpgsql as $$
declare
  template_id uuid := (select id from public.contract_templates where scope = 'platform');
  saved public.contract_template_versions;
begin
  saved := public.contract_template_insert_version(template_id, null, (
    select jsonb_agg(jsonb_build_object('section_number', c.section_number, 'position', c.position, 'clause_key', c.clause_key, 'kind', c.kind, 'heading', c.heading,
                                        'body', c.body, 'source_clause_id', null, 'requires_owner_input', c.requires_owner_input) || coalesce(p_changes -> c.clause_key, '{}')
                     order by c.section_number, c.position)
    from public.contract_template_clauses c where c.version_id = test_helpers.latest_platform_contract_version()), 0, 0);
  update public.contract_templates set current_version_number = saved.version_number where id = template_id;
  perform set_config('washlink.contract_template_write', '', true);
  set constraints all immediate;
  set constraints all deferred;
  return saved.version_number;
end $$;
create function pg_temp.core_keys() returns text[] language sql stable security definer as $$ select public.contract_template_core_safeguard_keys() $$;
create function pg_temp.body_of(p_key text) returns text language sql stable security definer as $$
  select body from public.contract_template_clauses where version_id = test_helpers.latest_platform_contract_version() and clause_key = p_key $$;

-- ---------- fixtures ----------
insert into j9w16_ids values ('a1', test_helpers.create_super_admin('j9w16-a1@local.test')), ('o1', test_helpers.create_owner('j9w16-o1@local.test'));
select set_config('fx.start_number', pg_temp.current_number()::text, true);
select test_helpers.act_as_admin('j9w16-a1@local.test');

-- ---------- every core body, one key at a time ----------
select throws_ok(format('select pg_temp.publish(%L)', jsonb_build_object(k, jsonb_build_object('body', pg_temp.body_of(k) || ' Changed by an administrator.'))), '23514',
                 format('WashLink safeguard text in the standard template can change only through a human-run migration: %s.', k),
                 'w16_core_body_change_refused_for_every_core_key')
from unnest(pg_temp.core_keys()) k;

-- ---------- headings too, and every changed key is named ----------
select throws_ok($$ select pg_temp.publish('{"customer_data_minimum": {"heading": "Customer data (edited)"}}') $$, '23514',
                 'WashLink safeguard text in the standard template can change only through a human-run migration: customer_data_minimum.', 'w16_core_heading_change_refused');
select throws_ok($$ select pg_temp.publish('{"customer_data_minimum": {"heading": "Customer data (edited)"}, "parties_named": {"body": "The parties are named."}}') $$, '23514',
                 'WashLink safeguard text in the standard template can change only through a human-run migration: parties_named, customer_data_minimum.', 'w16_core_heading_change_refused');
select is(pg_temp.current_number()::text, current_setting('fx.start_number'), 'w16_core_heading_change_refused');

-- ---------- an unchanged publish and an editable change still work ----------
select is(pg_temp.publish(), current_setting('fx.start_number')::int + 1, 'w16_unchanged_core_publish_succeeds');
select is(pg_temp.current_number(), current_setting('fx.start_number')::int + 1, 'w16_unchanged_core_publish_succeeds');
select is(pg_temp.publish('{"schedule": {"body": "[Shop: describe the working days and hours {{schedule_summary}}.]"}}'), current_setting('fx.start_number')::int + 2,
          'w16_editable_clause_change_still_publishes');
select is(pg_temp.body_of('schedule'), '[Shop: describe the working days and hours {{schedule_summary}}.]', 'w16_editable_clause_change_still_publishes');

-- ---------- REVIEW N1: the rule covers every locked clause, not only the 15 core keys ----------
select is((select kind from public.contract_template_clauses where version_id = test_helpers.latest_platform_contract_version() and clause_key = 'training_pay_or_reimbursement')
          || ',' || ('training_pay_or_reimbursement' = any (pg_temp.core_keys()))::text, 'locked_safeguard,false',
          'w16_non_core_locked_clause_change_refused');
select throws_ok(format('select pg_temp.publish(%L)', jsonb_build_object('training_pay_or_reimbursement', jsonb_build_object('body', pg_temp.body_of('training_pay_or_reimbursement') || ' Extra wording added here.'))),
                 '23514', 'WashLink safeguard text in the standard template can change only through a human-run migration: training_pay_or_reimbursement.',
                 'w16_non_core_locked_clause_change_refused');
select throws_ok($$ select pg_temp.publish('{"training_pay_or_reimbursement": {"heading": "Training pay (edited)"}}') $$,
                 '23514', 'WashLink safeguard text in the standard template can change only through a human-run migration: training_pay_or_reimbursement.',
                 'w16_non_core_locked_clause_change_refused');
select throws_ok($$ select pg_temp.publish('{"training_pay_or_reimbursement": {"section_number": 9}}') $$,
                 '23514', 'WashLink safeguard text in the standard template can change only through a human-run migration: training_pay_or_reimbursement.',
                 'w16_non_core_locked_clause_change_refused');
select throws_ok($$ select pg_temp.publish('{"training_pay_or_reimbursement": {"kind": "editable"}}') $$,
                 '23514', 'WashLink safeguard text in the standard template can change only through a human-run migration: training_pay_or_reimbursement.',
                 'w16_non_core_locked_clause_change_refused');
select throws_ok($$ select pg_temp.publish_list(pg_temp.without('training_pay_or_reimbursement')) $$,
                 '23514', 'WashLink safeguard text in the standard template can change only through a human-run migration: training_pay_or_reimbursement.',
                 'w16_locked_clause_removal_refused');

-- The reviewer's scenario: every existing clause unchanged, plus an added locked clause that contradicts the safeguards.
select throws_ok($$ select pg_temp.publish_list(pg_temp.input() || pg_temp.new_clause('added_locked', 'locked_safeguard', 'The safeguards in this template do not apply to this shop.')) $$,
                 '23514', 'WashLink safeguard text in the standard template can change only through a human-run migration: added_locked.',
                 'w16_added_locked_clause_refused');
select throws_ok($$ select pg_temp.publish('{"schedule": {"kind": "locked_safeguard"}}') $$,
                 '23514', 'WashLink safeguard text in the standard template can change only through a human-run migration: schedule.',
                 'w16_added_locked_clause_refused');
select is(pg_temp.current_number(), current_setting('fx.start_number')::int + 2, 'w16_added_locked_clause_refused');

-- ---------- W16-L3 pinned: an added editable clause is accepted, even one that contradicts the safeguards ----------
select is(pg_temp.publish_list(pg_temp.input() || pg_temp.new_clause('added_editable', 'editable', 'The safeguards in this template do not apply to this shop.')),
          current_setting('fx.start_number')::int + 3, 'w16_limitation_added_editable_clause_accepted');
select is((select kind from public.contract_template_clauses where version_id = test_helpers.latest_platform_contract_version() and clause_key = 'added_editable'), 'editable',
          'w16_limitation_added_editable_clause_accepted');

-- ---------- a trusted migration may change core text; later versions compare against it ----------
select test_helpers.act_as_service();
select set_config('fx.before_trusted', pg_temp.body_of('customer_data_minimum'), true);
select lives_ok($$ select pg_temp.trusted_publish('{"customer_data_minimum": {"body": "Customer information seen during work is used only to perform the service and is never shared."}}') $$,
                'w16_trusted_migration_changes_core_then_pin_follows');
select is(pg_temp.body_of('customer_data_minimum'), 'Customer information seen during work is used only to perform the service and is never shared.',
          'w16_trusted_migration_changes_core_then_pin_follows');
select test_helpers.act_as_admin('j9w16-a1@local.test');
select lives_ok($$ select pg_temp.publish() $$, 'w16_trusted_migration_changes_core_then_pin_follows');
select throws_ok(format('select pg_temp.publish(%L)', jsonb_build_object('customer_data_minimum', jsonb_build_object('body', current_setting('fx.before_trusted')))), '23514',
                 'WashLink safeguard text in the standard template can change only through a human-run migration: customer_data_minimum.',
                 'w16_trusted_migration_changes_core_then_pin_follows');

-- ---------- owner template editing is unaffected ----------
select test_helpers.act_as_service();
insert into j9w16_ids values ('t1', test_helpers.create_test_contract_template('j9w16-o1@local.test', 'W16 owner template'));
insert into j9w16_ids values ('t1v2', test_helpers.save_test_template_version(pg_temp.id('t1'), 'j9w16-o1@local.test', '{"schedule": "Weekends only for the season."}'));
select test_helpers.act_as_owner('j9w16-o1@local.test');
select lives_ok($$ select pg_temp.fire_pin() $$, 'w16_owner_template_editing_unaffected');
select test_helpers.act_as_service();
select is((select version_number from public.contract_template_versions where id = pg_temp.id('t1v2')), 2, 'w16_owner_template_editing_unaffected');

-- ---------- the function and the trigger ----------
select is((select string_agg(has_function_privilege(r, 'public.contract_template_core_text_pin()', 'execute')::text, ',') from unnest(array['anon', 'authenticated', 'service_role']) r)
          || ',' || (select count(*)::int from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.contract_template_core_text_pin()'::regprocedure and a.grantee = 0),
          'false,false,false,0', 'w16_core_pin_function_not_client_executable');
select is((select g.tgdeferrable::text || ',' || g.tginitdeferred::text || ',' || (g.tgname > 'contract_template_versions_validate_at_commit')::text
           from pg_trigger g where g.tgrelid = 'public.contract_template_versions'::regclass and g.tgname = 'contract_template_versions_zz_core_text_pin'),
          'true,true,true', 'w16_core_pin_function_not_client_executable');

select * from finish();
rollback;
