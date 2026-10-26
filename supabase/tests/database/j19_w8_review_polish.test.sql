-- W8 review polish (DB): owner validator counts / unique sources, invisible characters, safeguard impersonation with
-- punctuation, locked-only placeholders, single-pass render, super_admin publish pinning and claim wording, the w8a
-- function preflight, and the revised starter (locked classification_reasons, training pay clause, safeguards_prevail).
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

select set_config('fx.o1', test_helpers.create_owner('w8p-o1@local.test')::text, true);
select set_config('fx.a1', test_helpers.create_super_admin('w8p-a1@local.test')::text, true);
create temporary table w8p_ids (label text primary key, id uuid) on commit drop;
grant all on w8p_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w8p_ids where label = p_label $$;
insert into w8p_ids values ('p1', test_helpers.latest_platform_contract_version()),
  ('t1', test_helpers.create_test_contract_template('w8p-o1@local.test', 'Polish template'));
-- Owner save on the standard v1 (expected version 1: every save here is refused, so the template stays at v1).
create function pg_temp.save(p_bodies jsonb, p_terms jsonb default '[]') returns uuid language sql as $$
  select (public.save_owner_contract_template_version(pg_temp.id('t1'), 1, pg_temp.id('p1'), p_bodies, p_terms)).id $$;
-- Platform input = the standard v1 clauses with per-key overrides, plus extra clauses appended.
create function pg_temp.platform_input(p_override jsonb default '{}', p_extra jsonb default '[]') returns jsonb
language sql stable security definer as $$
  select jsonb_agg(e order by o) from (
    select jsonb_build_object('section_number', c.section_number, 'clause_key', c.clause_key, 'kind', c.kind, 'heading', c.heading,
             'body', c.body, 'requires_owner_input', c.requires_owner_input) || coalesce(p_override -> c.clause_key, '{}'::jsonb) as e,
           (c.section_number * 100 + c.position)::bigint as o
    from public.contract_template_clauses c where c.version_id = pg_temp.id('p1')
    union all select x.e, 100000 + x.o from jsonb_array_elements(p_extra) with ordinality as x(e, o)) list $$;
create function pg_temp.publish(p_clauses jsonb) returns uuid language sql
as $$ select (public.publish_platform_contract_template_version(1, p_clauses)).id $$;
-- Trusted SQL writing an owner version directly (flag set, no RPC), then forcing the deferred commit validator.
create function pg_temp.forge(p_extra jsonb) returns text language plpgsql as $$
declare
  vid uuid;
  clauses jsonb := (public.contract_template_owner_clause_list(pg_temp.id('p1'), '{}'::jsonb, '[]'::jsonb) -> 'clauses') || p_extra;
begin
  perform set_config('washlink.contract_template_write', pg_temp.id('t1')::text, true);
  insert into public.contract_template_versions (template_id, version_number, base_platform_version_id, content_hash, saved_by_role)
  values (pg_temp.id('t1'), 2, pg_temp.id('p1'), public.contract_template_clauses_content_hash(pg_temp.id('p1'), clauses), 'trusted_session')
  returning id into vid;
  insert into public.contract_template_clauses (version_id, section_number, position, clause_key, kind, heading, body, source_clause_id, clause_hash)
  select vid, x.section_number, x.position, x.clause_key, x.kind, x.heading, x.body, x.source_clause_id, repeat('0', 64)
  from jsonb_to_recordset(clauses) as x(section_number smallint, position smallint, clause_key text, kind text, heading text, body text, source_clause_id uuid);
  set constraints public.contract_template_versions_validate_at_commit immediate;
  set constraints public.contract_template_versions_validate_at_commit deferred;
  return 'validated';
end $$;
create function pg_temp.base_clause(p_key text) returns uuid language sql stable security definer
as $$ select id from public.contract_template_clauses where version_id = pg_temp.id('p1') and clause_key = p_key $$;

-- ---------- 1. owner validator: every standard clause exactly once ----------
select test_helpers.act_as_service();
select throws_ok($$ select pg_temp.forge('[{"section_number": 15, "position": 3, "clause_key": "extra_editable", "kind": "editable",
                    "heading": "Extra clause", "body": "Extra editable text.", "source_clause_id": null}]') $$,
                 '23514', 'Each clause of the standard template must appear exactly once.', 'w8p_owner_version_extra_standard_clause_refused');
select throws_like(format($$ select pg_temp.forge(jsonb_build_array(jsonb_build_object('section_number', 15, 'position', 3,
                    'clause_key', 'attachments_again', 'kind', 'editable', 'heading', 'Attachments', 'body', 'Copy.', 'source_clause_id', %L))) $$,
                   pg_temp.base_clause('attachments_list')), '%ctc_source_unique%', 'w8p_owner_version_source_clause_unique');
select is((select count(*)::int from public.contract_template_versions where template_id = pg_temp.id('t1')), 1, 'w8p_forged_versions_not_written');

