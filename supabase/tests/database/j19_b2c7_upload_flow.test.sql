-- B2C-7: a washer's upload slot and submit. The server builds the path and reads type and size from storage.objects. Each refusal
-- has a matching success in this file. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('a1', test_helpers.create_super_admin('b2c7-up-a1@local.test')),
  ('c1', test_helpers.create_customer('b2c7-up-c1@local.test')),
  ('o1', test_helpers.create_owner('b2c7-up-o1@local.test')),
  ('w1', test_helpers.create_worker('b2c7-up-w1@local.test')),
  ('w2', test_helpers.create_worker('b2c7-up-w2@local.test')),
  ('w3', test_helpers.create_worker('b2c7-up-w3@local.test')),
  ('w4', test_helpers.create_worker('b2c7-up-w4@local.test')),
  ('w5', test_helpers.create_worker('b2c7-up-w5@local.test')),
  ('w6', test_helpers.create_worker('b2c7-up-w6@local.test'));
insert into public.independent_workers (profile_id, verification_status)
  select id, case k when 'w3' then 'suspended' when 'w4' then 'rejected' else 'pending' end from ids where k in ('w1', 'w2', 'w3', 'w4', 'w6');

-- Begin as a washer, returning to the service session with the new id stored.
create function pg_temp.begin(p_worker text, p_type text, p_key text) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id(p_worker));
  select r.document_id into made from public.begin_worker_document_upload(p_type) r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.status(p_key text) returns text language sql stable as $$
  select status from public.independent_worker_documents where id = pg_temp.id(p_key) $$;
create function pg_temp.name_of(p_key text) returns text language sql stable as $$
  select object_name from public.independent_worker_documents where id = pg_temp.id(p_key) $$;

create function pg_temp.begin_times(p_times integer) returns integer language plpgsql as $$
begin
  for i in 1 .. p_times loop
    perform * from public.begin_worker_document_upload('selfie');
  end loop;
  return p_times;
end;
$$;

-- ---------- D-123: uploads stay off until a person turns them on ----------
select is((select worker_document_uploads_enabled from public.platform_settings), false, 'uploads_flag_defaults_off');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'platform_settings' and column_name = 'worker_document_uploads_enabled'),
          'false', 'uploads_flag_defaults_off');
insert into ids values ('closed', test_helpers.create_worker_document(pg_temp.id('w1'), 'selfie', 'awaiting_upload'));
select test_helpers.create_worker_document_object(pg_temp.name_of('closed'));
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok($$ select * from public.begin_worker_document_upload('selfie') $$, '23514', 'WashLink isn''t accepting verification documents yet. Try again later.', 'begin_refused_while_uploads_off');
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('closed')), '23514', 'WashLink isn''t accepting verification documents yet. Try again later.', 'submit_refused_while_uploads_off');
select test_helpers.act_as(pg_temp.id('a1'));
select is(test_helpers.attempt('update public.platform_settings set worker_document_uploads_enabled = true'), '42501', 'uploads_flag_only_changed_by_human_sql');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.prosrc ~* 'set[^;]*worker_document_uploads_enabled'), 0, 'uploads_flag_only_changed_by_human_sql');
select test_helpers.act_as_service();
delete from public.independent_worker_documents where id = pg_temp.id('closed');
delete from public.independent_worker_document_file_queue;
update public.platform_settings set worker_document_uploads_enabled = true;

-- ---------- begin ----------
select test_helpers.act_as(pg_temp.id('w1'));
select matches((select r.object_name from public.begin_worker_document_upload('government_id') r),
               '^' || pg_temp.id('w1') || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'begin_builds_server_path');
select test_helpers.act_as_service();
select is((select count(*)::int from public.independent_worker_documents where worker_id = pg_temp.id('w1')
             and object_name = worker_id::text || '/' || id::text and status = 'awaiting_upload'), 1, 'begin_builds_server_path');
select is((select pg_get_function_arguments(p.oid) from pg_proc p where p.oid = 'public.begin_worker_document_upload(text)'::regprocedure),
          'p_document_type text', 'begin_has_no_filename_argument');
select is((select count(*)::int from pg_proc p, unnest(p.proargnames) a where p.proname in ('begin_worker_document_upload', 'submit_worker_document_upload')
             and a ~* '(file|path|size|mime|content|ext)' and a not in ('content_type', 'size_bytes')), 0, 'begin_has_no_filename_argument');

