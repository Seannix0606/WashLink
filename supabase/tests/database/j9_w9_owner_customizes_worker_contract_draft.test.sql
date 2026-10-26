-- J9 (W9, contract-draft half): an owner drafts a worker contract from an own template version or the standard for a
-- worker with an accepted application or completed training (D-31), chooses the relationship type explicitly (D-26),
-- customises editable bodies and shop terms on the contract without touching the template version, sees the
-- unfilled list, live flags and the diff vs the standard (template vs contract edits); locked clauses are copied
-- verbatim from the base standard; stale saves and a second open contract are refused. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j9c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j9c-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j9c-o2@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('j9c-w1@local.test'))::text, true);
select set_config('fx.w2', test_helpers.create_worker_profile(test_helpers.create_worker('j9c-w2@local.test'))::text, true);
select set_config('fx.w3', test_helpers.create_worker_profile(test_helpers.create_worker('j9c-w3@local.test'))::text, true);
create temporary table j9c_ids (label text primary key, id uuid) on commit drop;
grant all on j9c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j9c_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j9c_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1'))),
                           ('s2', test_helpers.create_verified_shop(pg_temp.fx('o2'), pg_temp.fx('a1')));
insert into j9c_ids values ('app1', test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.fx('w1'))),
  ('app_other_shop', test_helpers.create_accepted_application(pg_temp.id('s2'), pg_temp.fx('w3'))),
  ('enr2', test_helpers.complete_training(pg_temp.id('s1'), pg_temp.fx('w2'), 'j9c-o1@local.test')),
  ('t1', test_helpers.create_test_contract_template('j9c-o1@local.test', 'Crew agreement'));
select test_helpers.create_job_application(test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Submitted only')),
                                           pg_temp.fx('w3'), 'submitted');
insert into j9c_ids values ('t1v2', test_helpers.save_test_template_version(pg_temp.id('t1'), 'j9c-o1@local.test',
  '{"schedule": "Mornings, as agreed with the worker each week."}', '[{"section_number": 15, "heading": "Uniform", "body": "The shop lends a uniform to the worker."}]'));
select set_config('fx.t1v2_hash', (select content_hash from public.contract_template_versions where id = pg_temp.id('t1v2')), true);
select set_config('fx.t1v2_clauses', (select string_agg(clause_hash, ',' order by section_number, position) from public.contract_template_clauses
                                      where version_id = pg_temp.id('t1v2')), true);

-- ---------- creation and eligibility ----------
insert into j9c_ids values ('c1', test_helpers.create_test_contract_draft('j9c-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w1'), pg_temp.id('t1v2')));
insert into j9c_ids select 'c1v1', id from public.contract_versions where contract_id = pg_temp.id('c1');
select is((select status || ',' || origin || ',' || (job_application_id = pg_temp.id('app1'))::text from public.worker_contracts where id = pg_temp.id('c1')),
          'draft,accepted_application,true', 'j9_owner_creates_contract_draft_from_own_template_version_for_accepted_applicant');
select is((select template_version_id = pg_temp.id('t1v2') and base_platform_version_id = test_helpers.latest_platform_contract_version()
                  and template_name_snapshot = 'Crew agreement' and kind = 'initial' and state = 'draft' and template_content_hash = current_setting('fx.t1v2_hash')
           from public.contract_versions where id = pg_temp.id('c1v1')), true, 'j9_owner_creates_contract_draft_from_own_template_version_for_accepted_applicant');
select is((select shop_terms from public.contract_versions where id = pg_temp.id('c1v1')),
          '[{"body": "The shop lends a uniform to the worker.", "heading": "Uniform", "section_number": 15}]'::jsonb,
          'j9_owner_creates_contract_draft_from_own_template_version_for_accepted_applicant');
insert into j9c_ids values ('c2', test_helpers.create_test_contract_draft('j9c-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w2')));
select is((select origin || ',' || (training_enrollment_id = pg_temp.id('enr2'))::text || ',' || (job_application_id is null)::text
           from public.worker_contracts where id = pg_temp.id('c2')), 'completed_training,true,true',
          'j9_owner_creates_contract_draft_for_worker_with_completed_training');
select is((select template_version_id from public.contract_versions where contract_id = pg_temp.id('c2')), test_helpers.latest_platform_contract_version(),
          'j9_owner_creates_contract_draft_for_worker_with_completed_training');
select test_helpers.act_as_owner('j9c-o1@local.test');
select throws_ok(format($$ select public.create_worker_contract_draft(%L, %L, %L, 'employee', test_helpers.manila_today()) $$,
                 pg_temp.id('s1'), pg_temp.fx('w3'), test_helpers.latest_platform_contract_version()), '23514',
                 'You can draft a contract only for a worker with an accepted application or completed training at this shop.',
                 'j9_draft_refused_without_accepted_application_or_completed_training');
