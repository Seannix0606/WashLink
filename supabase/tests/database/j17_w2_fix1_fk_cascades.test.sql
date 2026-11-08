-- J17 (W2 fix cycle 1, S-B1): FK `on delete set null` cascades pass every UPDATE guard, and
-- only the cascade itself. Account deletes run in an UNTRUSTED session (end-user claims of an
-- unrelated bystander; like GoTrue's own session it is not trusted and has no relation to the
-- rows), so the guards really run. The real GoTrue admin API path is w2-api-smoke.mjs.
-- Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j17f-c1@local.test')::text, true);
select set_config('fx.c2', test_helpers.create_customer('j17f-c2@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j17f-bystander@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17f-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17f-o2@local.test')::text, true);
select set_config('fx.uw', test_helpers.create_worker('j17f-w1@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17f-admin@local.test')::text, true);

-- s1 is approved through a real super-admin review (reviewer stamped server-side).
select set_config('fx.s1', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select test_helpers.act_as_admin('j17f-admin@local.test');
update public.shops set verification_status = 'approved' where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_service();
select set_config('fx.s2', test_helpers.create_shop(current_setting('fx.o2')::uuid)::text, true);
insert into public.shop_verification_documents (shop_id, document_type, storage_path, uploaded_by)
values (current_setting('fx.s1')::uuid, 'business_permit', current_setting('fx.s1') || '/permit.pdf',
        current_setting('fx.admin')::uuid);

select set_config('fx.w_linked', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)::text, true);
select set_config('fx.w_plain', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.w_kept', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.b_done', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid, 'completed')::text, true);
select set_config('fx.b_c1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)::text, true);
select set_config('fx.b_prog', test_helpers.create_booking_fixture(current_setting('fx.c2')::uuid, current_setting('fx.s1')::uuid, 'in_progress')::text, true);
select set_config('fx.b_canc', test_helpers.create_booking_fixture(current_setting('fx.c2')::uuid, current_setting('fx.s1')::uuid, 'cancelled')::text, true);
select set_config('fx.b_kept', test_helpers.create_booking_fixture(current_setting('fx.c2')::uuid, current_setting('fx.s1')::uuid, 'completed')::text, true);
select set_config('fx.b_o2', test_helpers.create_booking_fixture(current_setting('fx.c2')::uuid, current_setting('fx.s2')::uuid, 'accepted')::text, true);
update public.bookings set assigned_worker_id = current_setting('fx.w_plain')::uuid
where id in (current_setting('fx.b_done')::uuid, current_setting('fx.b_prog')::uuid);
update public.bookings set assigned_worker_id = current_setting('fx.w_linked')::uuid
where id = current_setting('fx.b_canc')::uuid;
update public.bookings set assigned_worker_id = current_setting('fx.w_kept')::uuid
where id = current_setting('fx.b_kept')::uuid;

-- Row snapshots (jsonb) taken before each step.
create temp table fx_before (id uuid primary key, row_json jsonb not null);
create function pg_temp.snapshot() returns void language sql as $$
  delete from fx_before;
  insert into fx_before
  select b.id, to_jsonb(b) from public.bookings b
  union all select s.id, to_jsonb(s) from public.shops s
  union all select w.id, to_jsonb(w) from public.workers w
  union all select d.id, to_jsonb(d) from public.shop_verification_documents d;
$$;
-- Untrusted session that can still delete auth users (current_user stays the superuser).
create function pg_temp.act_as_untrusted_bystander() returns void language sql as $$
  select test_helpers.act_as_service();
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as_untrusted_bystander();
select is(public.is_trusted_db_session(), false, 'j17_fk_cascade_tests_run_in_untrusted_session');

-- ---------- customer with bookings deleted: bookings.customer_id -> null only ----------
select test_helpers.act_as_service();
select pg_temp.snapshot();
select pg_temp.act_as_untrusted_bystander();
select lives_ok($$ delete from auth.users where id = current_setting('fx.c1')::uuid $$,
                'j17_customer_delete_with_bookings_succeeds');
select test_helpers.act_as_service();
select is((select count(*)::int from public.bookings
           where id in (current_setting('fx.b_done')::uuid, current_setting('fx.b_c1')::uuid) and customer_id is null),
          2, 'j17_customer_delete_with_bookings_succeeds');
select is((select to_jsonb(b) - 'customer_id' from public.bookings b where id = current_setting('fx.b_done')::uuid),
          (select row_json - 'customer_id' from fx_before where id = current_setting('fx.b_done')::uuid),
          'j17_customer_delete_changes_only_customer_id');
select is((select to_jsonb(b) - 'customer_id' from public.bookings b where id = current_setting('fx.b_c1')::uuid),
          (select row_json - 'customer_id' from fx_before where id = current_setting('fx.b_c1')::uuid),
          'j17_customer_delete_changes_only_customer_id');

-- ---------- linked worker account deleted: workers.user_id -> null only ----------
select pg_temp.snapshot();
select pg_temp.act_as_untrusted_bystander();
select lives_ok($$ delete from auth.users where id = current_setting('fx.uw')::uuid $$,
                'j17_linked_worker_account_delete_succeeds');
select test_helpers.act_as_service();
select is((select user_id from public.workers where id = current_setting('fx.w_linked')::uuid),
          null::uuid, 'j17_linked_worker_account_delete_succeeds');
select is((select to_jsonb(w) - 'user_id' from public.workers w where id = current_setting('fx.w_linked')::uuid),
          (select row_json - 'user_id' from fx_before where id = current_setting('fx.w_linked')::uuid),
          'j17_linked_worker_account_delete_changes_only_user_id');
select is((select to_jsonb(b) from public.bookings b where id = current_setting('fx.b_canc')::uuid),
          (select row_json from fx_before where id = current_setting('fx.b_canc')::uuid),
          'j17_linked_worker_account_delete_changes_only_user_id');

-- ---------- reviewing super admin deleted: shops.verification_reviewed_by -> null only ----------
select is((select verification_reviewed_by from public.shops where id = current_setting('fx.s1')::uuid),
          current_setting('fx.admin')::uuid, 'j17_reviewing_admin_delete_succeeds');
select pg_temp.snapshot();
select pg_temp.act_as_untrusted_bystander();
select lives_ok($$ delete from auth.users where id = current_setting('fx.admin')::uuid $$,
                'j17_reviewing_admin_delete_succeeds');
select test_helpers.act_as_service();
select is((select to_jsonb(s) - 'verification_reviewed_by' from public.shops s where id = current_setting('fx.s1')::uuid),
          (select row_json - 'verification_reviewed_by' from fx_before where id = current_setting('fx.s1')::uuid),
          'j17_reviewing_admin_delete_changes_only_reviewed_by');
select is((select verification_reviewed_by from public.shops where id = current_setting('fx.s1')::uuid),
          null::uuid, 'j17_reviewing_admin_delete_changes_only_reviewed_by');
select is((select to_jsonb(d) - 'uploaded_by' from public.shop_verification_documents d
           where shop_id = current_setting('fx.s1')::uuid),
          (select f.row_json - 'uploaded_by' from fx_before f
           join public.shop_verification_documents d on d.id = f.id
           where d.shop_id = current_setting('fx.s1')::uuid),
          'j17_uploader_delete_changes_only_uploaded_by');
select is((select uploaded_by from public.shop_verification_documents where shop_id = current_setting('fx.s1')::uuid),
          null::uuid, 'j17_uploader_delete_changes_only_uploaded_by');
-- C-B1(b) consequence: no recorded reviewer any more -> not a verified shop until re-reviewed.
select test_helpers.act_as_owner('j17f-o1@local.test');
select is(public.is_verified_shop_owner(current_setting('fx.s1')::uuid), false,
          'j17_reviewer_delete_unverifies_shop_until_rereview');

-- ---------- roster rows deleted by their owner, bookings in completed / in_progress / cancelled ----------
select test_helpers.act_as_service();
select pg_temp.snapshot();
select test_helpers.act_as_owner('j17f-o1@local.test');
select lives_ok($$ delete from public.workers where id in (current_setting('fx.w_plain')::uuid, current_setting('fx.w_linked')::uuid) $$,
                'j17_roster_worker_delete_with_bookings_in_any_status_succeeds');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workers
           where id in (current_setting('fx.w_plain')::uuid, current_setting('fx.w_linked')::uuid)),
          0, 'j17_roster_worker_delete_with_bookings_in_any_status_succeeds');