select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select * from public.begin_worker_document_upload('selfie') $$, '42501', 'Sign in with a worker account.', 'begin_refused_for_customer');
select test_helpers.act_as(pg_temp.id('o1'));
select throws_ok($$ select * from public.begin_worker_document_upload('selfie') $$, '42501', 'Sign in with a worker account.', 'begin_refused_for_owner');
select test_helpers.act_as(pg_temp.id('w5'));
select throws_ok($$ select * from public.begin_worker_document_upload('selfie') $$, '23514', 'Save your washer profile before uploading documents.', 'begin_refused_without_worker_row');
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok($$ select * from public.begin_worker_document_upload('passport_scan') $$, '22023', 'Choose a document type.', 'begin_refused_for_unknown_type');
select test_helpers.act_as(pg_temp.id('w3'));
select throws_ok($$ select * from public.begin_worker_document_upload('selfie') $$, '23514', 'WashLink has paused your account, so you can''t upload documents right now.', 'begin_refused_when_suspended');
select test_helpers.act_as(pg_temp.id('w4'));
select is((select count(*)::int from public.begin_worker_document_upload('selfie')), 1, 'begin_allowed_when_rejected');

-- D-122: ten slots in a rolling day. The eleventh is refused, and a row older than a day stops counting.
select test_helpers.act_as(pg_temp.id('w6'));
select is(pg_temp.begin_times(10), 10, 'begin_refused_over_daily_cap');
select throws_ok($$ select * from public.begin_worker_document_upload('selfie') $$, '23514', 'You have started too many uploads today. Try again tomorrow.', 'begin_refused_over_daily_cap');
select test_helpers.act_as_service();
update public.independent_worker_documents set created_at = now() - interval '25 hours'
  where id = (select id from public.independent_worker_documents where worker_id = pg_temp.id('w6') order by created_at limit 1);
select test_helpers.act_as(pg_temp.id('w6'));
select is((select count(*)::int from public.begin_worker_document_upload('selfie')), 1, 'begin_refused_over_daily_cap');
select test_helpers.act_as_service();

select pg_temp.begin('w2', 'selfie', 'first');
select pg_temp.begin('w2', 'selfie', 'second');
select is(pg_temp.status('first') || ',' || pg_temp.status('second'), 'abandoned,awaiting_upload', 'begin_again_abandons_old_slot');
select is((select count(*)::int from public.independent_worker_document_file_queue where object_name = pg_temp.name_of('first')), 1, 'begin_again_abandons_old_slot');

-- ---------- submit ----------
select test_helpers.act_as(pg_temp.id('w2'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('second')), '23514', 'We could not find your uploaded file. Try again.', 'submit_refused_without_object');
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('second')), '42501', 'Document not found.', 'submit_refused_for_other_washers_row');

select test_helpers.act_as_service();
select test_helpers.create_worker_document_object(pg_temp.name_of('second'), 'image/jpeg; charset=utf-8', 2048);
select test_helpers.act_as(pg_temp.id('w2'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('second')), '23514', 'Upload a JPEG or PNG photo.', 'submit_refused_with_charset_suffix');

select test_helpers.act_as_service();
select test_helpers.remove_worker_document_object(pg_temp.name_of('second'));
select test_helpers.create_worker_document_object(pg_temp.name_of('second'), 'image/svg+xml', 2048);
select test_helpers.act_as(pg_temp.id('w2'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('second')), '23514', 'Upload a JPEG or PNG photo.', 'submit_refused_with_disallowed_type');

select test_helpers.act_as_service();
select test_helpers.remove_worker_document_object(pg_temp.name_of('second'));
select test_helpers.create_worker_document_object(pg_temp.name_of('second'), 'image/png', 0);
select test_helpers.act_as(pg_temp.id('w2'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('second')), '23514', 'We could not read your uploaded file. Try again.', 'submit_refused_with_empty_file');

select test_helpers.act_as_service();
select test_helpers.remove_worker_document_object(pg_temp.name_of('second'));
select test_helpers.create_worker_document_object(pg_temp.name_of('second'), 'image/png', 4097, 'version-from-storage');
select test_helpers.act_as(pg_temp.id('w2'));
select results_eq(format($$ select status, content_type, size_bytes from public.submit_worker_document_upload(%L) $$, pg_temp.id('second')),
                  $$ values ('submitted'::text, 'image/png'::text, 4097) $$, 'submit_stores_type_and_size_from_storage');
