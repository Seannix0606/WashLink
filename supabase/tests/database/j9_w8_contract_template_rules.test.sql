-- W8 rules: write flag for every session, write-once versions and clauses, the commit validator (also for trusted
-- SQL), shop-term sections, placeholder allowlist, safeguard impersonation, size and count limits, archived and
-- active limits, rebase and base rules, super_admin publishing with core safeguards, draft-only review status,
-- classification vocabulary, starter text scan, platform template never deleted. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- ---------- fixtures ----------
select set_config('fx.o1', test_helpers.create_owner('w8r-o1@local.test')::text, true);
select set_config('fx.o3', test_helpers.create_owner('w8r-o3@local.test')::text, true);
select set_config('fx.a1', test_helpers.create_super_admin('w8r-a1@local.test')::text, true);
create temporary table w8r_ids (label text primary key, id uuid) on commit drop;
grant all on w8r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w8r_ids where label = p_label $$;
insert into w8r_ids values ('p1', test_helpers.latest_platform_contract_version()),
  ('pt', (select id from public.contract_templates where scope = 'platform')),
  ('t1', test_helpers.create_test_contract_template('w8r-o1@local.test', 'Rules template')),
  ('t9', test_helpers.create_test_contract_template('w8r-o1@local.test', 'Stays on the old standard'));
insert into w8r_ids select 't1v1', id from public.contract_template_versions where template_id = pg_temp.id('t1');
-- Runs p_sql (with %1$L .. %3$L replaced by the quoted arguments) under the write flag of p_template.
create function pg_temp.with_flag(p_template uuid, p_sql text, a1 text default null, a2 text default null, a3 text default null)
returns void language plpgsql as $$
begin
  perform set_config('washlink.contract_template_write', p_template::text, true);
  execute format(p_sql, a1, a2, a3);
end $$;
create function pg_temp.base_list() returns jsonb language sql stable
as $$ select public.contract_template_owner_clause_list(pg_temp.id('p1'), '{}'::jsonb, '[]'::jsonb) -> 'clauses' $$;
create function pg_temp.list_set(p_key text, p_body text) returns jsonb language sql stable
as $$ select jsonb_agg(case when e ->> 'clause_key' = p_key then jsonb_set(e, '{body}', to_jsonb(p_body)) else e end order by o)
      from jsonb_array_elements(pg_temp.base_list()) with ordinality x(e, o) $$;
create function pg_temp.list_where(p_keep text) returns jsonb language plpgsql stable as $$
declare result jsonb;
begin
  execute format('select jsonb_agg(e order by o) from jsonb_array_elements(%L::jsonb) with ordinality x(e, o) where %s', pg_temp.base_list(), p_keep)
    into result;
  return result;
end $$;
-- Trusted SQL writing a version directly (flag set, no RPC), then forcing the deferred commit validator.
create function pg_temp.forge(p_clauses jsonb, p_hash text default null, p_added int default 0) returns text language plpgsql as $$
declare vid uuid;
begin
  perform set_config('washlink.contract_template_write', pg_temp.id('t1')::text, true);
  insert into public.contract_template_versions (template_id, version_number, base_platform_version_id, content_hash, edited_count, added_count, saved_by_role)
  values (pg_temp.id('t1'), (select max(version_number) + 1 from public.contract_template_versions where template_id = pg_temp.id('t1')),
          pg_temp.id('p1'), coalesce(p_hash, public.contract_template_clauses_content_hash(pg_temp.id('p1'), p_clauses)), 0, p_added, 'trusted_session')
  returning id into vid;
  insert into public.contract_template_clauses (version_id, section_number, position, clause_key, kind, heading, body, source_clause_id, clause_hash)
  select vid, x.section_number, x.position, x.clause_key, x.kind, x.heading, x.body, x.source_clause_id, repeat('0', 64)
  from jsonb_to_recordset(p_clauses) as x(section_number smallint, position smallint, clause_key text, kind text, heading text, body text, source_clause_id uuid);
  set constraints public.contract_template_versions_validate_at_commit immediate;
  set constraints public.contract_template_versions_validate_at_commit deferred;
  return 'validated';
