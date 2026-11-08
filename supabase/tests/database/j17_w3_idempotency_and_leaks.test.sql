-- J17 (W3 TEST step): notification de-duplication under repeated triggers, and a combined leak scan
-- over every producer with a worker whose private phone and email are set (AC8, AC10).
-- Local Docker stack only; synthetic data. The file is one rolled-back transaction, so "across
-- transactions" is proven by the unique constraint (transaction independent) plus a forced conflict.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.o1', test_helpers.create_owner('j17i-o1@local.test')::text, true);
select set_config('fx.uw', test_helpers.create_worker('j17i-w1@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j17i-c1@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17i-admin@local.test')::text, true);

-- Synthetic private values that must never reach a notification or an audit payload.
update public.profiles set phone_number = '0917 555 1111' where id = current_setting('fx.o1')::uuid;
update public.profiles set phone_number = '0917 555 2222' where id = current_setting('fx.uw')::uuid;
insert into public.worker_profiles (profile_id, availability_status) values (current_setting('fx.uw')::uuid, 'flexible');
insert into public.worker_private_contacts (profile_id, contact_phone, contact_email, preferred_contact_method)
values (current_setting('fx.uw')::uuid, '+63 917 555 0101', 'j17i-private-contact@local.test', 'email');
insert into public.shops (owner_id, name, address, verification_status, verification_notes)
values (current_setting('fx.o1')::uuid, 'J17I Leak Wash', '12 Secret Street call 0917 555 4444', 'pending', 'Note: ring 0917 555 5555');
select set_config('fx.s1', (select id::text from public.shops where name = 'J17I Leak Wash'), true);
insert into public.shops (owner_id, name, address, verification_status)
values (current_setting('fx.o1')::uuid, 'Mail ops@shop.invalid Wash', 'Plain address', 'pending');
select set_config('fx.s2', (select id::text from public.shops where name = 'Mail ops@shop.invalid Wash'), true);

create function pg_temp.shop_notices() returns int language sql as $$
  select count(*)::int from public.notifications where category = 'shop_verification.status_changed'
$$;
create function pg_temp.notices(p_category text) returns int language sql as $$
  select count(*)::int from public.notifications where category = p_category
$$;

-- ---------- same transaction: repeated and no-op triggers never duplicate ----------
select test_helpers.act_as_admin('j17i-admin@local.test');
update public.shops set verification_status = 'approved' where id = current_setting('fx.s1')::uuid;
update public.shops set verification_status = 'approved' where id = current_setting('fx.s1')::uuid;
update public.shops set verification_notes = 'Another note 0917 555 6666' where id = current_setting('fx.s1')::uuid;
update public.shops set verification_status = 'approved' where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.shop_notices(), 1, 'w3_repeated_same_status_updates_notify_once');
select is((select count(*)::int from public.workforce_audit_events
           where action = 'shop.verification_decided' and subject_id = current_setting('fx.s1')::uuid),
          1, 'w3_repeated_same_status_updates_audit_once');

-- a real change is a new event: distinct audit ids give distinct keys
select test_helpers.act_as_admin('j17i-admin@local.test');
update public.shops set verification_status = 'rejected' where id = current_setting('fx.s1')::uuid;
update public.shops set verification_status = 'changes_requested' where id = current_setting('fx.s1')::uuid;
update public.shops set verification_status = 'pending' where id = current_setting('fx.s1')::uuid;
update public.shops set verification_status = 'approved' where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.shop_notices(), 5, 'w3_each_distinct_decision_notifies_once');
select is((select count(distinct idempotency_key)::int from public.notifications
           where category = 'shop_verification.status_changed'), 5, 'w3_each_distinct_decision_notifies_once');
select is((select count(*)::int from public.notifications where category = 'shop_verification.status_changed'
           and body in ('J17I Leak Wash is now Rejected.', 'J17I Leak Wash is now Changes requested.', 'J17I Leak Wash is now Pending review.')),
          3, 'w3_each_distinct_decision_notifies_once');