select is((select array_agg(booking_status::text order by booking_status::text) from public.bookings
           where id in (current_setting('fx.b_done')::uuid, current_setting('fx.b_prog')::uuid, current_setting('fx.b_canc')::uuid)
             and assigned_worker_id is null),
          array['cancelled', 'completed', 'in_progress'], 'j17_roster_worker_delete_with_bookings_in_any_status_succeeds');
select is((select count(*)::int from public.bookings b join fx_before f on f.id = b.id
           where b.id in (current_setting('fx.b_done')::uuid, current_setting('fx.b_prog')::uuid, current_setting('fx.b_canc')::uuid)
             and to_jsonb(b) - 'assigned_worker_id' = f.row_json - 'assigned_worker_id'),
          3, 'j17_roster_worker_delete_changes_only_assigned_worker_id');

-- ---------- owner account deleted: its shops cascade away, bookings.shop_id -> null only ----------
select pg_temp.snapshot();
select pg_temp.act_as_untrusted_bystander();
select lives_ok($$ delete from auth.users where id = current_setting('fx.o2')::uuid $$,
                'j17_owner_account_delete_with_shop_bookings_succeeds');
select test_helpers.act_as_service();
select is((select to_jsonb(b) - 'shop_id' from public.bookings b where id = current_setting('fx.b_o2')::uuid),
          (select row_json - 'shop_id' from fx_before where id = current_setting('fx.b_o2')::uuid),
          'j17_owner_account_delete_changes_only_shop_id');
