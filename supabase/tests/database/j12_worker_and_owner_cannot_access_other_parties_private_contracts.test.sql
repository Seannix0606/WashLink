-- J12: worker contracts are private to their two parties. Another owner, another worker, customers, super_admin and
-- anon read nothing (contracts, versions, clauses, flags, acceptances); the worker never reads an unsent draft or a
-- draft amendment; reads return nothing for foreign ids; foreign actions report "Contract not found."; the owner cannot
-- accept or decline for the worker; the eligible-worker list shows names only and only reachable workers; notifications
-- carry no contract text, pay, reasons or names. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j12c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j12c-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j12c-o2@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j12c-cu@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('j12c-w1@local.test'))::text, true);
select set_config('fx.w2', test_helpers.create_worker_profile(test_helpers.create_worker('j12c-w2@local.test'))::text, true);
select set_config('fx.w3', test_helpers.create_worker_profile(test_helpers.create_worker('j12c-w3@local.test'))::text, true);
create temporary table j12c_ids (label text primary key, id uuid) on commit drop;
grant all on j12c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j12c_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.visible() returns text language sql stable as $$
  select format('contracts=%s,versions=%s,clauses=%s,flags=%s,acceptances=%s', (select count(*) from public.worker_contracts),
                (select count(*) from public.contract_versions), (select count(*) from public.contract_version_clauses),
                (select count(*) from public.contract_version_flags), (select count(*) from public.contract_acceptances)) $$;
create function pg_temp.via_reads(p_contract uuid, p_version uuid) returns integer language sql stable as $$
  select ((select count(*) from public.worker_contract_versions(p_contract)) + (select count(*) from public.worker_contract_version_document(p_version))
        + (select count(*) from public.worker_contract_version_clauses(p_version)) + (select count(*) from public.worker_contract_version_flags(p_version))
        + (select count(*) from public.worker_contract_version_changes(p_version)) + (select count(*) from public.worker_contract_acceptances(p_contract))
        + (select count(*) from public.preview_worker_contract_draft(p_contract)))::int $$;
insert into j12c_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1'))),
                            ('s2', test_helpers.create_verified_shop(pg_temp.fx('o2'), pg_temp.fx('a1')));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.fx('w1'));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.fx('w2'));
select test_helpers.create_accepted_application(pg_temp.id('s2'), pg_temp.fx('w3'));
select test_helpers.create_job_application(test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Submitted only')),
                                           pg_temp.fx('w3'), 'submitted');
insert into public.worker_private_contacts (profile_id, contact_phone, contact_email, preferred_contact_method)
values (pg_temp.fx('w1'), '+63 917 555 0101', 'j12c-w1-private@local.test', 'phone');
insert into j12c_ids values ('c1', test_helpers.create_test_contract_draft('j12c-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w1')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j12c-o1@local.test', '{}',
  '[{"section_number": 7, "heading": "Locker", "body": "The worker pays a deposit for the locker key."}]', '{"pay_details": "Daily pay of QUOKKA pesos"}');
insert into j12c_ids values ('v1', test_helpers.send_test_contract(pg_temp.id('c1'), 'j12c-o1@local.test'));
select test_helpers.accept_test_contract(pg_temp.id('c1'), 'j12c-w1@local.test');
select test_helpers.act_as_owner('j12c-o1@local.test');
insert into j12c_ids values ('v2', (public.create_worker_contract_amendment(pg_temp.id('c1'), pg_temp.rev('c1'))).id);
select test_helpers.act_as_service();
insert into j12c_ids values ('c2', test_helpers.create_test_contract_draft('j12c-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w2')));
insert into j12c_ids select 'c2v1', id from public.contract_versions where contract_id = pg_temp.id('c2');

-- ---------- per-audience reads ----------
select test_helpers.act_as_owner('j12c-o1@local.test');
select ok(pg_temp.visible() ~ '^contracts=2,versions=3,clauses=[1-9][0-9]*,flags=1,acceptances=2$', 'j12_other_owner_reads_no_contracts_versions_clauses_flags_or_acceptances');
select test_helpers.act_as_owner('j12c-o2@local.test');
select is(pg_temp.visible(), 'contracts=0,versions=0,clauses=0,flags=0,acceptances=0', 'j12_other_owner_reads_no_contracts_versions_clauses_flags_or_acceptances');
select is((select count(*)::int from public.owner_worker_contracts()) + pg_temp.via_reads(pg_temp.id('c1'), pg_temp.id('v1')), 0,
          'j12_other_owner_reads_no_contracts_versions_clauses_flags_or_acceptances');
