-- J17 (W3): notifications are a per-recipient inbox written only by the server (AC9), with
-- idempotent producers (AC10) and contact-free text (AC8). Local Docker stack only; synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.oa', test_helpers.create_owner('j17n-oa@local.test')::text, true);
select set_config('fx.ob', test_helpers.create_owner('j17n-ob@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j17n-c1@local.test')::text, true);
select set_config('fx.uw', test_helpers.create_worker('j17n-w1@local.test')::text, true);
select set_config('fx.uw2', test_helpers.create_worker('j17n-w2@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17n-admin@local.test')::text, true);
select set_config('fx.na1', public.enqueue_notification(current_setting('fx.oa')::uuid, 'test.notice', 'Hello', 'First body', 'test:a1')::text, true);
select set_config('fx.na2', public.enqueue_notification(current_setting('fx.oa')::uuid, 'test.notice', 'Hello', 'Second body', 'test:a2')::text, true);
select set_config('fx.na3', public.enqueue_notification(current_setting('fx.oa')::uuid, 'test.notice', 'Hello', 'Third body', 'test:a3')::text, true);
select set_config('fx.nb1', public.enqueue_notification(current_setting('fx.ob')::uuid, 'test.notice', 'Hello', 'B body', 'test:b1')::text, true);
select set_config('fx.insert_sql', format(
  $q$insert into public.notifications (recipient_id, category, title, body, idempotency_key) values (%L, 'test.forged', 'T', 'B', 'test:forged')$q$,
  current_setting('fx.oa')), true);
select set_config('fx.enqueue_sql', format(
  $q$select public.enqueue_notification(%L, 'test.forged', 'T', 'B', 'test:forged')$q$, current_setting('fx.oa')), true);

-- Synthetic private values that must never reach a notification.
update public.profiles set phone_number = '0917 555 0202' where id = current_setting('fx.oa')::uuid;
insert into public.worker_profiles (profile_id, availability_status) values (current_setting('fx.uw')::uuid, 'flexible');
insert into public.worker_private_contacts (profile_id, contact_phone, contact_email, preferred_contact_method)
values (current_setting('fx.uw')::uuid, '+63 917 555 0101', 'j17n-private-contact@local.test', 'email');

-- ---------- recipient isolation ----------
select test_helpers.act_as_owner('j17n-oa@local.test');
select is((select count(*)::int from public.notifications), 3, 'j17_notifications_recipient_isolation');
select test_helpers.act_as_owner('j17n-ob@local.test');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('fx.oa')::uuid), 0,
          'j17_notifications_recipient_isolation');
select test_helpers.act_as_customer('j17n-c1@local.test');
select is((select count(*)::int from public.notifications), 0, 'j17_notifications_recipient_isolation');
select test_helpers.act_as_worker('j17n-w1@local.test');
select is((select count(*)::int from public.notifications), 0, 'j17_notifications_recipient_isolation');
select test_helpers.act_as_admin('j17n-admin@local.test');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('fx.oa')::uuid), 0,
          'j17_notifications_recipient_isolation');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.notifications'), '42501', 'j17_notifications_recipient_isolation');

-- ---------- direct INSERT rejected ----------
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_notifications_direct_insert_rejected');
select test_helpers.act_as_customer('j17n-c1@local.test');
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_notifications_direct_insert_rejected');
select test_helpers.act_as_owner('j17n-oa@local.test');
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_notifications_direct_insert_rejected');
select test_helpers.act_as_admin('j17n-admin@local.test');
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_notifications_direct_insert_rejected');
select test_helpers.act_as_service();
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_notifications_direct_insert_rejected');

-- ---------- enqueue is server-side only ----------
select test_helpers.act_as_anon();
select is(test_helpers.attempt(current_setting('fx.enqueue_sql')), '42501', 'j17_notifications_enqueue_not_callable_by_clients');
select test_helpers.act_as_owner('j17n-oa@local.test');
select is(test_helpers.attempt(current_setting('fx.enqueue_sql')), '42501', 'j17_notifications_enqueue_not_callable_by_clients');
select test_helpers.act_as_admin('j17n-admin@local.test');
select is(test_helpers.attempt(current_setting('fx.enqueue_sql')), '42501', 'j17_notifications_enqueue_not_callable_by_clients');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('role', 'service_role', true);
select throws_ok(current_setting('fx.enqueue_sql'), '42501', null, 'j17_notifications_enqueue_not_callable_by_clients');
select set_config('role', 'none', true);

