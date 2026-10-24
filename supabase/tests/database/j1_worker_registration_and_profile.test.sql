-- J1 (W2): worker registration, worker profile / private contact, consent-based roster
-- linking with one-time codes. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ---------- signup roles (E1 whitelist, D-8 / D-9) ----------
select set_config('fx.uw', test_helpers.create_worker('j1-w1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j1-o1@local.test')::text, true);
select set_config('fx.u_unknown', test_helpers.create_user('j1-unknown@local.test', 'manager')::text, true);
select set_config('fx.u_norole', test_helpers.create_user('j1-norole@local.test', null)::text, true);
select is((select role::text from public.profiles where id = current_setting('fx.uw')::uuid),
          'worker', 'j1_worker_can_sign_up_with_worker_role');
select is((select role::text from public.profiles where id = current_setting('fx.o1')::uuid),
          'owner', 'j1_owner_can_sign_up_with_owner_role');
select is((select role::text from public.profiles where id = current_setting('fx.u_unknown')::uuid),
          'customer', 'j1_signup_unknown_role_defaults_to_customer');
select is((select role::text from public.profiles where id = current_setting('fx.u_norole')::uuid),
          'customer', 'j1_signup_unknown_role_defaults_to_customer');

-- ---------- more fixtures ----------
select set_config('fx.uw2', test_helpers.create_worker('j1-w2@local.test')::text, true);
select set_config('fx.uw_rate', test_helpers.create_worker('j1-wrate@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j1-c1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j1-o2@local.test')::text, true);
select test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, test_helpers.create_super_admin('j1-admin@local.test'));
select test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending');
select test_helpers.create_shop(current_setting('fx.o2')::uuid);
select set_config('fx.wa', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.wb', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.wc', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.wo2', test_helpers.create_roster_worker(current_setting('fx.o2')::uuid)::text, true);

-- ---------- worker profile ----------
select test_helpers.act_as_worker('j1-w1@local.test');
select lives_ok($$
  insert into public.worker_profiles (profile_id, headline, years_of_experience, skills,
                                      preferred_locations, availability_status)
  values (auth.uid(), 'Local test car wash worker', 2, array['Hand wash'], array['Local test city'], 'part_time')
$$, 'j1_worker_can_create_own_profile');
select is((select count(*)::int from public.worker_profiles where profile_id = auth.uid()),
          1, 'j1_worker_can_create_own_profile');

select lives_ok($$
  update public.worker_profiles
  set headline = 'Local test detailer', availability_status = 'weekends_only', availability_notes = 'Sat and Sun'
  where profile_id = auth.uid()
$$, 'j1_worker_can_update_own_profile');
select is((select row(headline, availability_status, availability_notes)::text
           from public.worker_profiles where profile_id = auth.uid()),
          row('Local test detailer'::text, 'weekends_only'::text, 'Sat and Sun'::text)::text,
          'j1_worker_can_update_own_profile');

select throws_ok($$ update public.worker_profiles set years_of_experience = 61 where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_profile_rejects_invalid_values');
select throws_ok($$ update public.worker_profiles set availability_status = 'sometimes' where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_profile_rejects_invalid_values');
select throws_ok($$ update public.worker_profiles set headline = repeat('x', 121) where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_profile_rejects_invalid_values');
select throws_ok($$ update public.worker_profiles set experience_summary = repeat('x', 2001) where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_profile_rejects_invalid_values');
select throws_ok($$
  update public.worker_profiles set skills = (select array_agg('Skill ' || n) from generate_series(1, 31) n)
  where profile_id = auth.uid()
$$, '23514', null, 'j1_worker_profile_rejects_invalid_values');
select throws_ok($$ update public.worker_profiles set skills = array[repeat('x', 61)] where profile_id = auth.uid() $$,
                 '23514', 'Each skill must be 60 characters or fewer.', 'j1_worker_profile_rejects_invalid_values');
select throws_ok($$
  update public.worker_profiles set preferred_locations = (select array_agg('Place ' || n) from generate_series(1, 11) n)
  where profile_id = auth.uid()
$$, '23514', null, 'j1_worker_profile_rejects_invalid_values');
select throws_ok($$ update public.worker_profiles set availability_notes = repeat('x', 301) where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_profile_rejects_invalid_values');

select lives_ok($$
  update public.worker_profiles
  set skills = array[' Hand wash ', 'hand WASH', '', '  ', 'Waxing', 'waxing'],
      preferred_locations = array['Local test city', ' local TEST city', 'Local test town']
  where profile_id = auth.uid()
$$, 'j1_worker_profile_normalizes_skills');
select is((select skills from public.worker_profiles where profile_id = auth.uid()),
          array['Hand wash', 'Waxing']::text[], 'j1_worker_profile_normalizes_skills');
select is((select preferred_locations from public.worker_profiles where profile_id = auth.uid()),
          array['Local test city', 'Local test town']::text[], 'j1_worker_profile_normalizes_skills');

select test_helpers.act_as_customer('j1-c1@local.test');
select throws_ok($$ insert into public.worker_profiles (profile_id, headline, availability_status) values (auth.uid(), 'Not a worker', 'flexible') $$,
                 '42501', null, 'j1_non_worker_cannot_create_worker_profile');
select test_helpers.act_as_owner('j1-o1@local.test');
select throws_ok($$ insert into public.worker_profiles (profile_id, headline, availability_status) values (auth.uid(), 'Not a worker', 'flexible') $$,
                 '42501', null, 'j1_non_worker_cannot_create_worker_profile');

select test_helpers.act_as_worker('j1-w2@local.test');
select throws_ok($$
  insert into public.worker_profiles (profile_id, headline, availability_status) values (current_setting('fx.uw_rate')::uuid, 'Forged', 'flexible')
$$, '42501', null, 'j1_worker_cannot_create_profile_for_another_user');

-- ---------- private contact ----------
select test_helpers.act_as_worker('j1-w1@local.test');
select lives_ok($$
  insert into public.worker_private_contacts (profile_id, contact_phone, contact_email, preferred_contact_method)
  values (auth.uid(), '+63 900 000 0201', ' J1-W1-Contact@Local.Test ', 'phone')
$$, 'j1_worker_can_manage_own_private_contact');
select is((select row(contact_phone, contact_email, preferred_contact_method)::text
           from public.worker_private_contacts where profile_id = auth.uid()),
          row('+63 900 000 0201'::text, 'j1-w1-contact@local.test'::text, 'phone'::text)::text,
          'j1_worker_can_manage_own_private_contact');
select lives_ok($$
  update public.worker_private_contacts set preferred_contact_method = 'in_app', contact_phone = null
  where profile_id = auth.uid()
$$, 'j1_worker_can_manage_own_private_contact');
select throws_ok($$ update public.worker_private_contacts set contact_phone = 'call me' where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_can_manage_own_private_contact');
select throws_ok($$ update public.worker_private_contacts set contact_email = 'not-an-email' where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_can_manage_own_private_contact');
select throws_ok($$ update public.worker_private_contacts set preferred_contact_method = 'fax' where profile_id = auth.uid() $$,
                 '23514', null, 'j1_worker_can_manage_own_private_contact');
select lives_ok($$ delete from public.worker_private_contacts where profile_id = auth.uid() $$,
                'j1_worker_can_manage_own_private_contact');
select is((select count(*)::int from public.worker_private_contacts where profile_id = auth.uid()),
          0, 'j1_worker_can_manage_own_private_contact');

-- ---------- roster link codes ----------
select test_helpers.act_as_owner('j1-o1@local.test');
select set_config('fx.code_a', (select link_code from public.create_roster_link_code(current_setting('fx.wa')::uuid)), true);
select ok(current_setting('fx.code_a') ~ '^[0-9A-F]{12}$', 'j1_worker_can_link_roster_with_code');

select test_helpers.act_as_worker('j1-w1@local.test');
select is((select row(result, roster_display_name, cardinality(owner_shop_names))::text
           from public.preview_roster_link_code(lower(current_setting('fx.code_a')))),
          row('valid'::text, 'Local Test Roster Worker'::text, 1)::text,
          'j1_worker_can_link_roster_with_code');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_a'))),
          'linked', 'j1_worker_can_link_roster_with_code');
select is((select count(*)::int from public.list_my_roster_links() where worker_row_id = current_setting('fx.wa')::uuid),
          1, 'j1_worker_can_link_roster_with_code');
select test_helpers.act_as_service();
select is((select user_id from public.workers where id = current_setting('fx.wa')::uuid),
          current_setting('fx.uw')::uuid, 'j1_worker_can_link_roster_with_code');

-- Single use, revoked by a newer code, and expiring.
select test_helpers.act_as_worker('j1-w2@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_a'))),
          'invalid_or_expired', 'j1_roster_link_code_is_single_use_and_expires');
select test_helpers.act_as_owner('j1-o1@local.test');
select set_config('fx.code_b_old', (select link_code from public.create_roster_link_code(current_setting('fx.wb')::uuid)), true);
select set_config('fx.code_b', (select link_code from public.create_roster_link_code(current_setting('fx.wb')::uuid)), true);
select set_config('fx.code_c', (select link_code from public.create_roster_link_code(current_setting('fx.wc')::uuid)), true);
select test_helpers.act_as_worker('j1-w2@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_b_old'))),
          'invalid_or_expired', 'j1_roster_link_code_is_single_use_and_expires');
select test_helpers.act_as_service();
update public.worker_roster_link_codes set expires_at = now() - interval '1 second'
where worker_row_id = current_setting('fx.wc')::uuid and consumed_at is null and revoked_at is null;
select test_helpers.act_as_worker('j1-w2@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_c'))),
          'invalid_or_expired', 'j1_roster_link_code_is_single_use_and_expires');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workers
           where id in (current_setting('fx.wc')::uuid) and user_id is not null),
          0, 'j1_roster_link_code_is_single_use_and_expires');