select test_helpers.act_as_worker('j12c-w2@local.test');
select is(pg_temp.visible(), 'contracts=0,versions=0,clauses=0,flags=0,acceptances=0', 'j12_other_worker_reads_nothing');
select is((select count(*)::int from public.my_worker_contracts()) + pg_temp.via_reads(pg_temp.id('c1'), pg_temp.id('v1'))
          + pg_temp.via_reads(pg_temp.id('c2'), pg_temp.id('c2v1')), 0, 'j12_other_worker_reads_nothing');
select test_helpers.act_as_worker('j12c-w1@local.test');
select ok(pg_temp.visible() ~ '^contracts=1,versions=1,clauses=[1-9][0-9]*,flags=1,acceptances=2$', 'j12_worker_cannot_read_unsent_draft_or_draft_amendment');
select is((select string_agg(version_number::text, ',') from public.worker_contract_versions(pg_temp.id('c1'))), '1',
          'j12_worker_cannot_read_unsent_draft_or_draft_amendment');
select is((select count(*)::int from public.worker_contract_version_document(pg_temp.id('v2'))) + (select count(*)::int from public.preview_worker_contract_draft(pg_temp.id('c1')))
          + (select count(*)::int from public.worker_contract_version_changes(pg_temp.id('v2'))), 0, 'j12_worker_cannot_read_unsent_draft_or_draft_amendment');
select is((select pending_version_id from public.my_worker_contracts() where contract_id = pg_temp.id('c1')), null,
          'j12_worker_cannot_read_unsent_draft_or_draft_amendment');
select test_helpers.act_as_customer('j12c-cu@local.test');
select is(pg_temp.visible() || ',' || ((select count(*) from public.owner_worker_contracts()) + (select count(*) from public.my_worker_contracts())
          + pg_temp.via_reads(pg_temp.id('c1'), pg_temp.id('v1'))), 'contracts=0,versions=0,clauses=0,flags=0,acceptances=0,0',
          'j12_customer_anon_and_super_admin_read_nothing');
select test_helpers.act_as_admin('j12c-a1@local.test');
select is(pg_temp.visible() || ',' || ((select count(*) from public.owner_worker_contracts()) + (select count(*) from public.my_worker_contracts())
          + (select count(*) from public.owner_contract_eligible_workers()) + pg_temp.via_reads(pg_temp.id('c1'), pg_temp.id('v1'))),
          'contracts=0,versions=0,clauses=0,flags=0,acceptances=0,0', 'j12_customer_anon_and_super_admin_read_nothing');
select test_helpers.act_as_anon();
select is((select count(*)::int from unnest(array['worker_contracts', 'contract_versions', 'contract_version_clauses', 'contract_version_flags',
           'contract_acceptances', 'retained_job_application_records']) t where test_helpers.attempt(format('select count(*) from public.%I', t)) = '42501'),
          6, 'j12_customer_anon_and_super_admin_read_nothing');
select is(test_helpers.attempt('select * from public.my_worker_contracts()'), '42501', 'j12_customer_anon_and_super_admin_read_nothing');
select test_helpers.act_as_owner('j12c-o2@local.test');
select is(pg_temp.via_reads(gen_random_uuid(), gen_random_uuid()) + pg_temp.via_reads(pg_temp.id('c2'), pg_temp.id('c2v1')), 0,
          'j12_reads_return_nothing_for_foreign_ids');
select test_helpers.act_as_owner('j12c-o1@local.test');
select is(pg_temp.via_reads(gen_random_uuid(), gen_random_uuid()), 0, 'j12_reads_return_nothing_for_foreign_ids');

