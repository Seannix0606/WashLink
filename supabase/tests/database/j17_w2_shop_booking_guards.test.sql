-- J17 (W2): shop registration / verification guards, gate helper, trusted-session helper
-- and booking status transitions. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j17b-c1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17b-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17b-o2@local.test')::text, true);
select set_config('fx.uw', test_helpers.create_worker('j17b-w1@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17b-admin@local.test')::text, true);

select set_config('fx.s_appr', test_helpers.create_shop(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.s_pend', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_cr', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'changes_requested')::text, true);
select set_config('fx.s_ident', test_helpers.create_shop(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.s_o2', test_helpers.create_shop(current_setting('fx.o2')::uuid)::text, true);

select set_config('fx.w1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)::text, true);
select set_config('fx.b_acc', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s_appr')::uuid, 'accepted')::text, true);
select set_config('fx.b_wacc', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s_appr')::uuid, 'accepted')::text, true);
select set_config('fx.b_wpend', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s_appr')::uuid)::text, true);
update public.bookings set assigned_worker_id = current_setting('fx.w1')::uuid
where id in (current_setting('fx.b_wacc')::uuid, current_setting('fx.b_wpend')::uuid);
-- C-B1(b): the gate needs a recorded review (fixtures run in a trusted session).
update public.shops
set verification_reviewed_by = current_setting('fx.admin')::uuid, verification_reviewed_at = now()
where id = current_setting('fx.s_appr')::uuid;

-- ---------- E3 / C3: only owner accounts register shops ----------
select test_helpers.act_as_customer('j17b-c1@local.test');
select throws_ok($$
  insert into public.shops (owner_id, name, address) values (auth.uid(), 'J17b customer shop', 'J17b address')
$$, '42501', 'Only owner accounts can register a shop.', 'j17_customer_cannot_register_shop');
select test_helpers.act_as_worker('j17b-w1@local.test');
select throws_ok($$
  insert into public.shops (owner_id, name, address) values (auth.uid(), 'J17b worker shop', 'J17b address')
$$, '42501', 'Only owner accounts can register a shop.', 'j17_customer_cannot_register_shop');
select test_helpers.act_as_owner('j17b-o1@local.test');
select throws_ok($$
  insert into public.shops (owner_id, name, address, verification_reviewed_by)
  values (auth.uid(), 'J17b forged review', 'J17b address', auth.uid())
$$, '42501', 'New shops start as pending verification.', 'j17_owner_cannot_insert_preapproved_shop');

-- ---------- gate helper ----------
select test_helpers.act_as_owner('j17b-o1@local.test');
select is(public.is_verified_shop_owner(current_setting('fx.s_appr')::uuid), true,
          'j17_is_verified_shop_owner_requires_own_approved_shop');
select is(public.is_verified_shop_owner(current_setting('fx.s_pend')::uuid), false,
          'j17_is_verified_shop_owner_requires_own_approved_shop');
select is(public.is_verified_shop_owner(current_setting('fx.s_cr')::uuid), false,
          'j17_is_verified_shop_owner_requires_own_approved_shop');
select is(public.is_verified_shop_owner(current_setting('fx.s_o2')::uuid), false,
          'j17_is_verified_shop_owner_requires_own_approved_shop');
select test_helpers.act_as_customer('j17b-c1@local.test');
select is(public.is_verified_shop_owner(current_setting('fx.s_appr')::uuid), false,
          'j17_is_verified_shop_owner_requires_own_approved_shop');
select test_helpers.act_as_anon();
select throws_ok($$ select public.is_verified_shop_owner(current_setting('fx.s_appr')::uuid) $$,
                 '42501', null, 'j17_is_verified_shop_owner_requires_own_approved_shop');
-- Anon claims without the anon DB role (e.g. a definer path): still false.
select test_helpers.act_as_service();
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is(public.is_verified_shop_owner(current_setting('fx.s_appr')::uuid), false,
          'j17_is_verified_shop_owner_requires_own_approved_shop');

-- ---------- trusted session helper ----------
select is(public.is_trusted_db_session(), false, 'j17_trusted_session_false_for_end_users');
select test_helpers.act_as_customer('j17b-c1@local.test');
select is(public.is_trusted_db_session(), false, 'j17_trusted_session_false_for_end_users');
select test_helpers.act_as_admin('j17b-admin@local.test');
select is(public.is_trusted_db_session(), false, 'j17_trusted_session_false_for_end_users');
select test_helpers.act_as_anon();
select throws_ok($$ select public.is_trusted_db_session() $$, '42501', null,
                 'j17_trusted_session_false_for_end_users');
select test_helpers.act_as_service();
select is(public.is_trusted_db_session(), true, 'j17_trusted_session_false_for_end_users');

-- ---------- S6: approved shop identity change goes back to review ----------
select test_helpers.act_as_owner('j17b-o1@local.test');
select lives_ok($$
  update public.shops set name = 'J17b renamed shop' where id = current_setting('fx.s_ident')::uuid
$$, 'j17_approved_shop_identity_change_requires_rereview');
select test_helpers.act_as_service();
select is((select row(verification_status, verification_submitted_at is not null)::text
           from public.shops where id = current_setting('fx.s_ident')::uuid),
          row('pending'::text, true)::text, 'j17_approved_shop_identity_change_requires_rereview');

-- ---------- S7: verification documents bound to own shop folder and uploader ----------
select test_helpers.act_as_owner('j17b-o1@local.test');
select throws_ok($$
  insert into public.shop_verification_documents (shop_id, document_type, storage_path)
  values (current_setting('fx.s_appr')::uuid, 'business_permit', current_setting('fx.s_o2') || '/business_permit-x.pdf')
$$, '42501', 'Verification documents must be stored in their own shop folder.',
   'j17_verification_document_path_bound_to_own_shop');
select lives_ok($$
  insert into public.shop_verification_documents (shop_id, document_type, storage_path, uploaded_by)
  values (current_setting('fx.s_appr')::uuid, 'mayors_permit',
          current_setting('fx.s_appr') || '/mayors_permit-x.pdf', current_setting('fx.o2')::uuid)
$$, 'j17_verification_document_path_bound_to_own_shop');
select is((select uploaded_by from public.shop_verification_documents
           where shop_id = current_setting('fx.s_appr')::uuid and document_type = 'mayors_permit'),
          current_setting('fx.o1')::uuid, 'j17_verification_document_path_bound_to_own_shop');
select throws_ok($$
  update public.shop_verification_documents set storage_path = current_setting('fx.s_o2') || '/moved.pdf'
  where shop_id = current_setting('fx.s_appr')::uuid and document_type = 'mayors_permit'
$$, '42501', 'Verification documents must be stored in their own shop folder.',
   'j17_verification_document_path_bound_to_own_shop');

-- ---------- F5: the direct UPDATE stays blocked; the RPC is owner-only ----------
select test_helpers.act_as_owner('j17b-o1@local.test');
select throws_ok($$
  update public.shops set verification_status = 'pending', verification_submitted_at = now()
  where id = current_setting('fx.s_cr')::uuid
$$, 'P0001', 'Only super admins can change verification status or notes.',
   'j17_owner_cannot_directly_resubmit_changes_requested_shop');
-- Even with the RPC flag forged (possible in raw SQL, not through PostgREST: R3), the guard
-- only lets pending | changes_requested -> pending through, never a self-approval.
select set_config('washlink.submit_shop', current_setting('fx.s_cr'), true);
select throws_ok($$
  update public.shops set verification_status = 'approved'
  where id = current_setting('fx.s_cr')::uuid
$$, 'P0001', 'Only super admins can change verification status or notes.',
   'j17_owner_cannot_directly_resubmit_changes_requested_shop');
select set_config('washlink.submit_shop', '', true);

select test_helpers.act_as_owner('j17b-o2@local.test');
select throws_ok($$ select public.submit_shop_for_verification(current_setting('fx.s_cr')::uuid) $$,
                 '42501', 'Shop not found.', 'j17_submit_shop_rpc_rejects_other_owner');
select test_helpers.act_as_anon();
select throws_ok($$ select public.submit_shop_for_verification(current_setting('fx.s_cr')::uuid) $$,
                 '42501', null, 'j17_submit_shop_rpc_rejects_other_owner');
select test_helpers.act_as_service();
select is((select verification_status from public.shops where id = current_setting('fx.s_cr')::uuid),
          'changes_requested', 'j17_submit_shop_rpc_rejects_other_owner');
select test_helpers.act_as_owner('j17b-o1@local.test');
select throws_ok($$ select public.submit_shop_for_verification(current_setting('fx.s_appr')::uuid) $$,
                 'P0001', 'This shop cannot be submitted in its current status.',
                 'j17_submit_shop_rpc_rejects_ineligible_status');

-- ---------- booking status transitions ----------
select test_helpers.act_as_customer('j17b-c1@local.test');
select throws_ok($$
  update public.bookings set booking_status = 'cancelled' where id = current_setting('fx.b_acc')::uuid
$$, '42501', 'This booking status change is not allowed.', 'j17_customer_cannot_cancel_accepted_booking');
select test_helpers.act_as_service();
select is((select booking_status from public.bookings where id = current_setting('fx.b_acc')::uuid),
          'accepted', 'j17_customer_cannot_cancel_accepted_booking');

select test_helpers.act_as_worker('j17b-w1@local.test');
select throws_ok($$
  update public.bookings set booking_status = 'completed' where id = current_setting('fx.b_wacc')::uuid
$$, '42501', 'This booking status change is not allowed.', 'j17_worker_cannot_skip_booking_status');
select throws_ok($$
  update public.bookings set booking_status = 'in_progress' where id = current_setting('fx.b_wpend')::uuid
$$, '42501', 'This booking status change is not allowed.', 'j17_worker_cannot_skip_booking_status');
select test_helpers.act_as_service();
select is((select array_agg(booking_status order by booking_status) from public.bookings
           where id in (current_setting('fx.b_wacc')::uuid, current_setting('fx.b_wpend')::uuid)),
          array['accepted', 'pending']::text[], 'j17_worker_cannot_skip_booking_status');

select * from finish();
rollback;
