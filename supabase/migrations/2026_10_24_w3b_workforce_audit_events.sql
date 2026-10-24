-- =============================================================
-- WashLink W3b - append-only workforce audit trail (spec I auditability, R-4 part 1).
-- Requires 2026_10_24_w2a (is_trusted_db_session, current_user_profile_role) and w3a.
-- Idempotent.
--
-- P11: actor / subject are plain uuids (NO foreign keys), so deleting a user, shop or roster
--      row never nulls or removes history, and the table never takes part in cascades.
-- P12: rows are inserted only by record_workforce_audit_event(), which sets the
--      transaction-local flag washlink.audit_writer = on; a BEFORE INSERT trigger checks it
--      for every session (superuser and service_role included). No UPDATE ever; DELETE and
--      TRUNCATE only on the documented trusted retention path (docs/workforce/AUDIT_AND_NOTIFICATIONS.md).
-- P13: payloads carry identifiers, statuses and field NAMES only (CHECK below).
-- Not a tamper-proof or certified legal record (W3-L3): a DB superuser can disable triggers.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Payload rule (P13). Heuristic, not complete (R5): rejects contact-like keys, long or
--    free text, '@', phone-shaped strings, large numbers, deep nesting and big payloads.
-- -------------------------------------------------------------
create or replace function public.workforce_audit_payload_is_safe(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  with recursive node(key, value, depth) as (
    select null::text, p_payload, 1
    union all
    select child.key, child.value, node.depth + 1
    from node
    cross join lateral (
      select entry.key, entry.value
      from jsonb_each(case when jsonb_typeof(node.value) = 'object' then node.value else '{}'::jsonb end) entry
      union all
      select null::text, element.value
      from jsonb_array_elements(case when jsonb_typeof(node.value) = 'array' then node.value else '[]'::jsonb end) element
    ) child
    where node.depth <= 4
  )
  select p_payload is not null
    and octet_length(p_payload::text) <= 2048
    and not exists (
      select 1 from node
      where (jsonb_typeof(node.value) in ('object', 'array') and node.depth > 3)
         or (node.key is not null and node.key ~* '(phone|e_?mail|contact|address|note|password|token|secret|code|storage_path|document_path|body|message|text|clause|signature)')
         or (jsonb_typeof(node.value) = 'string' and (
               char_length(node.value #>> '{}') > 120
               or strpos(node.value #>> '{}', '@') > 0
               or regexp_replace(node.value #>> '{}', '[ ()-]', '', 'g') ~ '^\+?[0-9]{7,15}$'))
         or (jsonb_typeof(node.value) = 'number' and abs((node.value #>> '{}')::numeric) >= 1e6)
    );
$$;

revoke all on function public.workforce_audit_payload_is_safe(jsonb) from public, anon, service_role;
grant execute on function public.workforce_audit_payload_is_safe(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 2) Table
-- -------------------------------------------------------------
create table if not exists public.workforce_audit_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  actor_kind text not null,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  subject_profile_id uuid,
  payload jsonb not null default '{}'::jsonb,
  constraint workforce_audit_events_actor_kind_check
    check (actor_kind in ('user', 'trusted_session', 'system')),
  constraint workforce_audit_events_action_check
    check (char_length(action) <= 64 and action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  constraint workforce_audit_events_subject_type_check
    check (subject_type ~ '^[a-z_]{1,40}$'),
  constraint workforce_audit_events_payload_check
    check (jsonb_typeof(payload) = 'object' and public.workforce_audit_payload_is_safe(payload))
);

create index if not exists workforce_audit_events_created_at_idx
  on public.workforce_audit_events (created_at desc);
create index if not exists workforce_audit_events_subject_idx
  on public.workforce_audit_events (subject_type, subject_id, created_at desc);
create index if not exists workforce_audit_events_subject_profile_idx
  on public.workforce_audit_events (subject_profile_id, created_at desc)
  where subject_profile_id is not null;
create index if not exists workforce_audit_events_actor_idx
  on public.workforce_audit_events (actor_id, created_at desc)
  where actor_id is not null;
create index if not exists workforce_audit_events_action_idx
  on public.workforce_audit_events (action, created_at desc);

comment on table public.workforce_audit_events is
  'Append-only internal operational audit trail. No foreign keys by design (R-4: history survives account, shop and roster deletion). Not a tamper-proof or certified legal record (W3-L3).';

-- -------------------------------------------------------------
-- 3) Guards (every session; definer, revoked from every client role)
-- -------------------------------------------------------------
create or replace function public.workforce_audit_events_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('washlink.audit_writer', true), '') <> 'on' then
    raise exception 'Audit events are written only by the server.' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.workforce_audit_events_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Audit events are append-only.' using errcode = '42501';
end;
$$;

-- Row-level BEFORE DELETE and statement-level BEFORE TRUNCATE. Only the documented trusted
-- retention path passes: a trusted session (SQL editor / psql, not a PostgREST client) that
-- ran `set local washlink.audit_retention_purge = on` in the same transaction.
create or replace function public.workforce_audit_events_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_trusted_db_session()
          and coalesce(current_setting('washlink.audit_retention_purge', true), '') = 'on') then
    raise exception 'Audit events are append-only.' using errcode = '42501';
  end if;
  if tg_level = 'ROW' then
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.workforce_audit_events_guard_insert() from public, anon, authenticated, service_role;
revoke all on function public.workforce_audit_events_guard_update() from public, anon, authenticated, service_role;
revoke all on function public.workforce_audit_events_guard_delete() from public, anon, authenticated, service_role;

drop trigger if exists workforce_audit_events_guard_insert on public.workforce_audit_events;
create trigger workforce_audit_events_guard_insert
  before insert on public.workforce_audit_events
  for each row execute function public.workforce_audit_events_guard_insert();

drop trigger if exists workforce_audit_events_guard_update on public.workforce_audit_events;
create trigger workforce_audit_events_guard_update
  before update on public.workforce_audit_events
  for each row execute function public.workforce_audit_events_guard_update();

drop trigger if exists workforce_audit_events_guard_delete on public.workforce_audit_events;
create trigger workforce_audit_events_guard_delete
  before delete on public.workforce_audit_events
  for each row execute function public.workforce_audit_events_guard_delete();

drop trigger if exists workforce_audit_events_guard_truncate on public.workforce_audit_events;
create trigger workforce_audit_events_guard_truncate
  before truncate on public.workforce_audit_events
  for each statement execute function public.workforce_audit_events_guard_delete();

-- -------------------------------------------------------------
-- 4) The only writer. Actor fields are derived, never passed.
-- -------------------------------------------------------------
create or replace function public.record_workforce_audit_event(
  p_action text,
  p_subject_type text,
  p_subject_id uuid,
  p_subject_profile_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  new_event_id bigint;
begin
  perform set_config('washlink.audit_writer', 'on', true);
  insert into public.workforce_audit_events (
    actor_id, actor_role, actor_kind, action, subject_type, subject_id, subject_profile_id, payload
  )
  values (
    caller_id,
    public.current_user_profile_role(),
    case
      when caller_id is not null then 'user'
      when public.is_trusted_db_session() then 'trusted_session'
      else 'system'
    end,
    p_action,
    p_subject_type,
    p_subject_id,
    p_subject_profile_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into new_event_id;
  perform set_config('washlink.audit_writer', 'off', true);
  return new_event_id;
end;
$$;

revoke all on function public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 5) Privileges and RLS: super_admin read only (W11 adds redacted per-user functions).
-- -------------------------------------------------------------
alter table public.workforce_audit_events enable row level security;
revoke all on table public.workforce_audit_events from public, anon, authenticated, service_role;
grant select on table public.workforce_audit_events to authenticated;

do $$
declare
  id_sequence text := pg_get_serial_sequence('public.workforce_audit_events', 'id');
begin
  if id_sequence is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated, service_role', id_sequence);
  end if;
end $$;

drop policy if exists "wae_select_super_admin" on public.workforce_audit_events;
create policy "wae_select_super_admin" on public.workforce_audit_events
  for select to authenticated
  using (public.is_super_admin());

-- Explicit deny-all write policies (no client write privilege exists either).
drop policy if exists "wae_no_client_insert" on public.workforce_audit_events;
create policy "wae_no_client_insert" on public.workforce_audit_events
  for insert to authenticated with check (false);
drop policy if exists "wae_no_client_update" on public.workforce_audit_events;
create policy "wae_no_client_update" on public.workforce_audit_events
  for update to authenticated using (false);
drop policy if exists "wae_no_client_delete" on public.workforce_audit_events;
create policy "wae_no_client_delete" on public.workforce_audit_events
  for delete to authenticated using (false);

-- -------------------------------------------------------------
-- 6) Never streamed over Realtime (same pattern as w2f).
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise notice 'W3b: supabase_realtime is FOR ALL TABLES and includes workforce_audit_events. Record in the D-10 diff.';
    return;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workforce_audit_events'
  ) then
    alter publication supabase_realtime drop table public.workforce_audit_events;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W3 rollbacks in reverse order d..a)
-- IRREVERSIBLE AUDIT DATA LOSS: export first with a trusted
--   copy public.workforce_audit_events to '<file>' (or \copy in psql).
-- -------------------------------------------------------------
-- drop table if exists public.workforce_audit_events;   -- drops its triggers and policies
-- drop function if exists public.record_workforce_audit_event(text, text, uuid, uuid, jsonb);
-- drop function if exists public.workforce_audit_events_guard_delete();
-- drop function if exists public.workforce_audit_events_guard_update();
-- drop function if exists public.workforce_audit_events_guard_insert();
-- drop function if exists public.workforce_audit_payload_is_safe(jsonb);