select test_helpers.act_as_owner('j9c-o2@local.test');
select throws_ok(format($$ select public.create_worker_contract_draft(%L, %L, %L, 'employee', test_helpers.manila_today()) $$,
                 pg_temp.id('s2'), pg_temp.fx('w1'), test_helpers.latest_platform_contract_version()), '23514',
                 'You can draft a contract only for a worker with an accepted application or completed training at this shop.',
                 'j9_draft_refused_without_accepted_application_or_completed_training');
select throws_ok(format($$ select public.create_worker_contract_draft(%L, %L, %L, null, test_helpers.manila_today()) $$,
                 pg_temp.id('s2'), pg_temp.fx('w3'), test_helpers.latest_platform_contract_version()), '23514',
                 'Choose the relationship type for this contract.', 'j9_draft_requires_explicit_classification_no_default');
select throws_ok(format($$ select public.create_worker_contract_draft(%L, %L, %L, 'freelance_partner', test_helpers.manila_today()) $$,
                 pg_temp.id('s2'), pg_temp.fx('w3'), test_helpers.latest_platform_contract_version()), '23514',
                 'Unknown relationship type.', 'j9_draft_requires_explicit_classification_no_default');
select test_helpers.act_as_service();
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'contract_versions'
           and column_name = 'classification_key'), null, 'j9_draft_requires_explicit_classification_no_default');
select is((select (p.pronargs - p.pronargdefaults)::int from pg_proc p where p.oid = 'public.create_worker_contract_draft(uuid, uuid, uuid, text, date, date, jsonb)'::regprocedure),
          5, 'j9_draft_requires_explicit_classification_no_default');

-- ---------- customise, unfilled list, live flags ----------
select test_helpers.act_as_owner('j9c-o1@local.test');
select ok((select unfilled @> array['pay_details', 'role_title', 'clause:pay_terms', 'clause:attachments_list'] and not ('clause:schedule' = any (unfilled))
           from public.preview_worker_contract_draft(pg_temp.id('c1'))), 'j9_draft_preview_lists_unfilled_placeholders_and_live_flags');
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j9c-o1@local.test', '{"schedule": null, "pay_terms": "We pay {{pay_details}} every Friday."}',
  '[{"section_number": 15, "heading": "Uniform", "body": "The shop lends a uniform to the worker."},
    {"section_number": 7, "heading": "Locker", "body": "The worker pays a deposit for the locker key."}]');
select is((select draft_revision || ',' || (editable_bodies ->> 'pay_terms') || ',' || jsonb_array_length(shop_terms) || ',' || (editable_bodies ? 'schedule')::text
           from public.contract_versions where id = pg_temp.id('c1v1')), '2,We pay {{pay_details}} every Friday.,2,false',
          'j9_owner_customizes_editable_bodies_and_shop_terms_on_contract_draft');
select test_helpers.act_as_owner('j9c-o1@local.test');
select is((select unfilled from public.preview_worker_contract_draft(pg_temp.id('c1'))), '{}'::text[],
          'j9_draft_preview_lists_unfilled_placeholders_and_live_flags');
select is((select flag_count || ',' || (flags -> 0 ->> 'rule_key') || ',' || (flags -> 0 ->> 'section_number')
           from public.preview_worker_contract_draft(pg_temp.id('c1'))), '1,deposit,7', 'j9_draft_preview_lists_unfilled_placeholders_and_live_flags');
select is((select (c ->> 'body') from public.preview_worker_contract_draft(pg_temp.id('c1')) p, jsonb_array_elements(p.clauses) c
           where c ->> 'clause_key' = 'pay_terms'), 'We pay Pay as agreed in writing by both parties every Friday.',
          'j9_draft_preview_lists_unfilled_placeholders_and_live_flags');
select throws_ok(format($$ select public.save_worker_contract_draft(%L, 1, 'employee', test_helpers.manila_today(), null, '{}', '{}', '[]') $$,
                 pg_temp.id('c1')), '55000', 'This contract changed. Reload it and try again.', 'j9_stale_contract_draft_save_rejected');
select throws_ok(format($$ select public.save_worker_contract_draft(%L, 2, 'employee', test_helpers.manila_today(), null, '{}',
                 '{"no_waiver_of_mandatory_rights": "The worker waives everything."}', '[]') $$, pg_temp.id('c1')), '23514',
                 'This clause is a WashLink safeguard and cannot be changed.', 'j9_contract_locked_clauses_copied_verbatim_from_base_standard');
