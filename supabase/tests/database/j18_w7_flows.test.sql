-- J18 (W7): existing flows keep working with certification rows present, and D-18 / D-23 hold: shop and owner
-- account deletion (untrusted, like GoTrue) succeed and RETAIN the worker's certificates with their snapshots;
-- worker account deletion removes them and keeps the audit trail; training, trainees_welcome applications,
-- bookings (quote, rating) and shop verification decisions are unchanged. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j18c-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j18c-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j18c-c1@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j18c-by@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j18c-w' || n || '@local.test'))) from generate_series(1, 5) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j18c-w' || n || '@local.test' $$;
create temporary table j18c_ids (label text primary key, id uuid) on commit drop;
grant all on j18c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18c_ids where label = p_label $$;
insert into j18c_ids values ('s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)),
  ('s3', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)),
  ('s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)),
  ('s_pending', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending'));
select test_helpers.act_as_owner('j18c-o1@local.test');
select (public.set_shop_certification_validity(pg_temp.id('s1'), 6)).validity_months as validity;
select test_helpers.act_as_service();
insert into j18c_ids values ('c1', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.w(1), 'j18c-o1@local.test')),
  ('c3', test_helpers.issue_test_certification(pg_temp.id('s3'), pg_temp.w(3), 'j18c-o1@local.test')),
  ('c2', test_helpers.issue_test_certification(pg_temp.id('s2'), pg_temp.w(2), 'j18c-o2@local.test'));
create temporary table j18c_before on commit drop as
  select c.id, to_jsonb(c) - array['shop_id', 'owner_id', 'approved_by', 'status_changed_by', 'updated_at'] as row_json from public.certifications c;
create function pg_temp.untrusted() returns void language sql as $$
  select test_helpers.act_as_service();
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.unchanged(p_label text) returns boolean language sql stable security definer
as $$ select (select to_jsonb(c) - array['shop_id', 'owner_id', 'approved_by', 'status_changed_by', 'updated_at'] from public.certifications c
              where c.id = pg_temp.id(p_label)) = (select row_json from j18c_before where id = pg_temp.id(p_label)) $$;

-- ---------- shop deletion (owner, untrusted) ----------
select test_helpers.act_as_owner('j18c-o1@local.test');
select lives_ok(format('delete from public.shops where id = %L', pg_temp.id('s1')), 'j18_w7_certifications_survive_shop_deletion');
select test_helpers.act_as_service();
select is((select row(shop_id, owner_id = current_setting('fx.o1')::uuid, status)::text from public.certifications where id = pg_temp.id('c1')),
          row(null, true, 'active')::text, 'j18_w7_certifications_survive_shop_deletion');
select ok(pg_temp.unchanged('c1'), 'j18_w7_certifications_survive_shop_deletion');
select is((select count(*)::int from public.shop_certification_policies where shop_id = pg_temp.id('s1')), 0, 'j18_w7_certifications_survive_shop_deletion');
select is((select count(*)::int from public.workforce_audit_events where action = 'certification.shop_removed' and subject_id = pg_temp.id('c1')), 1,
          'j18_w7_certifications_survive_shop_deletion');
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.w(1) and category <> 'certification.issued'
           and category like 'certification%'), 0, 'j18_w7_certifications_survive_shop_deletion');
select test_helpers.act_as(pg_temp.w(1));
select is((select row(status, effective_status, issuing_shop_present, issuing_shop_currently_verified, shop_name is not null)::text
           from public.my_certifications()), row('active', 'active', false, null, true)::text, 'j18_w7_certifications_survive_shop_deletion');
select test_helpers.act_as_owner('j18c-o1@local.test');
select is((select count(*)::int from public.certifications where id = pg_temp.id('c1')), 0, 'j18_w7_certifications_survive_shop_deletion');

-- ---------- owner account deletion (untrusted, like GoTrue) ----------
select pg_temp.untrusted();
select lives_ok(format('delete from auth.users where id = %L', current_setting('fx.o2')), 'j18_w7_certifications_survive_owner_account_deletion');
select test_helpers.act_as_service();
select is((select row(shop_id, owner_id, approved_by, status)::text from public.certifications where id = pg_temp.id('c2')),
          row(null, null, null, 'active')::text, 'j18_w7_certifications_survive_owner_account_deletion');
