-- J18: existing flows keep working (booking + quote, pricing, verification, ratings, and the
-- W2-guarded owner / worker / customer write paths the frontend uses). No TODO blocks:
-- F5 is fixed in W2 through submit_shop_for_verification(). Profile reads: j18_w2_profile_reads.
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

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
select set_config('fx.bq3', gen_random_uuid()::text, true);

-- W2 owner / worker booking flows (all at s1, owned by o1).
select set_config('fx.uw', test_helpers.create_worker('j18-w1@local.test')::text, true);
select set_config('fx.w_own', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)::text, true);
select set_config('fx.b_flow', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)::text, true);
select set_config('fx.b_rej', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)::text, true);
select set_config('fx.b_acc_rej', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid, 'accepted')::text, true);

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

-- F5 (fixed in W2b): the owner resubmits a changes_requested shop through the RPC the
-- frontend now calls (SupabaseShopVerificationRepository -> rpc submit_shop_for_verification).
-- The direct UPDATE stays rejected: j17_owner_cannot_directly_resubmit_changes_requested_shop.
select lives_ok($$ select public.submit_shop_for_verification(current_setting('fx.s_cr')::uuid) $$,
                'j18_owner_can_resubmit_after_changes_requested');
select is((select row(verification_status, verification_submitted_at is not null)::text
           from public.shops where id = current_setting('fx.s_cr')::uuid),
          row('pending'::text, true)::text, 'j18_owner_can_resubmit_after_changes_requested');
select is((select verification_status from public.submit_shop_for_verification(current_setting('fx.s_pending')::uuid)),
          'pending', 'j18_owner_can_resubmit_after_changes_requested');

-- Admin reviews the resubmitted shop with the same UPDATE as applyReviewDecision.
select test_helpers.act_as_admin('j18-admin@local.test');
select lives_ok($$
  update public.shops
  set verification_status = 'approved', verification_notes = null,
      verification_reviewed_at = now(), verification_reviewed_by = auth.uid()
  where id = current_setting('fx.s_cr')::uuid
$$, 'j18_super_admin_can_review_resubmitted_shop');
select is((select row(verification_status, verification_reviewed_by)::text
           from public.shops where id = current_setting('fx.s_cr')::uuid),
          row('approved'::text, current_setting('fx.admin')::uuid)::text,
          'j18_super_admin_can_review_resubmitted_shop');

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

-- ---------- W2-guarded write paths (same payloads as the repositories) ----------
-- SupabaseBookingRepository.createBooking (mapCreateBookingInputToCreateBookingRow).
select test_helpers.act_as_customer('j18-c1@local.test');
select lives_ok($$
  insert into public.bookings (id, customer_name, vehicle_type, service_type, address, time, booking_status,
                               customer_id, shop_id, latitude, longitude, customer_notes)
  values (current_setting('fx.bq3')::uuid, 'J18 Customer', 'SUV', 'Basic Wash', 'J18 address',
          now() + interval '2 days', 'pending', auth.uid(), current_setting('fx.s1')::uuid,
          14.5995, 120.9842, 'Gate code at the guard house')
$$, 'j18_customer_booking_insert_with_frontend_payload');
select is((select row(booking_status, quoted_price)::text from public.bookings where id = current_setting('fx.bq3')::uuid),
          row('pending'::text, 300.00::numeric)::text, 'j18_customer_booking_insert_with_frontend_payload');

-- updateBookingStatus (owner) and assignWorkerToBooking.
select test_helpers.act_as_owner('j18-o1@local.test');
select lives_ok($$ update public.bookings set booking_status = 'accepted' where id = current_setting('fx.b_flow')::uuid $$,
                'j18_owner_can_accept_and_reject_pending_booking');
select lives_ok($$ update public.bookings set booking_status = 'rejected' where id = current_setting('fx.b_rej')::uuid $$,
                'j18_owner_can_accept_and_reject_pending_booking');
select lives_ok($$ update public.bookings set booking_status = 'rejected' where id = current_setting('fx.b_acc_rej')::uuid $$,
                'j18_owner_can_accept_and_reject_pending_booking');
select is((select array_agg(booking_status order by id = current_setting('fx.b_flow')::uuid desc, id = current_setting('fx.b_rej')::uuid desc)
           from public.bookings
           where id in (current_setting('fx.b_flow')::uuid, current_setting('fx.b_rej')::uuid, current_setting('fx.b_acc_rej')::uuid)),
          array['accepted', 'rejected', 'rejected']::text[], 'j18_owner_can_accept_and_reject_pending_booking');

select lives_ok($$ update public.bookings set assigned_worker_id = current_setting('fx.w_own')::uuid where id = current_setting('fx.b_flow')::uuid $$,
                'j18_owner_can_assign_own_roster_worker');
select is((select assigned_worker_id from public.bookings where id = current_setting('fx.b_flow')::uuid),
          current_setting('fx.w_own')::uuid, 'j18_owner_can_assign_own_roster_worker');

