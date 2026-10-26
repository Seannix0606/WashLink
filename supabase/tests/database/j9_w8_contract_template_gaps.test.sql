-- W8 TEST-step gap fills: locked ids / fields in payloads, super_admin direct writes, every core key, hash stability,
-- and read RPCs for worker / customer / anon. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select set_config('fx.o1', test_helpers.create_owner('w8g-o1@local.test')::text, true);
select set_config('fx.a1', test_helpers.create_super_admin('w8g-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('w8g-cu@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('w8g-w1@local.test'))::text, true);
create temporary table w8g_ids (label text primary key, id uuid) on commit drop;
grant all on w8g_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w8g_ids where label = p_label $$;
insert into w8g_ids values ('p1', test_helpers.latest_platform_contract_version()),
  ('t1', test_helpers.create_test_contract_template('w8g-o1@local.test', 'Gap template'));
create function pg_temp.locked_snapshot(p_version uuid) returns text language sql stable security definer
as $$ select md5(string_agg(clause_key || '|' || heading || '|' || body || '|' || clause_hash || '|' || section_number || '|' || position, ';'
                            order by section_number, position))
      from public.contract_template_clauses where version_id = p_version and kind = 'locked_safeguard' $$;
create function pg_temp.platform_input(p_drop text default null, p_downgrade text default null) returns jsonb language sql stable security definer as $$
  select jsonb_agg(jsonb_build_object('section_number', c.section_number, 'clause_key', c.clause_key,
         'kind', case when c.clause_key = p_downgrade then 'editable' else c.kind end, 'heading', c.heading,
         'body', c.body, 'requires_owner_input', c.requires_owner_input) order by c.section_number, c.position)
  from public.contract_template_clauses c where c.version_id = pg_temp.id('p1') and c.clause_key is distinct from p_drop $$;
create function pg_temp.publish(p_clauses jsonb) returns uuid language sql
as $$ select (public.publish_platform_contract_template_version(1, p_clauses)).id $$;
create temporary table w8g_snap (label text primary key, snap text) on commit drop;
grant all on w8g_snap to public;
insert into w8g_snap values ('p1', pg_temp.locked_snapshot(pg_temp.id('p1')));
create temporary table w8g_core (k text) on commit drop;
grant all on w8g_core to public;
insert into w8g_core select unnest(public.contract_template_core_safeguard_keys());

-- ---------- locked clause ids and fields in payloads ----------
select test_helpers.act_as_owner('w8g-o1@local.test');
select throws_ok(format($$ select public.save_owner_contract_template_version(%L, 1, %L, jsonb_build_object(%L, 'Hijacked'), '[]') $$,
                 pg_temp.id('t1'), pg_temp.id('p1'), (select id from public.contract_template_clauses where version_id = pg_temp.id('p1')
                 and clause_key = 'template_is_draft')::text), '22023', 'Unknown clause.', 'w8g_locked_clause_id_in_editable_payload_refused');
select throws_ok(format($$ select public.save_owner_contract_template_version(%L, 1, %L, '{"no_training_fee_or_deduction": "Training costs apply."}', '[]') $$,
                 pg_temp.id('t1'), pg_temp.id('p1')), '23514', 'This clause is a WashLink safeguard and cannot be changed.',
                 'w8g_core_key_in_payload_refused');
select throws_ok(format($$ select public.save_owner_contract_template_version(%L, 1, %L, '{"schedule": "Evenings.", "right_to_decline_or_leave": "x"}', '[]') $$,
                 pg_temp.id('t1'), pg_temp.id('p1')), '23514', 'This clause is a WashLink safeguard and cannot be changed.',
                 'w8g_locked_key_mixed_with_valid_edit_refused_whole');
select is((select count(*)::int from public.contract_template_versions where template_id = pg_temp.id('t1')), 1, 'w8g_refused_saves_wrote_no_version');
select lives_ok(format($$ select public.save_owner_contract_template_version(%L, 1, %L, '{"schedule": "Evenings only."}',
                 '[{"section_number": 9, "heading": "Extra duty", "body": "A long enough body.", "kind": "locked_safeguard", "clause_key": "x_key", "source_clause_id": null}]') $$,
                 pg_temp.id('t1'), pg_temp.id('p1')), 'w8g_extra_fields_in_shop_terms_are_ignored');
