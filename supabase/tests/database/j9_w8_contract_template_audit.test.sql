-- W8 audit: contract_template.created / .version_saved / .renamed / .status_changed / .deleted for owner actions,
-- super_admin publishing and owner account deletion; payloads carry ids, scope / status words and counts only
-- (no names, headings, bodies, keys or hashes); refused actions write nothing; no notifications (D-30).
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ---------- fixtures ----------
select set_config('fx.o1', test_helpers.create_owner('w8a-o1@local.test')::text, true);
select set_config('fx.a1', test_helpers.create_super_admin('w8a-a1@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('w8a-by@local.test')::text, true);
create temporary table w8a_ids (label text primary key, id uuid) on commit drop;
grant all on w8a_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w8a_ids where label = p_label $$;
insert into w8a_ids values ('pt', (select id from public.contract_templates where scope = 'platform')),
  ('p1', test_helpers.latest_platform_contract_version());
create temporary table w8a_mark on commit drop as
  select (select coalesce(max(id), 0) from public.workforce_audit_events) as audit_id, (select count(*) from public.notifications) as notes;
grant all on w8a_mark to public;
create function pg_temp.actions(p_subject uuid) returns text[] language sql stable security definer as $$
  select array_agg(action || ':' || coalesce(payload ->> 'changed_by', payload ->> 'deleted_by', '') order by id)
  from public.workforce_audit_events where subject_id = p_subject and id > (select audit_id from w8a_mark) $$;
create function pg_temp.event_count() returns bigint language sql stable security definer
as $$ select count(*) from public.workforce_audit_events where id > (select audit_id from w8a_mark) $$;

-- ---------- owner actions ----------
select test_helpers.act_as_owner('w8a-o1@local.test');
insert into w8a_ids select 't1', id from public.create_owner_contract_template('Audit FALCON agreement', null);
select (public.save_owner_contract_template_version(pg_temp.id('t1'), 1, pg_temp.id('p1'),
  '{"pay_terms": "We pay {{pay_details}} PELICAN each week."}', '[{"section_number": 9, "heading": "HERON duties", "body": "Keep the OSPREY bay clean."}]')).version_number;
select (public.rename_owner_contract_template(pg_temp.id('t1'), 'Audit KESTREL agreement')).name;
select (public.set_owner_contract_template_status(pg_temp.id('t1'), 'active', 'archived')).status;
select (public.set_owner_contract_template_status(pg_temp.id('t1'), 'archived', 'active')).status;
select test_helpers.act_as_admin('w8a-a1@local.test');
insert into w8a_ids select 'p2', id from public.publish_platform_contract_template_version(1, (
  select jsonb_agg(jsonb_build_object('section_number', section_number, 'clause_key', clause_key, 'kind', kind, 'heading', heading,
                                      'body', case when clause_key = 'attachments_list' then '[Shop: list each attachment by title, or write "None".]' else body end,
                                      'requires_owner_input', requires_owner_input) order by section_number, position)
  from public.contract_template_clauses where version_id = pg_temp.id('p1')));
select test_helpers.act_as_service();
select is(pg_temp.actions(pg_temp.id('t1')), array['contract_template.created:owner', 'contract_template.version_saved:owner',
  'contract_template.version_saved:owner', 'contract_template.renamed:owner', 'contract_template.status_changed:owner',
  'contract_template.status_changed:owner'], 'w8_audit_written_for_create_save_rename_status_publish_and_delete');
select is((select array_agg(row(payload ->> 'version_number', payload ->> 'base_platform_version_number', payload ->> 'edited_count',
                                payload ->> 'added_count', payload ->> 'scope')::text order by id)
           from public.workforce_audit_events where subject_id = pg_temp.id('t1') and action = 'contract_template.version_saved'),
          array[row('1', '1', '0', '0', 'owner')::text, row('2', '1', '1', '1', 'owner')::text],
          'w8_audit_written_for_create_save_rename_status_publish_and_delete');
select is((select array_agg(row(payload ->> 'from_status', payload ->> 'to_status')::text order by id) from public.workforce_audit_events
           where subject_id = pg_temp.id('t1') and action = 'contract_template.status_changed'),
          array[row('active', 'archived')::text, row('archived', 'active')::text], 'w8_audit_written_for_create_save_rename_status_publish_and_delete');
select is((select row(subject_type, subject_profile_id = current_setting('fx.o1')::uuid, actor_id = current_setting('fx.o1')::uuid, actor_role)::text
           from public.workforce_audit_events where subject_id = pg_temp.id('t1') and action = 'contract_template.renamed'),
          row('contract_template', true, true, 'owner')::text, 'w8_audit_written_for_create_save_rename_status_publish_and_delete');
select is((select array_agg(row(action, subject_profile_id is null, payload ->> 'version_number', payload ->> 'changed_by', payload ->> 'scope')::text)
           from public.workforce_audit_events where subject_id = pg_temp.id('pt') and id > (select audit_id from w8a_mark)),
          array[row('contract_template.version_saved', true, '2', 'super_admin', 'platform')::text],
          'w8_audit_written_for_create_save_rename_status_publish_and_delete');
select is((select count(*)::int from public.workforce_audit_events where subject_id = pg_temp.id('pt') and action = 'contract_template.created'), 1,
          'w8_audit_written_for_create_save_rename_status_publish_and_delete');

-- ---------- refused actions write nothing ----------
create temporary table w8a_before on commit drop as select pg_temp.event_count() as n;
grant all on w8a_before to public;
select test_helpers.act_as_owner('w8a-o1@local.test');
select is(test_helpers.attempt(format($$ select public.save_owner_contract_template_version(%L, 1, %L, '{"schedule": "Evenings."}', '[]') $$,
          pg_temp.id('t1'), pg_temp.id('p1'))), '55000', 'w8_refused_action_writes_nothing');
select is(test_helpers.attempt(format($$ select public.save_owner_contract_template_version(%L, 2, %L, '{"template_is_draft": "Final."}', '[]') $$,
          pg_temp.id('t1'), pg_temp.id('p1'))), '23514', 'w8_refused_action_writes_nothing');
select is(test_helpers.attempt($$ select public.publish_platform_contract_template_version(2, '[]') $$), '42501', 'w8_refused_action_writes_nothing');
select test_helpers.act_as_service();
select is(pg_temp.event_count(), (select n from w8a_before), 'w8_refused_action_writes_nothing');

-- ---------- owner account deletion (untrusted, like GoTrue) ----------
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
delete from auth.users where id = current_setting('fx.o1')::uuid;
select test_helpers.act_as_service();
select is((pg_temp.actions(pg_temp.id('t1')))[7], 'contract_template.deleted:owner_account_deleted',
          'w8_audit_written_for_create_save_rename_status_publish_and_delete');

-- ---------- payload content ----------
select is((select count(*)::int from public.workforce_audit_events e where e.subject_type = 'contract_template'
           and (e.payload::text ~* '(FALCON|KESTREL|PELICAN|HERON|OSPREY|Shop:|attachment|pay_details|template_is_draft|pay_terms|schedule)'
                or exists (select 1 from public.contract_template_versions v where strpos(e.payload::text, v.content_hash) > 0)
                or exists (select 1 from jsonb_object_keys(e.payload) k where k not in ('template_id', 'version_id', 'scope', 'version_number',
                           'base_platform_version_number', 'edited_count', 'added_count', 'changed_by', 'from_status', 'to_status',
                           'deleted_by', 'derived_from_version_id')))), 0,
          'w8_audit_payload_has_no_names_headings_bodies_or_hashes');
select ok((select count(*) from public.workforce_audit_events where subject_type = 'contract_template' and id > (select audit_id from w8a_mark)) >= 8,
          'w8_audit_payload_has_no_names_headings_bodies_or_hashes');

-- ---------- no notifications ----------
select is((select count(*) from public.notifications), (select notes from w8a_mark), 'w8_no_notifications_enqueued');
select is((select count(*)::int from public.notifications where category ~* 'contract' or subject_type = 'contract_template'), 0,
          'w8_no_notifications_enqueued');

select * from finish();
rollback;
