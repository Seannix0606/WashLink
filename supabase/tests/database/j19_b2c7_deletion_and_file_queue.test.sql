-- B2C-7: every deletion path queues the washer's files, delete_my_account itself is unchanged, and the job's two functions believe only
-- the database: a name leaves the queue only when no object row remains (D-121). Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create temporary table names (k text primary key, name text) on commit drop;
grant select on names to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
create function pg_temp.nm(p text) returns text language sql stable as $$ select name from names where k = p $$;
create function pg_temp.status_of(p text) returns text language sql stable security definer as $$
  select status from public.independent_worker_documents where id = pg_temp.id(p) $$;
create function pg_temp.queued(p text) returns integer language sql stable security definer as $$
  select count(*)::int from public.independent_worker_document_file_queue where object_name = pg_temp.nm(p) $$;
-- service_role has no usage on test_helpers, so these two never call it while holding that role.
create function pg_temp.back() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform test_helpers.act_as_service();
end;
$$;
create function pg_temp.as_service_role() returns void language plpgsql as $$
begin
  perform pg_temp.back();
  perform set_config('role', 'service_role', true);
end;
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'succeeded';
exception when others then
  return sqlstate;
end;
$$;
create function pg_temp.keep(p_key text, p_worker text, p_type text, p_status text) returns void language plpgsql as $$
declare
  made uuid := test_helpers.create_worker_document(pg_temp.id(p_worker), p_type, p_status);
begin
  insert into ids values (p_key, made);
  insert into names select p_key, object_name from public.independent_worker_documents where id = made;
end;
$$;
insert into ids values
  ('dw', test_helpers.create_worker('b2c7-del-dw@local.test')),
  ('gw', test_helpers.create_worker('b2c7-del-gw@local.test')),
  ('rw', test_helpers.create_worker('b2c7-del-rw@local.test')),
  ('jw', test_helpers.create_worker('b2c7-del-jw@local.test')),
  ('a1', test_helpers.create_super_admin('b2c7-del-a1@local.test'));
insert into public.independent_workers (profile_id) select id from ids where k in ('dw', 'gw', 'rw', 'jw');

-- ---------- delete_my_account ----------
select pg_temp.keep('dw_ok', 'dw', 'government_id', 'approved');
select pg_temp.keep('dw_slot', 'dw', 'selfie', 'awaiting_upload');
select is(md5(replace((select prosrc from pg_proc where oid = 'public.delete_my_account()'::regprocedure), E'\r', '')),
          'f2ca6319b342f0f5c3b8054e06f6174e', 'delete_my_account_body_unchanged');
select test_helpers.act_as_with_amr(pg_temp.id('dw'));
select lives_ok('select public.delete_my_account()', 'deleted_account_rows_removed_file_queued');
select pg_temp.back();
select is((select count(*)::int from public.independent_worker_documents where id in (pg_temp.id('dw_ok'), pg_temp.id('dw_slot'))), 0, 'deleted_account_rows_removed_file_queued');
select is(pg_temp.queued('dw_ok') + pg_temp.queued('dw_slot'), 2, 'deleted_account_rows_removed_file_queued');
select is((select count(*)::int from storage.objects where bucket_id = 'worker-verification-documents' and name = pg_temp.nm('dw_ok')), 1, 'deleted_account_rows_removed_file_queued');

-- A deletion done outside the app, as the dashboard or GoTrue does.
select pg_temp.keep('gw_ok', 'gw', 'government_id', 'approved');
delete from auth.users where id = pg_temp.id('gw');
select is(pg_temp.queued('gw_ok'), 1, 'dashboard_style_user_delete_queues_file');

select is(pg_temp.queued('dw_ok'), 1, 'queue_row_survives_account_deletion');
select is((select count(*)::int from pg_constraint where conrelid = 'public.independent_worker_document_file_queue'::regclass and contype = 'f'), 0, 'queue_row_survives_account_deletion');

