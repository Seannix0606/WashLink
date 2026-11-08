-- B2C-7: the private bucket, its only two storage policies, and tables no client role can reach. Runs as real roles against
-- storage.objects directly, so this proves the policies; b2c7-api-smoke proves the Storage service. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('a1', test_helpers.create_super_admin('b2c7-pol-a1@local.test')),
  ('a2', test_helpers.create_super_admin('b2c7-pol-a2@local.test')),
  ('c1', test_helpers.create_customer('b2c7-pol-c1@local.test')),
  ('w1', test_helpers.create_worker('b2c7-pol-w1@local.test')),
  ('w2', test_helpers.create_worker('b2c7-pol-w2@local.test')),
  ('w3', test_helpers.create_worker('b2c7-pol-w3@local.test'));
update public.platform_settings set worker_document_uploads_enabled = true;
insert into public.independent_workers (profile_id, verification_status)
  select id, case k when 'w3' then 'suspended' else 'pending' end from ids where k in ('w1', 'w2', 'w3');

-- Storage sets this on every route (probed on v1.88.0). Each assertion names the route it stands for.
create function pg_temp.upload(p_name text, p_operation text default 'storage.object.upload') returns text language sql as $$
  select set_config('storage.operation', p_operation, true);
  select test_helpers.attempt(format('insert into storage.objects (bucket_id, name, metadata, version) values (''worker-verification-documents'', %L, ''{"mimetype":"image/jpeg","size":10}'', ''v1'')', p_name)) $$;
create function pg_temp.visible(p_name text, p_operation text default 'storage.object.get_authenticated') returns integer language plpgsql as $$
declare
  n integer;
begin
  perform set_config('storage.operation', p_operation, true);
  select count(*)::int into n from storage.objects where bucket_id = 'worker-verification-documents' and name = p_name;
  return n;
end;
$$;
create function pg_temp.name_of(p_doc uuid) returns text language plpgsql security definer as $$
declare
  n text;
begin
  select object_name into n from public.independent_worker_documents where id = p_doc;
  return n;
end;
$$;
create function pg_temp.slot(p_worker text, p_key text) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id(p_worker));
  select r.document_id into made from public.begin_worker_document_upload('government_id') r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;

-- ---------- bucket ----------
select is((select public from storage.buckets where id = 'worker-verification-documents'), false, 'bucket_is_private');
select is((select file_size_limit from storage.buckets where id = 'worker-verification-documents'), 10485760::bigint, 'bucket_limit_is_10_mib');
select is((select allowed_mime_types from storage.buckets where id = 'worker-verification-documents'), array['image/jpeg', 'image/png'], 'bucket_allows_only_jpeg_and_png');
select is((select string_agg(policyname || ':' || cmd || ':' || roles::text, ',' order by policyname) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and coalesce(qual, '') || coalesce(with_check, '') like '%worker-verification-documents%'),
          'iwd_storage_insert_open_slot:INSERT:{authenticated},iwd_storage_select_admin_open_read:SELECT:{authenticated}',
          'bucket_policies_are_exactly_two');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and coalesce(qual, '') || coalesce(with_check, '') like '%worker-verification-documents%'
             and cmd in ('UPDATE', 'DELETE', 'ALL')), 0, 'no_washer_select_update_delete_policy');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and coalesce(qual, '') like '%worker-verification-documents%' and coalesce(qual, '') not like '%worker_document_admin_read_is_open%'),
          0, 'no_washer_select_update_delete_policy');

-- ---------- insert ----------
select test_helpers.act_as(pg_temp.id('w1'));
select is(pg_temp.upload(pg_temp.id('w1') || '/' || gen_random_uuid()), '42501', 'insert_refused_without_open_slot');
select pg_temp.slot('w1', 'slot1');
select pg_temp.slot('w2', 'slot2');
select test_helpers.act_as(pg_temp.id('w1'));
select is(pg_temp.upload(pg_temp.id('w1') || '/' || gen_random_uuid()), '42501', 'insert_refused_for_other_name_in_own_folder');
select is(pg_temp.upload(pg_temp.name_of(pg_temp.id('slot2'))), '42501', 'insert_refused_for_other_washers_folder');
select is(pg_temp.upload(pg_temp.id('w2') || '/' || pg_temp.id('slot1')), '42501', 'insert_refused_for_other_washers_folder');
select is(pg_temp.upload(pg_temp.id('w1') || '/../' || pg_temp.id('w2') || '/' || pg_temp.id('slot1')), '42501', 'insert_refused_for_other_name_in_own_folder');

-- The control for every refusal here: the same call succeeds for the washer's own open slot.
select is(pg_temp.upload(pg_temp.name_of(pg_temp.id('slot1'))), 'succeeded', 'insert_allowed_into_own_open_slot');
select is(pg_temp.upload(pg_temp.name_of(pg_temp.id('slot1'))), '23505', 'insert_allowed_into_own_open_slot');

-- D-124: the same open slot, by every other route. Only the plain upload route is allowed.
select test_helpers.act_as(pg_temp.id('w2'));
select is((select string_agg(pg_temp.upload(pg_temp.name_of(pg_temp.id('slot2')), op), ',') from unnest(array['storage.object.sign_upload_url', 'storage.tus.upload.create',
             'storage.tus.upload.part', 'storage.s3.upload', 'storage.object.copy', 'storage.object.upload_update', '']) op),
          '42501,42501,42501,42501,42501,42501,42501', 'insert_refused_on_every_other_route');

select test_helpers.act_as_service();
update public.independent_worker_documents set upload_expires_at = now() - interval '1 second' where id = pg_temp.id('slot2');
select test_helpers.act_as(pg_temp.id('w2'));
select is(pg_temp.upload(pg_temp.name_of(pg_temp.id('slot2'))), '42501', 'insert_refused_after_slot_expires');