-- ---------- a re-fired producer (same key) returns the existing row ----------
select set_config('fx.k_id', (select id::text from public.notifications where category = 'shop_verification.status_changed' order by created_at, id limit 1), true);
select set_config('fx.k_key', (select idempotency_key from public.notifications where id = current_setting('fx.k_id')::uuid), true);
select is(public.enqueue_notification(current_setting('fx.o1')::uuid, 'shop_verification.status_changed', 'Shop verification updated',
            'Replayed body', current_setting('fx.k_key'))::text, current_setting('fx.k_id'), 'w3_refired_producer_key_returns_existing_row');
select is(public.enqueue_notification(current_setting('fx.o1')::uuid, 'shop_verification.status_changed', 'Shop verification updated',
            'Replayed body', current_setting('fx.k_key'))::text, current_setting('fx.k_id'), 'w3_refired_producer_key_returns_existing_row');
select is(pg_temp.shop_notices(), 5, 'w3_refired_producer_key_returns_existing_row');
select isnt((select body from public.notifications where id = current_setting('fx.k_id')::uuid), 'Replayed body',
            'w3_refired_producer_key_returns_existing_row');

-- ---------- across transactions: the constraint, not the session, enforces uniqueness ----------
select is((select count(*)::int from pg_constraint
           where conrelid = 'public.notifications'::regclass and contype = 'u'
             and pg_get_constraintdef(oid) = 'UNIQUE (recipient_id, idempotency_key)'), 1, 'w3_idempotency_unique_constraint_is_transaction_independent');
select set_config('washlink.notification_writer', 'on', true);
select is(test_helpers.attempt(format($q$insert into public.notifications (recipient_id, category, title, body, idempotency_key)
            values (%L, 'test.dup', 'T', 'B', %L)$q$, current_setting('fx.o1'), current_setting('fx.k_key'))),
          '23505', 'w3_idempotency_unique_constraint_is_transaction_independent');
select set_config('washlink.notification_writer', 'off', true);
select is((select count(*)::int from (select recipient_id, idempotency_key from public.notifications
            group by 1, 2 having count(*) > 1) d), 0, 'w3_idempotency_unique_constraint_is_transaction_independent');

-- ---------- roster link accepted twice: one event, one notification ----------
select test_helpers.act_as_owner('j17i-o1@local.test');
insert into public.workers (owner_id, name, phone_number) values (auth.uid(), 'J17I Roster Ana', '0917 555 3333');
select set_config('fx.r1', (select id::text from public.workers where name = 'J17I Roster Ana'), true);
select set_config('fx.code', (select link_code from public.create_roster_link_code(current_setting('fx.r1')::uuid)), true);
select test_helpers.act_as_worker('j17i-w1@local.test');
select result from public.accept_roster_link_code(current_setting('fx.code'));
select result from public.accept_roster_link_code(current_setting('fx.code'));
select test_helpers.act_as_service();
select is(pg_temp.notices('roster.linked'), 1, 'w3_double_accept_notifies_once');
select is((select count(*)::int from public.workforce_audit_events where action = 'roster.linked' and subject_id = current_setting('fx.r1')::uuid),
          1, 'w3_double_accept_notifies_once');

-- unlink twice (second is a no-op), relink: second link is a new event
select test_helpers.act_as_worker('j17i-w1@local.test');
select public.unlink_my_roster_entry(current_setting('fx.r1')::uuid);
select test_helpers.attempt(format('select public.unlink_my_roster_entry(%L)', current_setting('fx.r1'))) as second_unlink_rejected;
select test_helpers.act_as_service();
select is(pg_temp.notices('roster.unlinked'), 1, 'w3_double_unlink_notifies_once');
select test_helpers.act_as_owner('j17i-o1@local.test');
select set_config('fx.code2', (select link_code from public.create_roster_link_code(current_setting('fx.r1')::uuid)), true);
select test_helpers.act_as_worker('j17i-w1@local.test');
select result from public.accept_roster_link_code(current_setting('fx.code2'));
select test_helpers.act_as_owner('j17i-o1@local.test');
update public.workers set user_id = null where id = current_setting('fx.r1')::uuid;
update public.workers set user_id = null where id = current_setting('fx.r1')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.notices('roster.linked'), 2, 'w3_relink_is_a_new_event');
select is(pg_temp.notices('roster.unlinked'), 2, 'w3_relink_is_a_new_event');
select is((select count(*)::int from public.notifications where category = 'roster.unlinked' and recipient_id = current_setting('fx.uw')::uuid),
          1, 'w3_relink_is_a_new_event');

