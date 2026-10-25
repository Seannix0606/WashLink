-- =============================================================
-- WashLink W6f - training enrollment RPCs, the enrollment state machine and trainer designation (spec C, D; D-15;
-- W6 PLAN 3.6, P27). Requires w5b, w6b, w6c, w6d, w6e. Idempotent.
--   (none) -> invited      owning owner; program open; verified shop; application `accepted` at the
--                          same shop and owner; worker is not an unrevoked trainer of the program;
--                          enough upcoming supervised days; no live enrollment; limits 10 / worker and
--                          100 / program count only live rows (training_enrollment_is_live)
--   invited -> accepted    worker (self); program open; notice 'w6_v1'; current schedule; enough
--                          upcoming days; stamps accepted_at, notice, terms snapshot (write-once)
--   invited -> declined    worker (self); any program status
--   invited -> cancelled   owning owner (invitation withdrawn)
--   accepted -> withdrawn  worker (self); progress not completed (a failed trainee may leave)
--   accepted -> cancelled  owning owner; progress not completed (failed may be cancelled); reason 10..300
-- A caller who is neither the row worker nor the current program owner -> 42501
-- `Training enrollment not found.`; everything else -> 42501 `This training enrollment change is
-- not allowed.` (super_admin included). An invitation or an acceptance is not a contract, an
-- employment offer or a certification.
-- =============================================================

create or replace function public.training_enrollment_notice_version()
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select 'w6_v1'::text $$;

revoke all on function public.training_enrollment_notice_version() from public, anon, service_role;
grant execute on function public.training_enrollment_notice_version() to authenticated;

-- Live = counts toward the limits: an invitation, or accepted training not yet completed / failed.
create or replace function public.training_enrollment_is_live(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.training_enrollment_progress_status_of(p_enrollment_id)
                  in ('invited', 'scheduled', 'in_progress', 'awaiting_assessment'), false);
$$;

revoke all on function public.training_enrollment_is_live(uuid) from public, anon, authenticated, service_role;

create or replace function public.invite_to_training(p_program_id uuid, p_job_application_id uuid)
returns public.training_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.training_programs;
  application public.job_applications;
  new_id uuid := gen_random_uuid();
  created public.training_enrollments;
begin
  select * into target from public.training_programs p where p.id = p_program_id for share;
  if not found or not public.is_current_training_program_owner(p_program_id) then
    raise exception 'Training program not found.' using errcode = '42501';
  end if;
  if target.status <> 'open' then
    raise exception 'Invitations can be sent only while the program is open.' using errcode = '23514';
  end if;
  if not public.is_verified_shop_owner(target.shop_id) then
    raise exception 'Only a verified shop can invite workers to training.' using errcode = '42501';
  end if;
  select * into application from public.job_applications a where a.id = p_job_application_id;
  if not found or application.status <> 'accepted' or application.shop_id is distinct from target.shop_id
     or application.owner_id is distinct from target.owner_id then
    raise exception 'Invite only an applicant you accepted for this shop.' using errcode = '23514';
  end if;
  if exists (select 1 from public.training_program_trainers t where t.program_id = target.id
             and t.trainer_id = application.worker_id and t.revoked_at is null) then
    raise exception 'A trainer of this program cannot be enrolled in it.' using errcode = '23514';
  end if;
  if public.training_upcoming_supervised_days(target.id) < target.min_training_days then
    raise exception 'This program does not have enough upcoming training days.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('training_enrollments:' || application.worker_id::text, 0));
  if (select count(*) from public.training_enrollments e where e.worker_id = application.worker_id
      and e.shop_id is not null and e.program_id <> target.id and public.training_enrollment_is_live(e.id)) >= 10 then
    raise exception 'This worker has reached the limit of 10 live trainings.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('training_program_enrollments:' || target.id::text, 0));
  if (select count(*) from public.training_enrollments e where e.program_id = target.id
      and public.training_enrollment_is_live(e.id)) >= 100 then
    raise exception 'This training program is full.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.training_write', new_id::text, true);
    insert into public.training_enrollments (
      id, program_id, shop_id, owner_id, worker_id, job_application_id, shop_name_snapshot, program_title_snapshot,
      owner_display_name_snapshot, status, invited_by, status_changed_at)
    select new_id, target.id, target.shop_id, target.owner_id, application.worker_id, application.id,
           left(coalesce(nullif(btrim(s.name), ''), 'Shop'), 200), target.title,
           left(coalesce(nullif(btrim(pr.full_name), ''), 'Shop owner'), 200), 'invited', auth.uid(), now()
    from public.shops s left join public.profiles pr on pr.id = target.owner_id
    where s.id = target.shop_id
    returning * into created;
  exception when unique_violation then
    raise exception 'This worker already has a live enrollment in this program.' using errcode = '23505';
  end;
  perform set_config('washlink.training_write', '', true);
  return created;
end;
$$;

