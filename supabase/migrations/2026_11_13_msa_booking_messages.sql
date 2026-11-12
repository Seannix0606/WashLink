-- =============================================================
-- WashLink booking messages (MSG-1): a private chat between a booking's customer and its washer.
--
-- One conversation per booking. It opens when a washer accepts and stays writable until 24 hours after the booking is
-- completed or cancelled; after that it is read-only. Each message records the washer of the conversation at the time
-- (worker_id), so if a booking is handed back and taken by someone else, the new washer never sees the earlier washer's
-- messages; the customer always sees the whole history.
--
-- Access is decided here, never by the apps:
--   * Rows: customers read their own bookings' messages; a washer reads messages of conversations they are part of.
--     Nobody inserts, updates or deletes directly; every write goes through the definer functions below.
--   * Realtime: messages and read receipts follow the same row rules. Typing and online status use the private channel
--     "booking-chat:<booking id>", which only the booking's customer and current washer can join.
--   * Photos: private bucket booking-chat-photos, JPEG/PNG/WebP up to 5 MB. A participant reserves an upload slot,
--     uploads to the path the server chose, then sends; the server checks the stored object's type and size. Photos are
--     readable by participants for 90 days, then marked removed and queued for deletion.
--   * Admin: read-only, with a reason, audited (admin_service_booking_chat).
-- Status changes post short system messages. A new message notifies the other person in the bell (at most once per
-- conversation per 10 minutes). Additive: no committed migration changes.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Tables
-- -------------------------------------------------------------
create table if not exists public.service_booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  -- The washer this conversation was with when the message was written.
  worker_id uuid references public.independent_workers(profile_id) on delete set null,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'worker', 'system')),
  kind text not null check (kind in ('text', 'photo', 'system')),
  body text check (body is null or (char_length(btrim(body)) between 1 and 2000
    and body !~ '[\x01-\x08\x0b-\x0c\x0e-\x1f\x7f​-‏⁠﻿]')),
  photo_object text unique,
  photo_removed_at timestamptz,
  -- Chosen by the sending app, so a retried send is saved once.
  client_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint service_booking_messages_shape check (
    (kind = 'text' and body is not null and photo_object is null and sender_role <> 'system')
    or (kind = 'photo' and photo_object is not null and sender_role <> 'system')
    or (kind = 'system' and sender_role = 'system' and sender_id is null and body is not null and photo_object is null)),
  constraint service_booking_messages_client_once unique (sender_id, client_id)
);
create index if not exists service_booking_messages_booking_time on public.service_booking_messages (booking_id, created_at desc);
create index if not exists service_booking_messages_worker on public.service_booking_messages (worker_id);
create index if not exists service_booking_messages_photo_age on public.service_booking_messages (created_at)
  where kind = 'photo' and photo_removed_at is null;

-- When each participant last read the conversation. "Seen" = the other person's last_read_at is after the message.
create table if not exists public.service_booking_chat_reads (
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default clock_timestamp(),
  primary key (booking_id, profile_id)
);

