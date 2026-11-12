-- MSG-1: booking messages. Only the booking's customer and its washer read or write; a new washer never sees an earlier
-- washer's conversation; writes only through checked functions; status changes post system messages; photos stay private;
-- the chat closes 24 hours after the booking ends; admin reads are audited. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;

insert into ids values
  ('admin', test_helpers.create_super_admin('msg1-admin@local.test')),
  ('c1', test_helpers.create_customer('msg1-c1@local.test')),
  ('stranger', test_helpers.create_customer('msg1-stranger@local.test')),
  ('w1', test_helpers.create_customer('msg1-w1@local.test')),
  ('w2', test_helpers.create_customer('msg1-w2@local.test')),
  ('svc', (select id from public.services where key = 'basic_exterior'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;
select public.make_platform_operator('msg1-w1@local.test') is not null as w1;
select public.make_platform_operator('msg1-w2@local.test') is not null as w2;
update public.independent_workers set verification_status = 'suspended' where profile_id not in (pg_temp.id('w1'), pg_temp.id('w2'));
update public.independent_workers set base_latitude = 14.5995, base_longitude = 120.9842, service_radius_km = 20
  where profile_id in (pg_temp.id('w1'), pg_temp.id('w2'));
insert into public.independent_worker_services select w, pg_temp.id('svc') from unnest(array[pg_temp.id('w1'), pg_temp.id('w2')]) w;
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select w, d, 0, 1440 from unnest(array[pg_temp.id('w1'), pg_temp.id('w2')]) w, generate_series(0, 6) d;

create function pg_temp.at(p_days integer) returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + p_days + interval '10 hours') at time zone 'Asia/Manila' $$;
create function pg_temp.book(p_key text, p_days integer) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id('c1'));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', false, pg_temp.at(p_days), 'key-msg1-' || p_key) r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.accept(p_booking text, p_worker text) returns void language plpgsql as $$
begin
  perform test_helpers.act_as(pg_temp.id(p_worker));
  perform public.accept_dispatch_request((select d.id from public.dispatch_requests d
    where d.booking_id = pg_temp.id(p_booking) and d.worker_id = pg_temp.id(p_worker) and d.status = 'offered'));
  perform test_helpers.act_as_service();
end;
$$;
create function pg_temp.visible_count(p_user text, p_booking text) returns integer language plpgsql as $$
declare
  n integer;
begin
  perform test_helpers.act_as(pg_temp.id(p_user));
  select count(*) into n from public.service_booking_messages where booking_id = pg_temp.id(p_booking);
  perform test_helpers.act_as_service();
  return n;
end;
$$;

-- 1) Before a washer accepts, there is no conversation to write in.
select pg_temp.book('job', 3);
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select public.send_service_booking_message(pg_temp.id('job'), 'Hello?') $$, '55000', 'This conversation is closed.',
  'msg1_no_chat_before_acceptance');
select test_helpers.act_as_service();

-- 2) Acceptance opens it and posts a system message.
select pg_temp.accept('job', 'w1');
select is((select count(*)::int from public.service_booking_messages where booking_id = pg_temp.id('job') and kind = 'system'
           and body = 'Your washer accepted the booking.'), 1, 'msg1_acceptance_posts_system_message');

-- 3) Customer and washer can write; the message records the conversation's washer.
select test_helpers.act_as(pg_temp.id('c1'));
select is((public.send_service_booking_message(pg_temp.id('job'), '  Gate code is 1234  ', null, 'aaaaaaaa-0000-4000-8000-000000000001')).body,
          'Gate code is 1234', 'msg1_customer_sends_trimmed_text');
select is((public.send_service_booking_message(pg_temp.id('job'), 'Gate code is 1234', null, 'aaaaaaaa-0000-4000-8000-000000000001')).body,
          'Gate code is 1234', 'msg1_retry_returns_the_saved_message');
select test_helpers.act_as_service();
select is((select count(*)::int from public.service_booking_messages where booking_id = pg_temp.id('job') and sender_id = pg_temp.id('c1')), 1,
          'msg1_retry_is_saved_once');
select is((select worker_id from public.service_booking_messages where booking_id = pg_temp.id('job') and sender_id = pg_temp.id('c1')),
          pg_temp.id('w1'), 'msg1_message_records_conversation_washer');
