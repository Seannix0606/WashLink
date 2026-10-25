-- J18 (W4): existing shop, review, roster-link and booking flows still work with job openings
-- and the shared verified-shop rule (R-2). Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18w4-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j18w4-o1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('j18w4-w1@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j18w4-c1@local.test')::text, true);
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select test_helpers.set_shop_price(current_setting('fx.s1')::uuid, 'Sedan', 'Basic Wash', 250.00);
select set_config('fx.j1', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J18 W4 opening')::text, true);
select set_config('fx.j2', test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'J18 W4 delete with shop')::text, true);
update public.job_openings set status = 'published', first_published_at = now(), status_changed_at = now()
where id in (current_setting('fx.j1')::uuid, current_setting('fx.j2')::uuid);

-- ---------- owner shop edit and delete ----------
select test_helpers.act_as_owner('j18w4-o1@local.test');
select lives_ok($$ update public.shops set phone_number = '09000000000' where id = current_setting('fx.s1')::uuid $$,
                'j18_owner_can_still_edit_and_delete_shop_with_openings');
select is((select verification_status from public.shops where id = current_setting('fx.s1')::uuid), 'approved',
          'j18_owner_can_still_edit_and_delete_shop_with_openings');
select lives_ok($$ delete from public.shops where id = current_setting('fx.s2')::uuid $$,
                'j18_owner_can_still_edit_and_delete_shop_with_openings');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j2')::uuid), 0,
          'j18_owner_can_still_edit_and_delete_shop_with_openings');
select is((select status from public.job_openings where id = current_setting('fx.j1')::uuid), 'published',
          'j18_owner_can_still_edit_and_delete_shop_with_openings');

-- ---------- super_admin review with the shared rule ----------
select lives_ok($$ insert into public.shops (owner_id, name, address) values (auth.uid(), 'J18 W4 review shop', 'J18 address') $$,
                'j18_super_admin_review_still_works_with_shared_rule');
select set_config('fx.s3', (select id::text from public.shops where name = 'J18 W4 review shop'), true);
select is(public.is_verified_shop_owner(current_setting('fx.s3')::uuid), false, 'j18_super_admin_review_still_works_with_shared_rule');
select test_helpers.act_as_admin('j18w4-a1@local.test');
select lives_ok($$ update public.shops set verification_status = 'approved' where id = current_setting('fx.s3')::uuid $$,
                'j18_super_admin_review_still_works_with_shared_rule');
select is((select row(verification_status, verification_reviewed_by = auth.uid(), verification_reviewed_at is not null,
                      public.shop_has_recorded_verification(id))::text
           from public.shops where id = current_setting('fx.s3')::uuid),
          row('approved'::text, true, true, true)::text, 'j18_super_admin_review_still_works_with_shared_rule');
select test_helpers.act_as_owner('j18w4-o1@local.test');
select is(public.is_verified_shop_owner(current_setting('fx.s3')::uuid), true, 'j18_super_admin_review_still_works_with_shared_rule');

-- ---------- roster link preview ----------
select test_helpers.act_as_service();
select set_config('fx.wr', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.s1_name', (select name from public.shops where id = current_setting('fx.s1')::uuid), true);
select test_helpers.act_as_owner('j18w4-o1@local.test');
select set_config('fx.code', (select link_code from public.create_roster_link_code(current_setting('fx.wr')::uuid)), true);
select test_helpers.act_as_worker('j18w4-w1@local.test');
select is((select row(result, current_setting('fx.s1_name') = any (owner_shop_names))::text
           from public.preview_roster_link_code(current_setting('fx.code'))),
          row('valid'::text, true)::text, 'j18_roster_link_preview_still_lists_verified_shop');

-- ---------- bookings ----------
select test_helpers.act_as_customer('j18w4-c1@local.test');
select lives_ok($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id, quoted_price)
  values ('J18 W4 Customer', auth.uid(), 'Sedan', 'Basic Wash', 'J18 address', now() + interval '1 day',
          current_setting('fx.s1')::uuid, 1.00)
$$, 'j18_booking_quote_and_creation_unaffected_by_w4');
select is((select quoted_price from public.bookings where customer_name = 'J18 W4 Customer'), 250.00::numeric,
          'j18_booking_quote_and_creation_unaffected_by_w4');
select is((select count(*)::int from public.job_openings), 0, 'j18_booking_quote_and_creation_unaffected_by_w4');

select * from finish();
rollback;