-- Upload slots: a participant asks for one, uploads to its path, then sends it. Unused slots expire after 15 minutes.
create table if not exists public.service_booking_chat_uploads (
  object_name text primary key,
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists service_booking_chat_uploads_uploader on public.service_booking_chat_uploads (uploader_id, created_at desc);

-- Photo files to delete from storage (by a trusted job; until then the read rule already refuses them).
create table if not exists public.service_booking_chat_photo_file_queue (
  object_name text primary key,
  queued_at timestamptz not null default now()
);

alter table public.service_booking_messages enable row level security;
alter table public.service_booking_chat_reads enable row level security;
alter table public.service_booking_chat_uploads enable row level security;
alter table public.service_booking_chat_photo_file_queue enable row level security;

revoke all on public.service_booking_messages, public.service_booking_chat_reads, public.service_booking_chat_uploads,
  public.service_booking_chat_photo_file_queue from public, anon, authenticated;
grant select on public.service_booking_messages, public.service_booking_chat_reads to authenticated;

-- -------------------------------------------------------------
-- 2) Who is in a conversation, and when it is open
-- -------------------------------------------------------------
-- 'customer', 'worker' (the booking's current washer) or null for the signed-in user.
create or replace function public.service_booking_chat_role(p_booking uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then null
    when b.customer_id = auth.uid() then 'customer'
    when b.worker_id = auth.uid() then 'worker'
  end
  from public.service_bookings b where b.id = p_booking
$$;

-- Writable from acceptance until 24 hours after the booking ends. Needs a washer on the booking.
create or replace function public.service_booking_chat_is_open(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select b.worker_id is not null and (
      b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress')
      or (b.status in ('completed', 'cancelled') and coalesce(b.completed_at, (
            select max(e.created_at) from public.service_booking_status_events e
            where e.booking_id = b.id and e.to_status = b.status), b.updated_at) > now() - interval '24 hours'))
    from public.service_bookings b where b.id = p_booking), false)
$$;

-- Row rule for messages: the customer sees all of their booking's messages; a washer sees the conversation they were in.
create or replace function public.service_booking_message_is_visible(p_booking uuid, p_worker uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.service_bookings b where b.id = p_booking and b.customer_id = auth.uid())
    or p_worker = auth.uid())
$$;

-- Read receipts: visible to anyone who can see the booking's conversation.
create or replace function public.service_booking_chat_read_is_visible(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.service_bookings b where b.id = p_booking
      and (b.customer_id = auth.uid() or b.worker_id = auth.uid()
           or exists (select 1 from public.service_booking_messages m where m.booking_id = b.id and m.worker_id = auth.uid())))
$$;

revoke all on function public.service_booking_chat_role(uuid), public.service_booking_chat_is_open(uuid),
  public.service_booking_message_is_visible(uuid, uuid), public.service_booking_chat_read_is_visible(uuid)
  from public, anon, authenticated, service_role;
-- Only the row rules below call these two as the signed-in user. The role and open checks stay internal, so nobody can probe
-- whether some other booking has a washer or an open chat.
grant execute on function public.service_booking_message_is_visible(uuid, uuid), public.service_booking_chat_read_is_visible(uuid)
  to authenticated;

drop policy if exists service_booking_messages_participants_read on public.service_booking_messages;
create policy service_booking_messages_participants_read on public.service_booking_messages for select to authenticated
  using (public.service_booking_message_is_visible(booking_id, worker_id));
drop policy if exists service_booking_chat_reads_participants_read on public.service_booking_chat_reads;
create policy service_booking_chat_reads_participants_read on public.service_booking_chat_reads for select to authenticated
  using (public.service_booking_chat_read_is_visible(booking_id));

-- -------------------------------------------------------------
-- 3) Sending, reading, photos
-- -------------------------------------------------------------
insert into public.notification_categories (category, source_increment, key_prefixes, subject_types, recipient_kind, description)
values ('service_booking.message', 'W19', array['service_booking_message'], array['service_booking'], 'either_party',
        'The other person on a booking sent a message. The text never includes the message itself.')
on conflict (category) do nothing;