end $$;
create function pg_temp.defer() returns void language sql as $$ set constraints public.contract_template_versions_validate_at_commit deferred $$;
create function pg_temp.save(p_template text, p_bodies jsonb, p_terms jsonb default '[]', p_base uuid default null) returns uuid language sql as $$
  select (public.save_owner_contract_template_version(pg_temp.id(p_template), (select current_version_number from public.contract_templates
    where id = pg_temp.id(p_template)), coalesce(p_base, (select base_platform_version_id from public.owner_contract_templates()
    where template_id = pg_temp.id(p_template))), p_bodies, p_terms)).id $$;
create function pg_temp.terms(p_count int, p_section int default 15, p_body text default 'A shop-specific term for this shop.') returns jsonb
language sql as $$ select jsonb_agg(jsonb_build_object('section_number', p_section, 'heading', 'Term ' || n, 'body', p_body)) from generate_series(1, p_count) n $$;
create function pg_temp.platform_input(p_changes jsonb default '{}', p_drop text default null) returns jsonb language sql stable security definer as $$
  select jsonb_agg(jsonb_build_object('section_number', c.section_number, 'clause_key', c.clause_key, 'kind', c.kind, 'heading', c.heading,
                                      'body', c.body, 'requires_owner_input', c.requires_owner_input) || coalesce(p_changes -> c.clause_key, '{}')
                   order by c.section_number, c.position)
  from public.contract_template_clauses c where c.version_id = pg_temp.id('p1') and c.clause_key is distinct from p_drop $$;
create function pg_temp.publish(p_expected int, p_clauses jsonb) returns uuid language sql
as $$ select (public.publish_platform_contract_template_version(p_expected, p_clauses)).id $$;
select test_helpers.act_as_service();

-- ---------- write flag (every session) ----------
select throws_ok(format($$ insert into public.contract_templates (scope, owner_id, name) values ('owner', %L, 'Forged template') $$, current_setting('fx.o1')),
                 '42501', 'Contract templates are changed only through WashLink.', 'w8_trusted_insert_without_flag_refused');
select throws_ok(format($$ insert into public.contract_template_versions (template_id, version_number, base_platform_version_id, content_hash, saved_by_role)
                           values (%L, 2, %L, repeat('a', 64), 'trusted_session') $$, pg_temp.id('t1'), pg_temp.id('p1')),
                 '42501', 'Contract templates are changed only through WashLink.', 'w8_trusted_insert_without_flag_refused');
select throws_ok(format($$ insert into public.contract_template_clauses (version_id, section_number, position, clause_key, kind, heading, body, clause_hash)
                           values (%L, 15, 3, 'extra_clause', 'editable', 'Extra', 'Extra text', repeat('a', 64)) $$, pg_temp.id('t1v1')),
                 '42501', 'Contract templates are changed only through WashLink.', 'w8_trusted_insert_without_flag_refused');
select throws_ok(format($$ update public.contract_templates set name = 'Renamed by SQL' where id = %L $$, pg_temp.id('t1')),
                 '42501', 'Contract templates are changed only through WashLink.', 'w8_trusted_insert_without_flag_refused');

-- ---------- write-once ----------
select throws_ok(format($$ select pg_temp.with_flag(%L, 'update public.contract_template_versions set edited_count = 5 where id = %%1$L', %L) $$,
                 pg_temp.id('t1'), pg_temp.id('t1v1')), '42501', 'Contract template versions cannot be edited.',
                 'w8_versions_and_clauses_immutable_for_every_session');
select throws_ok(format($$ select pg_temp.with_flag(%L, 'update public.contract_template_clauses set body = ''Changed'' where version_id = %%1$L', %L) $$,
                 pg_temp.id('t1'), pg_temp.id('t1v1')), '42501', 'Contract template versions cannot be edited.',
                 'w8_versions_and_clauses_immutable_for_every_session');
select throws_ok(format($$ select pg_temp.with_flag(%L, 'delete from public.contract_template_clauses where version_id = %%1$L', %L) $$,
                 pg_temp.id('t1'), pg_temp.id('t1v1')), '42501', 'Contract template versions cannot be edited.',
                 'w8_versions_and_clauses_immutable_for_every_session');
select throws_ok(format($$ select pg_temp.with_flag(%L, 'delete from public.contract_template_versions where id = %%1$L', %L) $$,
                 pg_temp.id('t1'), pg_temp.id('t1v1')), '42501', 'Contract template versions cannot be edited.',
                 'w8_versions_and_clauses_immutable_for_every_session');
