-- W9 rules: the state machine refuses unlisted transitions; sending needs a recorded verification, filled clauses and
-- details, the statements and the current flag count, a start date not in the past and the contractor acknowledgement
-- (D-26); no fabricated acceptance; the commit validator; braces in values; the worker can always decline and
-- terminate (spec F); owner termination; activation gates (start date, verification, C7); effective expiry and the
-- internal expiry function; discarding only unsent drafts. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w9r-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w9r-o1@local.test')::text, true);
create temporary table w9r_ids (label text primary key, id uuid) on commit drop;
grant all on w9r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w9r_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.draft_rev(p_label text) returns integer language sql stable security definer
as $$ select draft_revision from public.contract_versions where contract_id = pg_temp.id(p_label) and state = 'draft' $$;
create function pg_temp.pending(p_label text) returns uuid language sql stable security definer
as $$ select pending_version_id from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.hash_of(p_version uuid) returns text language sql stable security definer
as $$ select content_hash from public.contract_versions where id = p_version $$;
create function pg_temp.status(p_label text) returns text language sql stable security definer
as $$ select status from public.worker_contracts where id = pg_temp.id(p_label) $$;
insert into w9r_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1'))),
                           ('s_unrecorded', test_helpers.create_shop(pg_temp.fx('o1'), 'approved'));
insert into w9r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('w9r-w' || n || '@local.test')) from generate_series(1, 7) n;
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w' || n)) from generate_series(1, 7) n;
select test_helpers.create_accepted_application(pg_temp.id('s_unrecorded'), pg_temp.id('w1'));
-- c1: w1 at s1 (main flow); c_unrec: w1 at the shop without a recorded review.
insert into w9r_ids values ('c1', test_helpers.create_test_contract_draft('w9r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'))),
  ('c_unrec', test_helpers.create_test_contract_draft('w9r-o1@local.test', pg_temp.id('s_unrecorded'), pg_temp.id('w1')));
insert into w9r_ids select 'c1v1', id from public.contract_versions where contract_id = pg_temp.id('c1');

-- ---------- send gates ----------
select test_helpers.act_as_owner('w9r-o1@local.test');
select throws_like(format($$ select public.send_worker_contract_version(%L, 1, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c1')),
                   'Fill in every shop clause and contract detail before sending (missing: pay_details, role_title, schedule_summary, clause:%',
                   'w9_send_refuses_unfilled_placeholders_and_shop_instructions');
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'w9r-o1@local.test', '{"schedule": "[Shop: fill this in later.] Mornings."}');
select test_helpers.fill_test_contract_draft(pg_temp.id('c_unrec'), 'w9r-o1@local.test');
select test_helpers.act_as_owner('w9r-o1@local.test');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 2, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c1')), '23514',
                 'Fill in every shop clause and contract detail before sending (missing: clause:schedule).', 'w9_send_refuses_unfilled_placeholders_and_shop_instructions');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 2, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c_unrec')), '23514',
                 'Your shop needs a recorded verification before you send a contract.', 'w9_send_requires_recorded_shop_verification');
select throws_ok(format($$ select public.save_worker_contract_draft(%L, 2, 'employee', test_helpers.manila_today(), null,
                 '{"pay_details": "Pay of {{pay_details}} each week"}', '{}', '[]') $$, pg_temp.id('c1')), '22023',
                 'Placeholder values cannot contain {{ or }}.', 'w9_placeholder_braces_in_values_refused');
select throws_ok(format($$ select public.save_worker_contract_draft(%L, 2, 'employee', test_helpers.manila_today(), null,
                 '{"role_title": "Washer }} lead"}', '{}', '[]') $$, pg_temp.id('c1')), '22023',
                 'Placeholder values cannot contain {{ or }}.', 'w9_placeholder_braces_in_values_refused');
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'w9r-o1@local.test', '{}',
  '[{"section_number": 7, "heading": "Locker", "body": "The worker pays a deposit for the locker key."}]');