-- Reserve a photo upload. Returns the only path the caller may upload to.
create or replace function public.begin_service_booking_chat_photo(p_booking uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  role_in_chat text := public.service_booking_chat_role(p_booking);
  path text;
begin
  if role_in_chat is null then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  if not public.service_booking_chat_is_open(p_booking) then
    raise exception 'This conversation is closed.' using errcode = '55000';
  end if;
  if (select count(*) from public.service_booking_chat_uploads u
      where u.uploader_id = auth.uid() and u.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many photos in the last hour. Try again later.' using errcode = '54000';
  end if;
  path := p_booking::text || '/' || gen_random_uuid()::text;
  insert into public.service_booking_chat_uploads (object_name, booking_id, uploader_id) values (path, p_booking, auth.uid());
  return path;
end;
$$;

-- Storage rule helpers (see the policies in section 5).
create or replace function public.service_booking_chat_upload_is_open(p_object text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.service_booking_chat_uploads u
    where u.object_name = p_object and u.uploader_id = auth.uid() and u.used_at is null and u.expires_at > now()
      and public.service_booking_chat_is_open(u.booking_id))
$$;

create or replace function public.service_booking_chat_photo_is_readable(p_object text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.service_booking_messages m
    where m.photo_object = p_object and m.photo_removed_at is null and m.created_at > now() - interval '90 days'
      and public.service_booking_message_is_visible(m.booking_id, m.worker_id))
$$;

create or replace function public.send_service_booking_message(p_booking uuid, p_body text default null,
  p_photo_object text default null, p_client_id uuid default null)
returns public.service_booking_messages
language plpgsql
security definer
set search_path = public, pg_temp
-- Reads storage.objects: an owner without BYPASSRLS gets an error instead of silently finding no file (as in B2C-7).
set row_security = off
as $$
declare
  role_in_chat text := public.service_booking_chat_role(p_booking);
  b public.service_bookings;
  existing public.service_booking_messages;
  saved public.service_booking_messages;
  slot public.service_booking_chat_uploads;
  object_type text;
  object_size bigint;
  recipient uuid;
  sender_name text;
begin
  if role_in_chat is null then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  -- A retried send returns the message saved the first time.
  if p_client_id is not null then
    select * into existing from public.service_booking_messages m where m.sender_id = auth.uid() and m.client_id = p_client_id;
    if found then
      return existing;
    end if;
  end if;
  if not public.service_booking_chat_is_open(p_booking) then
    raise exception 'This conversation is closed.' using errcode = '55000';
  end if;
  if (p_body is null or btrim(p_body) = '') and p_photo_object is null then
    raise exception 'Write a message or add a photo.' using errcode = '22023';
  end if;
  if p_body is not null and char_length(btrim(p_body)) > 2000 then
    raise exception 'Messages can be up to 2000 characters.' using errcode = '22023';
  end if;
  if (select count(*) from public.service_booking_messages m
      where m.sender_id = auth.uid() and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too quickly. Wait a moment.' using errcode = '54000';
  end if;

  select * into b from public.service_bookings x where x.id = p_booking;

  if p_photo_object is not null then
    select * into slot from public.service_booking_chat_uploads u where u.object_name = p_photo_object for update;
    if not found or slot.uploader_id <> auth.uid() or slot.booking_id <> p_booking or slot.used_at is not null then
      raise exception 'Upload the photo again.' using errcode = '22023';
    end if;
    select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into object_type, object_size
      from storage.objects o where o.bucket_id = 'booking-chat-photos' and o.name = p_photo_object;
    if object_type is null then
      raise exception 'The photo did not finish uploading. Try again.' using errcode = '22023';
    end if;
    if object_type not in ('image/jpeg', 'image/png', 'image/webp') or object_size > 5242880 then
      raise exception 'Photos must be JPEG, PNG or WebP, up to 5 MB.' using errcode = '22023';
    end if;
    update public.service_booking_chat_uploads set used_at = now() where object_name = p_photo_object;
  end if;

  insert into public.service_booking_messages (booking_id, worker_id, sender_id, sender_role, kind, body, photo_object, client_id)
  values (p_booking, b.worker_id, auth.uid(), role_in_chat, case when p_photo_object is null then 'text' else 'photo' end,
          nullif(btrim(coalesce(p_body, '')), ''), p_photo_object, p_client_id)
  returning * into saved;

  -- The sender has read everything up to their own message.
  insert into public.service_booking_chat_reads (booking_id, profile_id, last_read_at) values (p_booking, auth.uid(), saved.created_at)
    on conflict (booking_id, profile_id) do update set last_read_at = greatest(public.service_booking_chat_reads.last_read_at, excluded.last_read_at);

  recipient := case role_in_chat when 'customer' then b.worker_id else b.customer_id end;
  select coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Someone') into sender_name from public.profiles p where p.id = auth.uid();
  -- Names the service, not the reference: notification text refuses runs of seven or more digits (they look like phone
  -- numbers), and a reference such as WL-81904306 has one.
  perform public.enqueue_notification_safely(recipient, 'service_booking.message', 'New message',
    left(coalesce(sender_name, 'Someone'), 40) || ' sent you a message about your ' || left(b.service_name, 80) || '.',
    'service_booking_message:' || p_booking || ':' || floor(extract(epoch from now()) / 600)::bigint,
    'service_booking', p_booking);
  return saved;
end;
$$;

create or replace function public.mark_service_booking_chat_read(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.service_booking_chat_role(p_booking) is null
     and not exists (select 1 from public.service_booking_messages m where m.booking_id = p_booking and m.worker_id = auth.uid()) then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  insert into public.service_booking_chat_reads (booking_id, profile_id, last_read_at) values (p_booking, auth.uid(), clock_timestamp())
    on conflict (booking_id, profile_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- The caller's conversations, newest activity first: the booking, the other person, the last message and unread count.
create or replace function public.my_service_booking_chats()
returns table (booking_id uuid, reference text, status text, service_name text, scheduled_at timestamptz, address text,
  my_role text, other_name text, is_open boolean, last_kind text, last_body text, last_sender_role text, last_at timestamptz,
  unread_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mine as (
    -- Customers: their bookings that have had a washer. Washers: bookings they are on now, or were chatting on.
    select b.id, 'customer'::text as my_role, b.worker_id as other_id
      from public.service_bookings b
      where b.customer_id = auth.uid()
        and (b.worker_id is not null or exists (select 1 from public.service_booking_messages m where m.booking_id = b.id))
    union
    select b.id, 'worker', b.customer_id
      from public.service_bookings b
      where b.worker_id = auth.uid() or exists (select 1 from public.service_booking_messages m where m.booking_id = b.id and m.worker_id = auth.uid())
  )
  select b.id, b.reference, b.status, b.service_name, b.scheduled_at,
    -- A washer sees the address only while the booking is theirs and active, as elsewhere.
    case when mine.my_role = 'customer' or (b.worker_id = auth.uid() and b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress'))
      then b.address end,
    mine.my_role,
    coalesce(nullif(btrim(p.full_name), ''), case mine.my_role when 'customer' then 'Your washer' else 'Customer' end),
    public.service_booking_chat_is_open(b.id) and (mine.my_role = 'customer' or b.worker_id = auth.uid()),
    last_message.kind, case when last_message.kind = 'photo' then null else last_message.body end, last_message.sender_role, last_message.created_at,
    (select count(*)::integer from public.service_booking_messages m
      where m.booking_id = b.id and m.sender_role <> mine.my_role
        and (mine.my_role = 'customer' or m.worker_id = auth.uid())
        and m.created_at > coalesce((select r.last_read_at from public.service_booking_chat_reads r
                                     where r.booking_id = b.id and r.profile_id = auth.uid()), '-infinity'))
  from mine
  join public.service_bookings b on b.id = mine.id
  left join public.profiles p on p.id = mine.other_id
  left join lateral (select m.kind, m.body, m.sender_role, m.created_at from public.service_booking_messages m
    where m.booking_id = b.id and (mine.my_role = 'customer' or m.worker_id = auth.uid())
    order by m.created_at desc limit 1) last_message on true
  where auth.uid() is not null
  order by coalesce(last_message.created_at, b.updated_at) desc
$$;

-- One page of a conversation, newest first, before a point in time. Runs as the caller, so the row rule above decides
-- which messages come back: a stranger simply gets none.
create or replace function public.service_booking_chat_messages(p_booking uuid, p_before timestamptz default null,
  p_limit integer default 40)
returns table (id uuid, sender_id uuid, sender_role text, kind text, body text, photo_object text, photo_removed boolean,
  client_id uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.id, m.sender_id, m.sender_role, m.kind, m.body,
    case when m.photo_removed_at is null and m.created_at > now() - interval '90 days' then m.photo_object end,
    m.kind = 'photo' and (m.photo_removed_at is not null or m.created_at <= now() - interval '90 days'),
    case when m.sender_id = auth.uid() then m.client_id end, m.created_at
  from public.service_booking_messages m
  where m.booking_id = p_booking and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;

-- Admin: read a conversation, with a reason. Every look is recorded. Photos are listed but not opened.
create or replace function public.admin_service_booking_chat(p_booking uuid, p_reason text)
returns table (id uuid, sender_role text, kind text, body text, has_photo boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_user_profile_role() is distinct from 'super_admin' then
    raise exception 'Only WashLink admins can read conversations.' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 300 then
    raise exception 'Give a reason of 10 to 300 characters.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.service_bookings b where b.id = p_booking) then
    raise exception 'Booking not found.' using errcode = '22023';
  end if;
  perform public.record_workforce_audit_event('service_booking.chat_viewed', 'service_booking', p_booking,
    (select b.customer_id from public.service_bookings b where b.id = p_booking), '{}'::jsonb);
  return query select m.id, m.sender_role, m.kind, case when m.kind = 'photo' then null else m.body end,
    m.kind = 'photo' and m.photo_removed_at is null, m.created_at
    from public.service_booking_messages m where m.booking_id = p_booking order by m.created_at;
end;
$$;

-- Ends photos older than 90 days: marks them removed and queues the files. Safe to run any time (trusted job).
create or replace function public.service_booking_chat_photos_expire()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed integer;
begin
  with ended as (
    update public.service_booking_messages m set photo_removed_at = now()
      where m.kind = 'photo' and m.photo_removed_at is null and m.created_at <= now() - interval '90 days'
      returning m.photo_object)
  insert into public.service_booking_chat_photo_file_queue (object_name) select photo_object from ended
    on conflict (object_name) do nothing;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.begin_service_booking_chat_photo(uuid), public.service_booking_chat_upload_is_open(text),
  public.service_booking_chat_photo_is_readable(text), public.send_service_booking_message(uuid, text, text, uuid),
  public.mark_service_booking_chat_read(uuid), public.my_service_booking_chats(), public.admin_service_booking_chat(uuid, text),
  public.service_booking_chat_photos_expire(), public.service_booking_chat_messages(uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_service_booking_chat_photo(uuid), public.service_booking_chat_upload_is_open(text),
  public.service_booking_chat_photo_is_readable(text), public.send_service_booking_message(uuid, text, text, uuid),
  public.mark_service_booking_chat_read(uuid), public.my_service_booking_chats(), public.admin_service_booking_chat(uuid, text),
  public.service_booking_chat_messages(uuid, timestamptz, integer)
  to authenticated;

-- -------------------------------------------------------------
-- 4) System messages when a booking changes status
-- -------------------------------------------------------------
create or replace function public.service_booking_post_status_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  label text;
  conversation_worker uuid := coalesce(new.worker_id, old.worker_id);
begin
  if new.status is not distinct from old.status or conversation_worker is null then
    return new;
  end if;
  label := case new.status
    when 'accepted' then 'Your washer accepted the booking.'
    when 'worker_on_the_way' then 'Your washer is on the way.'
    when 'arrived' then 'Your washer has arrived.'
    when 'in_progress' then 'The wash has started.'
    when 'completed' then 'The wash is complete.'
    when 'cancelled' then 'The booking was cancelled.'
    when 'searching_for_worker' then 'The washer handed this booking back. WashLink is finding another washer.'
  end;
  if label is not null then
    insert into public.service_booking_messages (booking_id, worker_id, sender_role, kind, body)
      values (new.id, conversation_worker, 'system', 'system', label);
  end if;
  return new;
end;
$$;
revoke all on function public.service_booking_post_status_message() from public, anon, authenticated, service_role;
drop trigger if exists service_booking_post_status_message on public.service_bookings;
create trigger service_booking_post_status_message
  after update of status on public.service_bookings
  for each row execute function public.service_booking_post_status_message();

-- -------------------------------------------------------------
-- 5) Photo storage, Realtime
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-chat-photos', 'booking-chat-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The only policies on this bucket: upload into a reserved slot, read a visible photo. No update or delete for anyone.
drop policy if exists bcp_storage_insert_reserved on storage.objects;
create policy bcp_storage_insert_reserved on storage.objects for insert to authenticated
  with check (bucket_id = 'booking-chat-photos' and storage.operation() = 'storage.object.upload'
    and public.service_booking_chat_upload_is_open(name));
drop policy if exists bcp_storage_select_participants on storage.objects;
create policy bcp_storage_select_participants on storage.objects for select to authenticated
  using (bucket_id = 'booking-chat-photos' and storage.operation() = 'storage.object.get_authenticated'
    and public.service_booking_chat_photo_is_readable(name));

-- Typing and online status: private channel "booking-chat:<booking id>", only for the booking's customer and current washer.
create or replace function public.service_booking_chat_can_join(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_topic ~ '^booking-chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.service_booking_chat_role(substr(p_topic, 14)::uuid) is not null
$$;
revoke all on function public.service_booking_chat_can_join(text) from public, anon, authenticated, service_role;
grant execute on function public.service_booking_chat_can_join(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists booking_chat_channel_read on realtime.messages';
    execute 'create policy booking_chat_channel_read on realtime.messages for select to authenticated
      using (realtime.messages.extension in (''broadcast'', ''presence'') and public.service_booking_chat_can_join(realtime.topic()))';
    execute 'drop policy if exists booking_chat_channel_write on realtime.messages';
    execute 'create policy booking_chat_channel_write on realtime.messages for insert to authenticated
      with check (realtime.messages.extension in (''broadcast'', ''presence'') and public.service_booking_chat_can_join(realtime.topic()))';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'service_booking_messages') then
      execute 'alter publication supabase_realtime add table public.service_booking_messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'service_booking_chat_reads') then
      execute 'alter publication supabase_realtime add table public.service_booking_chat_reads';
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ROLLBACK:
-- alter publication supabase_realtime drop table public.service_booking_messages, public.service_booking_chat_reads;
-- drop policy if exists booking_chat_channel_read on realtime.messages; drop policy if exists booking_chat_channel_write on realtime.messages;
-- drop policy if exists bcp_storage_insert_reserved on storage.objects; drop policy if exists bcp_storage_select_participants on storage.objects;
-- drop trigger if exists service_booking_post_status_message on public.service_bookings;
-- drop function public.service_booking_chat_messages(uuid, timestamptz, integer), public.service_booking_post_status_message(), public.service_booking_chat_can_join(text), public.service_booking_chat_photos_expire(),
--   public.admin_service_booking_chat(uuid, text), public.my_service_booking_chats(), public.mark_service_booking_chat_read(uuid),
--   public.send_service_booking_message(uuid, text, text, uuid), public.service_booking_chat_photo_is_readable(text),
--   public.service_booking_chat_upload_is_open(text), public.begin_service_booking_chat_photo(uuid),
--   public.service_booking_chat_read_is_visible(uuid), public.service_booking_message_is_visible(uuid, uuid),
--   public.service_booking_chat_is_open(uuid), public.service_booking_chat_role(uuid);
-- drop table public.service_booking_chat_photo_file_queue, public.service_booking_chat_uploads, public.service_booking_chat_reads,
--   public.service_booking_messages;
-- delete from public.notification_categories where category = 'service_booking.message';