select test_helpers.act_as_owner('w8r-o1@local.test');
select is(test_helpers.attempt(format($$ update public.contract_template_clauses set body = 'Changed' where version_id = %L $$, pg_temp.id('t1v1'))),
          '42501', 'w8_versions_and_clauses_immutable_for_every_session');
select test_helpers.act_as_service();
select throws_ok(format($$ select pg_temp.with_flag(%L, 'insert into public.contract_template_clauses (version_id, section_number, position, clause_key, kind, heading, body, clause_hash) values (%%1$L, 15, 3, ''extra_clause'', ''editable'', ''Extra'', ''Extra text'', repeat(''a'', 64))', %L) $$,
                 pg_temp.id('pt'), pg_temp.id('p1')), '42501', 'Contract template versions cannot be edited.',
                 'w8_clause_cannot_be_added_to_sealed_version');

-- ---------- commit validator (trusted SQL) ----------
select is(pg_temp.forge(pg_temp.base_list()), 'validated', 'w8_commit_validator_rejects_altered_locked_clause_even_for_trusted_sql');
select throws_ok($$ select pg_temp.forge(pg_temp.list_set('template_is_draft', 'This template is final and binding.')) $$, '23514',
                 'This clause is a WashLink safeguard and cannot be changed.', 'w8_commit_validator_rejects_altered_locked_clause_even_for_trusted_sql');
select pg_temp.defer();
select throws_ok($$ select pg_temp.forge(pg_temp.list_where($w$ (e ->> 'section_number')::int <> 2 $w$)) $$, '23514',
                 'Every contract section needs at least one clause (missing: 2).', 'w8_commit_validator_rejects_missing_section_or_base_clause');
select pg_temp.defer();
select throws_ok($$ select pg_temp.forge(pg_temp.list_where($w$ e ->> 'clause_key' <> 'owner_obligations' $w$)) $$, '23514',
                 'Every clause of the standard template must stay in place (owner_obligations).', 'w8_commit_validator_rejects_missing_section_or_base_clause');
select pg_temp.defer();
select throws_ok($$ select pg_temp.forge(pg_temp.base_list(), repeat('a', 64)) $$, '23514', 'The version hash does not match its clauses.',
                 'w8_commit_validator_rejects_forged_hash');
select pg_temp.defer();
select throws_ok($$ select pg_temp.forge(pg_temp.base_list() || jsonb_build_object('section_number', 4, 'position', 3, 'clause_key', null,
                    'kind', 'shop_specific', 'heading', 'Extra classification term', 'body', 'The worker is treated as a contractor.'), null, 1) $$,
                 '23514', 'Shop-specific terms are not allowed in this section.', 'w8_shop_terms_refused_in_sections_1_4_14');
select pg_temp.defer();

-- ---------- RPC input rules ----------
select test_helpers.act_as_owner('w8r-o1@local.test');
select throws_ok(format($$ select pg_temp.save('t1', '{}', pg_temp.terms(1, %s)) $$, s), '23514', 'Shop-specific terms are not allowed in this section.',
                 'w8_shop_terms_refused_in_sections_1_4_14') from unnest(array[1, 4, 14]) s;
select throws_ok($$ select pg_temp.save('t1', '{"pay_terms": "We pay {{salary}} each week."}') $$, '23514', 'Unknown placeholder {{salary}}.',
                 'w8_unknown_placeholder_refused');
select throws_ok($$ select pg_temp.save('t1', '{"pay_terms": "We pay {{pay_details each week."}') $$, '23514', null, 'w8_unknown_placeholder_refused');
select throws_ok($$ select pg_temp.save('t1', '{}', '[{"section_number": 9, "heading": "Bonus {{bonus_amount}}", "body": "Paid when agreed."}]') $$,
                 '23514', 'Unknown placeholder {{bonus_amount}}.', 'w8_unknown_placeholder_refused');
select throws_ok($$ select pg_temp.save('t1', '{"schedule": "This is a WashLink   Safeguard: no overtime is paid."}') $$, '23514',
                 'Shop text cannot be labelled as a WashLink safeguard.', 'w8_owner_text_cannot_impersonate_safeguard');