-- Locks program (FOR SHARE) then enrollment (FOR UPDATE); resolves the actor or raises not found.
create or replace function public.lock_training_enrollment_for_actor(p_enrollment_id uuid, out enrollment public.training_enrollments,
                                                                     out program public.training_programs, out actor text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  program_ref uuid := (select e.program_id from public.training_enrollments e where e.id = p_enrollment_id);
begin
  if program_ref is not null then
    select * into program from public.training_programs p where p.id = program_ref for share;
    select * into enrollment from public.training_enrollments e where e.id = p_enrollment_id for update;
  end if;
  if enrollment.id is not null and auth.uid() is not null then
    if enrollment.worker_id = auth.uid() and coalesce(public.current_user_profile_role(), '') = 'worker' then
      actor := 'worker';
    elsif enrollment.owner_id = auth.uid() and public.is_current_training_program_owner(enrollment.program_id) then
      actor := 'owner';
    end if;
  end if;
  if actor is null then
    raise exception 'Training enrollment not found.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.respond_to_training_invitation(
  p_enrollment_id uuid, p_accept boolean, p_notice_version text default null,
  p_expected_schedule_changed_at timestamptz default null)
returns public.training_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked record := public.lock_training_enrollment_for_actor(p_enrollment_id);
  target public.training_enrollments := locked.enrollment;
  program public.training_programs := locked.program;
begin
  if locked.actor <> 'worker' or target.status <> 'invited' or p_accept is null then
    raise exception 'This training enrollment change is not allowed.' using errcode = '42501';
  end if;
  perform set_config('washlink.training_write', target.id::text, true);
  if not p_accept then
    update public.training_enrollments set status = 'declined', responded_at = now(), status_changed_at = now()
    where id = target.id returning * into target;
  else
    if program.status <> 'open' or target.shop_id is null then
      raise exception 'This training program is not open.' using errcode = '23514';
    end if;
    if p_notice_version is distinct from public.training_enrollment_notice_version() then
      raise exception 'Review the free-training notice before enrolling.' using errcode = '23514';
    end if;
    if p_expected_schedule_changed_at is distinct from program.schedule_changed_at then
      raise exception 'This training program changed. Review it again.' using errcode = '55000';
    end if;
    if public.training_upcoming_supervised_days(program.id) < program.min_training_days then
      raise exception 'This program does not have enough upcoming training days.' using errcode = '23514';
    end if;
    update public.training_enrollments
    set status = 'accepted', responded_at = now(), accepted_at = now(), status_changed_at = now(),
        notice_version = public.training_enrollment_notice_version(), notice_acknowledged_at = now(),
        terms_snapshot = public.training_enrollment_terms_snapshot(program), terms_snapshot_taken_at = now()
    where id = target.id returning * into target;
  end if;
  perform set_config('washlink.training_write', '', true);
  return target;
end;
$$;

create or replace function public.withdraw_from_training(p_enrollment_id uuid)
returns public.training_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked record := public.lock_training_enrollment_for_actor(p_enrollment_id);
  target public.training_enrollments := locked.enrollment;
begin
  if locked.actor <> 'worker' or target.status <> 'accepted'
     or public.training_enrollment_progress_status_of(target.id) = 'completed' then
    raise exception 'This training enrollment change is not allowed.' using errcode = '42501';
  end if;
  perform set_config('washlink.training_write', target.id::text, true);
  update public.training_enrollments set status = 'withdrawn', ended_at = now(), status_changed_at = now()
  where id = target.id returning * into target;
  perform set_config('washlink.training_write', '', true);
  return target;
end;
$$;

create or replace function public.cancel_training_enrollment(p_enrollment_id uuid, p_reason text default null)
returns public.training_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked record := public.lock_training_enrollment_for_actor(p_enrollment_id);
  target public.training_enrollments := locked.enrollment;
  reason text := nullif(btrim(p_reason), '');
begin
  if locked.actor <> 'owner' or target.status not in ('invited', 'accepted')
     or (target.status = 'accepted'
         and public.training_enrollment_progress_status_of(target.id) = 'completed') then
    raise exception 'This training enrollment change is not allowed.' using errcode = '42501';
  end if;
  if (target.status = 'accepted' and reason is null) or char_length(reason) not between 10 and 300 then
    raise exception 'Give a reason of 10 to 300 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.training_write', target.id::text, true);
  update public.training_enrollments
  set status = 'cancelled', ended_at = now(), status_changed_at = now(), cancel_reason = reason
  where id = target.id returning * into target;
  perform set_config('washlink.training_write', '', true);
  return target;
end;
$$;

-- -------------------------------------------------------------
-- Trainer designation (D-4, D-16): the current shop owner designates a worker linked to the owner's
-- roster (consented link, C8) who has no live enrollment in the program; revocation is one-way.
-- Lives here (not w6e) to keep files <= 350 lines; uses lock_owned_training_program (w6e).
-- -------------------------------------------------------------
create or replace function public.designate_training_trainer(p_program_id uuid, p_roster_worker_id uuid)
returns public.training_program_trainers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.training_programs := public.lock_owned_training_program(p_program_id);
  trainer uuid;
  new_id uuid := gen_random_uuid();
  created public.training_program_trainers;