-- ---------- foreign actions ----------
select test_helpers.act_as_owner('j12c-o2@local.test');
select is(array[test_helpers.attempt(format($$ select public.save_worker_contract_draft(%L, 1, 'employee', test_helpers.manila_today(), null, '{}', '{}', '[]') $$, pg_temp.id('c2'))),
                test_helpers.attempt(format($$ select public.send_worker_contract_version(%L, 1, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c2'))),
                test_helpers.attempt(format($$ select public.discard_worker_contract_draft(%L, %L) $$, pg_temp.id('c2'), pg_temp.id('c2v1'))),
                test_helpers.attempt(format($$ select public.create_worker_contract_amendment(%L, 1) $$, pg_temp.id('c1'))),
                test_helpers.attempt(format($$ select public.activate_worker_contract(%L, 1) $$, pg_temp.id('c1'))),
                test_helpers.attempt(format($$ select public.terminate_worker_contract(%L, %s, 'Taking over this contract.') $$, pg_temp.id('c1'), pg_temp.rev('c1'))),
                test_helpers.attempt(format($$ select public.create_worker_contract_draft(%L, %L, %L, 'employee', test_helpers.manila_today()) $$,
                                            pg_temp.id('s1'), pg_temp.fx('w1'), test_helpers.latest_platform_contract_version()))],
          array_fill('42501'::text, array[7]), 'j12_foreign_contract_actions_report_not_found');
select throws_ok(format($$ select public.withdraw_worker_contract_version(%L, %L) $$, pg_temp.id('c1'), pg_temp.id('v1')), '42501', 'Contract not found.',
                 'j12_foreign_contract_actions_report_not_found');
select test_helpers.act_as_worker('j12c-w2@local.test');
select throws_ok(format($$ select public.decline_worker_contract_version(%L, %L) $$, pg_temp.id('c1'), pg_temp.id('v1')), '42501', 'Contract not found.',
                 'j12_foreign_contract_actions_report_not_found');
select throws_ok(format($$ select public.terminate_worker_contract(%L, %s, 'Ending a contract that is not mine.') $$, pg_temp.id('c1'), pg_temp.rev('c1')),
                 '42501', 'Contract not found.', 'j12_foreign_contract_actions_report_not_found');
select test_helpers.act_as_admin('j12c-a1@local.test');
select throws_ok(format($$ select public.terminate_worker_contract(%L, %s, 'Administrator ending this contract.') $$, pg_temp.id('c1'), pg_temp.rev('c1')),
                 '42501', 'Contract not found.', 'j12_foreign_contract_actions_report_not_found');
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j12c-o1@local.test', '{"schedule": "Weekends only for the season."}');
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j12c-o1@local.test');
select test_helpers.act_as_owner('j12c-o1@local.test');
select throws_ok(format($$ select public.accept_worker_contract_version(%L, %L, %L, 'w9_worker_accept_v1') $$, pg_temp.id('c1'), pg_temp.id('v2'),
                 (select content_hash from public.contract_versions where id = pg_temp.id('v2'))), '42501', 'Contract not found.',
                 'j12_owner_cannot_accept_or_decline_for_worker');
select throws_ok(format($$ select public.decline_worker_contract_version(%L, %L, 'Declined by the owner.') $$, pg_temp.id('c1'), pg_temp.id('v2')), '42501',
                 'Contract not found.', 'j12_owner_cannot_accept_or_decline_for_worker');
select is((select state from public.contract_versions where id = pg_temp.id('v2')), 'sent_for_review', 'j12_owner_cannot_accept_or_decline_for_worker');

-- ---------- eligible workers: names only, reachable only ----------
select is((select string_agg(display_name || ':' || origin || ':' || has_open_contract::text, ',' order by has_open_contract desc)
           from public.owner_contract_eligible_workers()), 'Local Test Worker:accepted_application:true,Local Test Worker:accepted_application:true',
          'j12_eligible_worker_list_shows_no_contacts_and_only_reachable_workers');
select is((select array_agg(worker_id order by worker_id) from public.owner_contract_eligible_workers()),
          (select array_agg(x order by x) from unnest(array[pg_temp.fx('w1'), pg_temp.fx('w2')]) x),
          'j12_eligible_worker_list_shows_no_contacts_and_only_reachable_workers');
select test_helpers.act_as_service();
select is((select array_agg(a order by n) from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as x(a, m, n)
           where p.oid = 'public.owner_contract_eligible_workers()'::regprocedure and m = 't'),
          array['worker_id', 'display_name', 'shop_id', 'shop_name', 'origin', 'has_open_contract'], 'j12_eligible_worker_list_shows_no_contacts_and_only_reachable_workers');

-- ---------- notifications carry no text, pay, reasons or names ----------
select test_helpers.act_as_worker('j12c-w1@local.test');
select public.decline_worker_contract_version(pg_temp.id('c1'), pg_temp.id('v2'), 'Too few hours for me OCELOT.');
select public.terminate_worker_contract(pg_temp.id('c1'), pg_temp.rev('c1'), 'Leaving for family reasons WOMBAT.');
select test_helpers.act_as_service();
select ok((select count(*) from public.notifications where subject_id = pg_temp.id('c1')) >= 5, 'j12_notifications_carry_no_contract_text_pay_reasons_or_names');
select is((select count(*)::int from public.notifications n where n.subject_id = pg_temp.id('c1')
           and (n.title || ' ' || n.body) ~* '(QUOKKA|OCELOT|WOMBAT|Local Test Worker|Local Test Owner|deposit|locker|weekends|relationship type|employee|agree)'),
          0, 'j12_notifications_carry_no_contract_text_pay_reasons_or_names');

select * from finish();
rollback;
