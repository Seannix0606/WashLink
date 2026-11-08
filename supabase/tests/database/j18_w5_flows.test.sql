-- J18 (W5): the W4 opening lifecycle, published edits, worker profile self-service, roster
-- links and bookings keep working once applications exist. Local Docker stack only; fixtures
-- are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18w5-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j18w5-o1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('j18w5-w1@local.test')::text, true);
select set_config('fx.w2', test_helpers.create_worker('j18w5-w2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j18w5-c1@local.test')::text, true);
select test_helpers.create_worker_profile(current_setting('fx.w1')::uuid) is not null as w1_profile;
select test_helpers.create_worker_profile(current_setting('fx.w2')::uuid) is not null as w2_profile;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select test_helpers.set_shop_price(current_setting('fx.s1')::uuid, 'Sedan', 'Basic Wash', 250.00);
select set_config('fx.j1', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J18 W5 opening')::text, true);
select set_config('fx.j2', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J18 W5 edit'))::text, true);

-- ---------- W4 lifecycle with applicants ----------
select test_helpers.act_as_owner('j18w5-o1@local.test');
select is((select status from public.transition_job_opening(current_setting('fx.j1')::uuid, 'draft', 'published')), 'published',
          'j18_w4_opening_lifecycle_unchanged_with_applications');
select test_helpers.act_as_worker('j18w5-w1@local.test');
select set_config('fx.app1', (select id from public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1'))::text, true);
select test_helpers.act_as_owner('j18w5-o1@local.test');
select is((select count(public.transition_job_opening(current_setting('fx.j1')::uuid, f, t))::int
           from (values (1, 'published', 'paused'), (2, 'paused', 'published'), (3, 'published', 'closed'), (4, 'closed', 'archived')) v(n, f, t)),
          4, 'j18_w4_opening_lifecycle_unchanged_with_applications');
select is((select status from public.job_openings where id = current_setting('fx.j1')::uuid), 'archived',
          'j18_w4_opening_lifecycle_unchanged_with_applications');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j1')::uuid, 'archived', 'published') $$,
                 '42501', 'This job opening status change is not allowed.', 'j18_w4_opening_lifecycle_unchanged_with_applications');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events
           where action = 'job_opening.status_changed' and subject_id = current_setting('fx.j1')::uuid), 5,
          'j18_w4_opening_lifecycle_unchanged_with_applications');
select is((select status from public.job_applications where id = current_setting('fx.app1')::uuid), 'closed',
          'j18_w4_opening_lifecycle_unchanged_with_applications');

-- ---------- published edits with applicants ----------
select test_helpers.act_as_worker('j18w5-w2@local.test');
select set_config('fx.app2', (select id from public.create_job_application(current_setting('fx.j2')::uuid, 'J18 note', true, 'w5_v1'))::text, true);
select test_helpers.act_as_owner('j18w5-o1@local.test');
select lives_ok($$ update public.job_openings set benefits = 'J18 free meals' where id = current_setting('fx.j2')::uuid $$,
                'j18_owner_can_edit_published_opening_with_applicants');
select is((select benefits from public.job_openings where id = current_setting('fx.j2')::uuid), 'J18 free meals',
          'j18_owner_can_edit_published_opening_with_applicants');
select throws_ok($$ update public.job_openings set status = 'closed' where id = current_setting('fx.j2')::uuid $$,
                 '42501', 'This job opening status change is not allowed.', 'j18_owner_can_edit_published_opening_with_applicants');
select test_helpers.act_as_worker('j18w5-w2@local.test');
select is((select opening_snapshot ->> 'benefits' from public.job_applications where id = current_setting('fx.app2')::uuid), null,
          'j18_owner_can_edit_published_opening_with_applicants');

-- ---------- worker profile self-service ----------
select lives_ok($$ update public.worker_profiles set headline = 'J18 updated headline' where profile_id = auth.uid() $$,
                'j18_worker_profile_self_access_unchanged');
select is((select headline from public.worker_profiles where profile_id = auth.uid()), 'J18 updated headline',
          'j18_worker_profile_self_access_unchanged');
select lives_ok($$ insert into public.worker_private_contacts (profile_id, contact_phone, preferred_contact_method)
                   values (auth.uid(), '+63 917 000 0002', 'phone') $$, 'j18_worker_profile_self_access_unchanged');
select is((select count(*)::int from public.worker_private_contacts), 1, 'j18_worker_profile_self_access_unchanged');
select is((select status from public.job_applications where id = current_setting('fx.app2')::uuid), 'submitted',
          'j18_worker_profile_self_access_unchanged');

-- ---------- roster link and bookings ----------
select test_helpers.act_as_service();
select set_config('fx.wr', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select test_helpers.act_as_owner('j18w5-o1@local.test');
select set_config('fx.code', (select link_code from public.create_roster_link_code(current_setting('fx.wr')::uuid)), true);
select test_helpers.act_as_worker('j18w5-w2@local.test');
select is((select result from public.preview_roster_link_code(current_setting('fx.code'))), 'valid',
          'j18_roster_link_and_booking_flows_unaffected_by_w5');
select is((select result from public.accept_roster_link_code(current_setting('fx.code'))), 'linked',
          'j18_roster_link_and_booking_flows_unaffected_by_w5');
select test_helpers.act_as_customer('j18w5-c1@local.test');
select lives_ok($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id, quoted_price)
  values ('J18 W5 Customer', auth.uid(), 'Sedan', 'Basic Wash', 'J18 address', now() + interval '1 day',
          current_setting('fx.s1')::uuid, 1.00)
$$, 'j18_roster_link_and_booking_flows_unaffected_by_w5');
select is((select quoted_price from public.bookings where customer_name = 'J18 W5 Customer'), 250.00::numeric,
          'j18_roster_link_and_booking_flows_unaffected_by_w5');
select is((select count(*)::int from public.job_applications), 0, 'j18_roster_link_and_booking_flows_unaffected_by_w5');

select * from finish();
rollback;