-- One link per owner: w1 is already on o1's roster (wa), so code_b is refused.
select test_helpers.act_as_worker('j1-w1@local.test');
select is((select result from public.preview_roster_link_code(current_setting('fx.code_b'))),
          'already_linked_to_owner', 'j1_worker_cannot_link_twice_to_same_owner');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_b'))),
          'already_linked_to_owner', 'j1_worker_cannot_link_twice_to_same_owner');
select test_helpers.act_as_service();
select is((select user_id from public.workers where id = current_setting('fx.wb')::uuid),
          null::uuid, 'j1_worker_cannot_link_twice_to_same_owner');

-- Multiple owners (F6: list instead of a single row).
select test_helpers.act_as_owner('j1-o2@local.test');
select set_config('fx.code_o2', (select link_code from public.create_roster_link_code(current_setting('fx.wo2')::uuid)), true);
select test_helpers.act_as_worker('j1-w1@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_o2'))),
          'linked', 'j1_worker_can_be_linked_to_multiple_owners');
select is((select count(*)::int from public.list_my_roster_links()), 2, 'j1_worker_can_be_linked_to_multiple_owners');

-- Rate limit: 5 failures per hour, then even a valid code is refused.
select test_helpers.act_as_worker('j1-wrate@local.test');
select is((select array_agg(r.result) from generate_series(1, 5) n
           cross join lateral public.accept_roster_link_code('BADC0DE0000' || n) r),
          array_fill('invalid_or_expired'::text, array[5]), 'j1_roster_link_attempts_are_rate_limited');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_b'))),
          'rate_limited', 'j1_roster_link_attempts_are_rate_limited');
