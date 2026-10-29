-- =============================================================
-- WashLink W11b - WashLink certification reviews (independent review of a shop's suspension / revocation decided by a
-- super_admin) and the holds on the W7 tables (spec D, A; D-44, D-45, D-46; W11 PLAN 3.2, P66-P68, P71).
-- Requires w2a, w7b, w7c, w11a. Idempotent.
-- P71: every INSERT / UPDATE goes through the W11 definer RPCs under the transaction-local flag
--      washlink.certification_platform_review_write = <review id>; no client role (anon, authenticated, service_role)
--      has a write grant; write policies deny all; a trusted session without the flag is refused too. The only
--      flag-less UPDATE is a D-18 FK set-null (deciding super_admin account removed, escalated shop request removed);
--      deletes only by cascade (certificate or worker profile gone).
-- P68 holds are NEW triggers (no W7 function body changes): while a review is open the owner cannot revoke and the
--      worker cannot open a shop review request (23514); an owner reinstatement closes the review as resolved_by_shop.
-- Reads: NO client raw select (deny-all select policy, fix cycle 1 N3); workers, owners and super_admin read through the
--      w11d definer reads only (the admin case read is audited). Statements and reasons live only here.
-- N1 (fix cycle 1): two NEW BEFORE triggers that sort after the W7 guards mask the deciding administrator's profile id in
--      the raw W7 rows the issuing owner can read (certifications.status_changed_by after a WashLink reinstatement,
--      certification_status_events.actor_id of every WashLink status event). Accountability stays in
--      certification_platform_reviews.decided_by and workforce_audit_events (super_admin only).
-- status_event_id = the latest suspended / revoked status event when the review was opened (the "current event"); the
--      per-event cap of 3 reviews (withdrawn ones count, N5) is enforced in w11c.
-- certification_status_events.platform_review_id has NO FK: reviews and events both cascade from the certificate, and
-- an FK cascade from the review would trip the W7 event guard.
-- =============================================================

