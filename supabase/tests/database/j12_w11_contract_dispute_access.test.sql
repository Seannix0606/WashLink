-- J12 (W11): contract access through a reported problem (D-47; W11 PLAN P70). A super_admin reads contract metadata,
-- sealed versions, acceptance records and the live (worker, owner) relationship status ONLY through the case functions,
-- ONLY while that dispute is open, and every call is audited; documents only for versions of that contract; nothing
-- without an open dispute. Other owners / workers cannot raise or read; party reads never show administrator ids; the
-- relationship block has no count or other owners; a closed dispute hides the contract block. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j12a-a1@local.test')::text, true);
create temporary table j12a_ids (label text primary key, id uuid) on commit drop;
grant all on j12a_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j12a_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j12a_ids select 'o' || n, test_helpers.create_owner('j12a-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j12a_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j12a-w' || n || '@local.test')) from generate_series(1, 2) n;
insert into j12a_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 2) n;
insert into j12a_ids values ('k1', test_helpers.create_active_test_contract('j12a-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j12a-w1@local.test')),
  ('k2', test_helpers.create_active_test_contract('j12a-o2@local.test', pg_temp.id('s2'), pg_temp.id('w1'), 'j12a-w1@local.test'));
insert into j12a_ids select 'v1', current_version_id from public.worker_contracts where id = pg_temp.id('k1');
insert into j12a_ids select 'v2', current_version_id from public.worker_contracts where id = pg_temp.id('k2');
insert into j12a_ids values ('d1', test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j12a-w1@local.test'));
create function pg_temp.case_json(p_label text) returns jsonb language sql as $$ select public.admin_contract_dispute_case(pg_temp.id(p_label)) $$;
create function pg_temp.doc(p_dispute text, p_version text) returns text language sql
as $$ select string_agg(content_hash || ',' || record_label, ';') from public.admin_contract_dispute_version_document(pg_temp.id(p_dispute), pg_temp.id(p_version)) $$;
create function pg_temp.views(p_label text) returns int language sql stable security definer
as $$ select count(*)::int from public.workforce_audit_events where action = 'worker_contract_dispute.case_viewed' and payload ->> 'dispute_id' = pg_temp.id(p_label)::text $$;

-- ---------- open dispute: case read with the contract block ----------
select test_helpers.act_as_admin('j12a-a1@local.test');
select set_config('fx.case1', pg_temp.case_json('d1')::text, true);
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('fx.case1')::jsonb) k),
          array['acceptances', 'contract', 'dispute', 'relationship', 'versions'], 'j12_w11_admin_reads_contract_only_while_dispute_open');
select is((select row(c -> 'contract' ->> 'status', c -> 'contract' ->> 'effective_status', c -> 'contract' ->> 'classification_key',
                      jsonb_array_length(c -> 'versions'), jsonb_array_length(c -> 'acceptances'), c -> 'versions' -> 0 ->> 'content_hash' is not null)::text
           from (select current_setting('fx.case1')::jsonb c) x), '(active,active,employee,1,2,t)', 'j12_w11_admin_reads_contract_only_while_dispute_open');
select is((select array_agg(a ->> 'party_role' || ':' || (a ->> 'record_label') order by a ->> 'party_role')
           from jsonb_array_elements(current_setting('fx.case1')::jsonb -> 'acceptances') a),
          array['owner:Acceptance record — not an e-signature', 'worker:Acceptance record — not an e-signature'],
          'j12_w11_admin_reads_contract_only_while_dispute_open');
select is(current_setting('fx.case1')::jsonb -> 'dispute' ->> 'statement', 'The local test contract terms need a closer look',
          'j12_w11_admin_reads_contract_only_while_dispute_open');

-- ---------- every call audited; first view stamped once; no revision change ----------
select test_helpers.act_as_service();
select set_config('fx.first_view', (select first_viewed_by_admin_at::text from public.worker_contract_disputes where id = pg_temp.id('d1')), true);
select is(pg_temp.views('d1'), 1, 'j12_w11_admin_case_read_audited_each_call');
select test_helpers.act_as_admin('j12a-a1@local.test');
select ok(pg_temp.case_json('d1') ? 'contract', 'j12_w11_admin_case_read_audited_each_call');
select test_helpers.act_as_service();
select is(pg_temp.views('d1'), 2, 'j12_w11_admin_case_read_audited_each_call');
select is((select first_viewed_by_admin_at::text || ',' || revision from public.worker_contract_disputes where id = pg_temp.id('d1')),
          current_setting('fx.first_view') || ',1', 'j12_w11_admin_case_read_audited_each_call');
select is((select actor_id = pg_temp.fx('a1') and actor_role = 'super_admin' and subject_type = 'worker_contract' and subject_id = pg_temp.id('k1')
           from public.workforce_audit_events where action = 'worker_contract_dispute.case_viewed' order by id desc limit 1), true,
          'j12_w11_admin_case_read_audited_each_call');

-- ---------- documents: only versions of that contract ----------
select set_config('fx.v1_doc', (select md5(rendered_text) || ',' || content_hash from public.contract_versions where id = pg_temp.id('v1')), true);
select test_helpers.act_as_admin('j12a-a1@local.test');
select is((select string_agg(md5(d.rendered_text) || ',' || d.content_hash || ',' || d.record_label, ';')
           from public.admin_contract_dispute_version_document(pg_temp.id('d1'), pg_temp.id('v1')) d),
          current_setting('fx.v1_doc') || ',Acceptance record — not an e-signature', 'j12_w11_admin_document_only_for_versions_of_that_contract');
