-- =============================================================
-- WashLink W14f - approved shops without a recorded super_admin review: queue and re-review (spec A, H; D-10 rows 14 /
-- 22; D-56; W14 PLAN 3.6, P79). Requires w2b, w3d, w4b, w7b, w9c, w10d, w10e. Idempotent.
-- Predicate (D-10 row 14): approved AND (verification_reviewed_by null OR verification_reviewed_at null OR the reviewer's
-- profile role is not super_admin). Such a shop fails shop_has_recorded_verification() when a reviewer column is null.
-- rereview_approved_shop (super_admin only):
--   confirm_approval   sets washlink.shop_rereview = <shop id> and updates verification_reviewed_at. The W2b guard keeps the
--                      old reviewer when the status is unchanged (body unchanged); shops_zz_rereview_stamp (BEFORE UPDATE,
--                      sorts after shops_prevent_owner_verification_mutation) then stamps verification_reviewed_by =
--                      auth.uid() and verification_reviewed_at = now() for a super_admin while the status stays approved
--                      (P79). The W10 shops_sync_owner_relationships trigger refreshes pairs (reviewer columns change).
--   request_changes / reject  status + notes through the W2b super_admin branch (stamped there); W3 audits
--                      shop.verification_decided and notifies the owner.
-- shops_audit_rereview (AFTER UPDATE WHEN the reviewer columns change under the flag) writes shop.verification_rereviewed
-- (from_reviewer_state, to_status, changed_by) and notifies the owner of a confirmation only. W2b / W3 / W10 bodies
-- unchanged. Notes are never copied into audit payloads or notifications.
-- =============================================================

create or replace function public.shop_reviewer_state(p_reviewed_by uuid, p_reviewed_at timestamptz)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when p_reviewed_by is null then 'reviewer_missing'
              when p_reviewed_at is null then 'review_time_missing'
              when not exists (select 1 from public.profiles p where p.id = p_reviewed_by and p.role::text = 'super_admin')
                then 'reviewer_not_super_admin'
         end;
$$;

create or replace function public.shop_lacks_recorded_super_admin_review(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.shops s where s.id = p_shop_id and s.verification_status = 'approved'
                 and public.shop_reviewer_state(s.verification_reviewed_by, s.verification_reviewed_at) is not null);
$$;

create or replace function public.admin_unreviewed_approved_shops()
returns table (shop_id uuid, shop_name text, owner_display_name text, is_active boolean, reviewer_state text,
               verification_reviewed_at timestamptz, last_decision_at timestamptz, published_opening_count integer,
               current_certification_count integer, active_contract_count integer, suspended_relationship_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    return;
  end if;
  return query
  select s.id, s.name, coalesce(nullif(btrim(p.full_name), ''), 'Owner'), s.is_active,
         public.shop_reviewer_state(s.verification_reviewed_by, s.verification_reviewed_at), s.verification_reviewed_at,
         (select max(e.created_at) from public.workforce_audit_events e
          where e.subject_type = 'shop' and e.subject_id = s.id and e.action = 'shop.verification_decided'),
         (select count(*)::integer from public.job_openings j where j.shop_id = s.id and j.status = 'published'),
         (select count(*)::integer from public.certifications ce
          where ce.shop_id = s.id and public.certification_effective_status(ce.status, ce.expires_at, now()) = 'active'),
         (select count(*)::integer from public.worker_contracts wc
          where wc.shop_id = s.id and public.worker_contract_effective_status(wc.status, wc.end_date) = 'active'),
         (select count(*)::integer from public.worker_owner_relationships r where r.owner_id = s.owner_id and r.status = 'suspended')
  from public.shops s
  left join public.profiles p on p.id = s.owner_id
  where s.verification_status = 'approved'
    and public.shop_reviewer_state(s.verification_reviewed_by, s.verification_reviewed_at) is not null
  order by coalesce(s.verification_reviewed_at, s.created_at), s.created_at, s.id
  limit 200;
end;
$$;

create or replace function public.rereview_approved_shop(p_shop_id uuid, p_decision text, p_notes text default null)
returns table (shop_id uuid, verification_status text, verification_reviewed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  s public.shops;
  clean_notes text := nullif(btrim(p_notes), '');
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can review shops.' using errcode = '42501';
  end if;
  select * into s from public.shops x where x.id = p_shop_id for update;
  if s.id is null then
    raise exception 'Shop not found.' using errcode = '42501';
  end if;
  if not public.shop_lacks_recorded_super_admin_review(s.id) then
    raise exception 'This shop already has a recorded review.' using errcode = '23514';
  end if;
  if p_decision is null or p_decision not in ('confirm_approval', 'request_changes', 'reject') then
    raise exception 'Choose confirm approval, request changes or reject.' using errcode = '22023';
  end if;
  if p_decision <> 'confirm_approval' and (clean_notes is null or char_length(clean_notes) not between 20 and 1000) then
    raise exception 'Write notes of 20 to 1000 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.shop_rereview', s.id::text, true);
  if p_decision = 'confirm_approval' then
    update public.shops set verification_reviewed_at = now() where id = s.id returning * into s;
  else
    update public.shops
    set verification_status = case when p_decision = 'reject' then 'rejected' else 'changes_requested' end, verification_notes = clean_notes
    where id = s.id
    returning * into s;
  end if;
  perform set_config('washlink.shop_rereview', '', true);
  return query select s.id, s.verification_status::text, s.verification_reviewed_at;
end;
$$;

-- P79 stamp (definer, internal). Inert unless the re-review flag names this shop, the caller is a super_admin and the
-- status stays approved.
create or replace function public.shops_zz_rereview_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('washlink.shop_rereview', true), '') = new.id::text
     and auth.uid() is not null and public.is_super_admin() and coalesce(public.current_user_profile_role(), '') = 'super_admin'
     and old.verification_status = 'approved' and new.verification_status = 'approved' then
    new.verification_reviewed_by := auth.uid();
    new.verification_reviewed_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.shops_audit_rereview()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_id bigint;