-- A refused deletion leaves everything where it was.
select pg_temp.keep('rw_ok', 'rw', 'government_id', 'approved');
select test_helpers.create_worker_profile(pg_temp.id('rw'));
select test_helpers.act_as_with_amr(pg_temp.id('rw'));
select throws_ok('select public.delete_my_account()', '42501', 'This account can''t be deleted here. Only WashLink can close it.', 'deletion_refused_keeps_rows_and_queue_empty');
select is(pg_temp.status_of('rw_ok') || ',' || pg_temp.queued('rw_ok'), 'approved,0', 'deletion_refused_keeps_rows_and_queue_empty');

-- ---------- the job's claim ----------
select pg_temp.back();
select pg_temp.keep('expired', 'jw', 'government_id', 'awaiting_upload');
update public.independent_worker_documents set upload_expires_at = now() - interval '1 second' where id = pg_temp.id('expired');
select pg_temp.keep('open', 'jw', 'selfie', 'awaiting_upload');
select pg_temp.keep('live_sub', 'jw', 'selfie', 'submitted');
select pg_temp.keep('live_ok', 'jw', 'government_id', 'approved');
select pg_temp.keep('live_rej', 'jw', 'government_id', 'rejected');
update storage.objects set created_at = now() - interval '4 hours'
  where bucket_id = 'worker-verification-documents' and name in (pg_temp.nm('live_sub'), pg_temp.nm('live_ok'), pg_temp.nm('live_rej'));
insert into names values ('orphan_old', gen_random_uuid() || '/' || gen_random_uuid()), ('orphan_new', gen_random_uuid() || '/' || gen_random_uuid());
select test_helpers.create_worker_document_object(pg_temp.nm('orphan_old'), p_age => interval '181 minutes');
select test_helpers.create_worker_document_object(pg_temp.nm('orphan_new'), p_age => interval '179 minutes');
-- A late token (F7): the file lands on a row that was already abandoned, or after a superseded file was removed.
select pg_temp.keep('late', 'jw', 'selfie', 'abandoned');
select test_helpers.create_worker_document_object(pg_temp.nm('late'), p_age => interval '4 hours');
select pg_temp.keep('late2', 'jw', 'selfie', 'superseded');
update storage.objects set created_at = now() - interval '4 hours' where bucket_id = 'worker-verification-documents' and name = pg_temp.nm('late2');
update public.independent_worker_documents set file_removed_at = now() where id = pg_temp.id('late2');

select pg_temp.as_service_role();
select is((select count(*)::int from public.worker_document_files_claim(1000) c where c.object_name = pg_temp.nm('expired')), 1, 'claim_expires_old_slots');
select pg_temp.back();
select is(pg_temp.status_of('expired') || ',' || pg_temp.queued('expired'), 'abandoned,1', 'claim_expires_old_slots');
select is(pg_temp.status_of('open') || ',' || pg_temp.queued('open'), 'awaiting_upload,0', 'claim_expires_old_slots');
select is(pg_temp.queued('orphan_old'), 1, 'claim_queues_orphan_object_after_3_hours');
select is(pg_temp.queued('late'), 1, 'claim_queues_late_file_on_abandoned_row');
select is(pg_temp.queued('late2') || ',' || (select (file_removed_at is null)::text from public.independent_worker_documents where id = pg_temp.id('late2')),
          '1,true', 'claim_queues_late_file_on_superseded_row');
select is(pg_temp.queued('orphan_new'), 0, 'claim_skips_recent_orphan');
select is(pg_temp.queued('live_sub') + pg_temp.queued('live_ok') + pg_temp.queued('live_rej'), 0, 'claim_skips_live_object');

-- Oldest first, the limit holds, and each claim counts as an attempt.
update public.independent_worker_document_file_queue set queued_at = now() - interval '9 days' where object_name = pg_temp.nm('orphan_old');
select pg_temp.as_service_role();
select is((select array_agg(c.object_name) from public.worker_document_files_claim(1) c), array[pg_temp.nm('orphan_old')], 'claim_returns_oldest_first_and_counts_attempts');
select pg_temp.back();
select is((select attempts from public.independent_worker_document_file_queue where object_name = pg_temp.nm('orphan_old')), 2, 'claim_returns_oldest_first_and_counts_attempts');

