-- J17 (W2): worker profile / private contact privacy and roster link-code authorization.
-- Local Docker stack only; fixtures are synthetic (@local.test, placeholder phone numbers).
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.uw1', test_helpers.create_worker('j17w-w1@local.test')::text, true);
select set_config('fx.uw2', test_helpers.create_worker('j17w-w2@local.test')::text, true);
select set_config('fx.uw3', test_helpers.create_worker('j17w-w3@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17w-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17w-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j17w-c1@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17w-admin@local.test')::text, true);
select test_helpers.create_shop(current_setting('fx.o1')::uuid);
-- uw1 is on o1's roster, so o1 is a real counterparty of uw1.
select set_config('fx.w1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.uw1')::uuid)::text, true);
select set_config('fx.w_o2', test_helpers.create_roster_worker(current_setting('fx.o2')::uuid)::text, true);

insert into public.worker_profiles (profile_id, headline, skills, availability_status)
values (current_setting('fx.uw1')::uuid, 'Local test headline', array['Hand wash'], 'flexible');
insert into public.worker_private_contacts (profile_id, contact_phone, contact_email)
values (current_setting('fx.uw1')::uuid, '+63 900 000 0101', 'j17w-w1-contact@local.test');

-- ---------- worker profile and private contact privacy ----------
select test_helpers.act_as_owner('j17w-o1@local.test');
select is((select count(*)::int from public.worker_profiles), 0, 'j17_other_users_cannot_read_worker_profile');
select is((select count(*)::int from public.worker_private_contacts), 0, 'j17_other_users_cannot_read_worker_private_contact');
select test_helpers.act_as_customer('j17w-c1@local.test');
select is((select count(*)::int from public.worker_profiles), 0, 'j17_other_users_cannot_read_worker_profile');
select is((select count(*)::int from public.worker_private_contacts), 0, 'j17_other_users_cannot_read_worker_private_contact');
select test_helpers.act_as_worker('j17w-w2@local.test');
select is((select count(*)::int from public.worker_profiles), 0, 'j17_other_users_cannot_read_worker_profile');
select is((select count(*)::int from public.worker_private_contacts), 0, 'j17_other_users_cannot_read_worker_private_contact');
select test_helpers.act_as_admin('j17w-admin@local.test');
select is((select count(*)::int from public.worker_profiles where profile_id = current_setting('fx.uw1')::uuid),
          1, 'j17_other_users_cannot_read_worker_profile');
select is((select count(*)::int from public.worker_private_contacts), 0, 'j17_other_users_cannot_read_worker_private_contact');
select test_helpers.act_as_anon();
select throws_ok($$ select count(*) from public.worker_profiles $$, '42501', null,
                 'j17_other_users_cannot_read_worker_profile');
select throws_ok($$ select count(*) from public.worker_private_contacts $$, '42501', null,
                 'j17_other_users_cannot_read_worker_private_contact');

-- ---------- writes for another user ----------
select test_helpers.act_as_worker('j17w-w2@local.test');
select throws_ok($$
  insert into public.worker_profiles (profile_id, headline, availability_status) values (current_setting('fx.uw3')::uuid, 'J17w forged', 'flexible')
$$, '42501', null, 'j17_worker_profile_cannot_be_written_for_another_user');
select test_helpers.attempt($$
  update public.worker_profiles set headline = 'J17w overwritten' where profile_id = current_setting('fx.uw1')::uuid
$$);
select test_helpers.attempt($$
  delete from public.worker_profiles where profile_id = current_setting('fx.uw1')::uuid
$$);
select throws_ok($$
  insert into public.worker_private_contacts (profile_id, contact_phone)
  values (current_setting('fx.uw1')::uuid, '+63 900 000 0102')
$$, '42501', null, 'j17_worker_profile_cannot_be_written_for_another_user');
select test_helpers.attempt($$
  update public.worker_private_contacts set contact_phone = '+63 900 000 0103'
  where profile_id = current_setting('fx.uw1')::uuid
$$);
-- The owner of a profile cannot move it to another account either.
select test_helpers.act_as_worker('j17w-w1@local.test');
select throws_ok($$
  update public.worker_profiles set profile_id = current_setting('fx.uw3')::uuid where profile_id = auth.uid()
$$, '42501', null, 'j17_worker_profile_cannot_be_written_for_another_user');
select test_helpers.act_as_service();
select is((select headline from public.worker_profiles where profile_id = current_setting('fx.uw1')::uuid),
          'Local test headline', 'j17_worker_profile_cannot_be_written_for_another_user');
