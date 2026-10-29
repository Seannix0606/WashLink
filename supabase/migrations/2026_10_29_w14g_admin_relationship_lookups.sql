-- =============================================================
-- WashLink W14g - audited super_admin relationship lookups (spec H, I; D-38 outside disputes; D-55; W14 PLAN 3.7, P77,
-- P78). Requires w3b, w10c..w10f, w14a. Idempotent.
-- admin_access_records: one row per lookup with a fixed purpose and a 20..300 note. subject_profile_id has NO FK (P11:
-- the record outlives the subject). Insert-only under washlink.admin_access_write = <row id>; never updated (except the
-- FK set null of a removed administrator); deleted only on the trusted retention path (W3 rule). Deny-all RLS for every
-- client role incl. super_admin; reads only through admin_workforce_audit_log (w14h). Not in Realtime.
-- admin_worker_relationships / admin_owner_relationships (VOLATILE; super_admin): the relationship rows are read first
-- (the row count goes into the record), then the access record and the admin_access.relationships_viewed audit row are
-- written in the SAME transaction before anything is returned; an audit failure aborts the call and returns nothing. An
-- unknown or wrong-role id returns {found:false} and is still recorded (no unaudited existence oracle). No contract text;
-- the owner lookup carries no worker count, minimum or other owners. The person looked up is not notified; they see the
-- event in "Your activity" with the generic purpose washlink_review (N7; my_workforce_activity, w14h).
-- The current minimum is NOT part of the worker lookup: only the W10 reads and setter may reference workforce_policies
-- (pinned by j16_only_w10_reads_and_setter_reference_workforce_policies); the super_admin console reads the minimum through
-- the W10 wp_select_super_admin policy (Policies tab).
-- =============================================================

create table if not exists public.admin_access_records (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  access_kind text not null,
  subject_profile_id uuid not null,
  purpose text not null,
  note text not null,
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aar_access_kind_check check (access_kind in ('worker_relationships', 'owner_relationships')),
  constraint aar_purpose_check check (purpose in ('party_support_request', 'reported_problem_follow_up', 'moderation_follow_up',
                                                  'policy_monitoring', 'legal_or_regulatory_request')),
  constraint aar_note_length check (char_length(note) between 20 and 300),
  constraint aar_row_count_check check (row_count >= 0)
);
create index if not exists admin_access_records_subject_idx on public.admin_access_records (subject_profile_id, created_at desc);
create index if not exists admin_access_records_admin_idx on public.admin_access_records (admin_id, created_at desc);
create index if not exists admin_access_records_created_idx on public.admin_access_records (created_at desc);
comment on table public.admin_access_records is
  'W14: one row per super_admin relationship lookup outside a dispute (D-38, D-55), with the stated purpose and note. Append-only; no FK on subject_profile_id (P11).';

create or replace function public.admin_access_records_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if public.is_trusted_db_session() and coalesce(current_setting('washlink.audit_retention_purge', true), '') = 'on' then
      return old;   -- documented trusted retention path (W3)
    end if;
    raise exception 'Access records are append-only.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.admin_access_records'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- the administrator account was removed; the record stays
    end if;
    raise exception 'Access records are append-only.' using errcode = '42501';
  end if;
  if coalesce(current_setting('washlink.admin_access_write', true), '') is distinct from new.id::text then
    raise exception 'Access records are written only by the WashLink lookup actions.' using errcode = '42501';
  end if;
  new.admin_id := auth.uid();
  new.note := btrim(new.note);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.admin_access_records_guard_write() from public, anon, authenticated, service_role;
drop trigger if exists admin_access_records_guard_write on public.admin_access_records;
create trigger admin_access_records_guard_write
  before insert or update or delete on public.admin_access_records
  for each row execute function public.admin_access_records_guard_write();

alter table public.admin_access_records enable row level security;
revoke all on table public.admin_access_records from public, anon, authenticated, service_role;
grant select on table public.admin_access_records to authenticated;
drop policy if exists "admin_access_records_no_client_select" on public.admin_access_records;
create policy "admin_access_records_no_client_select" on public.admin_access_records for select to authenticated using (false);
drop policy if exists "admin_access_records_no_client_insert" on public.admin_access_records;
create policy "admin_access_records_no_client_insert" on public.admin_access_records for insert to authenticated with check (false);
drop policy if exists "admin_access_records_no_client_update" on public.admin_access_records;
create policy "admin_access_records_no_client_update" on public.admin_access_records for update to authenticated using (false);
drop policy if exists "admin_access_records_no_client_delete" on public.admin_access_records;
create policy "admin_access_records_no_client_delete" on public.admin_access_records for delete to authenticated using (false);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W14g: supabase_realtime is FOR ALL TABLES and would publish admin_access_records (D-10 diff). Aborting.';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename = 'admin_access_records') then
    alter publication supabase_realtime drop table public.admin_access_records;
  end if;
end $$;