select is((select result from public.preview_roster_link_code(current_setting('fx.code_b'))),
          'rate_limited', 'j1_roster_link_attempts_are_rate_limited');

-- Linking never creates a worker profile.
select test_helpers.act_as_service();
select is((select count(*)::int from public.worker_profiles where profile_id = current_setting('fx.uw2')::uuid),
          0, 'j1_roster_link_creates_no_worker_profile');
select test_helpers.act_as_owner('j1-o2@local.test');
select is((select count(*)::int from public.worker_profiles), 0, 'j1_roster_link_creates_no_worker_profile');

-- Owner cannot link an account directly.
select test_helpers.act_as_owner('j1-o1@local.test');
select throws_ok($$ update public.workers set user_id = current_setting('fx.uw2')::uuid where id = current_setting('fx.wb')::uuid $$,
                 '42501', 'Workers are linked only when the worker accepts a link code.',
                 'j1_owner_cannot_set_worker_user_id_directly');
select throws_ok($$
  insert into public.workers (owner_id, user_id, name) values (auth.uid(), current_setting('fx.uw2')::uuid, 'J1 forged link')
$$, '42501', 'Workers are linked only when the worker accepts a link code.',
   'j1_owner_cannot_set_worker_user_id_directly');

-- Worker unlinks one entry; the other stays.
select test_helpers.act_as_worker('j1-w1@local.test');
select lives_ok($$ select public.unlink_my_roster_entry(current_setting('fx.wa')::uuid) $$,
                'j1_worker_can_unlink_own_roster_entry');
select is((select array_agg(worker_row_id) from public.list_my_roster_links()),
          array[current_setting('fx.wo2')::uuid], 'j1_worker_can_unlink_own_roster_entry');

-- Deleting the profile removes the private contact with it.
insert into public.worker_private_contacts (profile_id, contact_email) values (auth.uid(), 'j1-w1-again@local.test');
select lives_ok($$ delete from public.worker_profiles where profile_id = auth.uid() $$, 'j1_worker_can_delete_own_profile');
select test_helpers.act_as_service();
select is((select count(*)::int from public.worker_profiles where profile_id = current_setting('fx.uw')::uuid)
          + (select count(*)::int from public.worker_private_contacts where profile_id = current_setting('fx.uw')::uuid),
          0, 'j1_worker_can_delete_own_profile');

select * from finish();
rollback;