select test_helpers.act_as_owner('w9r-o1@local.test');
select is((select save.draft_revision from public.save_worker_contract_draft(pg_temp.id('c1'), 3, 'employee', test_helpers.manila_today() - 1, null,
             (select owner_values from public.contract_versions where id = pg_temp.id('c1v1')),
             (select editable_bodies from public.contract_versions where id = pg_temp.id('c1v1')),
             (select shop_terms from public.contract_versions where id = pg_temp.id('c1v1'))) save), 4, 'w9_initial_start_date_not_in_past');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 4, 'w9_owner_send_v1', null, 1) $$, pg_temp.id('c1')), '23514',
                 'The start date cannot be in the past.', 'w9_initial_start_date_not_in_past');
select (public.save_worker_contract_draft(pg_temp.id('c1'), 4, 'employee', test_helpers.manila_today(), null,
          (select owner_values from public.contract_versions where id = pg_temp.id('c1v1')),
          (select editable_bodies from public.contract_versions where id = pg_temp.id('c1v1')),
          (select shop_terms from public.contract_versions where id = pg_temp.id('c1v1')))).draft_revision;
select throws_ok(format($$ select public.send_worker_contract_version(%L, 4, 'w9_owner_send_v1', null, 1) $$, pg_temp.id('c1')), '55000',
                 'This contract changed. Reload it and try again.', 'w9_send_requires_owner_acknowledgement_and_current_flag_count');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 5, null, null, 1) $$, pg_temp.id('c1')), '23514',
                 'Confirm the offer statement before sending.', 'w9_send_requires_owner_acknowledgement_and_current_flag_count');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 5, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c1')), '55000',
                 'The keyword check changed. Review the flags again.', 'w9_send_requires_owner_acknowledgement_and_current_flag_count');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 5, 'w9_owner_send_v1', null, null) $$, pg_temp.id('c1')), '55000',
                 'The keyword check changed. Review the flags again.', 'w9_send_requires_owner_acknowledgement_and_current_flag_count');
select is((public.send_worker_contract_version(pg_temp.id('c1'), 5, 'w9_owner_send_v1', null, 1)).flag_count, 1,
          'w9_send_requires_owner_acknowledgement_and_current_flag_count');

-- ---------- unlisted transitions ----------
select throws_ok(format($$ select public.activate_worker_contract(%L, %s) $$, pg_temp.id('c1'), pg_temp.rev('c1')), '42501',
                 'This contract change is not allowed.', 'w9_unlisted_transitions_rejected');
select throws_ok(format($$ select public.discard_worker_contract_draft(%L, %L) $$, pg_temp.id('c1'), pg_temp.id('c1v1')), '42501',
                 'This contract change is not allowed.', 'w9_unlisted_transitions_rejected');
select throws_ok(format($$ select public.terminate_worker_contract(%L, %s, 'Ending before acceptance.') $$, pg_temp.id('c1'), pg_temp.rev('c1')), '42501',
                 'This contract change is not allowed.', 'w9_unlisted_transitions_rejected');
select throws_ok(format($$ select public.create_worker_contract_amendment(%L, %s) $$, pg_temp.id('c1'), pg_temp.rev('c1')), '42501',
                 'This contract change is not allowed.', 'w9_unlisted_transitions_rejected');
select throws_ok(format($$ select public.withdraw_worker_contract_version(%L, %L) $$, pg_temp.id('c_unrec'),
                 (select id from public.contract_versions where contract_id = pg_temp.id('c_unrec'))), '42501',
                 'This contract change is not allowed.', 'w9_unlisted_transitions_rejected');

