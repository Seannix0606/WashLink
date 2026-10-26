-- J10: a sent contract version is sealed with its own fully rendered plain text and a sha256 hash that recomputes
-- from the stored text (P46, P48); later template saves, a new platform standard and owner account deletion leave the
-- accepted text unchanged; sealed versions, clauses, flags and acceptances are immutable for every session; each
-- acceptance record names the version, its hash and the label "Acceptance record — not an e-signature" (P47).
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j10c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j10c-o1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('j10c-w1@local.test'))::text, true);
create temporary table j10c_ids (label text primary key, id uuid) on commit drop;
grant all on j10c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j10c_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j10c_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1'))),
  ('p1', test_helpers.latest_platform_contract_version()), ('t1', test_helpers.create_test_contract_template('j10c-o1@local.test', 'Crew agreement'));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.fx('w1'));
insert into j10c_ids values ('t1v2', test_helpers.save_test_template_version(pg_temp.id('t1'), 'j10c-o1@local.test', '{"schedule": "Mornings, as agreed each week."}'));
insert into j10c_ids values ('c1', test_helpers.create_test_contract_draft('j10c-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w1'), pg_temp.id('t1v2')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j10c-o1@local.test', '{"schedule": null}',
  '[{"section_number": 9, "heading": "Cleaning", "body": "The worker cleans the bay at the end of the shift."}]');
insert into j10c_ids values ('v1', test_helpers.send_test_contract(pg_temp.id('c1'), 'j10c-o1@local.test'));
create function pg_temp.doc() returns text language sql stable security definer as $$
  select content_hash || ':' || md5(rendered_text) from public.contract_versions where id = pg_temp.id('v1') $$;

-- ---------- sealing, hash, text format ----------
select is((select state || ',' || (content_hash ~ '^[0-9a-f]{64}$')::text || ',' || (sealed_at is not null)::text || ',' || (sealed_txid = txid_current())::text
           || ',' || (render_values ? 'worker_full_name')::text from public.contract_versions where id = pg_temp.id('v1')),
          'sent_for_review,true,true,true,true', 'j10_sent_version_sealed_with_rendered_text_and_sha256_hash');
select is((select count(*)::int from public.contract_version_clauses where version_id = pg_temp.id('v1')),
          (select count(*)::int from public.contract_template_clauses where version_id = pg_temp.id('p1')) + 1,
          'j10_sent_version_sealed_with_rendered_text_and_sha256_hash');
select is((select encode(sha256(convert_to(rendered_text, 'UTF8')), 'hex') from public.contract_versions where id = pg_temp.id('v1')),
          (select content_hash from public.contract_versions where id = pg_temp.id('v1')), 'j10_hash_recomputes_from_stored_text');
select lives_ok(format($$ select public.validate_worker_contract_version(%L) $$, pg_temp.id('v1')), 'j10_hash_recomputes_from_stored_text');
set constraints all immediate;   -- the commit-time validator runs now and passes
set constraints all deferred;
select pass('j10_hash_recomputes_from_stored_text');
select is((select count(*)::int from public.contract_template_sections s, public.contract_versions v
           where v.id = pg_temp.id('v1') and strpos(v.rendered_text, E'\n\n' || s.section_number || '. ' || s.title || E'\n' || s.review_notice || E'\n\n') > 0),
          15, 'j10_rendered_text_includes_section_titles_notices_and_labels');
select is((select split_part(rendered_text, E'\n', 1) || '|' || split_part(rendered_text, E'\n', 2) || '|' || split_part(rendered_text, E'\n', 3) || '|'
                  || split_part(rendered_text, E'\n', 4) || '|' || split_part(rendered_text, E'\n', 6) || '|' || split_part(rendered_text, E'\n', 7)
           from public.contract_versions where id = pg_temp.id('v1')),
          'Crew agreement|Contract reference: ' || pg_temp.id('c1') || '|Version 1 (initial)|Based on WashLink standard template version '
            || (select version_number from public.contract_template_versions where id = pg_temp.id('p1'))
            || '|Draft — requires review by a qualified Philippine labor-law professional|Acceptance record — not an e-signature',
          'j10_rendered_text_includes_section_titles_notices_and_labels');
