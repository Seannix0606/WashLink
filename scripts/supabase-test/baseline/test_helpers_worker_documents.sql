-- LOCAL TEST BASELINE (B2C-7): helpers for the washer verification document tests. Staged as seed only, never a migration.
-- pgTAP talks to storage.objects directly, so it proves the policies and not the Storage service. b2c7-api-smoke proves the service.

-- A row as the Storage service would leave it after an upload. Run as the service session.
create or replace function test_helpers.create_worker_document_object(p_name text, p_mime text default 'image/jpeg',
  p_size bigint default 2048, p_version text default 'fixture-version', p_age interval default interval '0')
returns void language plpgsql security invoker
as $$
begin
  insert into storage.objects (bucket_id, name, metadata, version, created_at)
  values ('worker-verification-documents', p_name, jsonb_build_object('mimetype', p_mime, 'size', p_size, 'eTag', '"fixture"'),
          p_version, now() - p_age);
end;
$$;

-- What the Storage service does on remove. Only this test session sets the setting that protect_delete looks for.
create or replace function test_helpers.remove_worker_document_object(p_name text)
returns void language plpgsql security invoker
as $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'worker-verification-documents' and name = p_name;
  perform set_config('storage.allow_delete_query', 'false', true);
end;
$$;

-- One document row in any status, with its object row when the status means a file exists.
create or replace function test_helpers.create_worker_document(p_worker uuid, p_type text, p_status text, p_reason text default null)
returns uuid language plpgsql security invoker
as $$
declare
  new_id uuid := gen_random_uuid();
  has_file boolean := p_status in ('submitted', 'approved', 'rejected', 'superseded');
begin
  insert into public.independent_worker_documents (id, worker_id, document_type, status, object_name, content_type, size_bytes, object_version,
    submitted_at, reviewed_at, review_reason)
  values (new_id, p_worker, p_type, p_status, p_worker::text || '/' || new_id::text,
    case when has_file then 'image/jpeg' end, case when has_file then 2048 end, case when has_file then 'fixture-version' end,
    case when has_file then now() end, case when p_status in ('approved', 'rejected') then now() end,
    coalesce(p_reason, case when p_status = 'rejected' then 'Fixture rejection reason' end));
  if has_file then
    perform test_helpers.create_worker_document_object(p_worker::text || '/' || new_id::text);
  end if;
  return new_id;
end;
$$;

-- A complete approved set, for a test that needs a washer the verification gate will accept.
create or replace function test_helpers.give_worker_approved_documents(p_worker uuid)
returns void language sql security invoker
as $$
  select test_helpers.create_worker_document(p_worker, t.key, 'approved')
  from public.independent_worker_document_types t where t.is_required;
$$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.give_worker_approved_documents(uuid);
-- drop function if exists test_helpers.create_worker_document(uuid, text, text, text);
-- drop function if exists test_helpers.remove_worker_document_object(text);
-- drop function if exists test_helpers.create_worker_document_object(text, text, bigint, text, interval);
