-- HUMAN-RUN ONLY, after human approval. NOT a migration: never copy this file into supabase/migrations/.
-- Run both scripts as the same role (postgres): pg_cron lets a role see and unschedule only the jobs it owns.
-- WashLink W12 (D-63, P85): removes every scheduled workforce job (pg_cron jobs named washlink_workforce_%).
-- Run it FIRST wherever register_workforce_jobs.sql was run, before rolling back any W12 migration (else cron keeps
-- calling a function that no longer exists). Idempotent: does nothing when pg_cron or the jobs are absent.
-- It does not drop the pg_cron extension (other jobs may use it). Unschedules by jobid (fix cycle 1 N6), which also
-- removes duplicate jobs of the same name.

do $$
declare
  job record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed; nothing to unregister.';
    return;
  end if;
  for job in execute $q$select jobid, jobname::text as jobname from cron.job where jobname like 'washlink\_workforce\_%' order by jobname, jobid$q$ loop
    perform cron.unschedule(job.jobid);
    raise notice 'Unregistered % (jobid %)', job.jobname, job.jobid;
  end loop;
end $$;