-- ---------- no fabricated acceptance; commit validator ----------
select test_helpers.act_as_service();
select set_config('washlink.worker_contract_write', pg_temp.id('c1')::text, true);
select throws_ok(format($$ insert into public.contract_acceptances (contract_id, version_id, version_number, version_content_hash, party_role, party_id,
                 party_name_snapshot, statement_key, statement_text) values (%L, %L, 1, %L, 'worker', %L, 'Forged', 'w9_worker_accept_v1', 'Forged') $$,
                 pg_temp.id('c1'), pg_temp.id('c1v1'), pg_temp.hash_of(pg_temp.id('c1v1')), pg_temp.id('w1')), '42501',
                 'Acceptance records are created only by the accepting party.', 'w9_acceptance_cannot_be_fabricated_by_trusted_sql');
-- Superuser with the OWNER's JWT claims and the write flag: still cannot record the worker's acceptance.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fx('o1'), 'role', 'authenticated')::text, true);
select throws_ok(format($$ insert into public.contract_acceptances (contract_id, version_id, version_number, version_content_hash, party_role, party_id,
                 party_name_snapshot, statement_key, statement_text) values (%L, %L, 1, %L, 'worker', %L, 'Forged', 'w9_worker_accept_v1', 'Forged') $$,
                 pg_temp.id('c1'), pg_temp.id('c1v1'), pg_temp.hash_of(pg_temp.id('c1v1')), pg_temp.fx('o1')), '42501',
                 'Acceptance records are created only by the accepting party.', 'w9_acceptance_cannot_be_fabricated_by_trusted_sql');
select test_helpers.act_as_service();
select is((select count(*)::int from public.contract_acceptances where version_id = pg_temp.id('c1v1')), 1, 'w9_acceptance_cannot_be_fabricated_by_trusted_sql');
select set_config('washlink.worker_contract_write', pg_temp.id('c_unrec')::text, true);
select set_config('washlink.worker_contract_seal', (select id::text from public.contract_versions where contract_id = pg_temp.id('c_unrec')), true);
set constraints contract_versions_validate_at_commit immediate;
select throws_ok(format($$ update public.contract_versions set state = 'sent_for_review', render_values = '{}', rendered_text = 'Forged text',
                 content_hash = encode(sha256(convert_to('Forged text', 'UTF8')), 'hex'), flag_count = 0, sealed_txid = txid_current(),
                 sealed_at = now(), sent_at = now() where contract_id = %L $$, pg_temp.id('c_unrec')), '23514', null,
                 'w9_commit_validator_rejects_altered_text_or_hash');
set constraints contract_versions_validate_at_commit deferred;
select set_config('washlink.worker_contract_write', '', true);
select set_config('washlink.worker_contract_seal', '', true);
select is((select state from public.contract_versions where contract_id = pg_temp.id('c_unrec')), 'draft', 'w9_commit_validator_rejects_altered_text_or_hash');
select lives_ok(format($$ select public.validate_worker_contract_version(%L) $$, pg_temp.id('c1v1')), 'w9_commit_validator_rejects_altered_text_or_hash');