-- ---------- remaining producers, so the leak scan covers all of them ----------
select test_helpers.act_as_owner('j17i-o1@local.test');
update public.shops set name = 'J17I Leak Wash Renamed', address = '99 Secret Avenue 0917 555 7777' where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_service();
select set_config('fx.r2', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)::text, true);
update public.workers set name = 'Ben 0917 555 8888' where id = current_setting('fx.r2')::uuid;
select test_helpers.act_as_owner('j17i-o1@local.test');
delete from public.workers where id = current_setting('fx.r2')::uuid;
select test_helpers.act_as_admin('j17i-admin@local.test');
update public.shops set verification_status = 'approved' where id = current_setting('fx.s2')::uuid;
select test_helpers.act_as_service();
select is((select body from public.notifications where category = 'shop_verification.status_changed' and subject_id = current_setting('fx.s2')::uuid),
          'Your shop is now Approved.', 'w3_shop_name_with_email_degrades_to_generic_label');
update public.profiles set role = 'owner' where id = current_setting('fx.c1')::uuid;
select test_helpers.act_as_worker('j17i-w1@local.test');
insert into public.worker_profiles (profile_id, availability_status) values (auth.uid(), 'part_time') on conflict do nothing;
delete from public.worker_profiles where profile_id = auth.uid();
select test_helpers.act_as_service();
delete from auth.users where id = current_setting('fx.uw')::uuid;

-- ---------- leak scan over every notification and audit row ----------
select cmp_ok((select count(*)::int from public.workforce_audit_events), '>=', 15, 'w3_no_private_data_leaks_from_any_producer');
select cmp_ok((select count(*)::int from public.notifications), '>=', 9, 'w3_no_private_data_leaks_from_any_producer');
select is((select count(*)::int from public.notifications
           where (category || ' ' || title || ' ' || body || ' ' || idempotency_key || ' ' || coalesce(subject_type, '')) ilike any (array[
             '%0917 555 1111%', '%0917 555 2222%', '%917 555 0101%', '%0917 555 3333%', '%0917 555 4444%', '%0917 555 5555%',
             '%0917 555 6666%', '%0917 555 7777%', '%0917 555 8888%', '%private-contact%', '%Secret%', '%@%', '%ops@%',
             '%' || current_setting('fx.code') || '%', '%' || current_setting('fx.code2') || '%'])),
          0, 'w3_no_private_data_leaks_from_any_producer');
select is((select count(*)::int from public.workforce_audit_events
           where (action || ' ' || subject_type || ' ' || payload::text) ilike any (array[
             '%0917 555 1111%', '%0917 555 2222%', '%917 555 0101%', '%0917 555 3333%', '%0917 555 4444%', '%0917 555 5555%',
             '%0917 555 6666%', '%0917 555 7777%', '%0917 555 8888%', '%private-contact%', '%Secret%', '%Another note%',
             '%@%', '%code_hash%', '%' || current_setting('fx.code') || '%', '%' || current_setting('fx.code2') || '%'])),
          0, 'w3_no_private_data_leaks_from_any_producer');
select is((select count(*)::int from public.workforce_audit_events
           where exists (select 1 from jsonb_object_keys(payload) k
                         where k ~* '(phone|e_?mail|contact|address|note|password|token|secret|code|storage_path|body|message|text)')),
          0, 'w3_no_private_data_leaks_from_any_producer');

select * from finish();
rollback;