select throws_ok($$ select pg_temp.save('t1', '{}', '[{"section_number": 9, "heading": "Extra WashLink safeguard", "body": "The worker pays for damage."}]') $$,
                 '23514', 'Shop text cannot be labelled as a WashLink safeguard.', 'w8_owner_text_cannot_impersonate_safeguard');
select throws_ok($$ select pg_temp.save('t1', '{}', pg_temp.terms(41)) $$, '23514', 'A version can have up to 40 shop-specific terms.', 'w8_size_and_count_limits');
select throws_ok($$ select pg_temp.save('t1', '{}', pg_temp.terms(1, 15, 'Too short')) $$, '23514', 'Write each shop-specific term in 10 to 4000 characters.',
                 'w8_size_and_count_limits');
select throws_ok($$ select pg_temp.save('t1', '{}', '[{"section_number": 9, "heading": "Ab", "body": "A long enough body."}]') $$, '23514',
                 'Give each shop-specific term a heading of 3 to 160 characters.', 'w8_size_and_count_limits');
select throws_ok(format($$ select pg_temp.save('t1', jsonb_build_object('schedule', %L)) $$, repeat('x', 4001)), '23514',
                 'A clause can hold up to 4000 characters.', 'w8_size_and_count_limits');
select throws_ok($$ select pg_temp.save('t1', '{"schedule": "  \n "}') $$, '23514', 'Editable clauses cannot be empty.', 'w8_size_and_count_limits');
select throws_ok(format($$ select pg_temp.save('t1', '{}', pg_temp.terms(30, 15, %L)) $$, repeat('y', 4000)), '23514',
                 'A contract template can hold up to 120000 characters.', 'w8_size_and_count_limits');
do $$ begin
  for n in 2..200 loop perform pg_temp.save('t9', jsonb_build_object('schedule', 'Schedule edit ' || n)); end loop;
end $$;
select throws_ok($$ select pg_temp.save('t9', '{"schedule": "One edit too many."}') $$, '23514',
                 'A template can keep up to 200 versions. Start a new template from this version.', 'w8_size_and_count_limits');

-- ---------- archived, active limit ----------
insert into w8r_ids select 't3', id from public.create_owner_contract_template('Archive me', null);
select is((public.set_owner_contract_template_status(pg_temp.id('t3'), 'active', 'archived')).status, 'archived', 'w8_archived_template_cannot_be_saved');
select throws_ok($$ select pg_temp.save('t3', '{"schedule": "Evenings."}') $$, '23514', 'Archived templates cannot be changed. Restore it first.',
                 'w8_archived_template_cannot_be_saved');
select throws_ok(format($$ select public.rename_owner_contract_template(%L, 'New name') $$, pg_temp.id('t3')), '23514',
                 'Archived templates cannot be changed. Restore it first.', 'w8_archived_template_cannot_be_saved');
select test_helpers.act_as_owner('w8r-o3@local.test');
select count(public.create_owner_contract_template('Limit template ' || chr(64 + n), null)) from generate_series(1, 25) n;
select throws_ok($$ select public.create_owner_contract_template('One too many', null) $$, '23514',
                 'You can keep up to 25 active templates. Archive one first.', 'w8_active_template_limit');
insert into w8r_ids select 'l1', template_id from public.owner_contract_templates() where name = 'Limit template A';
select is((public.set_owner_contract_template_status(pg_temp.id('l1'), 'active', 'archived')).status, 'archived', 'w8_active_template_limit');
select lives_ok($$ select public.create_owner_contract_template('Takes the free slot', null) $$, 'w8_active_template_limit');
select throws_ok(format($$ select public.set_owner_contract_template_status(%L, 'archived', 'active') $$, pg_temp.id('l1')), '23514',
                 'You can keep up to 25 active templates. Archive one first.', 'w8_active_template_limit');

-- ---------- super_admin publishes, owners rebase ----------
select test_helpers.act_as_owner('w8r-o1@local.test');
insert into w8r_ids select 't1v2', pg_temp.save('t1', '{"pay_terms": "We pay {{pay_details}} at the end of each week."}');
select throws_ok($$ select pg_temp.publish(1, pg_temp.platform_input()) $$, '42501', 'Only WashLink administrators can change the standard template.',
                 'w8_super_admin_publishes_platform_version_existing_owner_versions_unchanged');