select test_helpers.act_as_service();
select is((select object_version from public.independent_worker_documents where id = pg_temp.id('second')), 'version-from-storage', 'submit_stores_type_and_size_from_storage');
select is((select payload from public.workforce_audit_events where action = 'independent_worker_document.submitted' and subject_id = pg_temp.id('second')),
          '{"document_type": "selfie", "size_kb": 5}'::jsonb, 'submit_stores_type_and_size_from_storage');
select test_helpers.act_as(pg_temp.id('w2'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('second')), '55000', 'This upload is no longer open. Start again.', 'submit_refused_when_not_awaiting');

-- A slot past its time is closed for submit as well as upload, before the job has got to it.
select test_helpers.act_as_service();
update public.independent_worker_documents set status = 'abandoned' where worker_id = pg_temp.id('w1') and document_type = 'government_id';
insert into ids values ('late', test_helpers.create_worker_document(pg_temp.id('w1'), 'government_id', 'awaiting_upload'));
select test_helpers.create_worker_document_object(pg_temp.name_of('late'));
update public.independent_worker_documents set upload_expires_at = now() - interval '1 second' where id = pg_temp.id('late');
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('late')), '55000', 'This upload is no longer open. Start again.', 'submit_refused_after_slot_expires');

-- D-111: a file uploaded before a suspension does not enter the review queue after it.
select test_helpers.act_as_service();
insert into ids values ('held', test_helpers.create_worker_document(pg_temp.id('w3'), 'selfie', 'awaiting_upload'));
select test_helpers.create_worker_document_object(pg_temp.name_of('held'));
select test_helpers.act_as(pg_temp.id('w3'));
select throws_ok(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('held')), '23514', 'WashLink has paused your account, so you can''t upload documents right now.', 'submit_refused_when_suspended');

-- A newer upload replaces a rejected row, and leaves an approved one in place (D-110).
select test_helpers.act_as_service();
insert into ids values ('rej', test_helpers.create_worker_document(pg_temp.id('w4'), 'government_id', 'rejected', 'The photo is too dark'));
insert into ids values ('ok', test_helpers.create_worker_document(pg_temp.id('w4'), 'government_id', 'approved'));
select pg_temp.begin('w4', 'government_id', 'newer');
select test_helpers.create_worker_document_object(pg_temp.name_of('newer'));
select test_helpers.act_as(pg_temp.id('w4'));
select is((select count(*)::int from public.submit_worker_document_upload(pg_temp.id('newer'))), 1, 'submit_supersedes_older_rejected');
select test_helpers.act_as_service();
select is(pg_temp.status('rej') || ',' || (select count(*)::text from public.independent_worker_document_file_queue where object_name = pg_temp.name_of('rej')),
          'superseded,1', 'submit_supersedes_older_rejected');
select is(pg_temp.status('ok') || ',' || (select count(*)::text from public.independent_worker_document_file_queue where object_name = pg_temp.name_of('ok')),
          'approved,0', 'submit_keeps_approved_copy');

-- ---------- what the washer reads ----------
select test_helpers.act_as_service();
insert into ids values ('why', test_helpers.create_worker_document(pg_temp.id('w1'), 'selfie', 'rejected', 'The face is not visible'));
select test_helpers.act_as(pg_temp.id('w1'));
select results_eq($$ select document_type, status, review_reason, is_required, has_approved_copy from public.my_worker_documents() order by document_type $$,
                  $$ values ('government_id'::text, null::text, null::text, true, false), ('selfie'::text, 'rejected'::text, 'The face is not visible'::text, true, false) $$,
                  'my_documents_shows_reason');
select is((select count(*)::int from public.my_worker_documents() d where d.document_id in (pg_temp.id('second'), pg_temp.id('newer'))), 0, 'my_documents_shows_only_own');
select test_helpers.act_as(pg_temp.id('w5'));
select is((select count(*)::int from public.my_worker_documents() d where d.document_id is null), 2, 'my_documents_shows_only_own');
select is((select count(*)::int from pg_proc p, unnest(p.proargnames) a where p.proname = 'my_worker_documents'
             and a in ('object_name', 'object_version', 'reviewed_by', 'read_open_for', 'path', 'name')), 0, 'my_documents_has_no_path_column');

select * from finish();
rollback;