begin
  if target.status = 'archived' then
    raise exception 'Trainers cannot be changed on an archived program.' using errcode = '23514';
  end if;
  select w.user_id into trainer from public.workers w join public.profiles pr on pr.id = w.user_id
  where w.id = p_roster_worker_id and w.owner_id = target.owner_id and pr.role::text = 'worker';
  if trainer is null then
    raise exception 'Choose a worker linked to your roster.' using errcode = '23514';
  end if;
  if exists (select 1 from public.training_enrollments e where e.program_id = target.id and e.worker_id = trainer
             and e.status in ('invited', 'accepted')) then
    raise exception 'A worker enrolled in this program cannot be its trainer.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.training_write', new_id::text, true);
    insert into public.training_program_trainers (id, program_id, trainer_id, roster_worker_id, designated_by)
    values (new_id, target.id, trainer, p_roster_worker_id, auth.uid()) returning * into created;
  exception when unique_violation then
    raise exception 'This worker is already a trainer for this program.' using errcode = '23505';
  end;
  perform set_config('washlink.training_write', '', true);
  return created;
end;
$$;

create or replace function public.revoke_training_trainer(p_designation_id uuid)
returns public.training_program_trainers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  program_ref uuid := (select t.program_id from public.training_program_trainers t where t.id = p_designation_id);
  target public.training_programs := public.lock_owned_training_program(program_ref);
  designation public.training_program_trainers;
begin
  select * into designation from public.training_program_trainers t where t.id = p_designation_id for update;
  if designation.revoked_at is not null then
    raise exception 'This trainer role was already revoked.' using errcode = '23514';
  end if;
  perform set_config('washlink.training_write', designation.id::text, true);
  update public.training_program_trainers set revoked_by = auth.uid(), revoked_at = now()
  where id = designation.id returning * into designation;
  perform set_config('washlink.training_write', '', true);
  return designation;
end;
$$;

-- D-16: unlinking ends trainer authority for good. When workers.user_id changes (unlink / re-link) or
-- the roster row is deleted, every unrevoked designation through that row is revoked (one-way), so a
-- later re-link never revives it. Audit changed_by = 'roster_unlinked' (w6i).
create or replace function public.workers_revoke_unlinked_trainers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_flag text := coalesce(current_setting('washlink.training_write', true), '');
begin
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    return new;
  end if;
  perform set_config('washlink.training_write', 'roster_unlinked:' || old.id::text, true);
  update public.training_program_trainers t set revoked_by = coalesce(auth.uid(), old.owner_id), revoked_at = now()
  where t.roster_worker_id = old.id and t.revoked_at is null
    and exists (select 1 from public.profiles pr where pr.id = t.trainer_id);   -- account deletion: the row cascades away
  perform set_config('washlink.training_write', previous_flag, true);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.workers_revoke_unlinked_trainers() from public, anon, authenticated, service_role;
drop trigger if exists workers_revoke_unlinked_trainers on public.workers;
create trigger workers_revoke_unlinked_trainers
  before update of user_id or delete on public.workers
  for each row execute function public.workers_revoke_unlinked_trainers();

revoke all on function public.lock_training_enrollment_for_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function public.invite_to_training(uuid, uuid) from public, anon, service_role;
revoke all on function public.respond_to_training_invitation(uuid, boolean, text, timestamptz) from public, anon, service_role;
revoke all on function public.withdraw_from_training(uuid) from public, anon, service_role;
revoke all on function public.cancel_training_enrollment(uuid, text) from public, anon, service_role;
grant execute on function public.invite_to_training(uuid, uuid) to authenticated;
grant execute on function public.respond_to_training_invitation(uuid, boolean, text, timestamptz) to authenticated;
grant execute on function public.withdraw_from_training(uuid) to authenticated;
grant execute on function public.cancel_training_enrollment(uuid, text) to authenticated;
revoke all on function public.designate_training_trainer(uuid, uuid) from public, anon, service_role;
revoke all on function public.revoke_training_trainer(uuid) from public, anon, service_role;
grant execute on function public.designate_training_trainer(uuid, uuid) to authenticated;
grant execute on function public.revoke_training_trainer(uuid) to authenticated;
notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop trigger if exists workers_revoke_unlinked_trainers on public.workers;
-- drop function if exists public.workers_revoke_unlinked_trainers();
-- drop function if exists public.revoke_training_trainer(uuid);
-- drop function if exists public.designate_training_trainer(uuid, uuid);
-- drop function if exists public.cancel_training_enrollment(uuid, text);
-- drop function if exists public.withdraw_from_training(uuid);
-- drop function if exists public.respond_to_training_invitation(uuid, boolean, text, timestamptz);
-- drop function if exists public.lock_training_enrollment_for_actor(uuid);
-- drop function if exists public.invite_to_training(uuid, uuid);
-- drop function if exists public.training_enrollment_is_live(uuid);
-- drop function if exists public.training_enrollment_notice_version();