select ok((select strpos(rendered_text, 'Relationship type: ' || classification_label) > 0 and strpos(rendered_text, '{{') = 0
                  and strpos(rendered_text, E'\n\nCleaning\nThe worker cleans the bay at the end of the shift.') > 0
                  and strpos(rendered_text, 'The relationship type under this agreement is: ' || classification_label) > 0
           from public.contract_versions where id = pg_temp.id('v1')), 'j10_rendered_text_includes_section_titles_notices_and_labels');

-- ---------- immutability for every session (trusted superuser with the write flag included) ----------
select set_config('washlink.worker_contract_write', pg_temp.id('c1')::text, true);
select is(array[test_helpers.attempt(format($$ update public.contract_versions set rendered_text = 'Changed' where id = %L $$, pg_temp.id('v1'))),
                test_helpers.attempt(format($$ update public.contract_versions set content_hash = repeat('a', 64) where id = %L $$, pg_temp.id('v1'))),
                test_helpers.attempt(format($$ update public.contract_versions set owner_values = '{}' where id = %L $$, pg_temp.id('v1'))),
                test_helpers.attempt(format($$ delete from public.contract_versions where id = %L $$, pg_temp.id('v1')))],
          array['42501', '42501', '42501', '42501'], 'j10_sealed_versions_clauses_flags_and_acceptances_immutable_for_every_session');
select is(array[test_helpers.attempt(format($$ update public.contract_version_clauses set body = 'Changed' where version_id = %L $$, pg_temp.id('v1'))),
                test_helpers.attempt(format($$ delete from public.contract_version_clauses where version_id = %L $$, pg_temp.id('v1'))),
                test_helpers.attempt(format($$ insert into public.contract_version_clauses (version_id, section_number, section_title, review_notice, position,
                  kind, heading, body, change, edited_in, clause_hash) values (%L, 15, 't', 'n', 9, 'shop_specific', 'Extra', 'Extra term added later.',
                  'added_by_shop', 'contract', repeat('0', 64)) $$, pg_temp.id('v1'))),
                test_helpers.attempt(format($$ insert into public.contract_version_flags (version_id, value_key, rule_key, category, excerpt)
                  values (%L, 'pay_details', 'deposit', 'deposit', 'x') $$, pg_temp.id('v1')))],
          array['42501', '42501', '42501', '42501'], 'j10_sealed_versions_clauses_flags_and_acceptances_immutable_for_every_session');
select is(array[test_helpers.attempt(format($$ update public.contract_acceptances set accepted_at = now() - interval '1 day' where contract_id = %L $$, pg_temp.id('c1'))),
                test_helpers.attempt(format($$ update public.contract_acceptances set party_name_snapshot = 'Someone else' where contract_id = %L $$, pg_temp.id('c1'))),
                test_helpers.attempt(format($$ delete from public.contract_acceptances where contract_id = %L $$, pg_temp.id('c1')))],
          array['42501', '42501', '42501'], 'j10_sealed_versions_clauses_flags_and_acceptances_immutable_for_every_session');
select set_config('washlink.worker_contract_write', '', true);
select test_helpers.act_as_owner('j10c-o1@local.test');
select is(array[test_helpers.attempt(format($$ update public.contract_versions set rendered_text = 'Changed' where id = %L $$, pg_temp.id('v1'))),
                test_helpers.attempt(format($$ delete from public.contract_acceptances where contract_id = %L $$, pg_temp.id('c1')))],
          array['42501', '42501'], 'j10_sealed_versions_clauses_flags_and_acceptances_immutable_for_every_session');
select test_helpers.act_as_service();
select test_helpers.accept_test_contract(pg_temp.id('c1'), 'j10c-w1@local.test');
select set_config('fx.doc', pg_temp.doc(), true);
select test_helpers.act_as_worker('j10c-w1@local.test');
select is(test_helpers.attempt(format($$ update public.contract_acceptances set version_content_hash = repeat('b', 64) where contract_id = %L $$, pg_temp.id('c1'))),
          '42501', 'j10_sealed_versions_clauses_flags_and_acceptances_immutable_for_every_session');

-- ---------- acceptance records ----------
select is((select string_agg(party_role || ':' || version_number || ':' || (version_content_hash = (select content_hash from public.contract_versions where id = pg_temp.id('v1')))::text
                             || ':' || record_label, ',' order by party_role) from public.worker_contract_acceptances(pg_temp.id('c1'))),
          'owner:1:true:Acceptance record — not an e-signature,worker:1:true:Acceptance record — not an e-signature',
          'j10_acceptance_records_version_hash_and_label_not_e_signature');