select is((select shop_id from public.bookings where id = current_setting('fx.b_o2')::uuid),
          null::uuid, 'j17_owner_account_delete_changes_only_shop_id');

-- ---------- only the cascade: same columns set to null by hand stay rejected ----------
select test_helpers.act_as_owner('j17f-o1@local.test');
select throws_ok($$ update public.bookings set customer_id = null where id = current_setting('fx.b_prog')::uuid $$,
                 '42501', 'This booking field cannot be changed.', 'j17_manual_fk_null_with_existing_parent_rejected');
select throws_ok($$ update public.bookings set assigned_worker_id = null where id = current_setting('fx.b_kept')::uuid $$,
                 '42501', 'Only a worker from your own roster can be assigned to this booking.',
                 'j17_manual_fk_null_with_existing_parent_rejected');
select test_helpers.act_as_service();
select is((select assigned_worker_id from public.bookings where id = current_setting('fx.b_kept')::uuid),
          current_setting('fx.w_kept')::uuid, 'j17_manual_fk_null_with_existing_parent_rejected');
select is(public.is_orphaned_fk_set_null('public.bookings'::regclass,
            jsonb_build_object('customer_id', gen_random_uuid(), 'customer_name', 'A'),
            jsonb_build_object('customer_id', null, 'customer_name', 'A')),
          true, 'j17_orphan_fk_helper_allows_only_the_cascade');
select is(public.is_orphaned_fk_set_null('public.bookings'::regclass,
            jsonb_build_object('customer_id', gen_random_uuid(), 'customer_name', 'A'),
            jsonb_build_object('customer_id', null, 'customer_name', 'B')),
          false, 'j17_orphan_fk_helper_allows_only_the_cascade');
select is(public.is_orphaned_fk_set_null('public.bookings'::regclass,
            jsonb_build_object('customer_id', current_setting('fx.c2'), 'customer_name', 'A'),
            jsonb_build_object('customer_id', null, 'customer_name', 'A')),
          false, 'j17_orphan_fk_helper_allows_only_the_cascade');
select is(public.is_orphaned_fk_set_null('public.bookings'::regclass,
            jsonb_build_object('customer_name', 'A'), jsonb_build_object('customer_name', null)),
          false, 'j17_orphan_fk_helper_allows_only_the_cascade');
select test_helpers.act_as_owner('j17f-o1@local.test');
select throws_ok($$ select public.is_orphaned_fk_set_null('public.bookings'::regclass, '{}'::jsonb, '{}'::jsonb) $$,
                 '42501', null, 'j17_orphan_fk_helper_allows_only_the_cascade');

select * from finish();
rollback;
