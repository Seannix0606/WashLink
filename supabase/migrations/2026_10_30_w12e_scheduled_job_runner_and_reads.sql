-- =============================================================
-- WashLink W12e - the scheduled job runner and the super_admin job status read (W12 PLAN 3.5, P83..P85; D-63..D-66).
-- Requires w3b, w7h, w12b..w12d. Idempotent.
-- run_workforce_scheduled_job(p_job) is the ONLY scheduled entry point (the cron scheduler calls it after a human registers the
--   jobs with scripts/supabase-scheduling/register_workforce_jobs.sql; no migration registers anything). It takes NO
--   date and NO batch parameter (P83): the DB clock (Manila date for contracts) and the stored batch size. Internal:
--   revoked from every client role and refused (42501) unless the caller is a trusted database session without a
--   signed-in user and not a service_role JWT. One job per transaction (55000), a job try-lock (busy ->
--   already_running, nothing written), lock_timeout 1 s (fix cycle 1 N3), state + audit when anything was processed,
--   changed or skipped. Fix cycle 1 N4: an item that fails is skipped (skipped_failed) and only its SQLSTATE is kept
--   (failed_sqlstates); the contract expiry job keeps a cursor (cursor_contract_id) like the relationship refresh, so
--   a failing item is retried on the next pass without holding back the rest.
-- admin_workforce_scheduled_jobs() is the super_admin read for the Overview card: job state and the pending backlog
--   (counts only; no ids, names or contract data; not audited). Everyone else gets 0 rows.
-- =============================================================

