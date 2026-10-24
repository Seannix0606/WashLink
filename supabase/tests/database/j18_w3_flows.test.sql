-- J18 (W3): the W2 review, roster link and delete flows keep working with the W3 AFTER
-- triggers (audit + notifications) attached, and deletes leave sensible audit rows.
-- (j18_existing_flows.test.sql is at the 350-line limit, so these live here; W3 PLAN section 4.)
-- Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j18w3-c1@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j18w3-bystander@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j18w3-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j18w3-o2@local.test')::text, true);
select set_config('fx.uw', test_helpers.create_worker('j18w3-w1@local.test')::text, true);
select set_config('fx.uw2', test_helpers.create_worker('j18w3-w2@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j18w3-admin@local.test')::text, true);
select set_config('fx.s1', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_o2', test_helpers.create_shop(current_setting('fx.o2')::uuid)::text, true);
select set_config('fx.r_o2', test_helpers.create_roster_worker(current_setting('fx.o2')::uuid, current_setting('fx.uw2')::uuid)::text, true);

create function pg_temp.actions(p_subject uuid) returns text[] language sql as $$
  select coalesce(array_agg(action order by id), '{}') from public.workforce_audit_events where subject_id = p_subject
$$;
-- Untrusted session that can still delete auth users (as in j17_w2_fix1_fk_cascades).
create function pg_temp.act_as_untrusted_bystander() returns void language sql as $$
  select test_helpers.act_as_service();
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
$$;

-- ---------- super admin review: reviewer stamped server-side, audited, owner notified ----------
select test_helpers.act_as_admin('j18w3-admin@local.test');
update public.shops
set verification_status = 'approved', verification_reviewed_by = current_setting('fx.o1')::uuid
where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_service();
select is((select jsonb_build_object('status', verification_status, 'reviewed_by', verification_reviewed_by)
           from public.shops where id = current_setting('fx.s1')::uuid),
          jsonb_build_object('status', 'approved', 'reviewed_by', current_setting('fx.admin')::uuid),
          'j18_super_admin_review_still_stamps_reviewer_with_audit');
select test_helpers.act_as_owner('j18w3-o1@local.test');
select is(public.is_verified_shop_owner(current_setting('fx.s1')::uuid), true,
          'j18_super_admin_review_still_stamps_reviewer_with_audit');
select is((select count(*)::int from public.notifications where category = 'shop_verification.status_changed'), 1,
          'j18_super_admin_review_still_stamps_reviewer_with_audit');
select test_helpers.act_as_service();
select is((select array_agg(actor_id) from public.workforce_audit_events
           where action = 'shop.verification_decided' and subject_id = current_setting('fx.s1')::uuid),
          array[current_setting('fx.admin')::uuid], 'j18_super_admin_review_still_stamps_reviewer_with_audit');

-- ---------- worker link and unlink through the W2 RPCs ----------
select test_helpers.act_as_owner('j18w3-o1@local.test');
insert into public.workers (owner_id, name) values (auth.uid(), 'J18W3 Roster');
select set_config('fx.r1', (select id::text from public.workers where name = 'J18W3 Roster'), true);
select set_config('fx.code', (select link_code from public.create_roster_link_code(current_setting('fx.r1')::uuid)), true);
select test_helpers.act_as_worker('j18w3-w1@local.test');
select is((select result from public.preview_roster_link_code(current_setting('fx.code'))), 'valid',
          'j18_worker_link_and_unlink_still_work_with_audit');
select is((select result from public.accept_roster_link_code(current_setting('fx.code'))), 'linked',
          'j18_worker_link_and_unlink_still_work_with_audit');
select is((select count(*)::int from public.list_my_roster_links()), 1, 'j18_worker_link_and_unlink_still_work_with_audit');
select lives_ok($$ select public.unlink_my_roster_entry(current_setting('fx.r1')::uuid) $$,
                'j18_worker_link_and_unlink_still_work_with_audit');
select is((select count(*)::int from public.list_my_roster_links()), 0, 'j18_worker_link_and_unlink_still_work_with_audit');
select test_helpers.act_as_service();
select is(pg_temp.actions(current_setting('fx.r1')::uuid),
          array['roster.link_code_issued', 'roster.linked', 'roster.unlinked'],
          'j18_worker_link_and_unlink_still_work_with_audit');

-- ---------- owner deletes an audited shop that has bookings ----------
select set_config('fx.b1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)::text, true);
select test_helpers.act_as_owner('j18w3-o1@local.test');
select lives_ok($$ delete from public.shops where id = current_setting('fx.s1')::uuid $$,
                'j18_owner_shop_delete_still_succeeds_with_audit');
select test_helpers.act_as_service();
select is((select shop_id from public.bookings where id = current_setting('fx.b1')::uuid), null::uuid,
          'j18_owner_shop_delete_still_succeeds_with_audit');
select is(pg_temp.actions(current_setting('fx.s1')::uuid), array['shop.verification_decided'],
          'j18_owner_shop_delete_still_succeeds_with_audit');

-- ---------- owner account deleted: shop and linked roster row cascade, worker notified ----------
select pg_temp.act_as_untrusted_bystander();
select lives_ok($$ delete from auth.users where id = current_setting('fx.o2')::uuid $$,
                'j18_owner_account_delete_still_succeeds_with_audit');
select test_helpers.act_as_service();
select is((select jsonb_build_object('subject_profile', subject_profile_id, 'by', payload ->> 'unlinked_by', 'owner', payload ->> 'owner_id')
           from public.workforce_audit_events where action = 'roster.unlinked' and subject_id = current_setting('fx.r_o2')::uuid),
          jsonb_build_object('subject_profile', current_setting('fx.uw2')::uuid, 'by', 'owner_account_deleted', 'owner', current_setting('fx.o2')),
          'j18_owner_account_delete_still_succeeds_with_audit');
select is((select count(*)::int from public.notifications
           where recipient_id = current_setting('fx.uw2')::uuid and category = 'roster.unlinked'),
          1, 'j18_owner_account_delete_still_succeeds_with_audit');
select is((select array_agg(body) from public.notifications
           where recipient_id = current_setting('fx.uw2')::uuid and category = 'roster.unlinked'),
          array['A roster link ended because the shop''s account was closed.'],
          'j18_owner_account_delete_notifies_worker_neutral_text');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('fx.o2')::uuid), 0,
          'j18_owner_account_delete_still_succeeds_with_audit');

-- ---------- linked worker account deleted: roster row kept, no notification ----------
select set_config('fx.r2', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)::text, true);
select set_config('fx.o1_unlinked', (select count(*)::text from public.notifications
                                     where recipient_id = current_setting('fx.o1')::uuid and category = 'roster.unlinked'), true);
select pg_temp.act_as_untrusted_bystander();
select lives_ok($$ delete from auth.users where id = current_setting('fx.uw')::uuid $$,
                'j18_worker_account_delete_still_succeeds_with_audit');
select test_helpers.act_as_service();
select is((select user_id from public.workers where id = current_setting('fx.r2')::uuid), null::uuid,
          'j18_worker_account_delete_still_succeeds_with_audit');
select is((select payload ->> 'unlinked_by' from public.workforce_audit_events
           where action = 'roster.unlinked' and subject_id = current_setting('fx.r2')::uuid),
          'account_deleted', 'j18_worker_account_delete_still_succeeds_with_audit');
select is((select count(*)::text from public.notifications
           where recipient_id = current_setting('fx.o1')::uuid and category = 'roster.unlinked'),
          current_setting('fx.o1_unlinked'), 'j18_worker_account_delete_still_succeeds_with_audit');

select * from finish();
rollback;