begin
  event_id := public.record_workforce_audit_event('shop.verification_rereviewed', 'shop', new.id, new.owner_id,
    jsonb_build_object('from_reviewer_state', public.shop_reviewer_state(old.verification_reviewed_by, old.verification_reviewed_at),
                       'to_status', new.verification_status, 'changed_by', 'super_admin'));
  if new.verification_status = 'approved' then
    perform public.enqueue_notification_safely(new.owner_id, 'shop_verification.rereviewed', 'Shop verification confirmed',
      format('WashLink confirmed the verification of %s.', public.notification_safe_label(new.name, 'your shop')),
      format('shop_rereview:%s:%s', new.id, event_id), 'shop', new.id);
  end if;
  return null;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['shop_reviewer_state(uuid, timestamptz)', 'shop_lacks_recorded_super_admin_review(uuid)',
                             'shops_zz_rereview_stamp()', 'shops_audit_rereview()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
  foreach sig in array array['admin_unreviewed_approved_shops()', 'rereview_approved_shop(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

drop trigger if exists shops_zz_rereview_stamp on public.shops;
create trigger shops_zz_rereview_stamp
  before update on public.shops
  for each row
  when (coalesce(current_setting('washlink.shop_rereview', true), '') = new.id::text)
  execute function public.shops_zz_rereview_stamp();

drop trigger if exists shops_audit_rereview on public.shops;
create trigger shops_audit_rereview
  after update on public.shops
  for each row
  when ((old.verification_reviewed_by is distinct from new.verification_reviewed_by
         or old.verification_reviewed_at is distinct from new.verification_reviewed_at)
        and coalesce(current_setting('washlink.shop_rereview', true), '') = new.id::text)
  execute function public.shops_audit_rereview();

-- The stamp must run after the W2b guard (R1): abort if the BEFORE UPDATE order on shops differs.
do $$
declare
  actual text[];
begin
  select array_agg(t.tgname::text order by t.tgname) into actual
  from pg_trigger t
  where t.tgrelid = 'public.shops'::regclass and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16;
  if actual is distinct from array['shops_prevent_owner_verification_mutation', 'shops_zz_rereview_stamp'] then
    raise exception 'W14f: unexpected BEFORE UPDATE triggers on shops: % (D-10, R1)', actual;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a). Stamped reviewers stay (real
-- super_admin decisions). Run the whole block as ONE transaction (N6, same pattern as w14c): the triggers first, then the
-- functions; a failure part-way rolls everything back.
-- -------------------------------------------------------------
-- begin;
-- drop trigger if exists shops_audit_rereview on public.shops;
-- drop trigger if exists shops_zz_rereview_stamp on public.shops;
-- drop function if exists public.shops_audit_rereview();
-- drop function if exists public.shops_zz_rereview_stamp();
-- drop function if exists public.rereview_approved_shop(uuid, text, text);
-- drop function if exists public.admin_unreviewed_approved_shops();
-- drop function if exists public.shop_lacks_recorded_super_admin_review(uuid);
-- drop function if exists public.shop_reviewer_state(uuid, timestamptz);
-- commit;