-- ---------- contractor acknowledgement ----------
insert into w9r_ids values ('c2', test_helpers.create_test_contract_draft('w9r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w2'), null, 'independent_contractor'));
select test_helpers.fill_test_contract_draft(pg_temp.id('c2'), 'w9r-o1@local.test');
select test_helpers.act_as_owner('w9r-o1@local.test');
select throws_ok(format($$ select public.send_worker_contract_version(%L, 2, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('c2')), '23514',
                 'Confirm the independent contractor acknowledgement.', 'w9_contractor_classification_needs_owner_and_worker_acknowledgement');
select is((public.send_worker_contract_version(pg_temp.id('c2'), 2, 'w9_owner_send_v1', 'w9_contractor_owner_v1', 0)).state, 'sent_for_review',
          'w9_contractor_classification_needs_owner_and_worker_acknowledgement');
select test_helpers.act_as_worker('w9r-w2@local.test');
select throws_ok(format($$ select public.accept_worker_contract_version(%L, %L, %L, 'w9_worker_accept_v1') $$, pg_temp.id('c2'), pg_temp.pending('c2'),
                 pg_temp.hash_of(pg_temp.pending('c2'))), '23514', 'Confirm the independent contractor acknowledgement.',
                 'w9_contractor_classification_needs_owner_and_worker_acknowledgement');
select is((public.accept_worker_contract_version(pg_temp.id('c2'), pg_temp.pending('c2'), pg_temp.hash_of(pg_temp.pending('c2')), 'w9_worker_accept_v1',
          'w9_contractor_worker_v1')).status, 'accepted', 'w9_contractor_classification_needs_owner_and_worker_acknowledgement');
select is((select string_agg(party_role || ':' || contractor_ack_key, ',' order by party_role) from public.worker_contract_acceptances(pg_temp.id('c2'))),
          'owner:w9_contractor_owner_v1,worker:w9_contractor_worker_v1', 'w9_contractor_classification_needs_owner_and_worker_acknowledgement');
select test_helpers.act_as_service();
select is((select string_agg(classification_key, ',' order by sort_order desc) filter (where needs_extra_acknowledgement)
           || '|' || (select classification_key from public.worker_classification_options order by sort_order desc limit 1)
           from public.worker_classification_options), 'independent_contractor|independent_contractor',
          'w9_classification_options_have_no_default_and_contractor_last');
select is((select count(*)::int from information_schema.columns where table_schema = 'public'
           and ((table_name = 'contract_versions' and column_name = 'classification_key' and column_default is not null)
                or (table_name = 'worker_classification_options' and column_name ~ '(default|preselect|selected)'))), 0,
          'w9_classification_options_have_no_default_and_contractor_last');

-- ---------- the worker can always decline / terminate; owner termination ----------
select test_helpers.act_as_service();
update public.shops set verification_status = 'pending' where id = pg_temp.id('s1');
select test_helpers.act_as_worker('w9r-w1@local.test');
select throws_ok(format($$ select public.accept_worker_contract_version(%L, %L, %L, 'w9_worker_accept_v1') $$, pg_temp.id('c1'), pg_temp.id('c1v1'),
                 pg_temp.hash_of(pg_temp.id('c1v1'))), '23514', 'This shop''s verification is not current. You can decline or wait.',
                 'w9_worker_can_always_decline_even_if_shop_unverified_or_removed');
select is((public.decline_worker_contract_version(pg_temp.id('c1'), pg_temp.id('c1v1'), 'Not for me right now.')).status, 'declined',
          'w9_worker_can_always_decline_even_if_shop_unverified_or_removed');
select test_helpers.act_as_worker('w9r-w2@local.test');
select throws_ok(format($$ select public.terminate_worker_contract(%L, %s, 'Too short') $$, pg_temp.id('c2'), pg_temp.rev('c2')), '23514',
                 'Give a reason of 10 to 500 characters.', 'w9_worker_can_always_terminate_with_reason');
select is((select status || ',' || ended_by || ',' || end_reason from public.terminate_worker_contract(pg_temp.id('c2'), pg_temp.rev('c2'),
          'I found other work closer to home.')), 'terminated,worker,I found other work closer to home.', 'w9_worker_can_always_terminate_with_reason');
select test_helpers.act_as_service();
update public.shops set verification_status = 'approved', verification_reviewed_by = pg_temp.fx('a1'), verification_reviewed_at = now() where id = pg_temp.id('s1');
-- c3 (w3): sent, then the shop is deleted -> the offer stays and can only be declined.
insert into w9r_ids values ('s3', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1')));
select test_helpers.create_accepted_application(pg_temp.id('s3'), pg_temp.id('w3'));
insert into w9r_ids values ('c3', test_helpers.create_test_contract_draft('w9r-o1@local.test', pg_temp.id('s3'), pg_temp.id('w3')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c3'), 'w9r-o1@local.test');
insert into w9r_ids values ('c3v1', test_helpers.send_test_contract(pg_temp.id('c3'), 'w9r-o1@local.test'));
delete from public.shops where id = pg_temp.id('s3');
select test_helpers.act_as_worker('w9r-w3@local.test');
select throws_ok(format($$ select public.accept_worker_contract_version(%L, %L, %L, 'w9_worker_accept_v1') $$, pg_temp.id('c3'), pg_temp.id('c3v1'),
                 pg_temp.hash_of(pg_temp.id('c3v1'))), '23514', 'This shop is no longer on WashLink, so this offer can only be declined.',
                 'w9_worker_can_always_decline_even_if_shop_unverified_or_removed');
select is((public.decline_worker_contract_version(pg_temp.id('c3'), pg_temp.id('c3v1'))).status, 'declined',
          'w9_worker_can_always_decline_even_if_shop_unverified_or_removed');
-- c4 (w4): accepted, then the owner terminates.
select test_helpers.act_as_service();
insert into w9r_ids values ('c4', test_helpers.create_test_contract_draft('w9r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w4')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c4'), 'w9r-o1@local.test');
select test_helpers.send_test_contract(pg_temp.id('c4'), 'w9r-o1@local.test');
select test_helpers.accept_test_contract(pg_temp.id('c4'), 'w9r-w4@local.test');
select test_helpers.act_as_owner('w9r-o1@local.test');
select throws_ok(format($$ select public.terminate_worker_contract(%L, %s, '') $$, pg_temp.id('c4'), pg_temp.rev('c4')), '23514',
                 'Give a reason of 10 to 500 characters.', 'w9_owner_terminates_with_reason');
select is((select status || ',' || ended_by from public.terminate_worker_contract(pg_temp.id('c4'), pg_temp.rev('c4'), 'The shop is closing this branch.')),
          'terminated,owner', 'w9_owner_terminates_with_reason');

-- ---------- activation gates ----------
select test_helpers.act_as_service();
insert into w9r_ids values ('c5', test_helpers.create_test_contract_draft('w9r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w5')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c5'), 'w9r-o1@local.test');
select test_helpers.send_test_contract(pg_temp.id('c5'), 'w9r-o1@local.test');
select test_helpers.accept_test_contract(pg_temp.id('c5'), 'w9r-w5@local.test');
insert into w9r_ids values ('p5', test_helpers.create_training_program(pg_temp.id('s1')));
select test_helpers.add_training_session(pg_temp.id('p5'), test_helpers.manila_today() + 1);
select test_helpers.open_training_program(pg_temp.id('p5'));
insert into w9r_ids values ('e5', test_helpers.create_accepted_enrollment(pg_temp.id('p5'), pg_temp.id('w5'), now()));
select test_helpers.act_as_owner('w9r-o1@local.test');
select throws_ok(format($$ select public.activate_worker_contract(%L, %s) $$, pg_temp.id('c5'), pg_temp.rev('c5')), '23514',
                 'This worker is still in required training with your shop. Training is not productive work, so the contract cannot start yet.',
                 'w9_activation_blocked_during_live_required_training');
select test_helpers.act_as_service();
update public.training_enrollments set status = 'withdrawn', ended_at = now() where id = pg_temp.id('e5');
select test_helpers.act_as_owner('w9r-o1@local.test');
select is((public.activate_worker_contract(pg_temp.id('c5'), pg_temp.rev('c5'))).status, 'active', 'w9_activation_blocked_during_live_required_training');
-- c6 (w6): start tomorrow; then the shop loses its recorded verification.
select test_helpers.act_as_owner('w9r-o1@local.test');
insert into w9r_ids values ('c6', (public.create_worker_contract_draft(pg_temp.id('s1'), pg_temp.id('w6'), test_helpers.latest_platform_contract_version(),
                                   'employee', test_helpers.manila_today() + 1, test_helpers.manila_today() + 30)).id);
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c6'), 'w9r-o1@local.test');
select test_helpers.send_test_contract(pg_temp.id('c6'), 'w9r-o1@local.test');
select test_helpers.accept_test_contract(pg_temp.id('c6'), 'w9r-w6@local.test');
select test_helpers.act_as_owner('w9r-o1@local.test');
select throws_ok(format($$ select public.activate_worker_contract(%L, %s) $$, pg_temp.id('c6'), pg_temp.rev('c6')), '23514',
                 'The contract start date has not been reached yet.', 'w9_activation_requires_start_date_and_verified_shop');
select throws_ok(format($$ select public.activate_worker_contract(%L, %s) $$, pg_temp.id('c6'), pg_temp.rev('c6') - 1), '55000',
                 'This contract changed. Reload it and try again.', 'w9_activation_requires_start_date_and_verified_shop');
select test_helpers.act_as_service();
update public.shops set verification_status = 'pending' where id = pg_temp.id('s1');
select test_helpers.act_as_owner('w9r-o1@local.test');
select throws_ok(format($$ select public.activate_worker_contract(%L, %s) $$, pg_temp.id('c4'), pg_temp.rev('c4')), '42501',
                 'This contract change is not allowed.', 'w9_unlisted_transitions_rejected');
select test_helpers.act_as_service();

-- ---------- effective status and the internal expiry function ----------
select is(array[public.worker_contract_effective_status('active', test_helpers.manila_today() - 1),
                public.worker_contract_effective_status('accepted', test_helpers.manila_today()),
                public.worker_contract_effective_status('active', null), public.worker_contract_effective_status('draft', test_helpers.manila_today() - 5)],
          array['expired', 'accepted', 'active', 'draft'], 'w9_effective_status_expired_after_end_date');
select ok(not has_function_privilege('authenticated', 'public.expire_worker_contracts(date)', 'execute')
          and not has_function_privilege('service_role', 'public.expire_worker_contracts(date)', 'execute')
          and not has_function_privilege('anon', 'public.expire_worker_contracts(date)', 'execute'), 'w9_expire_function_internal_and_idempotent');
select throws_ok($$ select public.expire_worker_contracts(test_helpers.manila_today() - 1) $$, '22023', 'The expiry date cannot be in the past.',
                 'w9_expire_function_internal_and_idempotent');
select is(public.expire_worker_contracts(test_helpers.manila_today() + 31), 1, 'w9_expire_function_internal_and_idempotent');
select is(pg_temp.status('c5') || ',' || pg_temp.status('c6') || ',' || (select ended_by from public.worker_contracts where id = pg_temp.id('c6')),
          'active,expired,system', 'w9_expire_function_internal_and_idempotent');   -- c5 has no end date
select is(public.expire_worker_contracts(test_helpers.manila_today() + 31), 0, 'w9_expire_function_internal_and_idempotent');

-- ---------- discard only never-sent drafts ----------
update public.shops set verification_status = 'approved', verification_reviewed_by = pg_temp.fx('a1'), verification_reviewed_at = now() where id = pg_temp.id('s1');
insert into w9r_ids values ('c7', test_helpers.create_test_contract_draft('w9r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w7')));
select test_helpers.act_as_owner('w9r-o1@local.test');
select ok(public.discard_worker_contract_draft(pg_temp.id('c7'), (select v.version_id from public.worker_contract_versions(pg_temp.id('c7')) v)),
          'w9_discard_only_never_sent_drafts');
select is((select count(*)::int from public.owner_worker_contracts() where contract_id = pg_temp.id('c7')), 0, 'w9_discard_only_never_sent_drafts');
select throws_ok(format($$ select public.discard_worker_contract_draft(%L, %L) $$, pg_temp.id('c3'), pg_temp.id('c3v1')), '42501',
                 'Contract not found.', 'w9_discard_only_never_sent_drafts');
select test_helpers.act_as_service();

select * from finish();
rollback;
