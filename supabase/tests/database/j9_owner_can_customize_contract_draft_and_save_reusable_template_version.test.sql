-- J9 (W8): an owner starts a draft template from the WashLink standard (15 spec E sections, each marked as a draft
-- that requires labor-law review), customises editable clause bodies, adds shop-specific terms and saves reusable,
-- immutable, server-hashed versions; preview renders placeholder labels with the notice; the diff marks unchanged /
-- edited / added_by_shop; locked safeguards cannot be edited; no relationship type is preselected.
-- W9 extends this file with the worker-contract-draft leg. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- ---------- fixtures ----------
select set_config('fx.o1', test_helpers.create_owner('j9t-o1@local.test')::text, true);
create temporary table j9t_ids (label text primary key, id uuid) on commit drop;
grant all on j9t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j9t_ids where label = p_label $$;
insert into j9t_ids values ('p1', test_helpers.latest_platform_contract_version());
create function pg_temp.clause(p_version uuid, p_key text) returns public.contract_template_clauses language sql stable security definer
as $$ select * from public.contract_template_clauses where version_id = p_version and clause_key = p_key $$;
create function pg_temp.version_json(p_version uuid) returns jsonb language sql stable security definer
as $$ select jsonb_agg(to_jsonb(c) order by c.section_number, c.position) from public.contract_template_clauses c where c.version_id = p_version $$;
create function pg_temp.v(p_template uuid, p_number int) returns uuid language sql stable security definer
as $$ select id from public.contract_template_versions where template_id = p_template and version_number = p_number $$;
create function pg_temp.save(p_expected int, p_bodies jsonb, p_terms jsonb) returns uuid language sql
as $$ select (public.save_owner_contract_template_version(pg_temp.id('t1'), p_expected, pg_temp.id('p1'), p_bodies, p_terms)).id $$;

-- ---------- start from the standard ----------
select test_helpers.act_as_owner('j9t-o1@local.test');
insert into j9t_ids select 't1', id from public.create_owner_contract_template('  Main crew agreement  ', null);
select test_helpers.act_as_service();
insert into j9t_ids values ('t1v1', pg_temp.v(pg_temp.id('t1'), 1));
select is((select row(scope, owner_id = current_setting('fx.o1')::uuid, name, status, current_version_number)::text
           from public.contract_templates where id = pg_temp.id('t1')),
          row('owner', true, 'Main crew agreement', 'active', 1)::text, 'j9_owner_starts_draft_template_from_platform_standard');
select is((select row(base_platform_version_id = pg_temp.id('p1'), edited_count, added_count, saved_by_role)::text
           from public.contract_template_versions where id = pg_temp.id('t1v1')),
          row(true, 0, 0, 'owner')::text, 'j9_owner_starts_draft_template_from_platform_standard');
select is((select count(*)::int from public.contract_template_clauses c join public.contract_template_clauses b on b.id = c.source_clause_id
           where c.version_id = pg_temp.id('t1v1') and b.version_id = pg_temp.id('p1') and b.body = c.body and b.clause_key = c.clause_key),
          (select count(*)::int from public.contract_template_clauses where version_id = pg_temp.id('p1')),
          'j9_owner_starts_draft_template_from_platform_standard');

-- ---------- fifteen sections, every one marked draft ----------
select is((select array_agg(title order by section_number) from public.contract_template_sections), array[
  'Parties and verified identities', 'Car wash business and work location', 'Role, responsibilities, and scope of work',
  'Contract type and legal classification', 'Start date, duration, and renewal terms', 'Work schedule and availability',
  'Compensation, payment frequency, and lawful deductions, if any',
  'Training requirements, the minimum three-day training process, and certification conditions',
  'Worker and owner obligations', 'Occupational safety, protective equipment, and workplace rules',
  'Customer privacy, confidential information, and responsible data handling',
  'Leave, absences, termination, notice, and dispute resolution as applicable',
  'Applicable statutory benefits, contributions, and other mandatory rights when legally required',
  'Acknowledgment, acceptance, signatures, and dated copies', 'Attachments or shop-specific terms'],
  'j9_starter_has_all_fifteen_sections_in_spec_order');
select is((select array_agg(distinct section_number order by section_number)::int[] from public.contract_template_clauses
           where version_id = pg_temp.id('p1')), (select array_agg(n) from generate_series(1, 15) n),
          'j9_starter_has_all_fifteen_sections_in_spec_order');
select is((select count(*)::int from public.contract_template_sections
           where review_notice = 'Draft — requires review by a qualified Philippine labor-law professional'), 15,
          'j9_every_section_marked_draft_requires_labor_law_review');
select is((select count(*)::int from public.contract_template_versions where review_status <> 'draft_requires_legal_review'), 0,
          'j9_every_section_marked_draft_requires_labor_law_review');
