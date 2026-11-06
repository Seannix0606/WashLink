-- =============================================================
-- WashLink B2C m (B2C-7) - what washers and admins can do with verification documents.
-- The server builds every path and reads every size and type from storage.objects. No filename parameter exists. Audit payloads
-- hold no path, filename, reason or byte count. Lock order is always worker then document. Approving never changes a washer's
-- status (D-112). Opening is audited before the read window can be used, and each admin has an hourly cap (D-118). Functions that read
-- storage.objects set row_security = off, so an owner without BYPASSRLS gets an error instead of silently seeing no rows.
-- Local proof only (D-10, D-11).
-- =============================================================

create or replace function public.begin_worker_document_upload(p_document_type text)
returns table (document_id uuid, object_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  worker_status text;
  new_id uuid := gen_random_uuid();
  new_name text;
begin
  if me is null or public.current_user_profile_role() is distinct from 'worker' then
    raise exception 'Sign in with a worker account.' using errcode = '42501';
  end if;
  if not (select s.worker_document_uploads_enabled from public.platform_settings s) then
    raise exception 'WashLink isn''t accepting verification documents yet. Try again later.' using errcode = '23514';
  end if;
  select w.verification_status into worker_status from public.independent_workers w where w.profile_id = me for update;
  if worker_status is null then
    raise exception 'Save your washer profile before uploading documents.' using errcode = '23514';
  end if;
  if worker_status = 'suspended' then
    raise exception 'WashLink has paused your account, so you can''t upload documents right now.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.independent_worker_document_types t where t.key = p_document_type) then
    raise exception 'Choose a document type.' using errcode = '22023';
  end if;
  if (select count(*) from public.independent_worker_documents d
      where d.worker_id = me and d.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You have started too many uploads today. Try again tomorrow.' using errcode = '23514';
  end if;
  perform public.worker_document_retire_file(d.id, 'abandoned') from public.independent_worker_documents d
    where d.worker_id = me and d.document_type = p_document_type and d.status = 'awaiting_upload';
  new_name := me::text || '/' || new_id::text;
  insert into public.independent_worker_documents (id, worker_id, document_type, object_name)
    values (new_id, me, p_document_type, new_name);
  return query select new_id, new_name;
end;
$$;

create or replace function public.submit_worker_document_upload(p_document uuid)
returns table (document_id uuid, document_type text, status text, content_type text, size_bytes integer, submitted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  worker_status text;
  doc public.independent_worker_documents;
  stored_type text;
  stored_size text;
  stored_version text;
  found_object boolean := false;
begin
  if me is null then
    raise exception 'Document not found.' using errcode = '42501';
  end if;
  select w.verification_status into worker_status from public.independent_workers w where w.profile_id = me for update;
  select * into doc from public.independent_worker_documents d where d.id = p_document and d.worker_id = me for update;
  if doc.id is null then
    raise exception 'Document not found.' using errcode = '42501';
  end if;
  if not (select s.worker_document_uploads_enabled from public.platform_settings s) then
    raise exception 'WashLink isn''t accepting verification documents yet. Try again later.' using errcode = '23514';
  end if;
  if doc.status <> 'awaiting_upload' or doc.upload_expires_at <= now() then
    raise exception 'This upload is no longer open. Start again.' using errcode = '55000';
  end if;
  -- D-111: no new document enters the review queue from a suspended account, even one uploaded before the suspension.
  if worker_status = 'suspended' then
    raise exception 'WashLink has paused your account, so you can''t upload documents right now.' using errcode = '23514';
  end if;
  select true, o.metadata ->> 'mimetype', o.metadata ->> 'size', o.version into found_object, stored_type, stored_size, stored_version
    from storage.objects o where o.bucket_id = 'worker-verification-documents' and o.name = doc.object_name;
  if not coalesce(found_object, false) then
    raise exception 'We could not find your uploaded file. Try again.' using errcode = '23514';
  end if;
  -- Exact match, which refuses 'image/jpeg; charset=utf-8'. Anything unexpected fails closed.
  if stored_type is null or stored_type not in ('image/jpeg', 'image/png') then
    raise exception 'Upload a JPEG or PNG photo.' using errcode = '23514';
  end if;
  if stored_size is null or stored_size !~ '^[0-9]{1,9}$' or stored_size::integer not between 1 and 10485760
     or stored_version is null then
    raise exception 'We could not read your uploaded file. Try again.' using errcode = '23514';
  end if;
  perform public.worker_document_retire_file(d.id, 'superseded') from public.independent_worker_documents d
    where d.worker_id = me and d.document_type = doc.document_type and d.status in ('submitted', 'rejected');
  update public.independent_worker_documents d
    set status = 'submitted', content_type = stored_type, size_bytes = stored_size::integer, object_version = stored_version,
        submitted_at = now(), updated_at = now()
    where d.id = doc.id;
  perform public.record_workforce_audit_event('independent_worker_document.submitted', 'independent_worker_document', doc.id, me,
    jsonb_build_object('document_type', doc.document_type, 'size_kb', ceil(stored_size::numeric / 1024)::integer));
  return query select d.id, d.document_type, d.status, d.content_type, d.size_bytes, d.submitted_at
    from public.independent_worker_documents d where d.id = doc.id;
end;
$$;

-- One row per type. The review state shown is the latest row a person acted on, so an unfinished upload cannot hide a reason.
-- A suspended washer can still read this (D-111). No path and no reviewer.
create or replace function public.my_worker_documents()
returns table (document_type text, label text, instructions text, is_required boolean, document_id uuid, status text,
  submitted_at timestamptz, reviewed_at timestamptz, review_reason text, has_approved_copy boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if me is null or public.current_user_profile_role() is distinct from 'worker' then
    raise exception 'Sign in with a worker account.' using errcode = '42501';
  end if;
  return query
    select t.key, t.label, t.instructions, t.is_required, l.id, l.status, l.submitted_at, l.reviewed_at, l.review_reason,
      exists (select 1 from public.independent_worker_documents a
              where a.worker_id = me and a.document_type = t.key and a.status = 'approved')
    from public.independent_worker_document_types t
    left join lateral (
      select d.id, d.status, d.submitted_at, d.reviewed_at, d.review_reason from public.independent_worker_documents d
      where d.worker_id = me and d.document_type = t.key and d.status in ('submitted', 'approved', 'rejected')
      order by d.created_at desc, d.id desc limit 1) l on true
    order by t.sort_order, t.key;
end;
$$;

-- Metadata only, so it reads no file and needs no audit. opened_by_me tells the screen whether Approve can work (D-113).
create or replace function public.admin_worker_documents(p_worker uuid default null)
returns table (document_id uuid, worker_id uuid, worker_name text, document_type text, label text, is_required boolean, status text,
  content_type text, size_bytes integer, created_at timestamptz, submitted_at timestamptz, reviewed_at timestamptz,
  review_reason text, opened_by_me boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.b2c_require_super_admin();
  return query
    select d.id, d.worker_id, p.full_name, d.document_type, t.label, t.is_required, d.status, d.content_type, d.size_bytes,
      d.created_at, d.submitted_at, d.reviewed_at, d.review_reason, d.read_open_for is not distinct from auth.uid()
    from public.independent_worker_documents d
    join public.independent_worker_document_types t on t.key = d.document_type
    left join public.profiles p on p.id = d.worker_id
    where case when p_worker is null then d.status = 'submitted' else d.worker_id = p_worker end
    order by case when p_worker is null then d.submitted_at end asc, d.created_at desc, d.id
    limit 200;
end;
$$;

-- The audit row commits with the window, so no read can happen without it. The bucket policy allows only a download inside that window,
-- so no link can be signed. The hourly cap limits what a stolen admin session can take. The advisory lock makes the cap exact (D-118).
create or replace function public.admin_open_worker_document(p_document uuid)
returns table (object_name text, content_type text, read_open_until timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
#variable_conflict use_column
declare
  doc public.independent_worker_documents;
  window_end timestamptz := now() + interval '60 seconds';
  current_version text;
begin
  perform public.b2c_require_super_admin();
  perform pg_advisory_xact_lock(hashtextextended('worker_document_open:' || auth.uid()::text, 0));
  if (select count(*) from public.workforce_audit_events e
      where e.actor_id = auth.uid() and e.action = 'independent_worker_document.opened'
        and e.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'You have opened 60 documents in the last hour. Try again later.' using errcode = '23514';
  end if;
  select * into doc from public.independent_worker_documents d where d.id = p_document for update;
  if doc.id is null then
    raise exception 'Document not found.' using errcode = '42501';
  end if;
  if doc.worker_id = auth.uid() then
    raise exception 'You can''t open or review your own documents.' using errcode = '23514';
  end if;
  if doc.status not in ('submitted', 'approved', 'rejected') or doc.file_queued_at is not null then
    raise exception 'This document has no file to open.' using errcode = '55000';
  end if;
  select o.version into current_version from storage.objects o
    where o.bucket_id = 'worker-verification-documents' and o.name = doc.object_name;
  if current_version is null or doc.object_version is null or current_version <> doc.object_version then
    raise exception 'This file changed after it was uploaded. Reject it and ask for a new one.' using errcode = '23514';
  end if;
  update public.independent_worker_documents d
    set read_open_for = auth.uid(), read_open_until = window_end, updated_at = now() where d.id = doc.id;
  perform public.record_workforce_audit_event('independent_worker_document.opened', 'independent_worker_document', doc.id, doc.worker_id,
    jsonb_build_object('document_type', doc.document_type));
  return query select doc.object_name, doc.content_type, window_end;
end;
$$;

create or replace function public.admin_review_worker_document(p_document uuid, p_decision text, p_reason text default null)
returns table (document_id uuid, status text, verification_status text)
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
#variable_conflict use_column
declare
  target uuid;
  doc public.independent_worker_documents;
  current_version text;
  worker_status text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  lost_verification boolean := false;
begin
  perform public.b2c_require_super_admin();
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected.' using errcode = '22023';
  end if;
  select d.worker_id into target from public.independent_worker_documents d where d.id = p_document;
  if target is null then
    raise exception 'Document not found.' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'You can''t open or review your own documents.' using errcode = '23514';
  end if;
  select w.verification_status into worker_status from public.independent_workers w where w.profile_id = target for update;
  select * into doc from public.independent_worker_documents d where d.id = p_document for update;
  if doc.id is null then
    raise exception 'Document not found.' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    if doc.status <> 'submitted' then
      raise exception 'Only a document under review can be approved.' using errcode = '55000';
    end if;
    if doc.read_open_for is distinct from auth.uid() then
      raise exception 'Open this document before approving it.' using errcode = '23514';
    end if;
    select o.version into current_version from storage.objects o
      where o.bucket_id = 'worker-verification-documents' and o.name = doc.object_name;
    if current_version is null or doc.object_version is null or current_version <> doc.object_version then
      raise exception 'This file changed after it was uploaded. Reject it and ask for a new one.' using errcode = '23514';
    end if;
    perform public.worker_document_retire_file(d.id, 'superseded') from public.independent_worker_documents d
      where d.worker_id = target and d.document_type = doc.document_type and d.status = 'approved';
    update public.independent_worker_documents d
      set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), review_reason = null, updated_at = now()
      where d.id = doc.id;
  else
    if char_length(coalesce(clean_reason, '')) not between 10 and 500 then
      raise exception 'Give a reason of 10 to 500 characters.' using errcode = '23514';
    end if;
    if doc.status not in ('submitted', 'approved') then
      raise exception 'Only a document under review or already approved can be rejected.' using errcode = '55000';
    end if;
    update public.independent_worker_documents d
      set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), review_reason = clean_reason, updated_at = now()
      where d.id = doc.id;
  end if;

  perform public.record_workforce_audit_event('independent_worker_document.reviewed', 'independent_worker_document', doc.id, target,
    jsonb_build_object('document_type', doc.document_type, 'decision', p_decision));

  -- Revoking a required document ends verification through the one path that withdraws the washer from work (D-92). The notice below
  -- says so, so the status change sends no second one.
  if p_decision = 'rejected' and doc.status = 'approved' and worker_status = 'verified'
     and exists (select 1 from public.independent_worker_document_types t where t.key = doc.document_type and t.is_required)
     and not exists (select 1 from public.independent_worker_documents d
                     where d.worker_id = target and d.document_type = doc.document_type and d.status = 'approved') then
    perform public.independent_worker_apply_status(target, 'pending', clean_reason);
    lost_verification := true;
  end if;

  perform public.enqueue_notification_safely(target, 'independent_worker.documents', 'Verification documents',
    case when p_decision = 'approved' then 'One of your verification documents was approved.'
      when lost_verification then 'Your washer account needs attention. You have lost verification and won''t get new requests. Open your washer setup to see why.'
      else 'One of your verification documents needs attention. Open your washer setup to see why.' end,
    'worker_documents:' || doc.id || ':' || p_decision, 'independent_worker_document', doc.id);

  return query select d.id, d.status, w.verification_status from public.independent_worker_documents d
    join public.independent_workers w on w.profile_id = d.worker_id where d.id = doc.id;
end;
$$;

revoke all on function public.begin_worker_document_upload(text), public.submit_worker_document_upload(uuid),
  public.my_worker_documents(), public.admin_worker_documents(uuid),
  public.admin_open_worker_document(uuid), public.admin_review_worker_document(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_worker_document_upload(text), public.submit_worker_document_upload(uuid),
  public.my_worker_documents(), public.admin_worker_documents(uuid),
  public.admin_open_worker_document(uuid), public.admin_review_worker_document(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- ROLLBACK (reverse order n to l; run after b2cn is rolled back and before b2cl):
-- begin;
-- drop function if exists public.admin_review_worker_document(uuid, text, text), public.admin_open_worker_document(uuid),
--   public.admin_worker_documents(uuid), public.my_worker_documents(),
--   public.submit_worker_document_upload(uuid), public.begin_worker_document_upload(text);
-- commit;
-- Irreversible: audit events already written stay, by the audit rules.
