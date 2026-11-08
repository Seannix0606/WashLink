-- =============================================================
-- WashLink W12b - notification category registry and the registered-category guard on notifications (spec I; W12 PLAN
-- 3.2, P80, P81, D-61). Requires w3c, w3d and every W3..W14 producer, w12a. Idempotent.
-- P80 one path: every notification row is written by enqueue_notification (definer producer or trusted SQL) AND
--   matches a registry row: the category exists, idempotency_key starts with one of its key_prefixes + ':', and
--   subject_type is one of its subject_types (or both are null). A violation raises 23514, so
--   enqueue_notification_safely skips it with a WARNING and the business action still succeeds (P14 unchanged).
--   A repeat of an EXISTING (recipient, key) is left to the W3 unique constraint (ON CONFLICT DO NOTHING returns the
--   existing row; a plain insert fails 23505), so a replay can never write an unregistered row.
-- The BEFORE INSERT trigger notifications_guard_registered_category sorts after notifications_guard_insert (W3 writer
--   flag, 42501 first). It never touches rows that already exist (production rows stay as they are).
-- D-61 in-app only: external_delivery is fixed to 'never' by CHECK; only a later reviewed migration may widen it.
-- The registry is configuration: changed only by migrations / trusted SQL (42501 for everyone else), no client
--   privilege, deny-all policies, never published to Realtime.
-- =============================================================

create table if not exists public.notification_categories (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  source_increment text not null,
  key_prefixes text[] not null,
  subject_types text[],
  recipient_kind text not null,
  external_delivery text not null default 'never',
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_categories_category_unique unique (category),
  constraint notification_categories_category_check
    check (char_length(category) <= 64 and category ~ '^[a-z_]+(\.[a-z_]+)*$'),
  constraint notification_categories_source_increment_check check (source_increment ~ '^W[0-9]{1,2}$'),
  constraint notification_categories_key_prefixes_check
    check (array_ndims(key_prefixes) = 1 and cardinality(key_prefixes) between 1 and 4
           and array_position(key_prefixes, null) is null
           and array_to_string(key_prefixes, ',') ~ '^[a-z_]+(,[a-z_]+){0,3}$'),
  constraint notification_categories_subject_types_check
    check (subject_types is null
           or (array_ndims(subject_types) = 1 and cardinality(subject_types) between 1 and 4
               and array_position(subject_types, null) is null
               and array_to_string(subject_types, ',') ~ '^[a-z_]{1,40}(,[a-z_]{1,40}){0,3}$')),
  constraint notification_categories_recipient_kind_check
    check (recipient_kind in ('owner', 'worker', 'trainer', 'reporter', 'either_party')),
  constraint notification_categories_external_delivery_check check (external_delivery = 'never'),
  constraint notification_categories_description_check check (char_length(description) between 1 and 200)
);

comment on table public.notification_categories is
  'W12: registry of every in-app notification category (P80). Each notification must match a row (category, key prefix, subject type). external_delivery is fixed to never (D-61). Changed only by migrations / trusted SQL.';

-- -------------------------------------------------------------
-- 1) Registry guard: only a trusted session without a signed-in user (migrations, SQL editor) changes it.
-- -------------------------------------------------------------
create or replace function public.notification_categories_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null or not public.is_trusted_db_session() or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    raise exception 'The notification registry is changed only by migrations.' using errcode = '42501';
  end if;
  if tg_level = 'STATEMENT' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.notification_categories_guard_write() from public, anon, authenticated, service_role;
drop trigger if exists notification_categories_guard_write on public.notification_categories;
create trigger notification_categories_guard_write
  before insert or update or delete on public.notification_categories
  for each row execute function public.notification_categories_guard_write();
drop trigger if exists notification_categories_guard_truncate on public.notification_categories;
create trigger notification_categories_guard_truncate
  before truncate on public.notification_categories
  for each statement execute function public.notification_categories_guard_write();