select test_helpers.act_as_service();
insert into w8g_ids select 't1v2', id from public.contract_template_versions where template_id = pg_temp.id('t1') and version_number = 2;
select is((select array_agg(kind) from public.contract_template_clauses where version_id = pg_temp.id('t1v2') and heading = 'Extra duty'
           and clause_key is null), array['shop_specific'], 'w8g_shop_term_kind_and_key_are_server_set');
select is(pg_temp.locked_snapshot(pg_temp.id('t1v2')), (select snap from w8g_snap where label = 'p1'), 'w8g_locked_clauses_identical_to_standard_after_save');

-- ---------- super_admin session cannot write versions or clauses ----------
select test_helpers.act_as_admin('w8g-a1@local.test');
select is(test_helpers.attempt(format($$ update public.contract_template_versions set edited_count = 9 where id = %L $$, pg_temp.id('p1'))), '42501',
          'w8g_super_admin_cannot_update_version');
select is(test_helpers.attempt(format($$ update public.contract_template_clauses set body = 'x' where version_id = %L $$, pg_temp.id('p1'))), '42501',
          'w8g_super_admin_cannot_update_clause');
select is(test_helpers.attempt(format($$ delete from public.contract_template_clauses where version_id = %L $$, pg_temp.id('p1'))), '42501',
          'w8g_super_admin_cannot_delete_clause');
select is(test_helpers.attempt(format($$ delete from public.contract_template_versions where id = %L $$, pg_temp.id('p1'))), '42501',
          'w8g_super_admin_cannot_delete_version');
select is(test_helpers.attempt(format($$ insert into public.contract_template_clauses (version_id, section_number, position, clause_key, kind, heading, body, clause_hash)
          values (%L, 15, 9, 'admin_extra', 'editable', 'Extra', 'Extra', repeat('a', 64)) $$, pg_temp.id('p1'))), '42501', 'w8g_super_admin_cannot_insert_clause');
select is(test_helpers.attempt($$ delete from public.contract_templates where scope = 'platform' $$), '42501', 'w8g_super_admin_cannot_delete_platform_template');

-- ---------- every core key stays locked, even for super_admin ----------
select is((select count(*)::int from w8g_core), 15, 'w8g_fifteen_core_keys');
select is((select count(*)::int from w8g_core
           where test_helpers.attempt(format('select pg_temp.publish(pg_temp.platform_input(%L))', k)) = '23514'
             and test_helpers.attempt(format('select pg_temp.publish(pg_temp.platform_input(null, %L))', k)) = '23514'), 15,
          'w8g_every_core_key_cannot_be_dropped_or_downgraded_by_super_admin');

-- ---------- hash stability ----------
select test_helpers.act_as_service();
select is((select count(*)::int from public.contract_template_versions v where v.content_hash <> public.contract_template_version_hash(v.id)), 0,
          'w8g_content_hash_recomputes_equal');
select is((select count(*)::int from public.contract_template_clauses c where c.clause_hash <> public.contract_template_clause_hash(c.section_number,
           c.position, c.clause_key, c.kind, c.heading, c.body)), 0, 'w8g_clause_hash_recomputes_equal');

-- ---------- read RPCs for worker / customer / anon ----------
select test_helpers.act_as_worker('w8g-w1@local.test');
select is((select count(*)::int from public.contract_template_version_clauses(pg_temp.id('p1'))) + (select count(*)::int from public.contract_template_version_diff(pg_temp.id('p1')))
          + (select count(*)::int from public.contract_template_version_history(pg_temp.id('t1'))) + (select count(*)::int from public.contract_template_version_clauses(pg_temp.id('t1v2'))),
          0, 'w8g_worker_read_rpcs_return_nothing');
select test_helpers.act_as_customer('w8g-cu@local.test');
select is((select count(*)::int from public.contract_template_version_clauses(pg_temp.id('p1'))) + (select count(*)::int from public.contract_template_version_diff(pg_temp.id('p1')))
          + (select count(*)::int from public.preview_contract_template_version(pg_temp.id('p1'))) + (select count(*)::int from public.owner_contract_templates()),
          0, 'w8g_customer_read_rpcs_return_nothing');
select test_helpers.act_as_anon();
select is(test_helpers.attempt(format('select * from public.contract_template_version_clauses(%L)', pg_temp.id('p1'))), '42501', 'w8g_anon_read_rpc_denied');

select * from finish();
rollback;
