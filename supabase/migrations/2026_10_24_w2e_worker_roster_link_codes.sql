-- =============================================================
-- WashLink W2e - consent-based roster linking with one-time link codes (C8, F6).
-- Requires 2026_10_24_w2a and w2d (w2d also holds unlink_my_roster_entry, list_my_roster_links
-- and approved_shop_names_for_owner). Idempotent.
--
-- Link code state: active -> consumed (worker accepts) | revoked (owner issues a new code;
-- row deleted via cascade) | expired (derived: now() > expires_at). Only the RPCs below
-- perform transitions. Codes are 12 upper-case hex chars (48 bit, from gen_random_uuid,
-- no pgcrypto, P7), valid 72 h, single use. Only sha256(pepper || ':' || code) is stored
-- (fix cycle 1): the pepper is one server-side random secret (244 bit, two
-- gen_random_uuid values) in washlink_private.roster_link_code_pepper, which no client
-- role can read, so a leaked code_hash column cannot be brute-forced offline without the
-- pepper too. A pepper (not a per-row salt) keeps the hash an exact-match unique-index
-- lookup. Rotating the pepper invalidates every active code (owners issue new ones).
-- Rate limits (R8), per rolling hour: 5 failed attempts per user, 10 lookups of the same
-- code hash by anyone; checked under a per-user advisory lock; rows older than the
-- window are pruned. A link is not a contract, employment or worker-owner relationship
-- (W0-L7).
-- =============================================================

-- Private, non-API schema for server-side secrets (not in PostgREST's exposed schemas).
create schema if not exists washlink_private;
revoke all on schema washlink_private from public, anon, authenticated;

create table if not exists washlink_private.roster_link_code_pepper (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  pepper text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_link_code_pepper_singleton_check check (singleton),
  constraint roster_link_code_pepper_singleton_unique unique (singleton),
  constraint roster_link_code_pepper_length check (char_length(pepper) >= 64)
);

alter table washlink_private.roster_link_code_pepper enable row level security;
revoke all on table washlink_private.roster_link_code_pepper from public, anon, authenticated;

insert into washlink_private.roster_link_code_pepper (pepper)
select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from washlink_private.roster_link_code_pepper);

