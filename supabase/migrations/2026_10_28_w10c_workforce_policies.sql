-- =============================================================
-- WashLink W10c - workforce policies (W10 PLAN 3.3, P59, P60; D-3, D-37; spec F). Requires w2a, w3b, w8c, w9j, w10a.
-- Idempotent.
-- One row per policy key. Seeded `minimum_distinct_owners = 3` with `on conflict do nothing` (never overwrites a
-- changed value). enforcement is fixed to 'informational' by CHECK (any other value needs a new migration and legal
-- review, spec F); default_value (3) is immutable. Changes only through set_workforce_policy_value by a super_admin
-- (JWT + profile role) with the expected revision and a reason (10..300, stored as last_change_reason, never in the
-- audit payload); a trusted no-JWT SQL session may also update (audited trusted_session). No delete, no client insert.
-- Only a super_admin selects the table; workers see the minimum through my_owner_relationship_progress (w10f). No W9
-- path and no W10 trigger reads it.
-- =============================================================

create table if not exists public.workforce_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  integer_value integer not null,
  default_value integer not null,
  enforcement text not null default 'informational',
  description text not null,
  revision integer not null default 1,
  last_change_reason text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wp_policy_key_unique unique (policy_key),
  constraint wp_policy_key_check check (policy_key in ('minimum_distinct_owners')),
  constraint wp_enforcement_check check (enforcement = 'informational'),
  constraint wp_description_length check (char_length(description) between 20 and 300),
  constraint wp_revision_check check (revision >= 1),
  constraint wp_change_reason_length check (last_change_reason is null or char_length(last_change_reason) between 10 and 300),
  constraint wp_minimum_owner_range check (policy_key <> 'minimum_distinct_owners'
                                           or (integer_value between 1 and 10 and default_value = 3))
);
create index if not exists workforce_policies_updated_by_idx on public.workforce_policies (updated_by);
comment on table public.workforce_policies is
  'W10: platform workforce policies (D-37). minimum_distinct_owners is an informational progress goal shown to workers (D-3); enforcement is fixed to informational. Changed only by a platform administrator through set_workforce_policy_value (audited).';

-- -------------------------------------------------------------
-- 1) Guard (definer; every session)
-- -------------------------------------------------------------
create or replace function public.workforce_policies_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trusted boolean := public.is_trusted_db_session() and auth.uid() is null;
begin
  if tg_op = 'DELETE' then
    raise exception 'Workforce policies cannot be deleted.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if not trusted then
      raise exception 'Workforce policies are changed only by a platform administrator.' using errcode = '42501';
    end if;
    new.revision := 1;
    new.updated_by := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if public.is_orphaned_fk_set_null('public.workforce_policies'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- the administrator who made the last change was removed
  end if;
  if not trusted and coalesce(current_setting('washlink.workforce_policy_write', true), '') is distinct from old.id::text then
    raise exception 'Workforce policies are changed only by a platform administrator.' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.policy_key is distinct from old.policy_key or new.default_value is distinct from old.default_value
     or new.enforcement is distinct from old.enforcement or new.created_at is distinct from old.created_at then
    raise exception 'This part of a workforce policy cannot be changed.' using errcode = '42501';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.workforce_policies_guard_write() from public, anon, authenticated, service_role;
drop trigger if exists workforce_policies_guard_write on public.workforce_policies;
create trigger workforce_policies_guard_write
  before insert or update or delete on public.workforce_policies
  for each row execute function public.workforce_policies_guard_write();

-- -------------------------------------------------------------
-- 2) Seed (never overwrites; runs as the migration's trusted session)
-- -------------------------------------------------------------
insert into public.workforce_policies (policy_key, integer_value, default_value, enforcement, description)
values ('minimum_distinct_owners', 3, 3, 'informational',
        'Number of different verified shop owners with an active contract that WashLink shows to workers as a progress goal. Informational only.')
on conflict (policy_key) do nothing;

-- -------------------------------------------------------------
-- 3) RLS: only a super_admin reads the table (it holds last_change_reason and updated_by, P61); workers get the
--    minimum through the definer read my_owner_relationship_progress (w10f). Nobody writes directly.
-- -------------------------------------------------------------
alter table public.workforce_policies enable row level security;
revoke all on table public.workforce_policies from public, anon, authenticated, service_role;
grant select on table public.workforce_policies to authenticated;
drop policy if exists "wp_select_signed_in" on public.workforce_policies;
drop policy if exists "wp_select_super_admin" on public.workforce_policies;
create policy "wp_select_super_admin" on public.workforce_policies
  for select to authenticated using (auth.uid() is not null and public.is_super_admin());
