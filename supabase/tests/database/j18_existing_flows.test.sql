-- J18: existing flows keep working (booking + quote, pricing, verification, ratings).
-- One TODO: F5 (owner resubmission after changes_requested), fixed in W2.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j18-c1@local.test')::text, true);
select set_config('fx.c2', test_helpers.create_customer('j18-c2@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j18-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j18-o2@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j18-admin@local.test')::text, true);

select set_config('fx.s1', test_helpers.create_shop(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.s_pending', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_inactive', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'approved', false)::text, true);
select set_config('fx.s_review_a', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_review_r', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_cr', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'changes_requested')::text, true);
select set_config('fx.s_o2', test_helpers.create_shop(current_setting('fx.o2')::uuid)::text, true);

select test_helpers.set_shop_price(current_setting('fx.s1')::uuid, 'Sedan', 'Basic Wash', 250.00);
select test_helpers.set_shop_price(current_setting('fx.s1')::uuid, 'SUV', 'Basic Wash', 300.00);
select test_helpers.set_shop_price(current_setting('fx.s_pending')::uuid, 'Sedan', 'Basic Wash', 200.00);
select test_helpers.set_shop_price(current_setting('fx.s_inactive')::uuid, 'Sedan', 'Basic Wash', 210.00);

select set_config('fx.b_pending', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)::text, true);
select set_config('fx.b_done1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid, 'completed')::text, true);
select set_config('fx.b_done2', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid, 'completed')::text, true);

insert into public.shop_verification_documents (shop_id, document_type, storage_path, uploaded_by)
values (current_setting('fx.s_o2')::uuid, 'business_permit',
        current_setting('fx.s_o2') || '/business_permit-local.pdf', current_setting('fx.o2')::uuid);

select set_config('fx.bq1', gen_random_uuid()::text, true);
select set_config('fx.bq2', gen_random_uuid()::text, true);

-- ---------- booking creation and pricing quote ----------
select test_helpers.act_as_customer('j18-c1@local.test');

select lives_ok($$
  insert into public.bookings (id, customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
  values (current_setting('fx.bq1')::uuid, 'J18 Customer', auth.uid(), 'Sedan', 'Basic Wash',
          'J18 address', now() + interval '1 day', current_setting('fx.s1')::uuid)
$$, 'j18_customer_can_create_booking_with_shop_quote');
select is((select quoted_price from public.bookings where id = current_setting('fx.bq1')::uuid),
          250.00::numeric, 'j18_customer_can_create_booking_with_shop_quote');

select lives_ok($$
  insert into public.bookings (id, customer_name, customer_id, vehicle_type, service_type, address, time, shop_id, quoted_price)
  values (current_setting('fx.bq2')::uuid, 'J18 Customer', auth.uid(), 'Sedan', 'Basic Wash',
          'J18 address', now() + interval '1 day', current_setting('fx.s1')::uuid, 1.00)
$$, 'j18_booking_quote_ignores_client_supplied_price');
select is((select quoted_price from public.bookings where id = current_setting('fx.bq2')::uuid),
          250.00::numeric, 'j18_booking_quote_ignores_client_supplied_price');

select throws_ok($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time)
  values ('J18 Customer', auth.uid(), 'Sedan', 'Basic Wash', 'J18 address', now() + interval '1 day')
$$, 'P0001', 'Choose a shop before placing a booking.', 'j18_booking_requires_shop');

select throws_ok($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
  values ('J18 Customer', auth.uid(), 'SUV', 'Wax', 'J18 address', now() + interval '1 day',
          current_setting('fx.s1')::uuid)
$$, 'P0001', 'The selected shop has no active rate for this vehicle and wash package.',
   'j18_booking_requires_matching_active_price');

select throws_ok($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
  values ('J18 Customer', auth.uid(), 'Sedan', 'Basic Wash', 'J18 address', now() + interval '1 day',
          current_setting('fx.s_pending')::uuid)
$$, 'P0001', 'The selected shop has no active rate for this vehicle and wash package.',
   'j18_booking_rejected_for_unapproved_shop');

