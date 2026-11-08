-- =============================================================
-- WashLink W10b - forward-only trusted contract repairs (W10 PLAN 3.2, P64; D-40; closes W9-S1 / C1 status part and
-- W9 REVIEW C6: a trusted repair can no longer revive an ended contract into the owner count). Requires w9c, w10a.
-- Idempotent.
-- worker_contracts_guard_write() is the w9c body VERBATIM except the trusted (no write flag) branch: besides the w9c
-- column whitelist, a trusted, no-JWT update may only move accepted / active -> terminated / expired, or repair stamps
-- without a status change on accepted / active rows. It can never leave declined, withdrawn, expired or terminated,
-- never enter draft, sent_for_review, accepted or active from another status, and never null ended_at. A trusted
-- update that changes nothing but updated_at stays allowed. Same trigger, same revokes; the W9 comment marker is kept
-- (j17_w9 counts it as a W9 function).
-- =============================================================

create or replace function public.worker_contracts_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.worker_contract_write', true), '');
  changed text[];
begin
  if tg_op = 'DELETE' then
    -- Never-sent drafts (owner discard, owner / shop removal) and never-accepted contracts of a removed worker (w9i).
    if write_flag = old.id::text and (old.sent_at is null or (old.worker_id is null and old.accepted_at is null)) then
      return old;
    end if;
    raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.worker_contracts'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- a party, the shop or the origin record is gone (w9i stamps and cleans up)
    end if;
    select coalesce(array_agg(e.key), '{}') into changed from jsonb_each(to_jsonb(new)) e
    where e.value is distinct from (to_jsonb(old) -> e.key);
    if changed && array['id', 'shop_id', 'owner_id', 'worker_id', 'origin', 'job_application_id', 'training_enrollment_id', 'created_at'] then
      raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
    end if;
    if write_flag is distinct from old.id::text then
      if not (public.is_trusted_db_session() and auth.uid() is null)
         or not changed <@ array['status', 'status_changed_at', 'ended_at', 'ended_by', 'end_reason', 'activated_at', 'revision', 'updated_at'] then
        raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
      end if;
      -- W10 (D-40, P64): forward-only. Only accepted / active rows can be repaired, only to the same status,
      -- terminated or expired, and ended_at is never cleared.
      if not changed <@ array['updated_at']
         and (old.status not in ('accepted', 'active')
              or new.status not in (old.status, 'terminated', 'expired')
              or (old.ended_at is not null and new.ended_at is null)) then
        raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
      end if;
      if new.status = 'terminated' and old.status is distinct from 'terminated' then   -- audited trusted repair
        new.ended_by := 'trusted_session';
        new.ended_at := coalesce(new.ended_at, now());
      end if;
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
    end if;
    return new;
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
  end if;
  new.status := 'draft';
  new.revision := 1;
  new.current_version_id := null;
  new.pending_version_id := null;
  new.sent_at := null; new.accepted_at := null; new.activated_at := null; new.ended_at := null;
  new.ended_by := null; new.end_reason := null; new.decline_note := null;
  new.owner_removed_at := null; new.shop_removed_at := null; new.worker_removed_at := null;
  new.status_changed_at := now();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.worker_contracts_guard_write() from public, anon, authenticated, service_role;
comment on function public.worker_contracts_guard_write() is
  'W9: worker contracts (created by the W9 migrations). W10: forward-only trusted repairs.';
-- The w9c trigger (before insert or update or delete, for each row) is unchanged and keeps calling this function.

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W10 rollbacks in reverse order g..a). Re-opens W9-S1 / C1: a trusted repair
-- could again revive an ended contract. Re-create the complete w9c body and comment:
-- -------------------------------------------------------------
-- create or replace function public.worker_contracts_guard_write()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   write_flag text := coalesce(current_setting('washlink.worker_contract_write', true), '');
--   changed text[];
-- begin
--   if tg_op = 'DELETE' then
--     -- Never-sent drafts (owner discard, owner / shop removal) and never-accepted contracts of a removed worker (w9i).
--     if write_flag = old.id::text and (old.sent_at is null or (old.worker_id is null and old.accepted_at is null)) then
--       return old;
--     end if;
--     raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
--   end if;
--   if tg_op = 'UPDATE' then
--     if public.is_orphaned_fk_set_null('public.worker_contracts'::regclass, to_jsonb(old), to_jsonb(new)) then
--       return new;   -- a party, the shop or the origin record is gone (w9i stamps and cleans up)
--     end if;
--     select coalesce(array_agg(e.key), '{}') into changed from jsonb_each(to_jsonb(new)) e
--     where e.value is distinct from (to_jsonb(old) -> e.key);
--     if changed && array['id', 'shop_id', 'owner_id', 'worker_id', 'origin', 'job_application_id', 'training_enrollment_id', 'created_at'] then
--       raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
--     end if;
--     if write_flag is distinct from old.id::text then
--       if not (public.is_trusted_db_session() and auth.uid() is null)
--          or not changed <@ array['status', 'status_changed_at', 'ended_at', 'ended_by', 'end_reason', 'activated_at', 'revision', 'updated_at'] then
--         raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
--       end if;
--       if new.status = 'terminated' and old.status is distinct from 'terminated' then   -- audited trusted repair
--         new.ended_by := 'trusted_session';
--         new.ended_at := coalesce(new.ended_at, now());
--       end if;
--     end if;
--     new.revision := old.revision + 1;
--     new.updated_at := now();
--     if new.status is distinct from old.status then
--       new.status_changed_at := now();
--     end if;
--     return new;
--   end if;
--   if write_flag is distinct from new.id::text then
--     raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
--   end if;
--   new.status := 'draft';
--   new.revision := 1;
--   new.current_version_id := null;
--   new.pending_version_id := null;
--   new.sent_at := null; new.accepted_at := null; new.activated_at := null; new.ended_at := null;
--   new.ended_by := null; new.end_reason := null; new.decline_note := null;
--   new.owner_removed_at := null; new.shop_removed_at := null; new.worker_removed_at := null;
--   new.status_changed_at := now();
--   new.created_at := now();
--   new.updated_at := now();
--   return new;
-- end;
-- $$;
-- revoke all on function public.worker_contracts_guard_write() from public, anon, authenticated, service_role;
-- comment on function public.worker_contracts_guard_write() is 'W9: worker contracts (created by the W9 migrations).';