-- ---------- no edits by anyone ----------
select test_helpers.act_as_owner('j17n-oa@local.test');
select is(test_helpers.attempt(format($q$update public.notifications set title = 'Edited' where id = %L$q$, current_setting('fx.na1'))),
          '42501', 'j17_notifications_cannot_be_edited');
select is(test_helpers.attempt(format('update public.notifications set read_at = now() where id = %L', current_setting('fx.na1'))),
          '42501', 'j17_notifications_cannot_be_edited');
select is(test_helpers.attempt(format('delete from public.notifications where id = %L', current_setting('fx.na1'))),
          '42501', 'j17_notifications_cannot_be_edited');
select test_helpers.act_as_owner('j17n-ob@local.test');
select is(test_helpers.attempt(format($q$update public.notifications set body = 'Edited' where id = %L$q$, current_setting('fx.na1'))),
          '42501', 'j17_notifications_cannot_be_edited');
select test_helpers.act_as_admin('j17n-admin@local.test');
select is(test_helpers.attempt(format($q$update public.notifications set title = 'Edited' where id = %L$q$, current_setting('fx.na1'))),
          '42501', 'j17_notifications_cannot_be_edited');
select test_helpers.act_as_service();
select is(test_helpers.attempt(format($q$update public.notifications set title = 'Edited' where id = %L$q$, current_setting('fx.na1'))),
          '42501', 'j17_notifications_cannot_be_edited');
select is((select jsonb_build_object('title', title, 'read_at', read_at) from public.notifications where id = current_setting('fx.na1')::uuid),
          jsonb_build_object('title', 'Hello', 'read_at', null), 'j17_notifications_cannot_be_edited');

-- ---------- mark read: own rows only ----------
select test_helpers.act_as_owner('j17n-ob@local.test');
select is(public.mark_notifications_read(array[current_setting('fx.na1')::uuid]), 0, 'j17_mark_read_only_affects_own_notifications');
select is(public.mark_notifications_read(), 1, 'j17_mark_read_only_affects_own_notifications');
select test_helpers.act_as_service();
select is((select read_at from public.notifications where id = current_setting('fx.na1')::uuid), null::timestamptz,
          'j17_mark_read_only_affects_own_notifications');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('fx.oa')::uuid and read_at is null),
          3, 'j17_mark_read_only_affects_own_notifications');

-- ---------- mark selected, then all; idempotent ----------
select test_helpers.act_as_owner('j17n-oa@local.test');
select is(public.mark_notifications_read(array[current_setting('fx.na1')::uuid]), 1, 'w3_mark_notifications_read_marks_selected_and_all');
select is((select count(*)::int from public.notifications where read_at is null), 2, 'w3_mark_notifications_read_marks_selected_and_all');
select set_config('fx.na1_read_at', (select read_at::text from public.notifications where id = current_setting('fx.na1')::uuid), true);
select is(public.mark_notifications_read(null), 2, 'w3_mark_notifications_read_marks_selected_and_all');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'w3_mark_notifications_read_marks_selected_and_all');
select is(public.mark_notifications_read(array[current_setting('fx.na1')::uuid]), 0, 'w3_mark_read_is_idempotent');
select is(public.mark_notifications_read(), 0, 'w3_mark_read_is_idempotent');
select is((select read_at::text from public.notifications where id = current_setting('fx.na1')::uuid),
          current_setting('fx.na1_read_at'), 'w3_mark_read_is_idempotent');

-- ---------- mark read: anon, no subject, oversized lists ----------
select is(test_helpers.attempt(format('select public.mark_notifications_read(%L::uuid[])',
            (select array_agg(gen_random_uuid())::text from generate_series(1, 201)))),
          '22023', 'w3_mark_read_rejects_anon_and_oversized_lists');
select is(public.mark_notifications_read((select array_agg(gen_random_uuid()) from generate_series(1, 200))), 0,
          'w3_mark_read_rejects_anon_and_oversized_lists');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select public.mark_notifications_read()'), '42501', 'w3_mark_read_rejects_anon_and_oversized_lists');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok('select public.mark_notifications_read()', '42501', 'Sign in to manage notifications.',
                 'w3_mark_read_rejects_anon_and_oversized_lists');
select set_config('role', 'none', true);

-- ---------- idempotency ----------
select test_helpers.act_as_service();
select set_config('fx.dup1', public.enqueue_notification(current_setting('fx.oa')::uuid, 'test.dup', 'First', 'B', 'test:dup')::text, true);
select is(public.enqueue_notification(current_setting('fx.oa')::uuid, 'test.dup', 'Second', 'B', 'test:dup')::text,
          current_setting('fx.dup1'), 'w3_notification_idempotency_no_duplicate');