-- Pending backlog of a job (internal): contracts past their end date (Manila) not yet recorded expired; active
-- certificates within 30 days lacking their due / expired notice; null for the relationship refresh.
create or replace function public.workforce_scheduled_job_pending(p_job text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p_job
    when 'worker_contract_expiry' then
      (select count(*)::integer from public.worker_contracts c
       where c.status in ('accepted', 'active') and c.end_date < (now() at time zone 'Asia/Manila')::date)
    when 'certification_expiry_notices' then
      (select count(*)::integer from public.certifications c
       where c.status = 'active' and c.expires_at <= now() + interval '30 days'
         and not exists (select 1 from public.notifications n
                         where n.recipient_id = c.worker_id
                           and n.idempotency_key = format('certification_expiry:%s:%s', c.id,
                             case when public.certification_effective_status(c.status, c.expires_at, now()) = 'expired'
                                  then 'expired' else 'due' end)))
  end;
$$;

create or replace function public.run_workforce_scheduled_job(p_job text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  job public.workforce_scheduled_jobs;
  outcome text := 'completed';
  processed integer := 0;
  changed integer := 0;
  skipped integer := 0;
  failed integer := 0;
  sqlstates text[] := '{}';
  remaining integer;
  pass_done boolean := false;
  next_worker uuid;
  next_owner uuid;
  next_contract uuid;
  r record;
begin
  if auth.uid() is not null or not public.is_trusted_db_session() or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    raise exception 'Scheduled jobs run only from a trusted database session.' using errcode = '42501';
  end if;
  if p_job is null or p_job not in ('certification_expiry_notices', 'worker_contract_expiry', 'owner_relationship_refresh') then
    raise exception 'Unknown scheduled job.' using errcode = '22023';
  end if;
  if coalesce(current_setting('washlink.scheduled_job', true), '') <> '' then
    raise exception 'W12: one scheduled job per transaction.' using errcode = '55000';
  end if;
  perform set_config('washlink.scheduled_job', p_job, true);
  perform set_config('lock_timeout', '1s', true);
  if not pg_try_advisory_xact_lock(hashtextextended('w12:job:' || p_job, 0)) then
    return jsonb_build_object('job', p_job, 'outcome', 'already_running', 'processed', 0, 'changed', 0, 'skipped_locked', 0,
                              'skipped_failed', 0, 'failed_sqlstates', '[]'::jsonb, 'remaining', null);
  end if;
  begin
    select * into job from public.workforce_scheduled_jobs j where j.job_key = p_job for update nowait;
  exception when lock_not_available then
    return jsonb_build_object('job', p_job, 'outcome', 'already_running', 'processed', 0, 'changed', 0, 'skipped_locked', 0,
                              'skipped_failed', 0, 'failed_sqlstates', '[]'::jsonb, 'remaining', null);
  end;
  if job.id is null then
    raise exception 'Scheduled job state is missing.' using errcode = '22023';
  end if;
  next_worker := job.cursor_worker_id;
  next_owner := job.cursor_owner_id;
  next_contract := job.cursor_contract_id;
  if not job.enabled then
    outcome := 'disabled';
  elsif p_job = 'certification_expiry_notices' then
    processed := public.enqueue_certification_expiry_notices(now());
    changed := processed;
  elsif p_job = 'worker_contract_expiry' then
    select * into r from public.expire_worker_contracts_batch(job.cursor_contract_id, job.batch_size);
    processed := r.processed;
    changed := r.processed;
    skipped := r.skipped_locked;
    failed := r.skipped_failed;
    sqlstates := r.failed_sqlstates;
    pass_done := r.pass_completed;
    next_contract := case when pass_done then null else r.last_contract_id end;
  else
    select * into r from public.refresh_worker_owner_relationships_batch(job.cursor_worker_id, job.cursor_owner_id, job.batch_size);
    processed := r.processed;
    changed := r.changed;
    skipped := r.skipped_locked;
    failed := r.skipped_failed;
    sqlstates := r.failed_sqlstates;
    pass_done := r.pass_completed;
    if pass_done then
      next_worker := null;
      next_owner := null;
    else
      next_worker := r.last_worker_id;
      next_owner := r.last_owner_id;
    end if;
  end if;
  remaining := public.workforce_scheduled_job_pending(p_job);

  perform set_config('washlink.scheduled_job_state_write', p_job, true);
  update public.workforce_scheduled_jobs
  set last_started_at = now(), last_finished_at = clock_timestamp(), last_outcome = outcome,
      last_processed_count = processed, last_changed_count = changed, last_skipped_locked_count = skipped,
      last_skipped_failed_count = failed, last_failed_sqlstates = sqlstates,
      cursor_worker_id = next_worker, cursor_owner_id = next_owner, cursor_contract_id = next_contract,
      last_pass_completed_at = case when pass_done then now() else last_pass_completed_at end,
      run_count = run_count + 1
  where id = job.id;
  perform set_config('washlink.scheduled_job_state_write', '', true);

  if processed + changed + skipped + failed > 0 then
    perform public.record_workforce_audit_event('workforce_scheduled_job.ran', 'workforce_scheduled_job', null, null,
      jsonb_build_object('job_key', p_job, 'processed_count', processed, 'changed_count', changed,
                         'skipped_locked_count', skipped, 'skipped_failed_count', failed, 'failed_sqlstates', to_jsonb(sqlstates),
                         'pass_completed', pass_done, 'changed_by', 'system'));
  end if;
  return jsonb_build_object('job', p_job, 'outcome', outcome, 'processed', processed, 'changed', changed,
                            'skipped_locked', skipped, 'skipped_failed', failed, 'failed_sqlstates', to_jsonb(sqlstates),
                            'remaining', remaining);
end;
$$;

-- super_admin only (else 0 rows); counts and SQLSTATE codes only, no ids or names; not audited. Fix cycle 1 N4 added
-- last_skipped_failed_count and last_failed_sqlstates at the end (the column list changed, so the function is dropped
-- and re-created; the grant follows below).
drop function if exists public.admin_workforce_scheduled_jobs();
create function public.admin_workforce_scheduled_jobs()
returns table (job_key text, enabled boolean, batch_size integer, last_started_at timestamptz, last_finished_at timestamptz,
               last_outcome text, last_processed_count integer, last_changed_count integer, last_skipped_locked_count integer,
               last_pass_completed_at timestamptz, run_count bigint, pending_count integer, last_skipped_failed_count integer,
               last_failed_sqlstates text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.job_key, j.enabled, j.batch_size, j.last_started_at, j.last_finished_at, j.last_outcome, j.last_processed_count,
         j.last_changed_count, j.last_skipped_locked_count, j.last_pass_completed_at, j.run_count,
         public.workforce_scheduled_job_pending(j.job_key), j.last_skipped_failed_count, j.last_failed_sqlstates
  from public.workforce_scheduled_jobs j
  where auth.uid() is not null and public.is_super_admin() and coalesce(public.current_user_profile_role() = 'super_admin', false)
  order by array_position(array['certification_expiry_notices', 'worker_contract_expiry', 'owner_relationship_refresh'], j.job_key);
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['workforce_scheduled_job_pending(text)', 'run_workforce_scheduled_job(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
  revoke all on function public.admin_workforce_scheduled_jobs() from public, anon, service_role;
  grant execute on function public.admin_workforce_scheduled_jobs() to authenticated;
end $$;

-- Mark every W12 function and table with a `W12` comment. A missing one aborts here.
do $$
declare
  sig text;
  rel text;
begin
  foreach sig in array array[
    'notification_categories_guard_write()', 'notifications_guard_registered_category()', 'workforce_scheduled_jobs_guard_write()',
    'worker_owner_pair_try_lock(uuid, uuid)', 'expire_worker_contracts_batch(uuid, integer)',
    'refresh_worker_owner_relationships_batch(uuid, uuid, integer)', 'workforce_scheduled_job_pending(text)',
    'run_workforce_scheduled_job(text)', 'admin_workforce_scheduled_jobs()'
  ] loop
    if to_regprocedure('public.' || sig) is null then
      raise exception 'W12e: missing W12 function %', sig;
    end if;
    execute format('comment on function public.%s is %L', sig,
                   'W12: notification category registry and scheduled workforce jobs (created by the W12 migrations).');
  end loop;
  foreach rel in array array['notification_categories', 'workforce_scheduled_jobs'] loop
    if to_regclass('public.' || rel) is null or coalesce(obj_description(to_regclass('public.' || rel), 'pg_class'), '') not like 'W12:%' then
      raise exception 'W12e: missing W12 table or comment %', rel;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W12 rollbacks in reverse order e..a). FIRST, wherever the jobs were
-- registered, a human runs scripts/supabase-scheduling/unregister_workforce_jobs.sql (else cron calls a missing
-- function). Audit rows already written stay (append-only, P11).
-- -------------------------------------------------------------
-- drop function if exists public.admin_workforce_scheduled_jobs();
-- drop function if exists public.run_workforce_scheduled_job(text);
-- drop function if exists public.workforce_scheduled_job_pending(text);