-- -------------------------------------------------------------
-- 2) Seed: the 37 categories the W3..W14 producers emit (prefixes and subject types copied from the producers).
-- -------------------------------------------------------------
insert into public.notification_categories as c (category, source_increment, key_prefixes, subject_types, recipient_kind, description)
values
  ('shop_verification.status_changed', 'W3', array['shop_verification'], array['shop'], 'owner', 'A shop verification decision.'),
  ('roster.linked', 'W3', array['roster_link'], array['roster_entry'], 'owner', 'A roster entry was linked to a worker account.'),
  ('roster.unlinked', 'W3', array['roster_link'], array['roster_entry'], 'either_party', 'A roster link was removed.'),
  ('job_application.submitted', 'W5', array['job_application'], array['job_application'], 'owner', 'A new job application.'),
  ('job_application.status_changed', 'W5', array['job_application'], array['job_application'], 'worker', 'The owner changed an application status.'),
  ('job_application.withdrawn', 'W5', array['job_application'], array['job_application'], 'owner', 'An applicant withdrew.'),
  ('job_application.closed', 'W5', array['job_application'], array['job_application'], 'worker', 'An application closed with its opening.'),
  ('job_application.removed', 'W5', array['job_application'], array['job_opening', 'job_application'], 'either_party',
   'An application ended because a profile, shop or opening was removed.'),
  ('job_opening.paused', 'W5', array['job_opening'], array['job_application'], 'worker', 'An opening with an open application was paused.'),
  ('training.schedule_changed', 'W6', array['training_schedule'], array['training_enrollment'], 'worker', 'A training schedule changed.'),
  ('training.trainer_role', 'W6', array['training_trainer'], array['training_program'], 'trainer', 'A trainer role was given or removed.'),
  ('training.invited', 'W6', array['training_invite'], array['training_enrollment'], 'worker', 'A training invitation.'),
  ('training.response', 'W6', array['training_response'], array['training_enrollment'], 'owner', 'A worker answered a training invitation.'),
  ('training.cancelled', 'W6', array['training_cancel'], array['training_enrollment'], 'worker', 'The owner cancelled an enrollment.'),
  ('training.record_corrected', 'W6', array['training_attendance', 'training_assessment'], array['training_enrollment'], 'worker',
   'A training record was corrected.'),
  ('training.assessment', 'W6', array['training_assessment'], array['training_enrollment'], 'either_party', 'A training assessment was recorded.'),
  ('certification.issued', 'W7', array['certification'], array['certification'], 'worker', 'A shop-issued certification.'),
  ('certification.renewed', 'W7', array['certification'], array['certification'], 'worker', 'A certification was renewed.'),
  ('certification.suspended', 'W7', array['certification'], array['certification'], 'worker', 'A certification was suspended.'),
  ('certification.revoked', 'W7', array['certification'], array['certification'], 'worker', 'A certification was revoked.'),
  ('certification.reinstated', 'W7', array['certification'], array['certification'], 'worker', 'The owner reinstated a certification.'),
  ('certification.review_requested', 'W7', array['certification'], array['certification'], 'owner', 'A worker asked the shop for a review.'),
  ('certification.review_decided', 'W7', array['certification'], array['certification'], 'worker', 'The shop decided a review request.'),
  ('certification.training_record_changed', 'W7', array['certification'], array['certification'], 'owner',
   'A training record changed after a certification was issued.'),
  ('certification.expiring', 'W7', array['certification_expiry'], array['certification'], 'worker', 'A certification expires within 30 days.'),
  ('certification.expired', 'W7', array['certification_expiry'], array['certification'], 'worker', 'A certification has expired.'),
  ('worker_contract', 'W9', array['worker_contract'], array['worker_contract'], 'either_party', 'A worker contract event.'),
  ('certification_platform_review.opened', 'W11', array['certification_platform_review'], array['certification'], 'owner',
   'A worker asked WashLink to review a certification decision.'),
  ('certification_platform_review.decided', 'W11', array['certification_platform_review'], array['certification'], 'either_party',
   'WashLink decided a certification review.'),
  ('worker_contract_dispute.raised', 'W11', array['contract_dispute'], array['worker_contract'], 'either_party',
   'A contract problem was reported to WashLink.'),
  ('worker_contract_dispute.closed', 'W11', array['contract_dispute'], array['worker_contract'], 'either_party',
   'WashLink closed a reported contract problem.'),
  ('job_opening_moderation.paused', 'W14', array['job_opening_moderation'], array['job_opening'], 'owner', 'WashLink paused a job opening.'),
  ('job_opening_moderation.closed', 'W14', array['job_opening_moderation'], array['job_opening'], 'owner', 'WashLink closed a job opening.'),
  ('job_opening_moderation.pause_kept', 'W14', array['job_opening_moderation'], array['job_opening'], 'owner', 'WashLink kept a pause.'),
  ('job_opening_moderation.lifted', 'W14', array['job_opening_moderation'], array['job_opening'], 'owner', 'WashLink lifted a pause.'),
  ('job_opening_report.closed', 'W14', array['job_opening_report'], array['job_opening'], 'reporter', 'WashLink reviewed a reported opening.'),
  ('shop_verification.rereviewed', 'W14', array['shop_rereview'], array['shop'], 'owner', 'WashLink confirmed a shop verification.')