select test_helpers.act_as_service();
insert into ids values ('slot3', test_helpers.create_worker_document(pg_temp.id('w3'), 'government_id', 'awaiting_upload'));
select test_helpers.act_as(pg_temp.id('w3'));
select is(pg_temp.upload(pg_temp.name_of(pg_temp.id('slot3'))), '42501', 'insert_refused_for_suspended_washer');
select test_helpers.act_as(pg_temp.id('c1'));
select is(pg_temp.upload(pg_temp.id('c1') || '/' || gen_random_uuid()), '42501', 'insert_refused_for_customer');
select is(pg_temp.upload(pg_temp.name_of(pg_temp.id('slot1'))), '42501', 'insert_refused_for_customer');

-- ---------- select ----------
select test_helpers.act_as_service();
insert into ids values ('doc2', test_helpers.create_worker_document(pg_temp.id('w2'), 'selfie', 'submitted'));
select test_helpers.act_as(pg_temp.id('w2'));
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 0, 'select_refused_for_washer_own_file');
select test_helpers.act_as(pg_temp.id('w1'));
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 0, 'select_refused_for_other_washer_guessed_path');
select test_helpers.act_as(pg_temp.id('c1'));
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 0, 'select_refused_for_customer');
select test_helpers.act_as(pg_temp.id('a1'));
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 0, 'select_refused_for_admin_without_open_window');

select is((select count(*)::int from public.admin_open_worker_document(pg_temp.id('doc2'))), 1, 'select_allowed_for_admin_in_window');
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 1, 'select_allowed_for_admin_in_window');
-- D-118: the same window, by every other route. Signing is refused outright, so no long-lived link can be minted.
select is((select sum(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2')), op))::int from unnest(array['storage.object.sign', 'storage.object.sign_many', 'storage.object.copy',
             'storage.object.move', 'storage.object.list', 'storage.s3.object.get', 'object.get_authenticated_info', 'object.head_authenticated_info', 'storage.object.delete_many', '']) op),
          0, 'select_refused_on_every_other_route');
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 1, 'select_refused_on_every_other_route');
select test_helpers.act_as(pg_temp.id('a2'));
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 0, 'select_refused_for_other_admin_in_window');
select test_helpers.act_as_service();
update public.independent_worker_documents set read_open_until = now() - interval '1 second' where id = pg_temp.id('doc2');
select test_helpers.act_as(pg_temp.id('a1'));
select is(pg_temp.visible(pg_temp.name_of(pg_temp.id('doc2'))), 0, 'select_refused_after_window_ends');

-- ---------- tables ----------
create function pg_temp.write_codes() returns text language plpgsql as $$
declare
  worker_id uuid := pg_temp.id('w1');
begin
  return concat_ws(',',
    test_helpers.attempt(format('update public.independent_worker_documents set status = ''approved'' where worker_id = %L', worker_id)),
    test_helpers.attempt(format('insert into public.independent_worker_documents (worker_id, document_type, object_name) values (%L, ''selfie'', ''x'')', worker_id)),
    test_helpers.attempt('delete from public.independent_worker_documents'),
    test_helpers.attempt('update public.independent_worker_document_types set is_required = false'),
    test_helpers.attempt('delete from public.independent_worker_document_file_queue'),
    test_helpers.attempt('insert into public.independent_worker_document_file_queue (object_name) values (''x'')'));
end;
$$;
create function pg_temp.read_codes() returns text language sql as $$
  select concat_ws(',', test_helpers.attempt('select * from public.independent_worker_documents'),
    test_helpers.attempt('select * from public.independent_worker_document_types'),
    test_helpers.attempt('select * from public.independent_worker_document_file_queue')) $$;

select test_helpers.act_as(pg_temp.id('w1'));
select is(pg_temp.write_codes(), '42501,42501,42501,42501,42501,42501', 'direct_table_writes_refused_every_client_role');
select is(pg_temp.read_codes(), '42501,42501,42501', 'direct_table_reads_refused_every_client_role');
select test_helpers.act_as(pg_temp.id('a1'));
select is(pg_temp.write_codes(), '42501,42501,42501,42501,42501,42501', 'direct_table_writes_refused_every_client_role');
select is(pg_temp.read_codes(), '42501,42501,42501', 'direct_table_reads_refused_every_client_role');
select test_helpers.act_as(pg_temp.id('c1'));
select is(pg_temp.write_codes(), '42501,42501,42501,42501,42501,42501', 'direct_table_writes_refused_every_client_role');
select is(pg_temp.read_codes(), '42501,42501,42501', 'direct_table_reads_refused_every_client_role');
select test_helpers.act_as_anon();
select is(pg_temp.read_codes(), '42501,42501,42501', 'direct_table_reads_refused_every_client_role');
select test_helpers.act_as_service();

select is((select count(*)::int from unnest(array['public.independent_worker_documents', 'public.independent_worker_document_types',
             'public.independent_worker_document_file_queue']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
           where has_table_privilege('service_role', t, p)), 0, 'service_role_has_no_table_access');
select is((select count(*)::int from pg_class c where c.oid in ('public.independent_worker_documents'::regclass,
             'public.independent_worker_document_types'::regclass, 'public.independent_worker_document_file_queue'::regclass) and c.relrowsecurity), 3,
          'service_role_has_no_table_access');
select is((select count(*)::int from pg_policies where schemaname = 'public'
             and tablename in ('independent_worker_documents', 'independent_worker_document_types', 'independent_worker_document_file_queue')), 0,
          'service_role_has_no_table_access');

select * from finish();
rollback;