select is((select string_agg(a.statement_key || '=' || (a.statement_text = t.statement_text)::text, ',' order by a.party_role)
           from public.worker_contract_acceptances(pg_temp.id('c1')) a join public.contract_acknowledgement_texts t on t.ack_key = a.statement_key),
          'w9_owner_send_v1=true,w9_worker_accept_v1=true', 'j10_acceptance_records_version_hash_and_label_not_e_signature');
select is((select record_label from public.worker_contract_version_document(pg_temp.id('v1'))), 'Acceptance record — not an e-signature',
          'j10_acceptance_records_version_hash_and_label_not_e_signature');
select test_helpers.act_as_service();
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'contract_acceptances'
           and column_name ~* '(signature|sign_|ip_|device|user_agent|typed|image|location)'), 0, 'j10_acceptance_records_version_hash_and_label_not_e_signature');
select is((select party_id from public.contract_acceptances where contract_id = pg_temp.id('c1') and party_role = 'worker'), pg_temp.fx('w1'),
          'j10_acceptance_records_version_hash_and_label_not_e_signature');

-- ---------- later template / standard changes do not touch the sealed text ----------
select test_helpers.save_test_template_version(pg_temp.id('t1'), 'j10c-o1@local.test', '{"schedule": "Evenings only from now on."}');
select is(pg_temp.doc(), current_setting('fx.doc'), 'j10_owner_saves_new_template_version_accepted_text_unchanged');
select is((select template_version_id from public.contract_versions where id = pg_temp.id('v1')), pg_temp.id('t1v2'),
          'j10_owner_saves_new_template_version_accepted_text_unchanged');
select test_helpers.act_as_admin('j10c-a1@local.test');
select public.publish_platform_contract_template_version(
  (select current_version_number from public.contract_templates where scope = 'platform'),
  (select jsonb_agg(jsonb_build_object('section_number', c.section_number, 'clause_key', c.clause_key, 'kind', c.kind, 'heading', c.heading,
                                       'requires_owner_input', c.requires_owner_input,
                                       'body', case when c.clause_key = 'attachments_list' then '[Shop: list each attachment by its title, or write "None".]'
                                                    else c.body end) order by c.section_number, c.position)
   from public.contract_template_version_clauses(pg_temp.id('p1')) c));
select test_helpers.act_as_service();
select isnt(test_helpers.latest_platform_contract_version(), pg_temp.id('p1'), 'j10_new_platform_standard_published_accepted_text_unchanged');
select is(pg_temp.doc() || ',' || (select base_platform_version_id::text from public.contract_versions where id = pg_temp.id('v1')),
          current_setting('fx.doc') || ',' || pg_temp.id('p1'), 'j10_new_platform_standard_published_accepted_text_unchanged');

-- ---------- owner account deletion keeps the accepted text for the worker ----------
delete from auth.users where id = pg_temp.fx('o1');
select is((select status || ',' || (owner_id is null)::text || ',' || (shop_id is null)::text || ',' || (owner_removed_at is not null)::text
                  || ',' || (shop_removed_at is not null)::text from public.worker_contracts where id = pg_temp.id('c1')),
          'accepted,true,true,true,true', 'j10_owner_account_deletion_keeps_accepted_text_for_worker');
select is((select (template_version_id is null)::text || ',' || (created_by is null)::text from public.contract_versions where id = pg_temp.id('v1')),
          'true,true', 'j10_owner_account_deletion_keeps_accepted_text_for_worker');
select is(pg_temp.doc(), current_setting('fx.doc'), 'j10_owner_account_deletion_keeps_accepted_text_for_worker');
select test_helpers.act_as_worker('j10c-w1@local.test');
select is((select content_hash || ':' || md5(rendered_text) from public.worker_contract_version_document(pg_temp.id('v1'))), current_setting('fx.doc'),
          'j10_owner_account_deletion_keeps_accepted_text_for_worker');
select is((select count(*)::int from public.worker_contract_acceptances(pg_temp.id('c1'))), 2, 'j10_owner_account_deletion_keeps_accepted_text_for_worker');
select test_helpers.act_as_service();

select * from finish();
rollback;