drop policy if exists "workforce_policies_no_client_insert" on public.workforce_policies;
create policy "workforce_policies_no_client_insert" on public.workforce_policies for insert to authenticated with check (false);
drop policy if exists "workforce_policies_no_client_update" on public.workforce_policies;
create policy "workforce_policies_no_client_update" on public.workforce_policies for update to authenticated using (false);
drop policy if exists "workforce_policies_no_client_delete" on public.workforce_policies;
create policy "workforce_policies_no_client_delete" on public.workforce_policies for delete to authenticated using (false);

-- -------------------------------------------------------------
-- 4) The only client write: super_admin, expected revision, reason.
-- -------------------------------------------------------------
create or replace function public.set_workforce_policy_value(p_policy_key text, p_new_value integer, p_expected_revision integer,
                                                             p_change_reason text)
returns public.workforce_policies
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.workforce_policies;
  reason text := public.contract_template_normalize_text(p_change_reason);
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Only a platform administrator can change workforce policies.' using errcode = '42501';
  end if;
  select * into p from public.workforce_policies where policy_key = p_policy_key for update;
  if p.id is null then
    raise exception 'Unknown workforce policy.' using errcode = '22023';
  end if;
  if p_expected_revision is distinct from p.revision then
    raise exception 'This policy changed. Reload it and try again.' using errcode = '55000';
  end if;
  if p_new_value is null or p_new_value not between 1 and 10 then
    raise exception 'Choose a whole number from 1 to 10.' using errcode = '23514';
  end if;
  if coalesce(char_length(reason), 0) not between 10 and 300 then
    raise exception 'Give a reason of 10 to 300 characters.' using errcode = '23514';
  end if;
  if p_new_value = p.integer_value then
    raise exception 'This is already the current value.' using errcode = '23514';
  end if;
  perform set_config('washlink.workforce_policy_write', p.id::text, true);
  update public.workforce_policies set integer_value = p_new_value, last_change_reason = reason where id = p.id returning * into p;
  perform set_config('washlink.workforce_policy_write', '', true);
  return p;
end;
$$;

revoke all on function public.set_workforce_policy_value(text, integer, integer, text) from public, anon, service_role;
grant execute on function public.set_workforce_policy_value(text, integer, integer, text) to authenticated;

-- -------------------------------------------------------------
-- 5) Audit producer (W3 rules): value changes only; the reason text never enters the payload.
-- -------------------------------------------------------------
create or replace function public.workforce_policies_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.record_workforce_audit_event('workforce_policy.changed', 'workforce_policy', new.id, null,
    jsonb_build_object('policy_key', new.policy_key, 'from_value', old.integer_value, 'to_value', new.integer_value,
                       'revision', new.revision, 'changed_by', public.worker_contract_changed_by()));
  return null;
end;
$$;

revoke all on function public.workforce_policies_audit() from public, anon, authenticated, service_role;
drop trigger if exists workforce_policies_audit on public.workforce_policies;
create trigger workforce_policies_audit
  after update on public.workforce_policies
  for each row when (old.integer_value is distinct from new.integer_value)
  execute function public.workforce_policies_audit();

-- -------------------------------------------------------------
-- 6) Realtime: never published (w9i pattern).
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W10c: supabase_realtime is FOR ALL TABLES and would publish workforce_policies (D-10 diff). Aborting.';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename = 'workforce_policies') then
    alter publication supabase_realtime drop table public.workforce_policies;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W10 rollbacks in reverse order g..a)
-- IRREVERSIBLE loss of a changed value and its reason (the audit keeps from / to values): export first with a trusted
--   copy public.workforce_policies to '<file>'. Roll back w10f first (my_owner_relationship_progress reads the table).
-- -------------------------------------------------------------
-- drop trigger if exists workforce_policies_audit on public.workforce_policies;
-- drop function if exists public.workforce_policies_audit();
-- drop function if exists public.set_workforce_policy_value(text, integer, integer, text);
-- drop table if exists public.workforce_policies;   -- drops its guard trigger, policies and indexes
-- drop function if exists public.workforce_policies_guard_write();
