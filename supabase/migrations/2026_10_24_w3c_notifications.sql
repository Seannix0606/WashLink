-- =============================================================
-- WashLink W3c - in-app notification foundation (spec I notifications; audit F7).
-- Requires 2026_10_24_w2a and w3a. Idempotent.
--
-- State machine (per row): unread (read_at null) -> read (read_at set), by the recipient
-- only, through mark_notifications_read(). No read -> unread, no other mutation by anyone.
-- P12: rows are inserted only by enqueue_notification() (flag washlink.notification_writer).
-- P13: no jsonb payload; title / body never contain '@' or phone-shaped digit runs (CHECK).
-- Realtime: NOT published (D-10: production Realtime / RLS settings unknown); clients poll.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Text rules (P13) and the safe label used by producers (P14)
-- -------------------------------------------------------------
create or replace function public.notification_text_is_safe(p_text text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_text is not null
    and strpos(p_text, '@') = 0
    and not exists (
      select 1
      from regexp_matches(p_text, '[-+0-9 ()]+', 'g') as digit_run(parts)
      where char_length(regexp_replace(digit_run.parts[1], '[^0-9]', '', 'g')) >= 7
    );
$$;

-- The trimmed label if it is 1..60 chars and safe, else the fallback, so an owner-typed name
-- holding a phone number degrades to a generic label instead of failing the business action.
create or replace function public.notification_safe_label(p_label text, p_fallback text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when nullif(btrim(p_label), '') is not null
         and char_length(btrim(p_label)) <= 60
         and public.notification_text_is_safe(btrim(p_label))
      then btrim(p_label)
    else p_fallback
  end;
$$;

revoke all on function public.notification_text_is_safe(text) from public, anon, service_role;
revoke all on function public.notification_safe_label(text, text) from public, anon, service_role;
grant execute on function public.notification_text_is_safe(text) to authenticated;
grant execute on function public.notification_safe_label(text, text) to authenticated;

-- -------------------------------------------------------------
-- 2) Table
-- -------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  subject_type text,
  subject_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_category_check
    check (char_length(category) <= 64 and category ~ '^[a-z_]+(\.[a-z_]+)*$'),
  constraint notifications_title_check
    check (char_length(title) between 1 and 120 and public.notification_text_is_safe(title)),
  constraint notifications_body_check
    check (char_length(body) between 1 and 400 and public.notification_text_is_safe(body)),
  constraint notifications_subject_type_check
    check (subject_type ~ '^[a-z_]{1,40}$'),
  constraint notifications_idempotency_key_check
    check (idempotency_key ~ '^[a-z_]+:[A-Za-z0-9:_-]{1,180}$'),
  constraint notifications_recipient_idempotency_unique unique (recipient_id, idempotency_key)
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

comment on table public.notifications is
  'In-app notification inbox (W3). Written only by enqueue_notification(); the recipient reads own rows and marks them read via mark_notifications_read(). Not published to Realtime.';

-- -------------------------------------------------------------
-- 3) Guards (every session)
-- -------------------------------------------------------------
create or replace function public.notifications_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('washlink.notification_writer', true), '') <> 'on' then
    raise exception 'Notifications are written only by the server.' using errcode = '42501';
  end if;
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

create or replace function public.notifications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.read_at is null
     and new.read_at is not null
     and (to_jsonb(new) - 'read_at') = (to_jsonb(old) - 'read_at')
  then
    return new;
  end if;
  raise exception 'Notifications cannot be edited.' using errcode = '42501';
end;
$$;

revoke all on function public.notifications_guard_insert() from public, anon, authenticated, service_role;
revoke all on function public.notifications_guard_update() from public, anon, authenticated, service_role;

drop trigger if exists notifications_guard_insert on public.notifications;
create trigger notifications_guard_insert
  before insert on public.notifications
  for each row execute function public.notifications_guard_insert();

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function public.notifications_guard_update();

-- -------------------------------------------------------------
-- 4) Server-side writer (definer producers and trusted SQL only).
--    Null and no write when the recipient profile does not exist (cascade safety).
--    Idempotent: the first write for (recipient, key) wins; a repeat returns its id.
-- -------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_recipient_id uuid,
  p_category text,
  p_title text,
  p_body text,
  p_idempotency_key text,
  p_subject_type text default null,
  p_subject_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_id uuid;
begin
  if p_recipient_id is null
     or not exists (select 1 from public.profiles p where p.id = p_recipient_id) then
    return null;
  end if;
  perform set_config('washlink.notification_writer', 'on', true);
  insert into public.notifications (
    recipient_id, category, title, body, idempotency_key, subject_type, subject_id
  )
  values (
    p_recipient_id, p_category, p_title, p_body, p_idempotency_key, p_subject_type, p_subject_id
  )
  on conflict (recipient_id, idempotency_key) do nothing
  returning id into notification_id;
  perform set_config('washlink.notification_writer', 'off', true);
  if notification_id is null then
    select n.id into notification_id
    from public.notifications n
    where n.recipient_id = p_recipient_id and n.idempotency_key = p_idempotency_key;
  end if;
  return notification_id;
end;
$$;

revoke all on function public.enqueue_notification(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 5) Recipient: unread -> read. Null ids = every unread row of the caller.
--    Foreign or unknown ids are silently ignored (never revealed). Returns rows changed.
-- -------------------------------------------------------------
create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  changed_count integer;
begin
  if caller_id is null then
    raise exception 'Sign in to manage notifications.' using errcode = '42501';
  end if;
  if p_notification_ids is not null and cardinality(p_notification_ids) > 200 then
    raise exception 'Mark at most 200 notifications at a time.' using errcode = '22023';
  end if;
  update public.notifications n
  set read_at = now()
  where n.recipient_id = caller_id
    and n.read_at is null
    and (p_notification_ids is null or n.id = any(p_notification_ids));
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon, service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- -------------------------------------------------------------
-- 6) Privileges and RLS: personal inbox, recipient read only (no super_admin read).
-- -------------------------------------------------------------
alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated, service_role;
grant select on table public.notifications to authenticated;

drop policy if exists "notifications_select_recipient" on public.notifications;
create policy "notifications_select_recipient" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications_no_client_insert" on public.notifications;
create policy "notifications_no_client_insert" on public.notifications
  for insert to authenticated with check (false);
drop policy if exists "notifications_no_client_update" on public.notifications;
create policy "notifications_no_client_update" on public.notifications
  for update to authenticated using (false);
drop policy if exists "notifications_no_client_delete" on public.notifications;
create policy "notifications_no_client_delete" on public.notifications
  for delete to authenticated using (false);

-- -------------------------------------------------------------
-- 7) Realtime decision: never published (dropped if present; NOTICE on FOR ALL TABLES).
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise notice 'W3c: supabase_realtime is FOR ALL TABLES and includes notifications. Record in the D-10 diff.';
    return;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W3 rollbacks in reverse order d..a)
-- Inbox data loss (acceptable for a foundation table). Roll back w3d first (it calls these).
-- -------------------------------------------------------------
-- drop function if exists public.mark_notifications_read(uuid[]);
-- drop function if exists public.enqueue_notification(uuid, text, text, text, text, text, uuid);
-- drop table if exists public.notifications;   -- drops its triggers and policies
-- drop function if exists public.notifications_guard_update();
-- drop function if exists public.notifications_guard_insert();
-- drop function if exists public.notification_safe_label(text, text);
-- drop function if exists public.notification_text_is_safe(text);