create table if not exists public.certification_platform_reviews (
  id uuid primary key default gen_random_uuid(),
  certification_id uuid not null references public.certifications(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  basis text not null,
  escalated_from_request_id uuid references public.certification_review_requests(id) on delete set null,
  status_event_id bigint,
  certification_status_at_open text not null,
  worker_statement text not null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_reason text,
  closed_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cpr_basis_check check (basis in ('upheld_by_shop', 'shop_decision_overdue', 'issuer_unavailable',
                                              'resuspended_after_shop_resolution')),
  constraint cpr_escalated_from_request_unique unique (escalated_from_request_id),
  constraint cpr_status_at_open_check check (certification_status_at_open in ('suspended', 'revoked')),
  constraint cpr_statement_length check (char_length(worker_statement) between 20 and 1000),
  constraint cpr_status_check check (status in ('open', 'reinstated', 'upheld', 'withdrawn', 'resolved_by_shop')),
  constraint cpr_decision_reason_length check (char_length(decision_reason) between 20 and 500),
  constraint cpr_revision_check check (revision >= 1),
  constraint cpr_status_consistency check (
    (status = 'open' and decided_at is null and decision_reason is null and closed_at is null)
    or (status in ('reinstated', 'upheld') and decided_at is not null and decision_reason is not null and closed_at is null)
    or (status in ('withdrawn', 'resolved_by_shop') and closed_at is not null and decided_at is null and decision_reason is null))
);
create unique index if not exists certification_platform_reviews_one_open_per_certification
  on public.certification_platform_reviews (certification_id) where status = 'open';
create index if not exists certification_platform_reviews_cert_idx on public.certification_platform_reviews (certification_id, opened_at);
create index if not exists certification_platform_reviews_status_idx on public.certification_platform_reviews (status, opened_at);
create index if not exists certification_platform_reviews_worker_idx on public.certification_platform_reviews (worker_id, status);
create index if not exists certification_platform_reviews_decided_by_idx on public.certification_platform_reviews (decided_by);
create index if not exists certification_platform_reviews_event_idx on public.certification_platform_reviews (certification_id, status_event_id);
comment on column public.certification_platform_reviews.status_event_id is
  'W11: certification_status_events.id of the suspended / revoked event under review (set by the guard at open; no FK by design, both cascade from the certificate).';
comment on table public.certification_platform_reviews is
  'W11: WashLink reviews of a shop''s suspension or revocation (D-44), opened by the certificate worker only and decided by a WashLink platform administrator (reinstate or uphold; never suspend, revoke, issue or renew, D-45). Shown as "WashLink review". Statements and reasons are visible to the certificate worker, the current issuing owner and super_admin only.';

alter table public.certification_status_events add column if not exists platform_review_id uuid;
create index if not exists certification_status_events_platform_review_idx
  on public.certification_status_events (platform_review_id) where platform_review_id is not null;
comment on column public.certification_status_events.platform_review_id is
  'W11: the WashLink review (certification_platform_reviews.id) that decided this event; no FK by design (both cascade from the certificate).';

-- -------------------------------------------------------------
-- 1) Current-event helper (internal) and guard (definer; every session, no trusted bypass).
-- -------------------------------------------------------------
-- The latest suspended / revoked status event of a certificate (identity ids, strictly increasing), or null.
create or replace function public.certification_platform_review_current_event(p_cert uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(ev.id) from public.certification_status_events ev where ev.certification_id = p_cert and ev.event in ('suspended', 'revoked')
$$;
revoke all on function public.certification_platform_review_current_event(uuid) from public, anon, authenticated, service_role;

create or replace function public.certification_platform_reviews_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.certification_platform_review_write', true), '');
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.certifications c where c.id = old.certification_id)
       or not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id) then
      return old;   -- FK cascade: the certificate or the worker account is gone
    end if;
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.certification_platform_reviews'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- the deciding administrator account was removed; the decision stays
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'WashLink reviews change only through the WashLink review actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.worker_statement := btrim(new.worker_statement);
    new.status_event_id := public.certification_platform_review_current_event(new.certification_id);
    new.opened_at := now();
    new.decided_at := null;
    new.decided_by := null;
    new.decision_reason := null;
    new.closed_at := null;
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if old.status <> 'open' or new.status = 'open' or exists (
    select 1 from jsonb_each(to_jsonb(new)) entry
    where entry.key not in ('status', 'decided_at', 'decided_by', 'decision_reason', 'closed_at', 'revision', 'updated_at')
      and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  new.decision_reason := nullif(btrim(new.decision_reason), '');
  if new.status in ('reinstated', 'upheld') then
    new.decided_at := now();
    new.decided_by := auth.uid();
    new.closed_at := null;
  else
    new.closed_at := now();
    new.decided_at := null;
    new.decided_by := null;
    new.decision_reason := null;
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- 2) Holds (P68; definer, internal). Lock order: certifications row -> shop request row -> review row.
-- -------------------------------------------------------------
create or replace function public.certification_review_requests_platform_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.certification_platform_reviews p where p.certification_id = new.certification_id and p.status = 'open') then
    raise exception 'WashLink is reviewing this certification. Wait for its decision.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.certifications_platform_review_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked'
     and exists (select 1 from public.certification_platform_reviews p where p.certification_id = new.id and p.status = 'open') then
    raise exception 'WashLink is reviewing this certification. Wait for its decision.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- An issuing-owner reinstatement through W7 closes the open WashLink review as resolved_by_shop. A WashLink decision
-- sets washlink.certification_platform_review_decision and is closed by its own RPC instead.
create or replace function public.certifications_platform_review_resolve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  open_review uuid;
begin
  if coalesce(current_setting('washlink.certification_platform_review_decision', true), '') <> '' then
    return null;
  end if;
  select p.id into open_review from public.certification_platform_reviews p
  where p.certification_id = new.id and p.status = 'open' for update;
  if open_review is null then
    return null;
  end if;
  perform set_config('washlink.certification_platform_review_write', open_review::text, true);
  update public.certification_platform_reviews set status = 'resolved_by_shop' where id = open_review;
  perform set_config('washlink.certification_platform_review_write', '', true);
  return null;
end;
$$;

-- N1 masks (definer, internal). Their names sort after every W7 BEFORE trigger on the table, so they run after the W7
-- guard stamped auth.uid(). certifications: only a WashLink decision (decision flag naming an open review of this
-- certificate, caller super_admin). certification_status_events: every event linked to a WashLink review.
create or replace function public.certifications_zz_platform_review_mask()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  decision text := coalesce(current_setting('washlink.certification_platform_review_decision', true), '');
begin
  if decision <> '' and new.status is distinct from old.status and public.is_super_admin()
     and exists (select 1 from public.certification_platform_reviews p
                 where p.id::text = decision and p.certification_id = new.id and p.status = 'open') then
    new.status_changed_by := null;
  end if;
  return new;
