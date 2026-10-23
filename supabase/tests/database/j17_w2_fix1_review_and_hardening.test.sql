-- J17 (W2 fix cycle 1, C-B1 + non-blocking fixes): server-stamped reviews, the stricter
-- verified-shop gate and its pre-deploy audit query, fail-closed trusted sessions, booking /
-- shop / document hardening, peppered and locked link codes, realtime exclusion and the
-- availability default. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j17r-c1@local.test')::text, true);
select set_config('fx.c2', test_helpers.create_customer('j17r-c2@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17r-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17r-o2@local.test')::text, true);
select set_config('fx.uw', test_helpers.create_worker('j17r-w1@local.test')::text, true);
select set_config('fx.uw2', test_helpers.create_worker('j17r-w2@local.test')::text, true);
select set_config('fx.uw3', test_helpers.create_worker('j17r-w3@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17r-admin@local.test')::text, true);
select set_config('fx.admin2', test_helpers.create_super_admin('j17r-admin2@local.test')::text, true);
select set_config('fx.s_rev', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_off', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_cr', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
-- Approved without a recorded review (as legacy / fixture rows can be).
select set_config('fx.s_norev', test_helpers.create_shop(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.s_noat', test_helpers.create_shop(current_setting('fx.o1')::uuid)::text, true);
update public.shops set verification_reviewed_by = current_setting('fx.admin')::uuid
where id = current_setting('fx.s_noat')::uuid;
select set_config('fx.w1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.w2', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);

-- ---------- C-B1(a): reviewer and review time are stamped server-side ----------
select test_helpers.act_as_admin('j17r-admin@local.test');
select lives_ok($$
  update public.shops
  set verification_status = 'approved', verification_reviewed_by = current_setting('fx.o1')::uuid,
      verification_reviewed_at = '2000-01-01T00:00:00Z'
  where id in (current_setting('fx.s_rev')::uuid, current_setting('fx.s_off')::uuid, current_setting('fx.s_cr')::uuid)
$$, 'j17_super_admin_review_stamps_reviewer_server_side');
select is((select array_agg(distinct row(verification_reviewed_by, verification_reviewed_at = now())::text)
           from public.shops
           where id in (current_setting('fx.s_rev')::uuid, current_setting('fx.s_off')::uuid, current_setting('fx.s_cr')::uuid)),
          array[row(current_setting('fx.admin')::uuid, true)::text],
          'j17_super_admin_review_stamps_reviewer_server_side');
select lives_ok($$
  update public.shops
  set verification_notes = 'Checked again', verification_reviewed_by = current_setting('fx.o2')::uuid,
      verification_reviewed_at = '2001-01-01T00:00:00Z'
  where id = current_setting('fx.s_rev')::uuid
$$, 'j17_super_admin_cannot_forge_review_fields');
select is((select row(verification_notes, verification_reviewed_by, verification_reviewed_at = now())::text
           from public.shops where id = current_setting('fx.s_rev')::uuid),
          row('Checked again'::text, current_setting('fx.admin')::uuid, true)::text,
          'j17_super_admin_cannot_forge_review_fields');
select test_helpers.act_as_admin('j17r-admin2@local.test');
update public.shops set verification_status = 'changes_requested' where id = current_setting('fx.s_cr')::uuid;
select is((select verification_reviewed_by from public.shops where id = current_setting('fx.s_cr')::uuid),
          current_setting('fx.admin2')::uuid, 'j17_super_admin_review_stamps_reviewer_server_side');

-- ---------- C-B1(b): verified = approved + recorded review + active ----------
select test_helpers.act_as_owner('j17r-o1@local.test');
update public.shops set is_active = false where id = current_setting('fx.s_off')::uuid;
select is(public.is_verified_shop_owner(current_setting('fx.s_rev')::uuid), true,
          'j17_is_verified_shop_owner_requires_recorded_review_and_active');
select is(public.is_verified_shop_owner(current_setting('fx.s_norev')::uuid), false,
          'j17_is_verified_shop_owner_requires_recorded_review_and_active');
select is(public.is_verified_shop_owner(current_setting('fx.s_noat')::uuid), false,
          'j17_is_verified_shop_owner_requires_recorded_review_and_active');
select is(public.is_verified_shop_owner(current_setting('fx.s_off')::uuid), false,
          'j17_is_verified_shop_owner_requires_recorded_review_and_active');
select is(public.is_verified_shop_owner(current_setting('fx.s_cr')::uuid), false,
          'j17_is_verified_shop_owner_requires_recorded_review_and_active');

-- ---------- C-B1(c): the D-10 row 14 audit query finds approved shops without a reviewer ----------
select test_helpers.act_as_service();
select set_eq($$
  select s.id from public.shops s
  where s.verification_status = 'approved'
    and (s.verification_reviewed_by is null or s.verification_reviewed_at is null
         or not exists (select 1 from public.profiles p
                        where p.id = s.verification_reviewed_by and p.role::text = 'super_admin'))
    and s.owner_id = current_setting('fx.o1')::uuid
$$, $$ values (current_setting('fx.s_norev')::uuid), (current_setting('fx.s_noat')::uuid) $$,
'j17_d10_audit_query_finds_approved_shops_without_reviewer');

-- ---------- is_trusted_db_session fails closed ----------
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select is(public.is_trusted_db_session(), true, 'j17_trusted_session_only_service_role_or_no_claims');
select set_config('request.jwt.claims', '{}', true);
select is(public.is_trusted_db_session(), true, 'j17_trusted_session_only_service_role_or_no_claims');
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select is(public.is_trusted_db_session(), false, 'j17_trusted_session_only_service_role_or_no_claims');
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is(public.is_trusted_db_session(), false, 'j17_trusted_session_only_service_role_or_no_claims');
select set_config('request.jwt.claims', '{"aud": "x"}', true);
select is(public.is_trusted_db_session(), false, 'j17_trusted_session_only_service_role_or_no_claims');

-- ---------- booking insert: customer_id forced to the caller ----------
select test_helpers.act_as_service();
select test_helpers.set_shop_price(current_setting('fx.s_rev')::uuid, 'Sedan', 'Basic Wash', 250.00);
select test_helpers.act_as_customer('j17r-c1@local.test');
select lives_ok($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
  values ('J17r forged', current_setting('fx.c2')::uuid, 'Sedan', 'Basic Wash', 'J17r address', now() + interval '1 day',
          current_setting('fx.s_rev')::uuid),
         ('J17r missing', null, 'Sedan', 'Basic Wash', 'J17r address', now() + interval '1 day',
          current_setting('fx.s_rev')::uuid)
$$, 'j17_booking_insert_forces_customer_id_to_caller');
select test_helpers.act_as_service();
select is((select array_agg(distinct customer_id) from public.bookings where customer_name in ('J17r forged', 'J17r missing')),
          array[current_setting('fx.c1')::uuid], 'j17_booking_insert_forces_customer_id_to_caller');

-- ---------- shops.owner_id is frozen for non-trusted sessions ----------
select test_helpers.act_as_owner('j17r-o1@local.test');
select throws_ok($$ update public.shops set owner_id = current_setting('fx.o2')::uuid where id = current_setting('fx.s_rev')::uuid $$,
                 '42501', 'The owner of a shop cannot be changed.', 'j17_shop_owner_id_is_frozen');
select test_helpers.act_as_admin('j17r-admin@local.test');
select throws_ok($$ update public.shops set owner_id = current_setting('fx.o2')::uuid where id = current_setting('fx.s_rev')::uuid $$,
                 '42501', 'The owner of a shop cannot be changed.', 'j17_shop_owner_id_is_frozen');

-- ---------- verification document uploader stamped on INSERT only ----------
select test_helpers.act_as_service();
insert into public.shop_verification_documents (shop_id, document_type, storage_path, uploaded_by)
values (current_setting('fx.s_rev')::uuid, 'business_permit', current_setting('fx.s_rev') || '/a.pdf',
        current_setting('fx.admin')::uuid);
select test_helpers.act_as_owner('j17r-o1@local.test');
select lives_ok($$
  update public.shop_verification_documents
  set storage_path = current_setting('fx.s_rev') || '/b.pdf', uploaded_by = current_setting('fx.o2')::uuid
  where shop_id = current_setting('fx.s_rev')::uuid
$$, 'j17_document_uploader_set_on_insert_only');
select test_helpers.act_as_service();
select is((select row(storage_path, uploaded_by)::text from public.shop_verification_documents
           where shop_id = current_setting('fx.s_rev')::uuid),
          row(current_setting('fx.s_rev') || '/b.pdf', current_setting('fx.admin')::uuid)::text,
          'j17_document_uploader_set_on_insert_only');

-- ---------- link codes: pepper, lock, pruning, per-code limit ----------
select test_helpers.act_as_owner('j17r-o1@local.test');
select set_config('fx.code1', (select link_code from public.create_roster_link_code(current_setting('fx.w1')::uuid)), true);
select set_config('fx.code2', (select link_code from public.create_roster_link_code(current_setting('fx.w2')::uuid)), true);
select throws_ok($$ select count(*) from washlink_private.roster_link_code_pepper $$, '42501', null,
                 'j17_link_code_pepper_is_private');
select test_helpers.act_as_admin('j17r-admin@local.test');
select throws_ok($$ select count(*) from washlink_private.roster_link_code_pepper $$, '42501', null,
                 'j17_link_code_pepper_is_private');
select test_helpers.act_as_service();
select is((select count(*)::int from washlink_private.roster_link_code_pepper where char_length(pepper) >= 64),
          1, 'j17_link_code_hash_is_peppered');
select is((select code_hash from public.worker_roster_link_codes where worker_row_id = current_setting('fx.w1')::uuid),
          public.roster_link_code_hash(current_setting('fx.code1')), 'j17_link_code_hash_is_peppered');
select isnt((select code_hash from public.worker_roster_link_codes where worker_row_id = current_setting('fx.w1')::uuid),
            sha256(convert_to(current_setting('fx.code1'), 'UTF8')), 'j17_link_code_hash_is_peppered');

-- Pruning: five stale failures (outside the window) neither limit nor survive.
insert into public.worker_roster_link_attempts (user_id, succeeded, attempted_at)
select current_setting('fx.uw')::uuid, false, now() - interval '2 hours' from generate_series(1, 5);
select is((select count(*)::int from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()),
          0, 'j17_link_attempts_take_user_lock');
select test_helpers.act_as_worker('j17r-w1@local.test');
select is((select result from public.preview_roster_link_code('BADC0DE00009')), 'invalid_or_expired',
          'j17_link_attempts_older_than_window_are_pruned');
select test_helpers.act_as_service();
select is((select count(*)::int from public.worker_roster_link_attempts
           where user_id = current_setting('fx.uw')::uuid and attempted_at < now() - interval '1 hour'),
          0, 'j17_link_attempts_older_than_window_are_pruned');
select is((select count(*)::int from public.worker_roster_link_attempts
           where user_id = current_setting('fx.uw')::uuid and code_hash = public.roster_link_code_hash('BADC0DE00009')),
          1, 'j17_link_attempts_older_than_window_are_pruned');
select ok((select count(*) >= 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted),
          'j17_link_attempts_take_user_lock');

-- Per-code limit: 10 lookups of one code per hour (any users), then rate_limited for everyone.
select test_helpers.act_as_worker('j17r-w2@local.test');
select is((select array_agg(r.result) from generate_series(1, 10) n
           cross join lateral public.preview_roster_link_code(current_setting('fx.code1') || repeat('-', n)) r),
          array_fill('valid'::text, array[10]), 'j17_link_code_lookups_are_limited_per_code');
select is((select result from public.preview_roster_link_code(current_setting('fx.code1'))), 'rate_limited',
          'j17_link_code_lookups_are_limited_per_code');
select test_helpers.act_as_worker('j17r-w3@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code1'))), 'rate_limited',
          'j17_link_code_lookups_are_limited_per_code');
select is((select result from public.accept_roster_link_code(current_setting('fx.code2'))), 'linked',
          'j17_link_code_lookups_are_limited_per_code');

-- ---------- private tables stay out of realtime ----------
select is((select count(*)::int from pg_publication where pubname = 'supabase_realtime' and puballtables),
          0, 'j17_worker_private_contacts_not_in_realtime_publication');
select is((select count(*)::int from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename in ('worker_private_contacts', 'worker_profiles',
                               'worker_roster_link_codes', 'worker_roster_link_attempts')),
          0, 'j17_worker_private_contacts_not_in_realtime_publication');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'washlink_private' and c.relname = 'roster_link_code_pepper'),
          'j17_link_code_pepper_is_private');

-- ---------- availability has no invented default ----------
select col_hasnt_default('public', 'worker_profiles', 'availability_status',
                         'j17_worker_availability_has_no_default');
select col_not_null('public', 'worker_profiles', 'availability_status', 'j17_worker_availability_has_no_default');
select test_helpers.act_as_worker('j17r-w1@local.test');
select throws_ok($$ insert into public.worker_profiles (profile_id, headline) values (auth.uid(), 'No availability') $$,
                 '23502', null, 'j17_worker_availability_has_no_default');

select * from finish();
rollback;