select test_helpers.act_as_owner('j9t-o1@local.test');
select is((select row(count(distinct section_number), count(*) filter (where review_notice <> 'Draft — requires review by a qualified Philippine labor-law professional'))::text
           from public.preview_contract_template_version(pg_temp.id('t1v1'))), row(15, 0)::text,
          'j9_every_section_marked_draft_requires_labor_law_review');

-- ---------- customise editable bodies and add shop terms -> version 2 ----------
create temporary table j9t_v1_before on commit drop as select pg_temp.version_json(pg_temp.id('t1v1')) as clauses;
insert into j9t_ids select 't1v2', pg_temp.save(1,
  jsonb_build_object('pay_terms', E'  We pay {{pay_details}} every week.\r\nPaid in cash at the shop.  ', 'schedule', 'Mornings, as agreed each week.'),
  '[{"section_number": 15, "heading": "Uniform", "body": "The shop lends a uniform to the worker for each shift."},
    {"section_number": 9, "heading": "Shared cleaning", "body": "Both parties keep the wash bay tidy at closing."}]');
select is((select body from pg_temp.clause(pg_temp.id('t1v2'), 'pay_terms')), E'We pay {{pay_details}} every week.\nPaid in cash at the shop.',
          'j9_owner_customizes_editable_clause_bodies');
select is((select row(edited_count, added_count, version_number)::text from public.contract_template_versions where id = pg_temp.id('t1v2')),
          row(2, 2, 2)::text, 'j9_owner_customizes_editable_clause_bodies');
select is((select (pg_temp.clause(pg_temp.id('t1v2'), 'template_is_draft')).body), (select (pg_temp.clause(pg_temp.id('p1'), 'template_is_draft')).body),
          'j9_owner_customizes_editable_clause_bodies');
select is((select array_agg(row(section_number, position, kind, clause_key is null, heading)::text order by section_number, position)
           from public.contract_template_clauses where version_id = pg_temp.id('t1v2') and kind = 'shop_specific'),
          array[row(9, 3, 'shop_specific', true, 'Shared cleaning')::text, row(15, 3, 'shop_specific', true, 'Uniform')::text],
          'j9_owner_adds_shop_specific_terms');
select is((select position from pg_temp.clause(pg_temp.id('t1v2'), 'attachments_list')), 2::smallint, 'j9_owner_adds_shop_specific_terms');
select is(pg_temp.version_json(pg_temp.id('t1v1')), (select clauses from j9t_v1_before), 'j9_save_creates_new_version_and_keeps_previous_unchanged');
select is((select current_version_number from public.contract_templates where id = pg_temp.id('t1')), 2,
          'j9_save_creates_new_version_and_keeps_previous_unchanged');
select is((select count(*)::int from public.contract_template_versions where template_id = pg_temp.id('t1')), 2,
          'j9_save_creates_new_version_and_keeps_previous_unchanged');
select test_helpers.act_as_service();
select ok((select (a.content_hash ~ '^[0-9a-f]{64}$') and a.content_hash <> b.content_hash and a.content_hash = public.contract_template_version_hash(a.id)
                  and b.content_hash = public.contract_template_version_hash(b.id)
           from public.contract_template_versions a, public.contract_template_versions b
           where a.id = pg_temp.id('t1v2') and b.id = pg_temp.id('t1v1')), 'j9_each_version_has_server_computed_content_hash');
select is((select count(*)::int from public.contract_template_clauses c where c.version_id = pg_temp.id('t1v2')
           and c.clause_hash = public.contract_template_clause_hash(c.section_number, c.position, c.clause_key, c.kind, c.heading, c.body)),
          (select count(*)::int from public.contract_template_clauses where version_id = pg_temp.id('t1v2')),
          'j9_each_version_has_server_computed_content_hash');

-- ---------- identical / stale saves ----------
select test_helpers.act_as_owner('j9t-o1@local.test');
select throws_ok(format($$ select pg_temp.save(2, '{}'::jsonb, %L::jsonb) $$,
                 '[{"section_number": 9, "heading": "Shared cleaning", "body": "Both parties keep the wash bay tidy at closing."},
                   {"section_number": 15, "heading": "Uniform", "body": "The shop lends a uniform to the worker for each shift."}]'),
                 '23514', 'Nothing changed since the last version.', 'j9_identical_save_refused');
select throws_ok($$ select pg_temp.save(1, '{"schedule": "Evenings only."}'::jsonb, '[]'::jsonb) $$, '55000',
                 'This template changed. Reload it and try again.', 'j9_stale_save_rejected');
select is((select count(*)::int from public.contract_template_versions where template_id = pg_temp.id('t1')), 2, 'j9_stale_save_rejected');