select is((select title from public.notifications where id = current_setting('fx.dup1')::uuid), 'First',
          'w3_notification_idempotency_no_duplicate');
select isnt(public.enqueue_notification(current_setting('fx.ob')::uuid, 'test.dup', 'First', 'B', 'test:dup')::text,
            current_setting('fx.dup1'), 'w3_notification_idempotency_no_duplicate');
select is((select count(*)::int from public.notifications where idempotency_key = 'test:dup'), 2,
          'w3_notification_idempotency_no_duplicate');

-- ---------- producer: shop decision -> owner ----------
insert into public.shops (owner_id, name, address, verification_status)
values (current_setting('fx.oa')::uuid, 'W3N Sparkle Wash', 'Local test address', 'pending');
select set_config('fx.s1', (select id::text from public.shops where name = 'W3N Sparkle Wash'), true);
create function pg_temp.owner_shop_notices() returns int language sql as $$
  select count(*)::int from public.notifications
  where recipient_id = current_setting('fx.oa')::uuid and category = 'shop_verification.status_changed'
$$;
select test_helpers.act_as_admin('j17n-admin@local.test');
update public.shops set verification_status = 'approved' where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_owner('j17n-oa@local.test');
select is((select jsonb_build_object('title', title, 'body', body, 'subject_type', subject_type, 'subject_id', subject_id)
           from public.notifications where category = 'shop_verification.status_changed'),
          jsonb_build_object('title', 'Shop verification updated', 'body', 'W3N Sparkle Wash is now Approved.',
                             'subject_type', 'shop', 'subject_id', current_setting('fx.s1')::uuid),
          'w3_shop_decision_notifies_owner_once');
select test_helpers.act_as_service();
select is(pg_temp.owner_shop_notices(), 1, 'w3_shop_decision_notifies_owner_once');
select test_helpers.act_as_admin('j17n-admin@local.test');
update public.shops set verification_notes = 'Looks fine, call 0917 555 0404' where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.owner_shop_notices(), 1, 'w3_shop_decision_notifies_owner_once');
select test_helpers.act_as_admin('j17n-admin@local.test');
update public.shops set verification_status = 'rejected' where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.owner_shop_notices(), 2, 'w3_shop_decision_notifies_owner_once');

-- ---------- producer: roster link -> owner; owner unlink -> worker; worker unlink -> owner ----------
select test_helpers.act_as_owner('j17n-oa@local.test');
insert into public.workers (owner_id, name, phone_number) values (auth.uid(), 'W3N Roster Ana', '0917 555 0303');
select set_config('fx.r1', (select id::text from public.workers where name = 'W3N Roster Ana'), true);
select set_config('fx.code', (select link_code from public.create_roster_link_code(current_setting('fx.r1')::uuid)), true);
select test_helpers.act_as_worker('j17n-w1@local.test');
select result from public.accept_roster_link_code(current_setting('fx.code'));
select result from public.accept_roster_link_code(current_setting('fx.code'));
select test_helpers.act_as_owner('j17n-oa@local.test');
select is((select array_agg(body) from public.notifications where category = 'roster.linked'),
          array['W3N Roster Ana is now linked to a worker account.'], 'w3_roster_link_notifies_owner_once');
select is((select count(*)::int from public.notifications where category = 'roster.linked' and subject_id = current_setting('fx.r1')::uuid),
          1, 'w3_roster_link_notifies_owner_once');
update public.workers set user_id = null where id = current_setting('fx.r1')::uuid;
select test_helpers.act_as_worker('j17n-w1@local.test');
select is((select array_agg(body) from public.notifications where category = 'roster.unlinked'),
          array['A shop removed the link between your account and its roster.'], 'w3_owner_unlink_notifies_worker');
select test_helpers.act_as_owner('j17n-oa@local.test');
select set_config('fx.code2', (select link_code from public.create_roster_link_code(current_setting('fx.r1')::uuid)), true);
select test_helpers.act_as_worker('j17n-w1@local.test');
select result from public.accept_roster_link_code(current_setting('fx.code2'));
select public.unlink_my_roster_entry(current_setting('fx.r1')::uuid);
select test_helpers.act_as_owner('j17n-oa@local.test');
select is((select array_agg(body) from public.notifications where category = 'roster.unlinked'),
          array['W3N Roster Ana is no longer linked to a worker account.'], 'w3_owner_unlink_notifies_worker');