end;
$$;

create or replace function public.certification_status_events_zz_platform_review_mask()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.platform_review_id is not null then
    new.actor_id := null;
  end if;
  return new;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['certification_platform_reviews', 'certification_platform_reviews_guard_write', 'before insert or update or delete', ''],
    array['certifications', 'certifications_zz_platform_review_mask', 'before update of status', ''],
    array['certification_status_events', 'certification_status_events_zz_platform_review_mask', 'before insert', ''],
    array['certification_review_requests', 'certification_review_requests_platform_hold', 'before insert', ''],
    array['certifications', 'certifications_platform_review_hold', 'before update of status', ''],
    array['certifications', 'certifications_platform_review_resolve', 'after update of status',
          'when (old.status in (''suspended'', ''revoked'') and new.status = ''active'')']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[2], item[1]);
    execute format('create trigger %I %s on public.%I for each row %s execute function public.%I()',
                   item[2], item[3], item[1], item[4], item[2]);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 3) Privileges and RLS: deny-all select and write policies (no client raw read, N3; reads only through w11d).
-- -------------------------------------------------------------
alter table public.certification_platform_reviews enable row level security;
revoke all on table public.certification_platform_reviews from public, anon, authenticated, service_role;
grant select on table public.certification_platform_reviews to authenticated;

drop policy if exists "cpr_select_super_admin" on public.certification_platform_reviews;
drop policy if exists "certification_platform_reviews_no_client_select" on public.certification_platform_reviews;
create policy "certification_platform_reviews_no_client_select" on public.certification_platform_reviews
  for select to authenticated using (false);
drop policy if exists "certification_platform_reviews_no_client_insert" on public.certification_platform_reviews;
create policy "certification_platform_reviews_no_client_insert" on public.certification_platform_reviews
  for insert to authenticated with check (false);
drop policy if exists "certification_platform_reviews_no_client_update" on public.certification_platform_reviews;
create policy "certification_platform_reviews_no_client_update" on public.certification_platform_reviews
  for update to authenticated using (false);
drop policy if exists "certification_platform_reviews_no_client_delete" on public.certification_platform_reviews;
create policy "certification_platform_reviews_no_client_delete" on public.certification_platform_reviews
  for delete to authenticated using (false);

-- -------------------------------------------------------------
-- 4) Realtime: refuse FOR ALL TABLES, drop the table if published (D-10 diff).
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W11b: supabase_realtime is FOR ALL TABLES and would publish certification_platform_reviews (D-10 diff). Aborting.';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename = 'certification_platform_reviews') then
    alter publication supabase_realtime drop table public.certification_platform_reviews;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a; roll back w11c..w11i first)
-- Drop the holds FIRST (they read the reviews table). IRREVERSIBLE LOSS of WashLink reviews and of the event links:
-- export first with a trusted copy public.certification_platform_reviews to '<file>' (and the
-- certification_status_events rows where platform_review_id is not null).
-- -------------------------------------------------------------
-- drop trigger if exists certification_status_events_zz_platform_review_mask on public.certification_status_events;
-- drop trigger if exists certifications_zz_platform_review_mask on public.certifications;
-- drop trigger if exists certifications_platform_review_resolve on public.certifications;
-- drop trigger if exists certifications_platform_review_hold on public.certifications;
-- drop trigger if exists certification_review_requests_platform_hold on public.certification_review_requests;
-- drop function if exists public.certification_status_events_zz_platform_review_mask();
-- drop function if exists public.certifications_zz_platform_review_mask();
-- drop function if exists public.certifications_platform_review_resolve();
-- drop function if exists public.certifications_platform_review_hold();
-- drop function if exists public.certification_review_requests_platform_hold();
-- drop index if exists public.certification_status_events_platform_review_idx;
-- alter table public.certification_status_events drop column if exists platform_review_id;
-- drop table if exists public.certification_platform_reviews;   -- drops its guard trigger, policies and indexes
-- drop function if exists public.certification_platform_reviews_guard_write();
-- drop function if exists public.certification_platform_review_current_event(uuid);
