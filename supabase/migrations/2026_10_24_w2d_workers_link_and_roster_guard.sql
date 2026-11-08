-- =============================================================
-- WashLink W2d - roster (public.workers) account link and write guard
-- (closes S9, F6 DB part, C8 part 1). Requires 2026_10_24_w2a. Idempotent.
--
-- Roster link state: unlinked (user_id null) -> linked (worker accepts a link code,
-- W2e) -> unlinked (worker unlink_my_roster_entry(), or owner sets user_id null).
-- Nobody else can perform any transition.
-- =============================================================

-- -------------------------------------------------------------
-- 1) FK workers.user_id -> profiles(id), on delete set null (D-2 keep-and-link).
--    NOT VALID first so orphaned production rows do not block the migration (NOTICE).
-- -------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'public.workers'::regclass
      and con.contype = 'f'
      and att.attname = 'user_id'
  ) then
    alter table public.workers
      add constraint workers_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete set null
      not valid;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.workers'::regclass
      and conname = 'workers_user_id_fkey'
      and not convalidated
  ) then
    begin
      alter table public.workers validate constraint workers_user_id_fkey;
    exception when foreign_key_violation then
      raise notice 'W2d: workers.user_id has orphaned values; workers_user_id_fkey stays NOT VALID (new rows are enforced). Record in the D-10 diff.';
    end;
  end if;
end $$;

create index if not exists workers_user_id_idx on public.workers(user_id);

-- -------------------------------------------------------------
-- 2) One link per (owner, account). Skipped with a NOTICE if production already has
--    duplicates (R5); accept_roster_link_code() enforces it either way.
-- -------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.workers
    where user_id is not null
    group by owner_id, user_id
    having count(*) > 1
  ) then
    raise notice 'W2d: duplicate workers(owner_id, user_id) rows exist; workers_owner_user_unique NOT created (R5). Record in the D-10 diff.';
  else
    create unique index if not exists workers_owner_user_unique
      on public.workers(owner_id, user_id)
      where user_id is not null;
  end if;
end $$;

-- -------------------------------------------------------------
-- 3) S9 / C8: column rules for client writes (P2, P6).
--    INSERT: owner accounts only, always unlinked.
--    UPDATE: owner -> name, phone_number, is_available, user_id -> null;
--            linked worker -> is_available;
--            user_id null -> self or self -> null only inside the link RPCs
--            (flag washlink.roster_link = row id).
-- -------------------------------------------------------------
create or replace function public.guard_worker_roster_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  is_roster_owner boolean;
  is_linked_worker boolean;
  has_link_flag boolean;
  allowed_keys text[] := array['updated_at'];
  changed_keys text[];
begin
  if public.is_trusted_db_session() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(public.current_user_profile_role(), '') <> 'owner' then
      raise exception 'Only owner accounts can add roster workers.' using errcode = '42501';
    end if;
    if new.user_id is not null then
      raise exception 'Workers are linked only when the worker accepts a link code.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- S-B1: user_id -> null cascade (linked worker account deleted) and nothing else.
  if public.is_orphaned_fk_set_null('public.workers'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;

  is_roster_owner := caller_id is not null and old.owner_id = caller_id;
  is_linked_worker := caller_id is not null and old.user_id = caller_id;
  has_link_flag := coalesce(current_setting('washlink.roster_link', true), '') = old.id::text;

  if is_roster_owner then
    allowed_keys := allowed_keys || array['name', 'phone_number', 'is_available', 'user_id'];
  end if;
  if is_linked_worker then
    allowed_keys := allowed_keys || array['is_available'];
  end if;
  if has_link_flag then
    allowed_keys := allowed_keys || array['user_id'];
  end if;

  select coalesce(array_agg(entry.key), '{}') into changed_keys
  from jsonb_each(to_jsonb(new)) entry
  where entry.value is distinct from (to_jsonb(old) -> entry.key);

  if not (changed_keys <@ allowed_keys) then
    raise exception 'This roster field cannot be changed.' using errcode = '42501';
  end if;

  if new.user_id is distinct from old.user_id then
    if not (
      (has_link_flag and old.user_id is null and new.user_id = caller_id)
      or (has_link_flag and old.user_id = caller_id and new.user_id is null)
      or (is_roster_owner and new.user_id is null)
    ) then
      raise exception 'Workers are linked only when the worker accepts a link code.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_worker_roster_write() from public, anon, authenticated;

drop trigger if exists workers_guard_write on public.workers;
create trigger workers_guard_write
  before insert or update on public.workers
  for each row
  execute function public.guard_worker_roster_write();

-- -------------------------------------------------------------
-- 4) Roster-entry RPCs for the linked worker (moved here from w2e in fix cycle 1 to keep
--    files <= 350 lines; they need only public.workers / public.shops and the guard above).
--    Approved + active shop names of an owner (link-code preview and roster list).
-- -------------------------------------------------------------
create or replace function public.approved_shop_names_for_owner(p_owner_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(s.name order by s.name), '{}')
  from public.shops s
  where s.owner_id = p_owner_id and s.is_active and s.verification_status = 'approved';
$$;

revoke all on function public.approved_shop_names_for_owner(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Worker: unlink one of the caller's own roster entries.
-- -------------------------------------------------------------
create or replace function public.unlink_my_roster_entry(p_worker_row_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.workers w where w.id = p_worker_row_id and w.user_id = auth.uid()
  ) then
    raise exception 'Roster entry not found.' using errcode = '42501';
  end if;
  perform set_config('washlink.roster_link', p_worker_row_id::text, true);
  update public.workers set user_id = null where id = p_worker_row_id;
  perform set_config('washlink.roster_link', '', true);
end;
$$;

-- -------------------------------------------------------------
-- Worker: every roster entry linked to the caller (replaces the F6 `.single()` lookup).
-- -------------------------------------------------------------
create or replace function public.list_my_roster_links()
returns table (
  worker_row_id uuid,
  roster_display_name text,
  is_available boolean,
  owner_shop_names text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.name, w.is_available, public.approved_shop_names_for_owner(w.owner_id)
  from public.workers w
  where auth.uid() is not null and w.user_id = auth.uid()
  order by w.created_at, w.id;
$$;

revoke all on function public.unlink_my_roster_entry(uuid) from public, anon;
revoke all on function public.list_my_roster_links() from public, anon;
grant execute on function public.unlink_my_roster_entry(uuid) to authenticated;
grant execute on function public.list_my_roster_links() to authenticated;

comment on table public.workers is
  'Shop roster for booking assignment. A row or link is not a contract, employment or worker-owner relationship (W0-L7, C8).';

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W2 rollbacks in reverse order f..a)
-- -------------------------------------------------------------
-- drop function if exists public.list_my_roster_links();
-- drop function if exists public.unlink_my_roster_entry(uuid);
-- drop function if exists public.approved_shop_names_for_owner(uuid);
-- comment on table public.workers is null;
-- drop trigger if exists workers_guard_write on public.workers;
-- drop function if exists public.guard_worker_roster_write();
-- drop index if exists public.workers_owner_user_unique;
-- alter table public.workers drop constraint if exists workers_user_id_fkey;
-- -- workers_user_id_idx existed before W2 on the local baseline; keep it.
