-- =============================================================
-- WashLink W2b - shop registration and verification hardening
-- (closes E3/C3, F5, S6, S7; adds is_verified_shop_owner for W4/W7/W10).
-- Requires 2026_10_24_w2a (is_trusted_db_session, current_user_profile_role).
-- Idempotent.
-- =============================================================

-- -------------------------------------------------------------
-- 1) E3 / C3: only owner accounts register shops, and always as pending.
--    Trusted sessions and super admins are unaffected (fixtures, admin tooling).
-- -------------------------------------------------------------
create or replace function public.guard_shop_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_db_session() or public.is_super_admin() then
    return new;
  end if;
  if coalesce(public.current_user_profile_role(), '') <> 'owner' then
    raise exception 'Only owner accounts can register a shop.' using errcode = '42501';
  end if;
  if new.verification_status is distinct from 'pending'
     or new.verification_notes is not null
     or new.verification_reviewed_at is not null
     or new.verification_reviewed_by is not null
  then
    raise exception 'New shops start as pending verification.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_shop_insert() from public, anon, authenticated;

drop trigger if exists shops_guard_insert on public.shops;
create trigger shops_guard_insert
  before insert on public.shops
  for each row
  execute function public.guard_shop_insert();

-- -------------------------------------------------------------
-- 2) Verification mutation guard (same function and trigger name as 2026_04_18).
--    F5: the owner resubmits ONLY through submit_shop_for_verification(), which sets the
--    transaction-local flag washlink.submit_shop to the row id (P6).
--    S6: a non-admin edit of name/address on an approved shop sends it back to review.
-- -------------------------------------------------------------
create or replace function public.prevent_owner_verification_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_db_session() then
    return new;
  end if;
  -- S-B1: the `on delete set null` cascade of verification_reviewed_by (reviewing admin
  -- deleted) and nothing else in the same UPDATE.
  if public.is_orphaned_fk_set_null('public.shops'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  -- Fix cycle 1: shops never change hands from the app (also not for super admins).
  if new.owner_id is distinct from old.owner_id then
    raise exception 'The owner of a shop cannot be changed.' using errcode = '42501';
  end if;
  -- C-B1(a): the reviewer and review time are always server-side; client values are ignored.
  if public.is_super_admin() then
    if new.verification_status is distinct from old.verification_status then
      new.verification_reviewed_by := auth.uid();
      new.verification_reviewed_at := now();
    else
      new.verification_reviewed_by := old.verification_reviewed_by;
      new.verification_reviewed_at := old.verification_reviewed_at;
    end if;
    return new;
  end if;
  if coalesce(current_setting('washlink.submit_shop', true), '') = new.id::text
     and old.verification_status in ('pending', 'changes_requested')
     and new.verification_status = 'pending'
     and new.verification_notes is not distinct from old.verification_notes
     and new.verification_reviewed_at is not distinct from old.verification_reviewed_at
     and new.verification_reviewed_by is not distinct from old.verification_reviewed_by
  then
    return new;
  end if;
  if new.verification_status is distinct from old.verification_status
     or new.verification_notes is distinct from old.verification_notes
     or new.verification_reviewed_at is distinct from old.verification_reviewed_at
     or new.verification_reviewed_by is distinct from old.verification_reviewed_by
  then
    raise exception 'Only super admins can change verification status or notes.';
  end if;
  -- S6 (R6: lat/long, phone and is_active edits are not re-reviewed).
  if old.verification_status = 'approved'
     and (new.name is distinct from old.name or new.address is distinct from old.address)
  then
    new.verification_status := 'pending';
    new.verification_submitted_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_owner_verification_mutation() from public, anon, authenticated;

drop trigger if exists shops_prevent_owner_verification_mutation on public.shops;
create trigger shops_prevent_owner_verification_mutation
  before update on public.shops
  for each row
  execute function public.prevent_owner_verification_mutation();

-- -------------------------------------------------------------
-- 3) F5: owner (re)submission RPC.
--    Transition: pending | changes_requested -> pending (submitted_at = now()), owner only.
-- -------------------------------------------------------------
create or replace function public.submit_shop_for_verification(p_shop_id uuid)
returns public.shops
language plpgsql
security definer
set search_path = public
as $$
declare
  target_shop public.shops;