-- ---------- 2. invisible characters and safeguard impersonation ----------
select test_helpers.act_as_owner('w8p-o1@local.test');
select throws_ok(format('select pg_temp.save(%L)', jsonb_build_object('schedule', E'Evenings\u200b only.')), '23514',
                 'Remove invisible characters (such as zero-width spaces) from the text.', 'w8p_zero_width_space_refused');
select throws_ok(format('select pg_temp.save(%L, %L)', '{}', jsonb_build_array(jsonb_build_object('section_number', 9,
                 'heading', E'\ufeffExtra duty', 'body', 'A long enough body.'))), '23514',
                 'Remove invisible characters (such as zero-width spaces) from the text.', 'w8p_byte_order_mark_refused');
select throws_ok(format('select pg_temp.save(%L)', jsonb_build_object('schedule', E'Wash\u2060Link safeguard: evenings.')), '23514',
                 'Remove invisible characters (such as zero-width spaces) from the text.', 'w8p_word_joiner_refused');
select throws_ok(format('select pg_temp.save(%L)', jsonb_build_object('schedule', E'Right-to-left mark \u200f here.')), '23514',
                 'Remove invisible characters (such as zero-width spaces) from the text.', 'w8p_direction_mark_refused');
select ok((select bool_and(pg_get_constraintdef(oid) ~ 'u200b-\\u200f\\u2060\\ufeff') from pg_constraint
           where conrelid = 'public.contract_template_clauses'::regclass and conname in ('ctc_heading_length', 'ctc_body_length')),
          'w8p_clause_checks_refuse_invisible_characters');
select throws_ok($$ select pg_temp.save('{"schedule": "W.a.s.h-L.i.n.k  safe_guard: evenings only."}') $$, '23514',
                 'Shop text cannot be labelled as a WashLink safeguard.', 'w8p_punctuated_washlink_safeguard_refused');
select throws_ok($$ select pg_temp.save('{}', '[{"section_number": 15, "heading": "Platform safeguard", "body": "Cannot be edited by anyone."}]') $$,
                 '23514', 'Shop text cannot be labelled as a WashLink safeguard.', 'w8p_platform_safeguard_label_refused');
select throws_ok($$ select pg_temp.save('{"dispute_resolution": "This is a PLATFORM-SAFEGUARD clause."}') $$, '23514',
                 'Shop text cannot be labelled as a WashLink safeguard.', 'w8p_platform_safeguard_punctuated_refused');

-- ---------- 3. relationship type and party names only in locked clauses ----------
select throws_ok($$ select pg_temp.save('{"role_and_duties": "The worker is engaged as {{worker_classification}}."}') $$, '23514',
                 'The relationship type and the party names can appear only in WashLink safeguard clauses.', 'w8p_classification_placeholder_locked_only');
select throws_ok($$ select pg_temp.save('{}', '[{"section_number": 9, "heading": "Owner duty", "body": "{{owner_full_name}} supervises."}]') $$, '23514',
                 'The relationship type and the party names can appear only in WashLink safeguard clauses.', 'w8p_owner_name_placeholder_locked_only');
select throws_ok($$ select pg_temp.save('{"worker_obligations": "{{worker_full_name}} keeps the bay clean."}') $$, '23514',
                 'The relationship type and the party names can appear only in WashLink safeguard clauses.', 'w8p_worker_name_placeholder_locked_only');
select throws_ok($$ select pg_temp.save('{"classification_reasons": "The worker is an independent contractor."}') $$, '23514',
                 'This clause is a WashLink safeguard and cannot be changed.', 'w8p_classification_reasons_not_editable');
select is((select count(*)::int from public.contract_template_versions where template_id = pg_temp.id('t1')), 1, 'w8p_refused_owner_saves_wrote_nothing');
select lives_ok($$ select pg_temp.save('{"business_and_location": "We wash cars at {{shop_name}}, {{shop_address}}."}') $$,
                'w8p_shop_placeholders_still_allowed_in_editable_text');

-- ---------- 4. single-pass render ----------
select test_helpers.act_as_service();
select throws_ok($$ select public.render_contract_template_clause('Pay: {{pay_details}}. Type: {{worker_classification}}.',
                    '{"pay_details": "{{worker_classification}}", "worker_classification": "Employee"}') $$, '22023',
                 'Placeholder values cannot contain {{ or }}.', 'w8p_render_refuses_braces_in_values');
select throws_ok($$ select public.render_contract_template_clause('Pay: {{pay_details}}.', '{"pay_details": "weekly }}"}') $$, '22023',
                 'Placeholder values cannot contain {{ or }}.', 'w8p_render_refuses_closing_braces_in_values');
select is(public.render_contract_template_clause('{{shop_name}} and {{shop_name}} at {{shop_address}}; {{zz_unknown}} stays.',
            '{"shop_name": "Shop {A}", "shop_address": "Main road"}'),
          'Shop {A} and Shop {A} at Main road; {{zz_unknown}} stays.', 'w8p_render_single_pass_in_order');