select is(pg_temp.doc('d1', 'v2'), null, 'j12_w11_admin_document_only_for_versions_of_that_contract');
select test_helpers.act_as_service();
select is(pg_temp.views('d1') || ',' || (select count(*) from public.workforce_audit_events where action = 'worker_contract_dispute.case_viewed'
                                          and payload ->> 'version_id' = pg_temp.id('v1')::text),
          '3,1', 'j12_w11_admin_document_only_for_versions_of_that_contract');

-- ---------- nothing without an open dispute ----------
select test_helpers.act_as_admin('j12a-a1@local.test');
select is((select count(*) from public.worker_contracts) + (select count(*) from public.contract_versions) + (select count(*) from public.contract_acceptances)
          + (select count(*) from public.my_worker_contracts()) + (select count(*) from public.worker_contract_version_document(pg_temp.id('v2')))
          + (select count(*) from public.my_contract_disputes()), 0::bigint, 'j12_w11_admin_reads_nothing_without_dispute');
select is((select count(*)::int from public.admin_contract_dispute_queue('open') q where q.contract_id = pg_temp.id('k2')), 0,
          'j12_w11_admin_reads_nothing_without_dispute');
select is(pg_temp.doc('d1', 'v2'), null, 'j12_w11_admin_reads_nothing_without_dispute');

-- ---------- other parties ----------
select test_helpers.act_as_owner('j12a-o2@local.test');
select throws_ok(format('select public.raise_contract_dispute(%L, %L, %L)', pg_temp.id('k1'), 'other', 'Another owner tries to report this'),
                 '42501', 'Contract not found.', 'j12_w11_other_owner_and_worker_cannot_raise_or_read_disputes');
select is((select count(*) from public.my_contract_disputes()) + (select count(*) from public.worker_contract_disputes)
          + (select count(*) from public.admin_contract_dispute_queue('open')), 0::bigint, 'j12_w11_other_owner_and_worker_cannot_raise_or_read_disputes');
select throws_ok(format('select public.admin_contract_dispute_case(%L)', pg_temp.id('d1')), '42501',
                 'Only a platform administrator can read reported contract problems.', 'j12_w11_other_owner_and_worker_cannot_raise_or_read_disputes');
select test_helpers.act_as_worker('j12a-w2@local.test');
select throws_ok(format('select public.raise_contract_dispute(%L, %L, %L)', pg_temp.id('k1'), 'other', 'Another worker tries to report this'),
                 '42501', 'Contract not found.', 'j12_w11_other_owner_and_worker_cannot_raise_or_read_disputes');
select is((select count(*) from public.my_contract_disputes()) + (select count(*) from public.worker_contract_disputes), 0::bigint,
          'j12_w11_other_owner_and_worker_cannot_raise_or_read_disputes');
select throws_ok(format('select * from public.admin_contract_dispute_version_document(%L, %L)', pg_temp.id('d1'), pg_temp.id('v1')), '42501',
                 'Only a platform administrator can read reported contract problems.', 'j12_w11_other_owner_and_worker_cannot_raise_or_read_disputes');

-- ---------- party reads hide administrator ids ----------
select test_helpers.act_as_owner('j12a-o1@local.test');
select is((select row(m.raised_by_me, m.washlink_has_viewed, m.can_respond, m.counterpart_name)::text from public.my_contract_disputes() m),
          '(f,t,t,"Local Test Worker")', 'j12_w11_party_reads_hide_admin_ids');
select is((select count(*)::int from public.my_contract_disputes() m where to_jsonb(m)::text like '%' || pg_temp.fx('a1')::text || '%'), 0,
          'j12_w11_party_reads_hide_admin_ids');
select test_helpers.act_as_service();
select is((select count(*)::int from pg_proc p, unnest(p.proargnames) a where p.oid in ('public.my_contract_disputes()'::regprocedure,
             'public.my_certification_platform_reviews()'::regprocedure, 'public.owner_certification_platform_reviews()'::regprocedure)
             and a ~ '(closed_by|decided_by|response_by|raised_by$|admin|viewer)'), 0, 'j12_w11_party_reads_hide_admin_ids');

-- ---------- relationship block ----------
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('fx.case1')::jsonb -> 'relationship') k), array['status', 'status_reason'],
          'j12_w11_relationship_block_has_no_count_or_other_owners');
select is(current_setting('fx.case1')::jsonb -> 'relationship', '{"status": "active", "status_reason": "contract_active"}'::jsonb,
          'j12_w11_relationship_block_has_no_count_or_other_owners');
select is((select count(*)::int from (select current_setting('fx.case1') t) x
           where x.t like '%' || pg_temp.id('o2')::text || '%' or x.t like '%' || pg_temp.id('k2')::text || '%' or x.t ~ '(remaining|minimum|qualifying|goal)'),
          0, 'j12_w11_relationship_block_has_no_count_or_other_owners');

-- ---------- closed dispute hides the contract block ----------
select test_helpers.act_as_admin('j12a-a1@local.test');
select is((public.close_contract_dispute(pg_temp.id('d1'), 1, 'no_platform_action', 'WashLink recorded the problem and took no action')).status, 'closed',
          'j12_w11_closed_dispute_hides_contract_block');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.case_json('d1')) k), array['dispute'], 'j12_w11_closed_dispute_hides_contract_block');
select is(pg_temp.doc('d1', 'v1'), null, 'j12_w11_closed_dispute_hides_contract_block');
select test_helpers.act_as_service();
select is(pg_temp.views('d1'), 4, 'j12_w11_closed_dispute_hides_contract_block');

select * from finish();
rollback;
