-- J11: after the first acceptance every change is an amendment - a new draft version that is in force only after the
-- worker accepts it (D-34). Accepting supersedes and keeps the previous version; declining or a withdrawal keeps the
-- current terms; stale hashes are refused; accepted versions cannot be edited; there is no "minor change" path; one
-- open amendment at a time; sending needs a verified shop; the worker sees the change list; termination withdraws a
-- pending amendment and blocks new ones. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j11c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j11c-o1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('j11c-w1@local.test'))::text, true);
create temporary table j11c_ids (label text primary key, id uuid) on commit drop;
grant all on j11c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j11c_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev() returns integer language sql stable security definer as $$ select revision from public.worker_contracts where id = pg_temp.id('c1') $$;
create function pg_temp.state(p_version text) returns text language sql stable security definer as $$ select state from public.contract_versions where id = pg_temp.id(p_version) $$;
create function pg_temp.amend() returns uuid language plpgsql as $$
begin
  perform test_helpers.act_as_owner('j11c-o1@local.test');
  return (public.create_worker_contract_amendment(pg_temp.id('c1'), pg_temp.rev())).id;
end $$;
insert into j11c_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1')));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.fx('w1'));
insert into j11c_ids values ('c1', test_helpers.create_test_contract_draft('j11c-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w1')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j11c-o1@local.test');
insert into j11c_ids values ('v1', test_helpers.send_test_contract(pg_temp.id('c1'), 'j11c-o1@local.test'));
select test_helpers.accept_test_contract(pg_temp.id('c1'), 'j11c-w1@local.test');
select set_config('fx.v1doc', (select content_hash from public.contract_versions where id = pg_temp.id('v1')), true);

-- ---------- amendment v2: a new draft; current terms unchanged until the worker accepts ----------
insert into j11c_ids values ('v2', pg_temp.amend());
select test_helpers.act_as_service();
select is((select version_number || ',' || kind || ',' || state from public.contract_versions where id = pg_temp.id('v2')), '2,amendment,draft',
          'j11_amendment_is_new_draft_version_current_terms_unchanged');
select is((select status || ',' || (current_version_id = pg_temp.id('v1'))::text || ',' || (pending_version_id is null)::text
           from public.worker_contracts where id = pg_temp.id('c1')), 'accepted,true,true', 'j11_amendment_is_new_draft_version_current_terms_unchanged');
select is((select (a.owner_values = b.owner_values and a.editable_bodies = b.editable_bodies and a.shop_terms = b.shop_terms
                   and a.classification_key = b.classification_key and a.start_date = b.start_date)::text
           from public.contract_versions a, public.contract_versions b where a.id = pg_temp.id('v2') and b.id = pg_temp.id('v1')), 'true',
          'j11_amendment_is_new_draft_version_current_terms_unchanged');
select test_helpers.act_as_owner('j11c-o1@local.test');
select throws_ok(format($$ select public.create_worker_contract_amendment(%L, %s) $$, pg_temp.id('c1'), pg_temp.rev()), '23505',
                 'This contract already has an open change.', 'j11_one_open_amendment_at_a_time');
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j11c-o1@local.test', '{"schedule": "Weekends only, as agreed with the worker."}', null,
  '{"pay_details": "A higher daily rate as agreed in writing"}');
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j11c-o1@local.test');
select is((select (current_version_id = pg_temp.id('v1'))::text || ',' || (pending_version_id = pg_temp.id('v2'))::text || ',' || status
           from public.worker_contracts where id = pg_temp.id('c1')), 'true,true,accepted', 'j11_amendment_not_in_force_until_worker_accepts');
select test_helpers.act_as_worker('j11c-w1@local.test');
select is((select current_version_number || ',' || pending_version_number || ',' || pending_version_kind || ',' || array_to_string(allowed_actions, ' ')
           from public.my_worker_contracts() where contract_id = pg_temp.id('c1')), '1,2,amendment,accept_amendment decline_amendment terminate',
          'j11_amendment_not_in_force_until_worker_accepts');
select throws_ok(format($$ select public.create_worker_contract_amendment(%L, %s) $$, pg_temp.id('c1'), pg_temp.rev()), '42501',
                 'Contract not found.', 'j11_every_change_requires_acceptance_no_minor_change_path');
select is((select string_agg(change_kind || ':' || coalesce(item_key, '-'), ',' order by change_kind, item_key)
           from public.worker_contract_version_changes(pg_temp.id('v2'))), 'clause_changed:schedule,contract_detail_changed:pay_details',
          'j11_amendment_changes_listed_for_worker');
select is((select previous_text || ' -> ' || new_text from public.worker_contract_version_changes(pg_temp.id('v2')) where item_key = 'pay_details'),
          'Pay as agreed in writing by both parties -> A higher daily rate as agreed in writing', 'j11_amendment_changes_listed_for_worker');
select throws_ok(format($$ select public.accept_worker_contract_version(%L, %L, %L, 'w9_worker_accept_v1') $$, pg_temp.id('c1'), pg_temp.id('v2'),
                 current_setting('fx.v1doc')), '55000', 'This contract changed. Read the new version before you accept.', 'j11_accept_with_stale_hash_refused');