-- ---------- the job's confirm ----------
select pg_temp.as_service_role();
select is(public.worker_document_files_confirm_removed(array[pg_temp.nm('orphan_old')]), 0, 'confirm_refuses_while_object_row_exists');
select pg_temp.back();
select is(pg_temp.queued('orphan_old'), 1, 'confirm_refuses_while_object_row_exists');

select test_helpers.remove_worker_document_object(pg_temp.nm('orphan_old'));
select test_helpers.remove_worker_document_object(pg_temp.nm('late'));
select pg_temp.as_service_role();
select is(public.worker_document_files_confirm_removed(array[pg_temp.nm('orphan_old'), pg_temp.nm('late'), pg_temp.nm('late2'), 'not-in-the-queue']), 2, 'confirm_deletes_queue_row_when_gone');
select pg_temp.back();
select is(pg_temp.queued('orphan_old') || ',' || pg_temp.queued('late') || ',' || pg_temp.queued('late2'), '0,0,1', 'confirm_deletes_queue_row_when_gone');
select is((select count(*)::int from public.independent_worker_documents where id = pg_temp.id('late') and file_removed_at is not null), 1, 'confirm_stamps_surviving_row');
select is((select payload from public.workforce_audit_events where action = 'independent_worker_document.files_removed' order by id desc limit 1), '{"files_removed": 2}'::jsonb, 'confirm_stamps_surviving_row');

-- ---------- who can call them ----------
select test_helpers.act_as(pg_temp.id('a1'));
select is(pg_temp.try('select * from public.worker_document_files_claim(1)') || ',' || pg_temp.try('select public.worker_document_files_confirm_removed(''{}'')'),
          '42501,42501', 'job_functions_refused_for_authenticated');
select test_helpers.act_as(pg_temp.id('jw'));
select is(pg_temp.try('select * from public.worker_document_files_claim(1)') || ',' || pg_temp.try('select public.worker_document_files_confirm_removed(''{}'')'),
          '42501,42501', 'job_functions_refused_for_authenticated');
select test_helpers.act_as_anon();
select is(pg_temp.try('select * from public.worker_document_files_claim(1)') || ',' || pg_temp.try('select public.worker_document_files_confirm_removed(''{}'')'),
          '42501,42501', 'job_functions_refused_for_anon');
select pg_temp.as_service_role();
select is(pg_temp.try('select * from public.worker_document_files_claim(1)') || ',' || pg_temp.try('select public.worker_document_files_confirm_removed(''{}'')'),
          'succeeded,succeeded', 'job_functions_allowed_for_service_role');
select pg_temp.back();

-- ---------- an owner without BYPASSRLS gets an error, never "the file is gone" ----------
select pg_temp.back();
select is((select coalesce(string_agg(p.oid::regprocedure::text, ','), '-') from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosrc ~ 'storage\.objects'
             and not coalesce('row_security=off' = any (p.proconfig), false)), '-', 'functions_reading_storage_set_row_security_off');
-- The real failure mode: the same function owned by a role that has no BYPASSRLS. Without the setting this would return 1 and clear the queue.
create role b2c7_no_bypass nologin nobypassrls;
grant b2c7_no_bypass to postgres;
grant usage on schema storage to b2c7_no_bypass;
grant usage, create on schema public to b2c7_no_bypass;
grant select on storage.objects to b2c7_no_bypass;
grant select, delete on public.independent_worker_document_file_queue to b2c7_no_bypass;
alter function public.worker_document_files_confirm_removed(text[]) owner to b2c7_no_bypass;
insert into public.independent_worker_document_file_queue (object_name) values ('still/here');
select test_helpers.create_worker_document_object('still/here');
select throws_ok($$ select public.worker_document_files_confirm_removed(array['still/here']) $$, '42501', null, 'owner_without_bypassrls_errors_instead_of_seeing_no_rows');
alter function public.worker_document_files_confirm_removed(text[]) owner to postgres;

select * from finish();
rollback;