select test_helpers.act_as_admin('w8r-a1@local.test');
insert into w8r_ids select 'p2', pg_temp.publish(1, pg_temp.platform_input(jsonb_build_object(
  'schedule', jsonb_build_object('body', '[Shop: describe the working days and hours {{schedule_summary}}.]'))));
select test_helpers.act_as_service();
select is((select row(version_number, saved_by_role, base_platform_version_id is null)::text from public.contract_template_versions where id = pg_temp.id('p2')),
          row(2, 'super_admin', true)::text, 'w8_super_admin_publishes_platform_version_existing_owner_versions_unchanged');
select is((select count(*)::int from public.contract_template_versions where id in (pg_temp.id('t1v1'), pg_temp.id('t1v2'))
           and base_platform_version_id = pg_temp.id('p1')), 2, 'w8_super_admin_publishes_platform_version_existing_owner_versions_unchanged');
select test_helpers.act_as_admin('w8r-a1@local.test');
select throws_ok($$ select pg_temp.publish(1, pg_temp.platform_input()) $$, '55000', 'This template changed. Reload it and try again.',
                 'w8_super_admin_publishes_platform_version_existing_owner_versions_unchanged');
select throws_ok($$ select pg_temp.publish(2, pg_temp.platform_input('{"template_is_draft": {"kind": "editable"}}')) $$, '23514',
                 'The standard template must keep these WashLink safeguard clauses locked: template_is_draft.', 'w8_platform_version_must_keep_core_safeguards_locked');
select throws_ok($$ select pg_temp.publish(2, pg_temp.platform_input('{}', 'safeguards_prevail')) $$, '23514',
                 'The standard template must keep these WashLink safeguard clauses locked: safeguards_prevail.', 'w8_platform_version_must_keep_core_safeguards_locked');
select throws_ok($$ select pg_temp.publish(2, pg_temp.platform_input('{"classification_not_preselected": {"body": "The relationship type is employee."}}')) $$,
                 '23514', 'Section 4 must keep the relationship-type placeholder in a WashLink safeguard clause.', 'w8_platform_version_must_keep_core_safeguards_locked');
select throws_ok($$ select pg_temp.publish(2, pg_temp.platform_input('{"pay_terms": {"body": "[Shop: pay at least 500 per day.]"}}')) $$, '23514',
                 'The standard template cannot contain digits or amounts.', 'w8_platform_version_must_keep_core_safeguards_locked');
select throws_ok($$ select pg_temp.publish(2, pg_temp.platform_input('{"attachments_list": {"kind": "shop_specific"}}')) $$, '23514',
                 'The standard template has only WashLink safeguard and editable clauses.', 'w8_platform_version_must_keep_core_safeguards_locked');
select test_helpers.act_as_owner('w8r-o1@local.test');
select is((select row(newer_standard_available, base_platform_version_number, latest_platform_version_number)::text from public.owner_contract_templates()
           where template_id = pg_temp.id('t1')), row(true, 1, 2)::text, 'w8_rebase_to_latest_standard_keeps_edits_by_key');
insert into w8r_ids select 't1v3', pg_temp.save('t1', '{}', '[]', pg_temp.id('p2'));
select test_helpers.act_as_service();
select is((select jsonb_object_agg(clause_key, body) from public.contract_template_clauses where version_id = pg_temp.id('t1v3')
           and clause_key in ('pay_terms', 'schedule', 'customer_data_minimum')),
          jsonb_build_object('pay_terms', 'We pay {{pay_details}} at the end of each week.',
                             'schedule', '[Shop: describe the working days and hours {{schedule_summary}}.]',
                             -- W16 (D-87): core text no longer changes in a super_admin publish; the rule is in j9_w16_core_safeguard_text_pinned.
                             'customer_data_minimum', (select body from public.contract_template_clauses where version_id = pg_temp.id('p1') and clause_key = 'customer_data_minimum')),
          'w8_rebase_to_latest_standard_keeps_edits_by_key');
select is((select row(base_platform_version_id = pg_temp.id('p2'), edited_count, added_count)::text from public.contract_template_versions
           where id = pg_temp.id('t1v3')), row(true, 1, 0)::text, 'w8_rebase_to_latest_standard_keeps_edits_by_key');
select test_helpers.act_as_owner('w8r-o1@local.test');
select throws_ok($$ select pg_temp.save('t1', '{"schedule": "Evenings."}', '[]', pg_temp.id('p1')) $$, '23514', 'Use the current standard template version.',
                 'w8_older_base_refused');
