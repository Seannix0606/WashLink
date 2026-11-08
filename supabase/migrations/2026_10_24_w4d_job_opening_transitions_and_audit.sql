-- =============================================================
-- WashLink W4d - job opening lifecycle RPC and audit producer (spec B, A, I; W4 PLAN P15, P17).
-- Requires 2026_10_24_w3b (record_workforce_audit_event), w4b, w4c. Idempotent.
--
-- Lifecycle (the only end-user path; super_admin included, no exceptions):
--   draft -> published        owning owner; verified shop (P15), no missing fields,
--                             deadline null or >= today (Asia/Manila)
--   published -> paused       owning owner
--   paused -> published       owning owner; same conditions as publish
--   published | paused -> closed   owning owner
--   closed -> archived        owning owner
--   draft -> (deleted)        owning owner, DELETE (w4c policy + guard)
-- Trusted SQL sessions bypass the w4c guard (support / repair; audited as trusted_session).
-- Notifications: none in W4 (PLAN section 4); W5/W12 notify applicants.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Transition RPC. Errors: 42501 not found (no existence leak) / not allowed / unverified;
--    55000 stale expected status; 23514 missing fields / deadline passed.
-- -------------------------------------------------------------
create or replace function public.transition_job_opening(
  p_job_opening_id uuid,
  p_from_status text,
  p_to_status text
)
returns public.job_openings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.job_openings;
begin
  select * into target
  from public.job_openings j
  where j.id = p_job_opening_id
  for update;
  if not found
     or auth.uid() is null
     or target.owner_id is distinct from auth.uid()
     or coalesce(public.current_user_profile_role(), '') <> 'owner'
  then
    raise exception 'Job opening not found.' using errcode = '42501';
  end if;
  if target.status is distinct from p_from_status then
    raise exception 'This job opening changed. Refresh and try again.' using errcode = '55000';
  end if;
  if not coalesce(
    (p_from_status || '>' || p_to_status) = any (array[
      'draft>published', 'published>paused', 'paused>published',
      'published>closed', 'paused>closed', 'closed>archived'
    ]), false)
  then
    raise exception 'This job opening status change is not allowed.' using errcode = '42501';
  end if;
  if p_to_status = 'published' then
    if not public.is_verified_shop_owner(target.shop_id) then
      raise exception 'Only a verified shop can publish job openings.' using errcode = '42501';
    end if;
    if cardinality(public.job_opening_missing_publish_fields(target)) > 0 then
      raise exception 'Complete the required job opening fields before publishing.' using errcode = '23514';
    end if;
    if target.application_deadline < (now() at time zone 'Asia/Manila')::date then
      raise exception 'The application deadline has passed.' using errcode = '23514';
    end if;
  end if;
  perform set_config('washlink.job_opening_transition', target.id::text, true);
  update public.job_openings
  set status = p_to_status,
      status_changed_at = now(),
      first_published_at = coalesce(first_published_at, now())
  where id = target.id
  returning * into target;
  perform set_config('washlink.job_opening_transition', '', true);
  return target;
end;
$$;

revoke all on function public.transition_job_opening(uuid, text, text) from public, anon, service_role;
grant execute on function public.transition_job_opening(uuid, text, text) to authenticated;

-- -------------------------------------------------------------
-- 2) Audit producer (C-W3-1: ids, status words and column NAMES only; never titles,
--    descriptions, amounts or terms). Draft content edits are not audited.
-- -------------------------------------------------------------
create or replace function public.job_openings_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_fields text[];
begin
  if tg_op = 'INSERT' then
    perform public.record_workforce_audit_event(
      'job_opening.created', 'job_opening', new.id, new.owner_id,
      jsonb_build_object('shop_id', new.shop_id, 'status', new.status));
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.record_workforce_audit_event(
      'job_opening.deleted', 'job_opening', old.id, old.owner_id,
      jsonb_build_object(
        'shop_id', old.shop_id,
        'from_status', old.status,
        'deleted_by', case
          when not exists (select 1 from public.profiles p where p.id = old.owner_id) then 'owner_account_deleted'
          when not exists (select 1 from public.shops s where s.id = old.shop_id) then 'shop_deleted'
          when auth.uid() is not null and auth.uid() = old.owner_id then 'owner'
          else 'trusted_session'
        end));
    return null;
  end if;

  if new.status is distinct from old.status then
    perform public.record_workforce_audit_event(
      'job_opening.status_changed', 'job_opening', new.id, new.owner_id,
      jsonb_build_object('shop_id', new.shop_id, 'from_status', old.status, 'to_status', new.status));
    return null;
  end if;

  if old.status = 'draft' then
    return null;
  end if;

  select array_agg(entry.key order by entry.key) into changed_fields
  from jsonb_each(to_jsonb(new)) entry
  where entry.key not in ('updated_at')
    and entry.value is distinct from (to_jsonb(old) -> entry.key);
  if changed_fields is null then
    return null;
  end if;
  perform public.record_workforce_audit_event(
    'job_opening.updated', 'job_opening', new.id, new.owner_id,
    jsonb_build_object('shop_id', new.shop_id, 'status', new.status,
                       'changed_fields', to_jsonb(changed_fields)));
  return null;
end;
$$;

revoke all on function public.job_openings_audit() from public, anon, authenticated, service_role;

drop trigger if exists job_openings_audit on public.job_openings;
create trigger job_openings_audit
  after insert or update or delete on public.job_openings
  for each row execute function public.job_openings_audit();

-- -------------------------------------------------------------
-- 3) W3a pin assertion repeated: no SECURITY DEFINER function in public / washlink_private
--    without pg_temp in its search_path (baseline-only handle_new_user excluded, D-10 row 17).
-- -------------------------------------------------------------
do $$
declare
  unpinned text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname in ('public', 'washlink_private')
    and not (n.nspname = 'public' and p.proname = 'handle_new_user' and p.pronargs = 0)
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) c
      where c like 'search_path=%'
        and 'pg_temp' = any (string_to_array(replace(substr(c, 13), ' ', ''), ','))
    );
  if unpinned is not null then
    raise exception 'W4d: SECURITY DEFINER functions without pg_temp in search_path: % (pin them; D-10 row 17)', unpinned;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W4 rollbacks in reverse order d, c, b, a)
-- Audit rows already written stay (append-only, P11).
-- -------------------------------------------------------------
-- drop trigger if exists job_openings_audit on public.job_openings;
-- drop function if exists public.job_openings_audit();
-- drop function if exists public.transition_job_opening(uuid, text, text);