-- -------------------------------------------------------------
-- Internal: validate, record the access and audit it (the one shared path of both lookups). Returns the record id.
-- -------------------------------------------------------------
create or replace function public.admin_access_record_lookup(p_access_kind text, p_subject uuid, p_purpose text, p_note text, p_row_count integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_note text := nullif(btrim(p_note), '');
  new_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can look up relationships.' using errcode = '42501';
  end if;
  if p_purpose is null or p_purpose not in ('party_support_request', 'reported_problem_follow_up', 'moderation_follow_up',
                                            'policy_monitoring', 'legal_or_regulatory_request') then
    raise exception 'Choose a purpose for this lookup.' using errcode = '22023';
  end if;
  if clean_note is null or char_length(clean_note) not between 20 and 300 then
    raise exception 'Write a note of 20 to 300 characters.' using errcode = '23514';
  end if;
  if p_subject is null then
    raise exception 'Choose a person to look up.' using errcode = '22023';
  end if;
  perform set_config('washlink.admin_access_write', new_id::text, true);
  insert into public.admin_access_records (id, access_kind, subject_profile_id, purpose, note, row_count)
  values (new_id, p_access_kind, p_subject, p_purpose, clean_note, p_row_count);
  perform set_config('washlink.admin_access_write', '', true);
  perform public.record_workforce_audit_event('admin_access.relationships_viewed', 'profile', p_subject, p_subject,
    jsonb_build_object('access_record_id', new_id, 'access_kind', p_access_kind, 'purpose', p_purpose, 'row_count', p_row_count));
  return new_id;
end;
$$;

create or replace function public.admin_worker_relationships(p_worker_id uuid, p_purpose text, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  is_worker boolean;
  rows_json jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can look up relationships.' using errcode = '42501';
  end if;
  is_worker := exists (select 1 from public.profiles p where p.id = p_worker_id and p.role::text = 'worker');
  select coalesce(jsonb_agg(jsonb_build_object('relationship_id', r.id, 'owner_name_snapshot', r.owner_name_snapshot,
           'owner_present', r.owner_id is not null and exists (select 1 from public.profiles p where p.id = r.owner_id),
           'status', coalesce(l.status, r.status), 'status_reason', coalesce(l.status_reason, r.status_reason),
           'counts_toward_goal', coalesce(l.status, r.status) = 'active',
           'qualifying_contract_count', coalesce(l.qualifying_contract_count, r.qualifying_contract_count),
           'first_accepted_at', r.first_accepted_at, 'last_active_at', r.last_active_at, 'ended_at', r.ended_at)
           order by r.first_accepted_at, r.id), '[]'::jsonb)
  into rows_json
  from public.worker_owner_relationships r
  left join lateral (select d.* from public.worker_owner_relationship_derive(r.worker_id, r.owner_id, null) d
                     where r.owner_id is not null and d.has_accepted_contract) l on true
  where is_worker and r.worker_id = p_worker_id;
  perform public.admin_access_record_lookup('worker_relationships', p_worker_id, p_purpose, p_note, jsonb_array_length(rows_json));
  if not is_worker then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true,
    'worker_display_name', (select coalesce(nullif(btrim(p.full_name), ''), 'Worker') from public.profiles p where p.id = p_worker_id),
    'distinct_qualifying_owner_count', public.worker_distinct_qualifying_owner_count(p_worker_id, null),
    'relationships', rows_json);
end;
$$;

create or replace function public.admin_owner_relationships(p_owner_id uuid, p_purpose text, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  is_owner boolean;
  rows_json jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can look up relationships.' using errcode = '42501';
  end if;
  is_owner := exists (select 1 from public.profiles p where p.id = p_owner_id and p.role::text = 'owner');
  select coalesce(jsonb_agg(jsonb_build_object('relationship_id', r.id, 'worker_name_snapshot', r.worker_name_snapshot,
           'status', coalesce(l.status, r.status), 'status_reason', coalesce(l.status_reason, r.status_reason),
           'counts_toward_goal', coalesce(l.status, r.status) = 'active',
           'qualifying_contract_count', coalesce(l.qualifying_contract_count, r.qualifying_contract_count),
           'first_accepted_at', r.first_accepted_at, 'last_active_at', r.last_active_at, 'ended_at', r.ended_at)
           order by r.first_accepted_at, r.id), '[]'::jsonb)
  into rows_json
  from public.worker_owner_relationships r
  left join lateral (select d.* from public.worker_owner_relationship_derive(r.worker_id, r.owner_id, null) d
                     where d.has_accepted_contract) l on true
  where is_owner and r.owner_id = p_owner_id;
  perform public.admin_access_record_lookup('owner_relationships', p_owner_id, p_purpose, p_note, jsonb_array_length(rows_json));
  if not is_owner then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true,
    'owner_display_name', (select coalesce(nullif(btrim(p.full_name), ''), 'Owner') from public.profiles p where p.id = p_owner_id),
    'relationships', rows_json);
end;
$$;

revoke all on function public.admin_access_record_lookup(text, uuid, text, text, integer) from public, anon, authenticated, service_role;
do $$
declare
  sig text;
begin
  foreach sig in array array['admin_worker_relationships(uuid, text, text)', 'admin_owner_relationships(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a; roll back w14h first)
-- IRREVERSIBLE LOSS of the lookup records: export first with a trusted copy public.admin_access_records to '<file>'.
-- The admin_access.relationships_viewed audit rows stay (append-only, P11).
-- -------------------------------------------------------------
-- drop function if exists public.admin_owner_relationships(uuid, text, text);
-- drop function if exists public.admin_worker_relationships(uuid, text, text);
-- drop function if exists public.admin_access_record_lookup(text, uuid, text, text, integer);
-- drop table if exists public.admin_access_records;   -- drops its guard trigger, policies and indexes
-- drop function if exists public.admin_access_records_guard_write();