-- ---------- reuse a saved version as the start of a new template ----------
insert into j9t_ids select 't2', id from public.create_owner_contract_template('Weekend crew agreement', pg_temp.id('t1v2'));
select test_helpers.act_as_service();
insert into j9t_ids values ('t2v1', pg_temp.v(pg_temp.id('t2'), 1));
select is((select row(t.derived_from_version_id = pg_temp.id('t1v2'), v.content_hash = (select content_hash from public.contract_template_versions
                                                                                         where id = pg_temp.id('t1v2')), v.edited_count, v.added_count)::text
           from public.contract_templates t join public.contract_template_versions v on v.template_id = t.id where t.id = pg_temp.id('t2')),
          row(true, true, 2, 2)::text, 'j9_saved_version_reusable_as_start_of_new_template');
select is((select body from pg_temp.clause(pg_temp.id('t2v1'), 'pay_terms')), (select body from pg_temp.clause(pg_temp.id('t1v2'), 'pay_terms')),
          'j9_saved_version_reusable_as_start_of_new_template');

-- ---------- history, preview, diff ----------
select test_helpers.act_as_owner('j9t-o1@local.test');
select is((select array_agg(row(version_number, base_platform_version_number, edited_count, added_count, saved_by_role, is_current)::text)
           from public.contract_template_version_history(pg_temp.id('t1'))),
          array[row(2, 1, 2, 2, 'owner', true)::text, row(1, 1, 0, 0, 'owner', false)::text],
          'j9_saved_version_listed_in_history_with_base_standard');
select is((select row(name, current_version_number, base_platform_version_number, newer_standard_available)::text
           from public.owner_contract_templates() where template_id = pg_temp.id('t1')),
          row('Main crew agreement', 2, 1, false)::text, 'j9_saved_version_listed_in_history_with_base_standard');
select is((select rendered_body from public.preview_contract_template_version(pg_temp.id('t1v2')) where clause_key = 'pay_terms'),
          E'We pay [Pay as written by the shop on the contract] every week.\nPaid in cash at the shop.',
          'j9_preview_renders_placeholders_as_labels_with_draft_notice');
select is((select count(*)::int from public.preview_contract_template_version(pg_temp.id('t1v2'))
           where rendered_body like '%{{%' or rendered_heading like '%{{%'
              or review_notice <> 'Draft — requires review by a qualified Philippine labor-law professional'), 0,
          'j9_preview_renders_placeholders_as_labels_with_draft_notice');
select is((select jsonb_object_agg(change, n) from (select change, count(*) n from public.contract_template_version_diff(pg_temp.id('t1v2')) group by change) d),
          jsonb_build_object('added_by_shop', 2, 'edited', 2,
                             'unchanged', (select count(*) - 2 from public.contract_template_clauses where version_id = pg_temp.id('p1'))),
          'j9_diff_marks_unchanged_edited_and_added_by_shop');
select is((select row(standard_body = (select body from pg_temp.clause(pg_temp.id('p1'), 'schedule')), version_body)::text
           from public.contract_template_version_diff(pg_temp.id('t1v2')) where clause_key = 'schedule'),
          row(true, 'Mornings, as agreed each week.')::text, 'j9_diff_marks_unchanged_edited_and_added_by_shop');
select is((select array_agg(distinct change) from public.contract_template_version_diff(pg_temp.id('p1'))), array['unchanged'],
          'j9_diff_marks_unchanged_edited_and_added_by_shop');

-- ---------- locked safeguards and classification ----------
select throws_ok($$ select pg_temp.save(2, '{"template_is_draft": "This template is final."}'::jsonb, '[]'::jsonb) $$, '23514',
                 'This clause is a WashLink safeguard and cannot be changed.', 'j9_locked_safeguard_clause_cannot_be_edited_through_rpc');
select throws_ok($$ select pg_temp.save(2, '{"classification_not_preselected": "The worker is an independent contractor."}'::jsonb, '[]'::jsonb) $$,
                 '23514', 'This clause is a WashLink safeguard and cannot be changed.', 'j9_locked_safeguard_clause_cannot_be_edited_through_rpc');
select throws_ok($$ select pg_temp.save(2, '{"made_up_clause": "Anything."}'::jsonb, '[]'::jsonb) $$, '22023', 'Unknown clause.',
                 'j9_locked_safeguard_clause_cannot_be_edited_through_rpc');
select test_helpers.act_as_service();
select is((select count(*)::int from information_schema.columns where table_schema = 'public'
           and table_name in ('contract_templates', 'contract_template_versions', 'contract_template_clauses', 'worker_classification_options')
           and (column_name ~* 'classif' and table_name <> 'worker_classification_options' or column_name ~* 'default')), 0,
          'j9_classification_not_preselected_in_template');
select is((select row(kind, strpos(body, '{{worker_classification}}') > 0, body ~* 'independent')::text
           from pg_temp.clause(pg_temp.id('t1v2'), 'classification_not_preselected')), row('locked_safeguard', true, false)::text,
          'j9_classification_not_preselected_in_template');
select is((select preview_label from public.contract_template_placeholders where placeholder_key = 'worker_classification'),
          '[Relationship type - chosen per contract, not preselected]', 'j9_classification_not_preselected_in_template');

select * from finish();
rollback;