select is(public.render_contract_template_clause('Type: {{worker_classification}}.', null),
          'Type: [Relationship type - chosen per contract, not preselected].', 'w8p_render_labels_without_values');

-- ---------- 5. super_admin publish: pinned sections, locked keys, no claim wording ----------
select test_helpers.act_as_admin('w8p-a1@local.test');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{"customer_data_minimum": {"section_number": 12}}')) $$, '23514',
                 'These WashLink safeguard clauses must stay in their own sections: customer_data_minimum.', 'w8p_core_key_pinned_to_section');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{"safety_terms_need_review": {"kind": "editable"}}')) $$, '23514',
                 'The standard template must keep these WashLink safeguard clauses locked: safety_terms_need_review.', 'w8p_w8_l10_keys_core');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{"classification_reasons": {"kind": "editable"}}')) $$, '23514',
                 'The standard template must keep these WashLink safeguard clauses locked: classification_reasons.', 'w8p_classification_reasons_core');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{}', '[{"section_number": 4, "clause_key": "more_reasons", "kind": "editable",
                    "heading": "More reasons", "body": "[Shop: explain.]"}]')) $$, '23514',
                 'Section 4 can hold only WashLink safeguard clauses.', 'w8p_section_four_locked_only');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{"pay_terms": {"body": "[Shop: state the pay {{pay_details}}. This agreement is binding.]"}}')) $$,
                 '23514', 'The standard template cannot say it is reviewed, approved, valid, binding, signed or compliant.', 'w8p_platform_claim_binding_refused');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{"attachments_list": {"heading": "Signed attachments"}}')) $$,
                 '23514', 'The standard template cannot say it is reviewed, approved, valid, binding, signed or compliant.', 'w8p_platform_claim_signed_refused');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{"template_is_draft": {"body": "This template is a draft. It has been reviewed and is legally compliant."}}')) $$,
                 '23514', 'The standard template cannot say it is reviewed, approved, valid, binding, signed or compliant.', 'w8p_template_is_draft_must_stay_negated');
select throws_ok($$ select pg_temp.publish(pg_temp.platform_input('{"schedule": {"body": "[Shop: describe the hours {{schedule_summary}} for {{worker_classification}}.]"}}')) $$,
                 '23514', 'The relationship type and the party names can appear only in WashLink safeguard clauses.', 'w8p_platform_editable_placeholder_locked_only');
select lives_ok($$ select pg_temp.publish(pg_temp.platform_input('{"role_and_duties": {"body": "[Shop: describe the role {{role_title}} and the tasks assigned.]"}}')) $$,
                'w8p_platform_publish_with_neutral_wording_allowed');

-- ---------- 6. w8a preflight refuses foreign contract_template functions ----------
select test_helpers.act_as_service();
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and strpos(p.proname, 'contract_template') > 0
           and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'W8%'), 0, 'w8p_every_w8_function_has_w8_comment');
create temporary table w8p_preflight on commit drop as
  select statements[1] as sql from supabase_migrations.schema_migrations where name = 'w8a_contract_templates_preflight';
select lives_ok((select sql from w8p_preflight), 'w8p_preflight_passes_on_w8_objects');
create function public.contract_template_foreign_probe() returns integer language sql as $$ select 1 $$;
select throws_like((select sql from w8p_preflight), '%contract template functions exist that W8 did not create: %contract_template_foreign_probe()%',
                   'w8p_preflight_refuses_foreign_contract_template_function');
drop function public.contract_template_foreign_probe();

-- ---------- 7-9. revised starter ----------
select ok(public.contract_template_core_safeguard_keys() @> array['parties_named', 'safety_terms_need_review', 'customer_data_minimum',
            'classification_reasons'], 'w8p_w8_l10_keys_core');
select is((select array_agg(clause_key || ':' || kind order by position) from public.contract_template_clauses
           where version_id = pg_temp.id('p1') and section_number = 4),
          array['classification_not_preselected:locked_safeguard', 'classification_reasons:locked_safeguard'], 'w8p_starter_section_four_all_locked');
select is((select row(kind, body ~ '[0-9]', body ~* '\m(complian|approved|valid|reviewed|binding|signed|law|legal)')::text
           from public.contract_template_clauses where version_id = pg_temp.id('p1') and clause_key = 'training_pay_or_reimbursement' and section_number = 8),
          row('locked_safeguard', false, false)::text, 'w8p_starter_training_pay_clause_locked_neutral');
select ok((select body ~ 'writes or edits' and body ~ 'Shop-specific terms' and body ~ 'attachments' from public.contract_template_clauses
           where version_id = pg_temp.id('p1') and clause_key = 'safeguards_prevail'), 'w8p_starter_safeguards_prevail_covers_owner_edits');

select * from finish();
rollback;