create table if not exists public.worker_roster_link_codes (
  id uuid primary key default gen_random_uuid(),
  worker_row_id uuid not null references public.workers(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_roster_link_codes_not_consumed_and_revoked
    check (not (consumed_at is not null and revoked_at is not null)),
  constraint worker_roster_link_codes_consumed_by_with_consumed_at
    check (consumed_by is null or consumed_at is not null)
);

create unique index if not exists worker_roster_link_codes_one_active_per_row
  on public.worker_roster_link_codes(worker_row_id)
  where consumed_at is null and revoked_at is null;
create index if not exists worker_roster_link_codes_owner_id_idx
  on public.worker_roster_link_codes(owner_id);
create index if not exists worker_roster_link_codes_consumed_by_idx
  on public.worker_roster_link_codes(consumed_by);

create table if not exists public.worker_roster_link_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Peppered hash of the code that was tried (null only for rows from before fix cycle 1).
alter table public.worker_roster_link_attempts add column if not exists code_hash bytea;

create index if not exists worker_roster_link_attempts_user_time_idx
  on public.worker_roster_link_attempts(user_id, attempted_at);
create index if not exists worker_roster_link_attempts_code_time_idx
  on public.worker_roster_link_attempts(code_hash, attempted_at);
create index if not exists worker_roster_link_attempts_time_idx
  on public.worker_roster_link_attempts(attempted_at);

-- RPC-only tables: RLS on, explicit deny-all policies, no client privileges.
alter table public.worker_roster_link_codes enable row level security;
alter table public.worker_roster_link_attempts enable row level security;
revoke all on table public.worker_roster_link_codes from anon, authenticated;
revoke all on table public.worker_roster_link_attempts from anon, authenticated;

do $$
declare
  target text;
  policy_base text;
  command text;
begin
  foreach target in array array[
    'public.worker_roster_link_codes',
    'public.worker_roster_link_attempts',
    'washlink_private.roster_link_code_pepper'
  ] loop
    policy_base := split_part(target, '.', 2) || '_no_client_';
    foreach command in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on %s', policy_base || command, target);
      if command = 'insert' then
        execute format('create policy %I on %s for insert to authenticated with check (false)',
                       policy_base || command, target);
      else
        execute format('create policy %I on %s for %s to authenticated using (false)',
                       policy_base || command, target, command);
      end if;
    end loop;
  end loop;
end $$;

-- -------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- -------------------------------------------------------------
-- Stable (reads the pepper); returns null if the pepper row is missing, so issuing fails
-- (code_hash not null) and every lookup misses: fails closed.
create or replace function public.roster_link_code_hash(p_code text)
returns bytea
language sql
stable
security definer
set search_path = public
as $$
  select sha256(convert_to(
    p.pepper || ':' || upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')),
    'UTF8'))
  from washlink_private.roster_link_code_pepper p
  where p.singleton;
$$;

create or replace function public.require_worker_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'worker' then
    raise exception 'Only worker accounts can link to a shop roster.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Fix cycle 1: replaced by roster_link_check_rate_limit(uuid, bytea).
drop function if exists public.roster_link_is_rate_limited(uuid);

-- Takes a per-user transaction advisory lock first, so parallel calls of one user are
-- serialised until commit (count + attempt insert cannot interleave). Prunes a bounded
-- batch of rows older than the window (skip locked: no contention between users).
create or replace function public.roster_link_check_rate_limit(p_user_id uuid, p_code_hash bytea)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('washlink.roster_link_attempts:' || p_user_id::text, 0));
  delete from public.worker_roster_link_attempts old_attempt
  where old_attempt.id in (
    select a.id from public.worker_roster_link_attempts a
    where a.attempted_at <= now() - interval '1 hour'
    order by a.attempted_at
    limit 500
    for update skip locked
  );
  return (
    select count(*) >= 5
    from public.worker_roster_link_attempts a
    where a.user_id = p_user_id and not a.succeeded and a.attempted_at > now() - interval '1 hour'
  ) or (
    select count(*) >= 10
    from public.worker_roster_link_attempts a
    where p_code_hash is not null and a.code_hash = p_code_hash
      and a.attempted_at > now() - interval '1 hour'
  );
end;
$$;