select test_helpers.act_as(pg_temp.id('w1'));
select is((public.send_service_booking_message(pg_temp.id('job'), 'On my way soon.')).sender_role, 'worker', 'msg1_washer_replies');
select test_helpers.act_as_service();
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.id('w1') and category = 'service_booking.message'), 1,
          'msg1_washer_notified_without_message_text');
select is((select count(*)::int from public.notifications where category = 'service_booking.message' and body like '%1234%'), 0,
          'msg1_notification_never_holds_message_text');

-- 4) Strangers and other washers can't read or write.
select is(pg_temp.visible_count('c1', 'job'), 3, 'msg1_customer_reads_conversation');
select is(pg_temp.visible_count('w1', 'job'), 3, 'msg1_washer_reads_conversation');
select is(pg_temp.visible_count('stranger', 'job'), 0, 'msg1_stranger_reads_nothing');
select test_helpers.act_as(pg_temp.id('stranger'));
select is((select count(*)::int from public.service_booking_chat_messages(pg_temp.id('job'))), 0, 'msg1_stranger_pages_nothing');
select test_helpers.act_as(pg_temp.id('c1'));
select is((select count(*)::int from public.service_booking_chat_messages(pg_temp.id('job'), null, 2)), 2, 'msg1_customer_pages_newest_first');
select test_helpers.act_as_service();
select is(pg_temp.visible_count('w2', 'job'), 0, 'msg1_other_washer_reads_nothing');
select test_helpers.act_as(pg_temp.id('stranger'));
select throws_ok($$ select public.send_service_booking_message(pg_temp.id('job'), 'Hi there') $$, '42501', 'Conversation not found.',
  'msg1_stranger_cannot_send');
select throws_ok($$ select public.mark_service_booking_chat_read(pg_temp.id('job')) $$, '42501', 'Conversation not found.',
  'msg1_stranger_cannot_mark_read');
select is((select count(*)::int from public.my_service_booking_chats()), 0, 'msg1_stranger_lists_no_conversations');
select test_helpers.act_as_service();

-- 5) No direct writes for app users.
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ insert into public.service_booking_messages (booking_id, sender_role, kind, body) values (pg_temp.id('job'), 'customer', 'text', 'x') $$,
  '42501', null, 'msg1_no_direct_insert');
select throws_ok($$ update public.service_booking_messages set body = 'changed' where booking_id = pg_temp.id('job') $$,
  '42501', null, 'msg1_no_direct_update');
select throws_ok($$ delete from public.service_booking_messages where booking_id = pg_temp.id('job') $$, '42501', null, 'msg1_no_direct_delete');
select test_helpers.act_as_service();

-- 6) Unread counts and read receipts.
select test_helpers.act_as(pg_temp.id('c1'));
-- Sending marks everything before it as read, so only the washer's reply is unread.
select is((select unread_count from public.my_service_booking_chats() where booking_id = pg_temp.id('job')), 1,
          'msg1_customer_unread_counts_washer_reply');
select public.mark_service_booking_chat_read(pg_temp.id('job'));
select is((select unread_count from public.my_service_booking_chats() where booking_id = pg_temp.id('job')), 0, 'msg1_mark_read_clears_unread');
select isnt((select other_name from public.my_service_booking_chats() where booking_id = pg_temp.id('job')), 'Your washer',
          'msg1_list_names_the_washer');
select test_helpers.act_as_service();
select test_helpers.act_as(pg_temp.id('w1'));
select is((select count(*)::int from public.service_booking_chat_reads where booking_id = pg_temp.id('job') and profile_id = pg_temp.id('c1')), 1,
          'msg1_washer_sees_customer_read_receipt');
select test_helpers.act_as_service();

-- 7) Typing and online channel: only the two participants can join.
select test_helpers.act_as(pg_temp.id('w1'));
select is(public.service_booking_chat_can_join('booking-chat:' || pg_temp.id('job')), true, 'msg1_washer_joins_channel');
select test_helpers.act_as(pg_temp.id('stranger'));
select is(public.service_booking_chat_can_join('booking-chat:' || pg_temp.id('job')), false, 'msg1_stranger_cannot_join_channel');
select is(public.service_booking_chat_can_join('booking-chat:not-a-uuid'), false, 'msg1_malformed_topic_refused');
select test_helpers.act_as_service();