select test_helpers.act_as_owner('j18-o1@local.test');
select lives_ok($$
  insert into public.shop_pricing (shop_id, vehicle_type, service_type, price)
  values (current_setting('fx.s1')::uuid, 'Pickup', 'Full Wash', 500.00)
$$, 'j18_owner_can_manage_own_shop_pricing');
select lives_ok($$
  update public.shop_pricing set price = 550.00
  where shop_id = current_setting('fx.s1')::uuid and vehicle_type = 'Pickup' and service_type = 'Full Wash'
$$, 'j18_owner_can_manage_own_shop_pricing');
select is((select price from public.shop_pricing
           where shop_id = current_setting('fx.s1')::uuid and vehicle_type = 'Pickup' and service_type = 'Full Wash'),
          550.00::numeric, 'j18_owner_can_manage_own_shop_pricing');

select test_helpers.act_as_owner('j18-o2@local.test');
select throws_ok($$
  insert into public.shop_pricing (shop_id, vehicle_type, service_type, price)
  values (current_setting('fx.s1')::uuid, 'Pickup', 'Wax', 99.00)
$$, '42501', null, 'j18_owner_cannot_manage_other_shop_pricing');
select test_helpers.attempt($$
  update public.shop_pricing set price = 1.00
  where shop_id = current_setting('fx.s1')::uuid and vehicle_type = 'Sedan' and service_type = 'Basic Wash'
$$);
select test_helpers.act_as_service();
select is((select price from public.shop_pricing
           where shop_id = current_setting('fx.s1')::uuid and vehicle_type = 'Sedan' and service_type = 'Basic Wash'),
          250.00::numeric, 'j18_owner_cannot_manage_other_shop_pricing');

select test_helpers.act_as_customer('j18-c1@local.test');
select is((select count(*)::int from public.shop_pricing
           where shop_id in (current_setting('fx.s_pending')::uuid, current_setting('fx.s_inactive')::uuid)),
          0, 'j18_customer_sees_only_approved_active_shop_pricing');
select ok(exists (select 1 from public.shop_pricing where shop_id = current_setting('fx.s1')::uuid),
          'j18_customer_sees_only_approved_active_shop_pricing');

select test_helpers.act_as_owner('j18-o1@local.test');
select throws_ok($$
  insert into public.shop_pricing (shop_id, vehicle_type, service_type, price)
  values (current_setting('fx.s1')::uuid, 'Pickup', 'Wax', 0)
$$, '23514', null, 'j18_shop_price_must_be_positive');

select test_helpers.act_as_customer('j18-c1@local.test');
select lives_ok($$
  update public.bookings set booking_status = 'cancelled'
  where id = current_setting('fx.b_pending')::uuid and customer_id = auth.uid() and booking_status = 'pending'
$$, 'j18_customer_can_cancel_own_pending_booking');
select is((select booking_status from public.bookings where id = current_setting('fx.b_pending')::uuid),
          'cancelled', 'j18_customer_can_cancel_own_pending_booking');

-- ---------- verification ----------
select test_helpers.act_as_owner('j18-o1@local.test');
select throws_ok($$
  update public.shops set verification_status = 'approved' where id = current_setting('fx.s_review_a')::uuid
$$, 'P0001', 'Only super admins can change verification status or notes.', 'j18_owner_cannot_self_approve_shop');

select test_helpers.act_as_admin('j18-admin@local.test');
select lives_ok($$
  update public.shops
  set verification_status = 'approved', verification_reviewed_at = now(), verification_reviewed_by = auth.uid()
  where id = current_setting('fx.s_review_a')::uuid
$$, 'j18_super_admin_can_approve_shop');
select is((select verification_status from public.shops where id = current_setting('fx.s_review_a')::uuid),
          'approved', 'j18_super_admin_can_approve_shop');

select lives_ok($$
  update public.shops
  set verification_status = 'changes_requested', verification_notes = 'Upload a clearer permit.',
      verification_reviewed_at = now(), verification_reviewed_by = auth.uid()
  where id = current_setting('fx.s_review_r')::uuid
$$, 'j18_super_admin_can_request_changes');
select is((select verification_status from public.shops where id = current_setting('fx.s_review_r')::uuid),
          'changes_requested', 'j18_super_admin_can_request_changes');

-- Same UPDATE that SupabaseShopVerificationRepository.submitShopForVerification sends.
select test_helpers.act_as_owner('j18-o1@local.test');
select lives_ok($$
  update public.shops set verification_status = 'pending', verification_submitted_at = now()
  where id = current_setting('fx.s_pending')::uuid and owner_id = auth.uid()
    and verification_status in ('pending', 'changes_requested')
$$, 'j18_owner_can_resubmit_pending_shop');
select ok((select verification_submitted_at is not null from public.shops where id = current_setting('fx.s_pending')::uuid),
          'j18_owner_can_resubmit_pending_shop');