revoke all on function public.roster_link_code_hash(text) from public, anon, authenticated;
revoke all on function public.require_worker_caller() from public, anon, authenticated;
revoke all on function public.roster_link_check_rate_limit(uuid, bytea) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Owner: issue a code for an unlinked roster row (revokes older active codes).
-- -------------------------------------------------------------
create or replace function public.create_roster_link_code(p_worker_row_id uuid)
returns table (link_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  roster_row public.workers;
  new_code text := upper(left(replace(gen_random_uuid()::text, '-', ''), 12));
  new_expiry timestamptz := now() + interval '72 hours';
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'owner' then
    raise exception 'Only owner accounts can issue roster link codes.' using errcode = '42501';
  end if;
  select * into roster_row from public.workers w
  where w.id = p_worker_row_id and w.owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Roster worker not found.' using errcode = '42501';
  end if;
  if roster_row.user_id is not null then
    raise exception 'This roster worker is already linked to an account.';
  end if;
  update public.worker_roster_link_codes c
  set revoked_at = now(), updated_at = now()
  where c.worker_row_id = p_worker_row_id and c.consumed_at is null and c.revoked_at is null;
  insert into public.worker_roster_link_codes (worker_row_id, owner_id, code_hash, expires_at)
  values (p_worker_row_id, auth.uid(), public.roster_link_code_hash(new_code), new_expiry);
  return query select new_code, new_expiry;
end;
$$;

-- -------------------------------------------------------------
-- Worker: preview a code (never raises on a bad code, so the attempt row persists).
-- -------------------------------------------------------------
create or replace function public.preview_roster_link_code(p_code text)
returns table (result text, roster_display_name text, owner_shop_names text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := public.require_worker_caller();
  attempted_hash bytea := public.roster_link_code_hash(p_code);
  code_row public.worker_roster_link_codes;
  roster_row public.workers;
begin
  if public.roster_link_check_rate_limit(caller_id, attempted_hash) then
    return query select 'rate_limited'::text, null::text, null::text[];
    return;
  end if;
  select c.* into code_row from public.worker_roster_link_codes c
  where c.code_hash = attempted_hash
    and c.consumed_at is null and c.revoked_at is null and c.expires_at > now();
  if found then
    select * into roster_row from public.workers w
    where w.id = code_row.worker_row_id and w.user_id is null;
  end if;
  if code_row.id is null or roster_row.id is null then
    insert into public.worker_roster_link_attempts (user_id, succeeded, code_hash)
    values (caller_id, false, attempted_hash);
    return query select 'invalid_or_expired'::text, null::text, null::text[];
    return;
  end if;
  insert into public.worker_roster_link_attempts (user_id, succeeded, code_hash)
  values (caller_id, true, attempted_hash);
  if exists (select 1 from public.workers w
             where w.owner_id = code_row.owner_id and w.user_id = caller_id) then
    return query select 'already_linked_to_owner'::text, null::text, null::text[];
    return;
  end if;
  return query select 'valid'::text, roster_row.name,
                      public.approved_shop_names_for_owner(code_row.owner_id);
end;
$$;

-- -------------------------------------------------------------
-- Worker: accept a code (explicit consent). Links the roster row to the caller.
-- -------------------------------------------------------------
create or replace function public.accept_roster_link_code(p_code text)
returns table (result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := public.require_worker_caller();
  attempted_hash bytea := public.roster_link_code_hash(p_code);
  code_row public.worker_roster_link_codes;
  roster_row public.workers;
begin
  if public.roster_link_check_rate_limit(caller_id, attempted_hash) then
    return query select 'rate_limited'::text;
    return;
  end if;
  select c.* into code_row from public.worker_roster_link_codes c
  where c.code_hash = attempted_hash
    and c.consumed_at is null and c.revoked_at is null and c.expires_at > now()
  for update;
  if found then
    select * into roster_row from public.workers w
    where w.id = code_row.worker_row_id and w.user_id is null
    for update;
  end if;
  if code_row.id is null or roster_row.id is null then
    insert into public.worker_roster_link_attempts (user_id, succeeded, code_hash)
    values (caller_id, false, attempted_hash);
    return query select 'invalid_or_expired'::text;
    return;
  end if;
  insert into public.worker_roster_link_attempts (user_id, succeeded, code_hash)
  values (caller_id, true, attempted_hash);
  if exists (select 1 from public.workers w
             where w.owner_id = code_row.owner_id and w.user_id = caller_id) then
    return query select 'already_linked_to_owner'::text;
    return;
  end if;
  perform set_config('washlink.roster_link', roster_row.id::text, true);
  update public.workers set user_id = caller_id where id = roster_row.id;
  perform set_config('washlink.roster_link', '', true);
  update public.worker_roster_link_codes
  set consumed_at = now(), consumed_by = caller_id, updated_at = now()
  where id = code_row.id;
  return query select 'linked'::text;
end;
$$;

revoke all on function public.create_roster_link_code(uuid) from public, anon;
revoke all on function public.preview_roster_link_code(text) from public, anon;
revoke all on function public.accept_roster_link_code(text) from public, anon;
grant execute on function public.create_roster_link_code(uuid) to authenticated;
grant execute on function public.preview_roster_link_code(text) to authenticated;
grant execute on function public.accept_roster_link_code(text) to authenticated;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W2 rollbacks in reverse order f..a)
-- Links already made stay as workers.user_id values (harmless).
-- -------------------------------------------------------------
-- drop function if exists public.accept_roster_link_code(text);
-- drop function if exists public.preview_roster_link_code(text);
-- drop function if exists public.create_roster_link_code(uuid);
-- drop function if exists public.roster_link_check_rate_limit(uuid, bytea);
-- drop function if exists public.require_worker_caller();
-- drop function if exists public.roster_link_code_hash(text);
-- drop table if exists public.worker_roster_link_attempts;
-- drop table if exists public.worker_roster_link_codes;
-- drop table if exists washlink_private.roster_link_code_pepper;   -- destroys the pepper
-- drop schema if exists washlink_private;                          -- only if now empty