begin
  if auth.uid() is null then
    raise exception 'Sign in to submit a shop for verification.' using errcode = '42501';
  end if;
  select * into target_shop
  from public.shops s
  where s.id = p_shop_id and s.owner_id = auth.uid()
  for update;
  if not found then
    raise exception 'Shop not found.' using errcode = '42501';
  end if;
  if target_shop.verification_status not in ('pending', 'changes_requested') then
    raise exception 'This shop cannot be submitted in its current status.';
  end if;
  perform set_config('washlink.submit_shop', p_shop_id::text, true);
  update public.shops
  set verification_status = 'pending',
      verification_submitted_at = now()
  where id = p_shop_id
  returning * into target_shop;
  perform set_config('washlink.submit_shop', '', true);
  return target_shop;
end;
$$;

revoke all on function public.submit_shop_for_verification(uuid) from public, anon;
grant execute on function public.submit_shop_for_verification(uuid) to authenticated;

-- -------------------------------------------------------------
-- 4) S7: verification documents are bound to their own shop folder and uploader.
-- -------------------------------------------------------------
create or replace function public.guard_verification_document_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_db_session() then
    return new;
  end if;
  -- S-B1: uploaded_by -> null cascade (uploader account deleted) and nothing else.
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.shop_verification_documents'::regclass,
                                        to_jsonb(old), to_jsonb(new))
  then
    return new;
  end if;
  if split_part(coalesce(new.storage_path, ''), '/', 1) <> new.shop_id::text then
    raise exception 'Verification documents must be stored in their own shop folder.'
      using errcode = '42501';
  end if;
  -- Fix cycle 1: the uploader is stamped on INSERT only; an UPDATE (e.g. re-upload via
  -- upsert) keeps the original uploader, whatever the client sends.
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
  else
    new.uploaded_by := old.uploaded_by;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_verification_document_write() from public, anon, authenticated;

drop trigger if exists svd_guard_path_and_uploader on public.shop_verification_documents;
create trigger svd_guard_path_and_uploader
  before insert or update on public.shop_verification_documents
  for each row
  execute function public.guard_verification_document_write();

-- -------------------------------------------------------------
-- 5) Gate helper for workforce features (W4/W7/W10): the caller is an owner account
--    and owns this shop, and the shop is approved BY A RECORDED REVIEW (reviewed_by and
--    reviewed_at set, both server-stamped since fix cycle 1) and active (compliance N3,
--    adopted as the default). Consequence: deleting the reviewing super admin nulls
--    reviewed_by and the shop stops counting as verified until it is reviewed again.
-- -------------------------------------------------------------
create or replace function public.is_verified_shop_owner(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_profile_role() = 'owner', false)
    and exists (
      select 1 from public.shops s
      where s.id = p_shop_id
        and s.owner_id = auth.uid()
        and s.verification_status = 'approved'
        and s.verification_reviewed_by is not null
        and s.verification_reviewed_at is not null
        and s.is_active
    );
$$;

revoke all on function public.is_verified_shop_owner(uuid) from public, anon;
grant execute on function public.is_verified_shop_owner(uuid) to authenticated;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W2 rollbacks in reverse order f..a)
-- -------------------------------------------------------------
-- drop function if exists public.is_verified_shop_owner(uuid);   -- after W4+ rollbacks
-- drop trigger if exists svd_guard_path_and_uploader on public.shop_verification_documents;
-- drop function if exists public.guard_verification_document_write();
-- drop function if exists public.submit_shop_for_verification(uuid);
-- drop trigger if exists shops_guard_insert on public.shops;
-- drop function if exists public.guard_shop_insert();
-- -- Restore the 2026_04_18 body verbatim (same trigger keeps pointing at it):
-- create or replace function public.prevent_owner_verification_mutation()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   if public.is_super_admin() then
--     return new;
--   end if;
--   if new.verification_status is distinct from old.verification_status
--      or new.verification_notes is distinct from old.verification_notes
--      or new.verification_reviewed_at is distinct from old.verification_reviewed_at
--      or new.verification_reviewed_by is distinct from old.verification_reviewed_by
--   then
--     raise exception 'Only super admins can change verification status or notes.';
--   end if;
--   return new;
-- end;
-- $$;
-- -- The frontend must then go back to the direct UPDATE (F5 re-opens).