select lives_ok($$
  insert into public.shop_verification_documents (shop_id, document_type, storage_path, file_name, uploaded_by)
  values (current_setting('fx.s1')::uuid, 'valid_government_id',
          current_setting('fx.s1') || '/valid_government_id-local.pdf', 'id.pdf', auth.uid())
$$, 'j18_owner_can_manage_own_verification_documents');
select lives_ok($$
  update public.shop_verification_documents set file_name = 'id-v2.pdf'
  where shop_id = current_setting('fx.s1')::uuid and document_type = 'valid_government_id'
$$, 'j18_owner_can_manage_own_verification_documents');
select is((select file_name from public.shop_verification_documents
           where shop_id = current_setting('fx.s1')::uuid and document_type = 'valid_government_id'),
          'id-v2.pdf', 'j18_owner_can_manage_own_verification_documents');
select lives_ok($$
  delete from public.shop_verification_documents
  where shop_id = current_setting('fx.s1')::uuid and document_type = 'valid_government_id'
$$, 'j18_owner_can_manage_own_verification_documents');
select is((select count(*)::int from public.shop_verification_documents where shop_id = current_setting('fx.s1')::uuid),
          0, 'j18_owner_can_manage_own_verification_documents');

select is((select count(*)::int from public.shop_verification_documents where shop_id = current_setting('fx.s_o2')::uuid),
          0, 'j18_owner_cannot_read_other_shop_verification_documents');

-- F5 is a genuine failing TODO today: this is the exact UPDATE the frontend sends, and
-- prevent_owner_verification_mutation() rejects it for a changes_requested shop.
-- W2 NOTE: W2 may fix F5 through an RPC (e.g. public.submit_shop_for_verification(shop_id))
-- instead of making this direct UPDATE legal. If so, W2 MUST rewrite this test to exercise the
-- real resubmission path the frontend then uses (call the RPC as the owner, assert status
-- 'pending' and verification_submitted_at set), and keep a check that the direct UPDATE of
-- verification_status by an owner is still rejected. Do not just delete the todo wrapper.
select todo_start('F5: blocked by prevent_owner_verification_mutation; fixed in W2 by submit_shop_for_verification(); remove this todo in W2');
select lives_ok($$
  update public.shops set verification_status = 'pending', verification_submitted_at = now()
  where id = current_setting('fx.s_cr')::uuid and owner_id = auth.uid()
    and verification_status in ('pending', 'changes_requested')
$$, 'j18_owner_can_resubmit_after_changes_requested');
select is((select verification_status from public.shops where id = current_setting('fx.s_cr')::uuid),
          'pending', 'j18_owner_can_resubmit_after_changes_requested');
select todo_end();

-- ---------- ratings (same UPDATE as SupabaseBookingRepository.rateBooking) ----------
select test_helpers.act_as_customer('j18-c1@local.test');
select lives_ok($$
  update public.bookings
  set customer_rating_stars = 5, customer_rating_comment = 'Great', customer_rated_at = now()
  where id = current_setting('fx.b_done1')::uuid and customer_id = auth.uid()
    and booking_status = 'completed' and customer_rating_stars is null
$$, 'j18_customer_can_rate_completed_booking');
select is((select customer_rating_stars from public.bookings where id = current_setting('fx.b_done1')::uuid),
          5::smallint, 'j18_customer_can_rate_completed_booking');

select throws_ok($$
  update public.bookings set customer_rating_stars = 0 where id = current_setting('fx.b_done2')::uuid
$$, '23514', null, 'j18_rating_stars_must_be_between_1_and_5');
select throws_ok($$
  update public.bookings set customer_rating_stars = 6 where id = current_setting('fx.b_done2')::uuid
$$, '23514', null, 'j18_rating_stars_must_be_between_1_and_5');

select test_helpers.act_as_customer('j18-c2@local.test');
select lives_ok($$
  update public.bookings
  set customer_rating_stars = 1, customer_rating_comment = 'Not mine', customer_rated_at = now()
  where id = current_setting('fx.b_done2')::uuid and customer_id = current_setting('fx.c1')::uuid
    and booking_status = 'completed' and customer_rating_stars is null
$$, 'j18_customer_cannot_rate_other_customer_booking');
select test_helpers.act_as_service();
select is((select customer_rating_stars from public.bookings where id = current_setting('fx.b_done2')::uuid),
          null::smallint, 'j18_customer_cannot_rate_other_customer_booking');

select * from finish();
rollback;