-- 8) Photos: a reserved slot, the stored file checked, readable only by participants.
create temporary table photo (path text) on commit drop;
grant all on photo to public;
select test_helpers.act_as(pg_temp.id('c1'));
insert into photo select public.begin_service_booking_chat_photo(pg_temp.id('job'));
select ok((select path from photo) like pg_temp.id('job') || '/%', 'msg1_photo_path_inside_booking_folder');
select is(public.service_booking_chat_upload_is_open((select path from photo)), true, 'msg1_uploader_may_upload_to_slot');
select throws_ok($$ select public.send_service_booking_message(pg_temp.id('job'), null, (select path from photo)) $$, '22023',
  'The photo did not finish uploading. Try again.', 'msg1_photo_must_exist_before_sending');
select test_helpers.act_as(pg_temp.id('w1'));
select is(public.service_booking_chat_upload_is_open((select path from photo)), false, 'msg1_other_person_cannot_use_slot');
select test_helpers.act_as_service();
insert into storage.objects (bucket_id, name, metadata) select 'booking-chat-photos', path, '{"mimetype": "image/jpeg", "size": 120000}'::jsonb from photo;
select test_helpers.act_as(pg_temp.id('c1'));
select is((public.send_service_booking_message(pg_temp.id('job'), null, (select path from photo))).kind, 'photo', 'msg1_customer_sends_photo');
select test_helpers.act_as(pg_temp.id('w1'));
select is(public.service_booking_chat_photo_is_readable((select path from photo)), true, 'msg1_washer_can_open_photo');
select test_helpers.act_as(pg_temp.id('stranger'));
select is(public.service_booking_chat_photo_is_readable((select path from photo)), false, 'msg1_stranger_cannot_open_photo');
select test_helpers.act_as_service();

-- 9) Hand-over: the new washer sees none of the earlier washer's conversation; the customer still sees all of it.
select test_helpers.act_as(pg_temp.id('w1'));
select public.release_service_booking(pg_temp.id('job'), 'Car broke down on the way, sorry') is not null as released;
select test_helpers.act_as_service();
select pg_temp.accept('job', 'w2');
select is(pg_temp.visible_count('w2', 'job'), 1, 'msg1_new_washer_sees_only_their_own_conversation');
select ok(pg_temp.visible_count('c1', 'job') >= 6, 'msg1_customer_keeps_whole_history');
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok($$ select public.send_service_booking_message(pg_temp.id('job'), 'Still there?') $$, '42501', 'Conversation not found.',
  'msg1_previous_washer_cannot_write');
select test_helpers.act_as_service();

-- 10) Closed 24 hours after the booking ends.
-- Fixture only: skip the step-by-step guard to put the booking 25 hours after completion.
set local session_replication_role = replica;
update public.service_bookings set status = 'completed', completed_at = now() - interval '25 hours' where id = pg_temp.id('job');
set local session_replication_role = origin;
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select public.send_service_booking_message(pg_temp.id('job'), 'Thanks!') $$, '55000', 'This conversation is closed.',
  'msg1_closed_24_hours_after_completion');
select test_helpers.act_as_service();

-- 11) Admin: read-only, with a reason, audited.
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select * from public.admin_service_booking_chat(pg_temp.id('job'), 'Checking a complaint here') $$, '42501', null,
  'msg1_customer_cannot_use_admin_read');
select test_helpers.act_as(pg_temp.id('admin'));
select throws_ok($$ select * from public.admin_service_booking_chat(pg_temp.id('job'), 'short') $$, '23514', 'Give a reason of 10 to 300 characters.',
  'msg1_admin_read_needs_reason');
select ok((select count(*) from public.admin_service_booking_chat(pg_temp.id('job'), 'Customer reported a problem with the wash')) >= 6,
  'msg1_admin_reads_with_reason');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events where action = 'service_booking.chat_viewed' and subject_id = pg_temp.id('job')), 1,
          'msg1_admin_read_audited');

select * from finish();
rollback;