select is(pg_temp.state('v2'), 'sent_for_review', 'j11_accept_with_stale_hash_refused');
select test_helpers.act_as_service();
select test_helpers.accept_test_contract(pg_temp.id('c1'), 'j11c-w1@local.test');
select is(pg_temp.state('v1') || ',' || pg_temp.state('v2'), 'superseded,accepted', 'j11_worker_accepts_amendment_previous_version_superseded_and_kept');
select is((select (current_version_id = pg_temp.id('v2'))::text || ',' || (pending_version_id is null)::text from public.worker_contracts where id = pg_temp.id('c1')),
          'true,true', 'j11_worker_accepts_amendment_previous_version_superseded_and_kept');
select is((select content_hash from public.contract_versions where id = pg_temp.id('v1')), current_setting('fx.v1doc'),
          'j11_worker_accepts_amendment_previous_version_superseded_and_kept');
select is((select count(*)::int from public.contract_acceptances where contract_id = pg_temp.id('c1')), 4,
          'j11_worker_accepts_amendment_previous_version_superseded_and_kept');

-- ---------- no direct edits, no minor-change path ----------
select test_helpers.act_as_owner('j11c-o1@local.test');
select throws_ok(format($$ select public.save_worker_contract_draft(%L, 1, 'employee', test_helpers.manila_today(), null, '{}', '{}', '[]') $$,
                 pg_temp.id('c1')), '42501', 'This contract change is not allowed.', 'j11_owner_cannot_edit_accepted_version_directly');
select is(test_helpers.attempt(format($$ update public.contract_versions set owner_values = '{}' where id = %L $$, pg_temp.id('v2'))), '42501',
          'j11_owner_cannot_edit_accepted_version_directly');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 1, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c1')), '42501',
                 'This contract change is not allowed.', 'j11_owner_cannot_edit_accepted_version_directly');
select test_helpers.act_as_service();
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '(contract|amend)'
           and p.proname ~ '(minor|silent|quick|direct|patch|edit_accepted|override)'), 0, 'j11_every_change_requires_acceptance_no_minor_change_path');
select is((select count(*)::int from public.contract_versions v where v.contract_id = pg_temp.id('c1') and v.state = 'accepted'
           and not exists (select 1 from public.contract_acceptances a where a.version_id = v.id and a.party_role = 'worker')), 0,
          'j11_every_change_requires_acceptance_no_minor_change_path');

-- ---------- decline, withdraw, verification ----------
insert into j11c_ids values ('v3', pg_temp.amend());
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j11c-o1@local.test', '{"schedule": "Nights only."}');
update public.shops set verification_status = 'pending' where id = pg_temp.id('s1');
select test_helpers.act_as_owner('j11c-o1@local.test');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 2, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c1')), '23514',
                 'Your shop needs a recorded verification before you send a contract.', 'j11_amendment_send_requires_verified_shop');
select test_helpers.act_as_service();
update public.shops set verification_status = 'approved', verification_reviewed_by = pg_temp.fx('a1'), verification_reviewed_at = now() where id = pg_temp.id('s1');
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j11c-o1@local.test');
select test_helpers.act_as_worker('j11c-w1@local.test');
select is((public.decline_worker_contract_version(pg_temp.id('c1'), pg_temp.id('v3'), 'I prefer the current days.')).status, 'accepted',
          'j11_worker_declines_amendment_contract_continues_on_current_version');
select test_helpers.act_as_service();
select is(pg_temp.state('v3') || ',' || (select (current_version_id = pg_temp.id('v2'))::text from public.worker_contracts where id = pg_temp.id('c1')),
          'declined,true', 'j11_worker_declines_amendment_contract_continues_on_current_version');
insert into j11c_ids values ('v4', pg_temp.amend());
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j11c-o1@local.test', '{"schedule": "Afternoons only."}');
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j11c-o1@local.test');
select test_helpers.act_as_owner('j11c-o1@local.test');
select is((public.withdraw_worker_contract_version(pg_temp.id('c1'), pg_temp.id('v4'))).status, 'accepted', 'j11_owner_withdraws_amendment');
select test_helpers.act_as_service();
select is(pg_temp.state('v4') || ',' || (select (current_version_id = pg_temp.id('v2') and pending_version_id is null)::text
                                         from public.worker_contracts where id = pg_temp.id('c1')), 'withdrawn,true', 'j11_owner_withdraws_amendment');

-- ---------- termination withdraws a pending amendment and blocks new ones ----------
insert into j11c_ids values ('v5', pg_temp.amend());
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j11c-o1@local.test', '{"schedule": "Mornings only."}');
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j11c-o1@local.test');
select test_helpers.act_as_worker('j11c-w1@local.test');
select is((public.terminate_worker_contract(pg_temp.id('c1'), pg_temp.rev(), 'I am moving to another city.')).status, 'terminated',
          'j11_termination_withdraws_pending_amendment_and_blocks_new_ones');
select test_helpers.act_as_service();
select is(pg_temp.state('v5') || ',' || (select (pending_version_id is null)::text from public.worker_contracts where id = pg_temp.id('c1')),
          'withdrawn,true', 'j11_termination_withdraws_pending_amendment_and_blocks_new_ones');
select test_helpers.act_as_owner('j11c-o1@local.test');
select throws_ok(format($$ select public.create_worker_contract_amendment(%L, %s) $$, pg_temp.id('c1'), pg_temp.rev()), '42501',
                 'This contract change is not allowed.', 'j11_termination_withdraws_pending_amendment_and_blocks_new_ones');
select test_helpers.act_as_service();

select * from finish();
rollback;