-- ---------- text rules ----------
select test_helpers.act_as_service();
select is(test_helpers.attempt(format($q$select public.enqueue_notification(%L, 'test.text', 'Mail me@example.invalid', 'B', 'test:t1')$q$, current_setting('fx.oa'))),
          '23514', 'w3_notification_text_rejects_contact_data');
select is(test_helpers.attempt(format($q$select public.enqueue_notification(%L, 'test.text', 'T', 'Call +63 912 345 6789', 'test:t2')$q$, current_setting('fx.oa'))),
          '23514', 'w3_notification_text_rejects_contact_data');
select is(test_helpers.attempt(format($q$select public.enqueue_notification(%L, 'test.text', 'T', 'Call (0912) 345-6789 now', 'test:t3')$q$, current_setting('fx.oa'))),
          '23514', 'w3_notification_text_rejects_contact_data');
select is(test_helpers.attempt(format($q$select public.enqueue_notification(%L, 'test.text', 'T', 'Order 123456 is ready', 'test:t4')$q$, current_setting('fx.oa'))),
          'succeeded', 'w3_notification_text_rejects_contact_data');

-- ---------- a roster name with a phone number degrades to the generic label ----------
select test_helpers.act_as_owner('j17n-oa@local.test');
insert into public.workers (owner_id, name) values (auth.uid(), 'Ben 0917 555 0909');
select set_config('fx.r2', (select id::text from public.workers where name = 'Ben 0917 555 0909'), true);
select set_config('fx.code3', (select link_code from public.create_roster_link_code(current_setting('fx.r2')::uuid)), true);
select test_helpers.act_as_worker('j17n-w2@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code3'))), 'linked',
          'w3_roster_name_with_phone_falls_back_to_generic_label');
select test_helpers.act_as_owner('j17n-oa@local.test');
select is((select body from public.notifications where category = 'roster.linked' and subject_id = current_setting('fx.r2')::uuid),
          'A roster entry is now linked to a worker account.', 'w3_roster_name_with_phone_falls_back_to_generic_label');
select is(public.notification_safe_label('ana@example.invalid', 'A roster entry'), 'A roster entry',
          'w3_roster_name_with_phone_falls_back_to_generic_label');

-- ---------- no private data in any notification ----------
select test_helpers.act_as_service();
select cmp_ok((select count(*)::int from public.notifications where category <> 'test.notice' and category not like 'test.%'),
              '>=', 5, 'w3_no_private_data_in_notifications');
select is((select count(*)::int from public.notifications
           where (title || ' ' || body) ilike any (array[
             '%0917 555 0202%', '%917 555 0101%', '%0917 555 0303%', '%0917 555 0404%', '%0917 555 0909%',
             '%private-contact%', '%@%', '%' || current_setting('fx.code') || '%', '%' || current_setting('fx.code2') || '%'])),
          0, 'w3_no_private_data_in_notifications');

-- ---------- deleted / unknown recipients ----------
select is(public.enqueue_notification(gen_random_uuid(), 'test.notice', 'T', 'B', 'test:ghost'), null::uuid,
          'w3_enqueue_for_deleted_recipient_returns_null');
delete from auth.users where id = current_setting('fx.ob')::uuid;
select is((select count(*)::int from public.notifications where recipient_id = current_setting('fx.ob')::uuid), 0,
          'w3_enqueue_for_deleted_recipient_returns_null');
select is(public.enqueue_notification(current_setting('fx.ob')::uuid, 'test.notice', 'T', 'B', 'test:gone'), null::uuid,
          'w3_enqueue_for_deleted_recipient_returns_null');

-- ---------- enqueue_notification_safely: data errors skipped, defects re-raised ----------
select is(public.enqueue_notification_safely(current_setting('fx.oa')::uuid, 'test.safe', 'T', 'Mail me@example.invalid', 'test:safe1'),
          null::uuid, 'w3_safe_enqueue_skips_data_errors');
-- Simulated privilege defect inside enqueue_notification (rolled back with the test).
create or replace function public.enqueue_notification(
  p_recipient_id uuid, p_category text, p_title text, p_body text, p_idempotency_key text,
  p_subject_type text default null, p_subject_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'simulated permission defect' using errcode = '42501';
end;
$$;
select is(test_helpers.attempt(format($q$select public.enqueue_notification_safely(%L, 'test.safe', 'T', 'B', 'test:safe2')$q$,
                                      current_setting('fx.oa'))),
          '42501', 'w3_safe_enqueue_reraises_permission_errors');

select * from finish();
rollback;