-- updateBookingStatusForAssignedWorker: accepted -> in_progress -> completed.
select test_helpers.act_as_worker('j18-w1@local.test');
select lives_ok($$
  update public.bookings set booking_status = 'in_progress'
  where id = current_setting('fx.b_flow')::uuid and assigned_worker_id = current_setting('fx.w_own')::uuid
$$, 'j18_assigned_worker_can_progress_booking');
select lives_ok($$
  update public.bookings set booking_status = 'completed'
  where id = current_setting('fx.b_flow')::uuid and assigned_worker_id = current_setting('fx.w_own')::uuid
$$, 'j18_assigned_worker_can_progress_booking');
select is((select booking_status from public.bookings where id = current_setting('fx.b_flow')::uuid),
          'completed', 'j18_assigned_worker_can_progress_booking');
-- updateWorkerAvailability by the linked worker.
select lives_ok($$ update public.workers set is_available = false where id = current_setting('fx.w_own')::uuid $$,
                'j18_assigned_worker_can_progress_booking');

-- SupabaseShopRepository.updateShop on an approved shop: phone / pin edits keep approval (R6).
select test_helpers.act_as_owner('j18-o1@local.test');
select lives_ok($$
  update public.shops set phone_number = '+63 900 000 0301', latitude = 14.6, longitude = 121.0
  where id = current_setting('fx.s1')::uuid
$$, 'j18_owner_can_edit_approved_shop_phone_without_rereview');
select is((select row(verification_status, phone_number)::text from public.shops where id = current_setting('fx.s1')::uuid),
          row('approved'::text, '+63 900 000 0301'::text)::text,
          'j18_owner_can_edit_approved_shop_phone_without_rereview');

-- SupabaseShopRepository.createShop payload.
select lives_ok($$
  insert into public.shops (owner_id, name, address, phone_number, latitude, longitude)
  values (auth.uid(), 'J18 new shop', 'J18 new address', '+63 900 000 0302', 14.5, 121.0)
$$, 'j18_owner_can_register_shop_with_frontend_payload');
select is((select verification_status from public.shops where name = 'J18 new shop' and owner_id = auth.uid()),
          'pending', 'j18_owner_can_register_shop_with_frontend_payload');

-- SupabaseShopVerificationRepository upload: upsert on (shop_id, document_type), twice.
select lives_ok($$
  insert into public.shop_verification_documents (shop_id, document_type, storage_path, file_name,
                                                  file_size_bytes, content_type, uploaded_by, uploaded_at)
  values (current_setting('fx.s_cr')::uuid, 'business_permit', current_setting('fx.s_cr') || '/business_permit-a.pdf',
          'permit.pdf', 1024, 'application/pdf', auth.uid(), now())
  on conflict (shop_id, document_type) do update
  set storage_path = excluded.storage_path, file_name = excluded.file_name, uploaded_by = excluded.uploaded_by
$$, 'j18_owner_can_upsert_verification_document_with_frontend_payload');
select lives_ok($$
  insert into public.shop_verification_documents (shop_id, document_type, storage_path, file_name,
                                                  file_size_bytes, content_type, uploaded_by, uploaded_at)
  values (current_setting('fx.s_cr')::uuid, 'business_permit', current_setting('fx.s_cr') || '/business_permit-b.pdf',
          'permit-v2.pdf', 2048, 'application/pdf', auth.uid(), now())
  on conflict (shop_id, document_type) do update
  set storage_path = excluded.storage_path, file_name = excluded.file_name, uploaded_by = excluded.uploaded_by
$$, 'j18_owner_can_upsert_verification_document_with_frontend_payload');
select is((select row(file_name, uploaded_by)::text from public.shop_verification_documents
           where shop_id = current_setting('fx.s_cr')::uuid and document_type = 'business_permit'),
          row('permit-v2.pdf'::text, current_setting('fx.o1')::uuid)::text,
          'j18_owner_can_upsert_verification_document_with_frontend_payload');

-- SupabaseWorkerRepository.createWorkerForOwner payload, then owner edits and deletes it.
select lives_ok($$
  insert into public.workers (owner_id, name, phone_number, is_available)
  values (auth.uid(), 'J18 roster worker', '+63 900 000 0303', true)
$$, 'j18_owner_can_add_unlinked_roster_worker');
select is((select count(*)::int from public.workers
           where owner_id = auth.uid() and name = 'J18 roster worker' and user_id is null),
          1, 'j18_owner_can_add_unlinked_roster_worker');
select lives_ok($$ update public.workers set is_available = false where name = 'J18 roster worker' $$,
                'j18_owner_can_add_unlinked_roster_worker');
select lives_ok($$ delete from public.workers where name = 'J18 roster worker' $$,
                'j18_owner_can_add_unlinked_roster_worker');

select * from finish();
rollback;