select is((select contact_phone from public.worker_private_contacts where profile_id = current_setting('fx.uw1')::uuid),
          '+63 900 000 0101', 'j17_worker_profile_cannot_be_written_for_another_user');
select is((select count(*)::int from public.worker_profiles where profile_id = current_setting('fx.uw3')::uuid),
          0, 'j17_worker_profile_cannot_be_written_for_another_user');

-- ---------- link-code RPCs: anon and wrong roles ----------
select test_helpers.act_as_anon();
select throws_ok($$ select * from public.create_roster_link_code(current_setting('fx.w_o2')::uuid) $$,
                 '42501', null, 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select throws_ok($$ select * from public.preview_roster_link_code('ABCDEF012345') $$,
                 '42501', null, 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select throws_ok($$ select * from public.accept_roster_link_code('ABCDEF012345') $$,
                 '42501', null, 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select throws_ok($$ select public.unlink_my_roster_entry(current_setting('fx.w1')::uuid) $$,
                 '42501', null, 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select throws_ok($$ select * from public.list_my_roster_links() $$,
                 '42501', null, 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select test_helpers.act_as_customer('j17w-c1@local.test');
select throws_ok($$ select * from public.preview_roster_link_code('ABCDEF012345') $$,
                 '42501', 'Only worker accounts can link to a shop roster.',
                 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select throws_ok($$ select * from public.create_roster_link_code(current_setting('fx.w_o2')::uuid) $$,
                 '42501', 'Only owner accounts can issue roster link codes.',
                 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select test_helpers.act_as_owner('j17w-o2@local.test');
select throws_ok($$ select * from public.accept_roster_link_code('ABCDEF012345') $$,
                 '42501', 'Only worker accounts can link to a shop roster.',
                 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select test_helpers.act_as_worker('j17w-w2@local.test');
select throws_ok($$ select * from public.create_roster_link_code(current_setting('fx.w_o2')::uuid) $$,
                 '42501', 'Only owner accounts can issue roster link codes.',
                 'j17_link_code_rpcs_reject_anon_and_wrong_roles');
select throws_ok($$ select public.unlink_my_roster_entry(current_setting('fx.w1')::uuid) $$,
                 '42501', 'Roster entry not found.', 'j17_worker_cannot_unlink_other_roster_entry');

-- ---------- owner cannot issue codes for another owner's roster ----------
select test_helpers.act_as_owner('j17w-o1@local.test');
select throws_ok($$ select * from public.create_roster_link_code(current_setting('fx.w_o2')::uuid) $$,
                 '42501', 'Roster worker not found.', 'j17_owner_cannot_issue_link_code_for_other_owner_roster');
select throws_ok($$ select * from public.create_roster_link_code(current_setting('fx.w1')::uuid) $$,
                 'P0001', 'This roster worker is already linked to an account.',
                 'j17_owner_cannot_issue_link_code_for_other_owner_roster');
select test_helpers.act_as_service();
select is((select count(*)::int from public.worker_roster_link_codes), 0,
          'j17_owner_cannot_issue_link_code_for_other_owner_roster');

-- ---------- link tables are RPC-only ----------
select test_helpers.act_as_owner('j17w-o2@local.test');
select is((select count(*)::int from public.create_roster_link_code(current_setting('fx.w_o2')::uuid)),
          1, 'j17_link_tables_not_readable_by_clients');
select throws_ok($$ select count(*) from public.worker_roster_link_codes $$, '42501', null,
                 'j17_link_tables_not_readable_by_clients');
select throws_ok($$
  insert into public.worker_roster_link_codes (worker_row_id, owner_id, code_hash, expires_at)
  values (current_setting('fx.w_o2')::uuid, auth.uid(), '\x00'::bytea, now() + interval '1 day')
$$, '42501', null, 'j17_link_tables_not_readable_by_clients');
select test_helpers.act_as_worker('j17w-w2@local.test');
select throws_ok($$ select count(*) from public.worker_roster_link_attempts $$, '42501', null,
                 'j17_link_tables_not_readable_by_clients');
select test_helpers.act_as_admin('j17w-admin@local.test');
select throws_ok($$ select count(*) from public.worker_roster_link_codes $$, '42501', null,
                 'j17_link_tables_not_readable_by_clients');

select * from finish();
rollback;