select throws_ok(format($$ select public.create_owner_contract_template('From the old standard', %L) $$, pg_temp.id('p1')), '23514',
                 'Use the current standard template version.', 'w8_older_base_refused');

-- ---------- review status, classification, starter text, platform template ----------
select test_helpers.act_as_service();
select throws_like(format($$ select pg_temp.with_flag(%L, 'insert into public.contract_template_versions (template_id, version_number, base_platform_version_id, content_hash, saved_by_role, review_status) values (%%1$L, %%2$s, %%3$L, repeat(''a'', 64), ''trusted_session'', ''legally_reviewed'')', %L, %L, %L) $$,
                   pg_temp.id('t1'), pg_temp.id('t1'), (select max(version_number) + 1 from public.contract_template_versions where template_id = pg_temp.id('t1')),
                   pg_temp.id('p2')), '%ctv_review_status_check%', 'w8_review_status_only_draft_value');
select is((select count(*)::int from public.contract_template_versions where review_status <> 'draft_requires_legal_review'), 0, 'w8_review_status_only_draft_value');
select is((select count(*)::int from pg_proc p, unnest(coalesce(p.proargnames, '{}')) arg where p.pronamespace = 'public'::regnamespace
           and p.proname ~ 'contract' and arg ~* 'review_status' and has_function_privilege('authenticated', p.oid, 'execute')), 0, 'w8_review_status_only_draft_value');
select is((select array_agg(classification_key order by sort_order) from public.worker_classification_options),
          array['employee', 'probationary_employee', 'fixed_term_employee', 'project_employee', 'seasonal_employee', 'casual_employee',
                'other_needs_review', 'independent_contractor'], 'w8_classification_options_have_no_default_and_contractor_last');
select is((select array_agg(classification_key) from public.worker_classification_options where needs_extra_acknowledgement), array['independent_contractor'],
          'w8_classification_options_have_no_default_and_contractor_last');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'worker_classification_options'
           and (column_name ~* '(default|preselect|selected)' or (column_default is not null and column_name not in ('review_status', 'created_at', 'updated_at')))),
          0, 'w8_classification_options_have_no_default_and_contractor_last');
create temporary table w8r_text on commit drop as
  select clause_key, heading || ' ' || body as words from public.contract_template_clauses where version_id = pg_temp.id('p1')
  union all select 'section_' || section_number, title from public.contract_template_sections;
select is((select count(*)::int from w8r_text where words ~ '[0-9]' or words ~* '(₱|\$|php|peso|usd|amount|minimum wage|republic act|labor code|article|decree)'),
          0, 'w8_starter_text_has_no_digits_amounts_or_compliance_claims');
select is((select array_agg(clause_key) from w8r_text where words ~* '(complian|approved|valid|reviewed)'), array['template_is_draft'],
          'w8_starter_text_has_no_digits_amounts_or_compliance_claims');
select is((select count(*)::int from public.contract_template_clauses where version_id = pg_temp.id('p1') and kind = 'editable'
           and not (body ~ '^\[(Shop|Optional): .*\]$' and requires_owner_input)), 0, 'w8_starter_text_has_no_digits_amounts_or_compliance_claims');
select throws_ok(format($$ delete from public.contract_templates where id = %L $$, pg_temp.id('pt')), '42501',
                 'The standard contract template cannot be deleted.', 'w8_platform_template_never_deleted');
select throws_like(format($$ select pg_temp.with_flag(%L, 'update public.contract_templates set status = ''archived'' where scope = ''platform''') $$, pg_temp.id('pt')),
                   '%ct_platform_always_active%', 'w8_platform_template_never_deleted');
select test_helpers.act_as_admin('w8r-a1@local.test');
select throws_ok(format($$ select public.set_owner_contract_template_status(%L, 'active', 'archived') $$, pg_temp.id('pt')), '42501',
                 'Contract template not found.', 'w8_platform_template_never_deleted');
select test_helpers.act_as_owner('w8r-o1@local.test');
select is(test_helpers.attempt(format($$ delete from public.contract_templates where id = %L $$, pg_temp.id('t1'))), '42501', 'w8_platform_template_never_deleted');

select * from finish();
rollback;