on conflict (category) do update
  set source_increment = excluded.source_increment, key_prefixes = excluded.key_prefixes, subject_types = excluded.subject_types,
      recipient_kind = excluded.recipient_kind, description = excluded.description
  where (c.source_increment, c.key_prefixes, c.subject_types, c.recipient_kind, c.description)
        is distinct from (excluded.source_increment, excluded.key_prefixes, excluded.subject_types, excluded.recipient_kind, excluded.description);

-- R1 (D-10): production categories missing from the seed would be skipped from now on. NOTICE only; old rows stay.
do $$
declare
  unregistered text;
begin
  select string_agg(distinct n.category, ', ' order by n.category) into unregistered
  from public.notifications n
  where not exists (select 1 from public.notification_categories c where c.category = n.category);
  if unregistered is not null then
    raise notice 'W12b: existing notifications use categories missing from the registry: % (record in the D-10 diff)', unregistered;
  end if;
end $$;

-- -------------------------------------------------------------
-- 3) Registered-category guard on notifications (P80; every session).
-- -------------------------------------------------------------
create or replace function public.notifications_guard_registered_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reg public.notification_categories;
begin
  if exists (select 1 from public.notifications n where n.recipient_id = new.recipient_id and n.idempotency_key = new.idempotency_key) then
    return new;   -- a repeat: ON CONFLICT DO NOTHING discards it, a plain insert fails on the W3 unique constraint
  end if;
  select * into reg from public.notification_categories c where c.category = new.category;
  if reg.id is null
     or reg.external_delivery <> 'never'
     or not coalesce(split_part(new.idempotency_key, ':', 1) = any (reg.key_prefixes), false)
     or (new.subject_type is null) <> (reg.subject_types is null)
     or (new.subject_type is not null and not coalesce(new.subject_type = any (reg.subject_types), false)) then
    raise exception 'W12: notification category or key is not registered.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.notifications_guard_registered_category() from public, anon, authenticated, service_role;
drop trigger if exists notifications_guard_registered_category on public.notifications;
create trigger notifications_guard_registered_category
  before insert on public.notifications
  for each row execute function public.notifications_guard_registered_category();

-- -------------------------------------------------------------
-- 4) Privileges, RLS (deny-all) and Realtime (never published).
-- -------------------------------------------------------------
alter table public.notification_categories enable row level security;
revoke all on table public.notification_categories from public, anon, authenticated, service_role;
drop policy if exists notification_categories_no_client_select on public.notification_categories;
create policy notification_categories_no_client_select on public.notification_categories for select to authenticated using (false);
drop policy if exists notification_categories_no_client_insert on public.notification_categories;
create policy notification_categories_no_client_insert on public.notification_categories for insert to authenticated with check (false);
drop policy if exists notification_categories_no_client_update on public.notification_categories;
create policy notification_categories_no_client_update on public.notification_categories for update to authenticated using (false);
drop policy if exists notification_categories_no_client_delete on public.notification_categories;
create policy notification_categories_no_client_delete on public.notification_categories for delete to authenticated using (false);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W12b: supabase_realtime is FOR ALL TABLES and would publish notification_categories (D-10 diff). Aborting.';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename = 'notification_categories') then
    alter publication supabase_realtime drop table public.notification_categories;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W12 rollbacks in reverse order e..a). Configuration only: notices are
-- unchecked again; notification rows stay.
-- -------------------------------------------------------------
-- drop trigger if exists notifications_guard_registered_category on public.notifications;
-- drop function if exists public.notifications_guard_registered_category();
-- drop table if exists public.notification_categories;   -- drops its guard triggers and policies
-- drop function if exists public.notification_categories_guard_write();