select throws_ok(format($$ select public.save_worker_contract_draft(%L, 2, 'employee', test_helpers.manila_today(), null, '{}',
                 '{"schedule": "As {{worker_classification}} the worker works mornings."}', '[]') $$, pg_temp.id('c1')), '23514',
                 'The relationship type and the party names can appear only in WashLink safeguard clauses.',
                 'j9_owner_customizes_editable_bodies_and_shop_terms_on_contract_draft');
select throws_ok(format($$ select public.save_worker_contract_draft(%L, 2, 'employee', test_helpers.manila_today(), null, '{}', '{}',
                 '[{"section_number": 4, "heading": "Type", "body": "The worker is a partner of the shop."}]') $$, pg_temp.id('c1')), '23514',
                 'Shop-specific terms are not allowed in this section.', 'j9_owner_customizes_editable_bodies_and_shop_terms_on_contract_draft');
select throws_ok(format($$ select public.create_worker_contract_draft(%L, %L, %L, 'employee', test_helpers.manila_today()) $$,
                 pg_temp.id('s1'), pg_temp.fx('w1'), test_helpers.latest_platform_contract_version()), '23505',
                 'This worker already has an open contract with this shop.', 'j9_one_open_contract_per_shop_and_worker');
select test_helpers.act_as_service();
select is((select content_hash from public.contract_template_versions where id = pg_temp.id('t1v2')), current_setting('fx.t1v2_hash'),
          'j9_contract_draft_customization_leaves_template_version_unchanged');
select is((select string_agg(clause_hash, ',' order by section_number, position) from public.contract_template_clauses where version_id = pg_temp.id('t1v2')),
          current_setting('fx.t1v2_clauses'), 'j9_contract_draft_customization_leaves_template_version_unchanged');
select is((select body from public.contract_template_clauses where version_id = pg_temp.id('t1v2') and clause_key = 'pay_terms'),
          (select body from public.contract_template_clauses where version_id = test_helpers.latest_platform_contract_version() and clause_key = 'pay_terms'),
          'j9_contract_draft_customization_leaves_template_version_unchanged');

-- ---------- sealed clauses: locked verbatim, diff marks template vs contract edits ----------
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j9c-o1@local.test');
select is((select count(*)::int from public.contract_version_clauses c
           join public.contract_template_clauses b on b.version_id = test_helpers.latest_platform_contract_version() and b.clause_key = c.clause_key
           join public.contract_versions v on v.id = c.version_id
           where c.version_id = pg_temp.id('c1v1') and c.kind = 'locked_safeguard' and b.kind = 'locked_safeguard'
             and c.heading = b.heading and c.body = public.render_contract_template_clause(b.body, v.render_values) and c.body = c.standard_body
             and c.section_number = b.section_number and c.position = b.position),
          (select count(*)::int from public.contract_template_clauses b where b.version_id = test_helpers.latest_platform_contract_version()
           and b.kind = 'locked_safeguard'), 'j9_contract_locked_clauses_copied_verbatim_from_base_standard');
select is((select count(*)::int from public.contract_version_clauses where version_id = pg_temp.id('c1v1') and kind = 'locked_safeguard' and change <> 'unchanged'),
          0, 'j9_contract_locked_clauses_copied_verbatim_from_base_standard');
select is((select string_agg(coalesce(clause_key, heading) || ':' || change || ':' || coalesce(edited_in, '-'), ',' order by section_number, position)
           from public.contract_version_clauses where version_id = pg_temp.id('c1v1') and clause_key in ('schedule', 'pay_terms', 'parties_named')
             or (version_id = pg_temp.id('c1v1') and kind = 'shop_specific')),
          'parties_named:unchanged:-,schedule:edited:template,pay_terms:edited:contract,Locker:added_by_shop:contract,Uniform:added_by_shop:template',
          'j9_draft_diff_vs_standard_marks_template_and_contract_edits');
select test_helpers.act_as_owner('j9c-o1@local.test');
select is((select count(*)::int from public.worker_contract_version_clauses(pg_temp.id('c1v1')) where change = 'edited' and standard_body like '[Shop:%'),
          (select count(*)::int from public.contract_template_clauses where version_id = test_helpers.latest_platform_contract_version() and kind = 'editable'),
          'j9_draft_diff_vs_standard_marks_template_and_contract_edits');
select is((select standard_body from public.worker_contract_version_clauses(pg_temp.id('c1v1')) where clause_key = 'schedule'),
          '[Shop: describe the working days and hours Weekdays from morning to afternoon and how availability is agreed.]',
          'j9_draft_diff_vs_standard_marks_template_and_contract_edits');
select is((select count(*)::int from public.preview_worker_contract_draft(pg_temp.id('c1'))), 0, 'j9_draft_preview_lists_unfilled_placeholders_and_live_flags');
select test_helpers.act_as_service();

select * from finish();
rollback;