select ok(pg_temp.unchanged('c2'), 'j18_w7_certifications_survive_owner_account_deletion');
select ok(public.worker_holds_current_certification(pg_temp.w(2)), 'j18_w7_certifications_survive_owner_account_deletion');
select test_helpers.act_as(pg_temp.w(2));
select is((select count(*)::int from public.certification_history(pg_temp.id('c2'))), 1, 'j18_w7_certifications_survive_owner_account_deletion');

-- ---------- worker account deletion ----------
select pg_temp.untrusted();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.w(3)), 'j18_w7_worker_deletion_cascades_certifications_and_keeps_audit');
select test_helpers.act_as_service();
select is((select count(*)::int from public.certifications where id = pg_temp.id('c3'))
          + (select count(*)::int from public.certification_status_events where certification_id = pg_temp.id('c3')), 0,
          'j18_w7_worker_deletion_cascades_certifications_and_keeps_audit');
select is((select array_agg(action || ':' || coalesce(payload ->> 'deleted_by', '') order by id) from public.workforce_audit_events
           where subject_id = pg_temp.id('c3')), array['certification.issued:', 'certification.deleted:worker_profile_deleted'],
          'j18_w7_worker_deletion_cascades_certifications_and_keeps_audit');

-- ---------- training, applications, bookings, verification ----------
insert into j18c_ids values ('e4', test_helpers.complete_training(pg_temp.id('s3'), pg_temp.w(4), 'j18c-o1@local.test'));
select is((select progress_status from public.training_enrollment_progress where enrollment_id = pg_temp.id('e4')), 'completed',
          'j18_w7_training_flow_unchanged');
select is((select count(*)::int from public.certifications where enrollment_id = pg_temp.id('e4')), 0, 'j18_w7_training_flow_unchanged');
select test_helpers.act_as_owner('j18c-o1@local.test');
insert into j18c_ids select 'c4', id from public.issue_certification(pg_temp.id('e4'),
  (select a.id from public.training_assessments a where a.enrollment_id = pg_temp.id('e4')), 'w7_issuer_v1');
select test_helpers.act_as_service();
insert into j18c_ids values ('job', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s3'), 'J18C trainees welcome')));
select test_helpers.act_as(pg_temp.w(5));
select is((public.create_job_application(pg_temp.id('job'), null, true, 'w5_v1')).status, 'submitted', 'j18_w7_trainees_welcome_apply_unchanged');
select test_helpers.act_as_service();
select test_helpers.set_shop_price(pg_temp.id('s3'), 'Sedan', 'Basic Wash', 250.00);
select test_helpers.act_as_customer('j18c-c1@local.test');
select lives_ok(format($$ insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
                         values ('J18 W7', %L, 'Sedan', 'Basic Wash', 'Test address', now() + interval '2 days', %L) $$,
                       current_setting('fx.c1'), pg_temp.id('s3')), 'j18_w7_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
select is((select quoted_price from public.bookings where customer_name = 'J18 W7'), 250.00::numeric, 'j18_w7_booking_quote_rating_and_verification_unchanged');
update public.bookings set booking_status = 'completed' where customer_name = 'J18 W7';
select test_helpers.act_as_customer('j18c-c1@local.test');
select lives_ok($$ update public.bookings set customer_rating_stars = 5 where customer_name = 'J18 W7' $$,
                'j18_w7_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_admin('j18c-a1@local.test');
select lives_ok(format('update public.shops set verification_status = %L where id = %L', 'approved', pg_temp.id('s_pending')),
                'j18_w7_shop_verification_decision_still_works');
select lives_ok(format('update public.shops set verification_status = %L, verification_notes = %L where id = %L', 'changes_requested',
                       'Local test: new photo needed', pg_temp.id('s3')), 'j18_w7_shop_verification_decision_still_works');
select test_helpers.act_as_service();
select is((select row(s.verification_status, (select status from public.certifications c where c.id = pg_temp.id('c4')))::text
           from public.shops s where s.id = pg_temp.id('s3')), row('changes_requested', 'active')::text, 'j18_w7_shop_verification_decision_still_works');
select is((select row(verification_reviewed_by = current_setting('fx.a1')::uuid, public.shop_has_recorded_verification(id),
                      exists (select 1 from public.workforce_audit_events e where e.action = 'shop.verification_decided' and e.subject_id = s.id))::text
           from public.shops s where s.id = pg_temp.id('s_pending')), row(true, true, true)::text, 'j18_w7_shop_verification_decision_still_works');

select * from finish();
rollback;
