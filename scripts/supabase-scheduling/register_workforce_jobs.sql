-- HUMAN-RUN ONLY, after human approval. NOT a migration: never copy this file into supabase/migrations/.
-- Run both scripts as the same role (postgres): a job registered by another role is not replaced by name and cannot be
-- unregistered by unregister_workforce_jobs.sql run as postgres.
-- WashLink W12 (D-63, P85): registers the three scheduled workforce jobs with pg_cron. Run it by hand in the SQL editor
-- (or psql) of the approved project, as the database owner, after the W12 migrations are applied. Schedules are UTC.
-- Every job calls the single date-free entry point public.run_workforce_scheduled_job(<job key>) (one job per
-- transaction; never waits on a lock; state in public.workforce_scheduled_jobs; status in the super_admin Overview card).
-- Idempotent: cron.schedule(job_name, ...) replaces an existing job of the same name.
-- Check runs afterwards: select * from cron.job_run_details order by start_time desc limit 20;
-- Pause one job without unregistering it (trusted SQL):
--   update public.workforce_scheduled_jobs set enabled = false where job_key = 'worker_contract_expiry';
-- Undo: scripts/supabase-scheduling/unregister_workforce_jobs.sql (run it BEFORE rolling back the W12 migrations).
-- Never call the raw expire_worker_contracts(date), refresh_worker_owner_relationships(date) or
-- enqueue_certification_expiry_notices(timestamptz) with a date in production (D-64).

create extension if not exists pg_cron;

select cron.schedule('washlink_workforce_certification_expiry_notices', '17 * * * *',
                     $job$select public.run_workforce_scheduled_job('certification_expiry_notices')$job$);
select cron.schedule('washlink_workforce_worker_contract_expiry', '*/10 * * * *',
                     $job$select public.run_workforce_scheduled_job('worker_contract_expiry')$job$);
select cron.schedule('washlink_workforce_owner_relationship_refresh', '5-59/10 * * * *',
                     $job$select public.run_workforce_scheduled_job('owner_relationship_refresh')$job$);

select jobname, schedule, command from cron.job where jobname like 'washlink\_workforce\_%' order by jobname;
