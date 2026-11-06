-- =============================================================
-- WashLink B2C l (B2C-7) - washer verification documents: tables, removal queue, private bucket and its two storage policies.
-- No client role has a table grant. Reads and writes go through definer RPCs (b2cm, b2cn). The bucket allows JPEG and PNG up to
-- 10 MiB (D-115). A washer may only insert into their own open slot, never read back, overwrite or remove (D-119). An admin reads
-- only inside a 60-second audited window (D-118). Storage does not inspect bytes, so a declared type is all the server can check.
-- Each policy allows one storage route by name, so a renamed or new route is refused: an admin can download but never sign a link
-- (D-118), and a washer can upload but not use TUS, S3, a signed-upload token, copy or move (D-124). Uploads stay off until a person
-- turns them on, after the removal job is running (D-123). Local proof only (D-10, D-11); hosted Storage behaviour is unverified.
-- =============================================================

-- Changed by human-run SQL. A new type needs one insert, and no admin screen exists (D-109).
create table if not exists public.independent_worker_document_types (
  key text primary key,
  label text not null,
  instructions text not null,
  is_required boolean not null,
  sort_order integer not null default 0,
  constraint independent_worker_document_types_key_check check (key ~ '^[a-z_]{1,40}$'),
  constraint independent_worker_document_types_label_check check (char_length(btrim(label)) between 1 and 80),
  constraint independent_worker_document_types_instructions_check check (char_length(btrim(instructions)) between 1 and 500)
);

insert into public.independent_worker_document_types (key, label, instructions, is_required, sort_order) values
  ('government_id', 'Government ID', 'A clear photo of one government-issued ID, with every corner in the frame.', true, 10),
  ('selfie', 'Selfie', 'A clear photo of your face in good light, with nothing covering it.', true, 20)
on conflict (key) do nothing;

create table if not exists public.independent_worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.independent_workers(profile_id) on delete cascade,
  document_type text not null references public.independent_worker_document_types(key) on delete restrict,
  status text not null default 'awaiting_upload',
  object_name text not null unique,
  upload_expires_at timestamptz not null default now() + interval '15 minutes',
  -- Read from storage.objects at submit, never from the client.
  content_type text,
  size_bytes integer,
  object_version text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_reason text,
  -- The audited read window. Only the admin named here can read the file, and only until the time here.
  read_open_for uuid,
  read_open_until timestamptz,
  file_queued_at timestamptz,
  file_removed_at timestamptz,
  -- Clock time, so "the latest row" stays well defined for two rows written in one transaction.
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  constraint independent_worker_documents_status_check
    check (status in ('awaiting_upload', 'submitted', 'approved', 'rejected', 'superseded', 'abandoned')),
  constraint independent_worker_documents_object_name_check check (object_name = worker_id::text || '/' || id::text),
  constraint independent_worker_documents_reason_check
    check (review_reason is null or char_length(btrim(review_reason)) between 10 and 500),
  constraint independent_worker_documents_rejected_has_reason check (status <> 'rejected' or review_reason is not null),
  constraint independent_worker_documents_content_type_check check (content_type is null or content_type in ('image/jpeg', 'image/png')),
  constraint independent_worker_documents_size_check check (size_bytes is null or size_bytes > 0)
);

create unique index if not exists independent_worker_documents_one_awaiting
  on public.independent_worker_documents (worker_id, document_type) where status = 'awaiting_upload';
create unique index if not exists independent_worker_documents_one_submitted
  on public.independent_worker_documents (worker_id, document_type) where status = 'submitted';
create unique index if not exists independent_worker_documents_one_approved
  on public.independent_worker_documents (worker_id, document_type) where status = 'approved';
create index if not exists independent_worker_documents_review_queue_idx
  on public.independent_worker_documents (submitted_at) where status = 'submitted';
create index if not exists independent_worker_documents_worker_idx
  on public.independent_worker_documents (worker_id, created_at desc);
create index if not exists independent_worker_documents_type_idx on public.independent_worker_documents (document_type);
create index if not exists independent_worker_documents_reviewer_idx
  on public.independent_worker_documents (reviewed_by) where reviewed_by is not null;
create index if not exists independent_worker_documents_open_slots_idx
  on public.independent_worker_documents (upload_expires_at) where status = 'awaiting_upload';

-- No foreign key, so a name outlives the account. A row goes only after the database sees the object row is gone (D-121).
create table if not exists public.independent_worker_document_file_queue (
  object_name text primary key,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  constraint independent_worker_document_file_queue_attempts_check check (attempts >= 0)
);
create index if not exists independent_worker_document_file_queue_age_idx
  on public.independent_worker_document_file_queue (queued_at);

alter table public.independent_worker_document_types enable row level security;
alter table public.independent_worker_documents enable row level security;
alter table public.independent_worker_document_file_queue enable row level security;
revoke all on public.independent_worker_document_types, public.independent_worker_documents,
  public.independent_worker_document_file_queue from public, anon, authenticated, service_role;

-- Every deletion path passes through here: delete_my_account, a GoTrue or dashboard user deletion, and manual closure.
create or replace function public.independent_worker_documents_queue_file_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.independent_worker_document_file_queue (object_name) values (old.object_name)
    on conflict (object_name) do nothing;
  return old;
end;
$$;
revoke all on function public.independent_worker_documents_queue_file_on_delete() from public, anon, authenticated, service_role;
drop trigger if exists independent_worker_documents_queue_file_on_delete on public.independent_worker_documents;
create trigger independent_worker_documents_queue_file_on_delete
  before delete on public.independent_worker_documents
  for each row execute function public.independent_worker_documents_queue_file_on_delete();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-verification-documents', 'worker-verification-documents', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- D-123: off until a person has deployed and scheduled the removal job. Changed only by human-run SQL: no client role has a grant on
-- this table and no RPC writes this column. With it off no washer can be verified, so bookings can't be served. That is intended.
alter table public.platform_settings add column if not exists worker_document_uploads_enabled boolean not null default false;

-- Internal. Ends a document's life and queues its file for the trusted job (D-120).
create or replace function public.worker_document_retire_file(p_document uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  name_to_queue text;
begin
  update public.independent_worker_documents d
    set status = p_status, file_queued_at = coalesce(d.file_queued_at, now()), updated_at = now()
    where d.id = p_document returning d.object_name into name_to_queue;
  if name_to_queue is not null then
    insert into public.independent_worker_document_file_queue (object_name) values (name_to_queue)
      on conflict (object_name) do nothing;
  end if;
end;
$$;
revoke all on function public.worker_document_retire_file(uuid, text) from public, anon, authenticated, service_role;

-- True only for the caller's own open slot, and only that exact name, so no client-chosen path can be used.
create or replace function public.worker_document_upload_is_open(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.independent_worker_documents d
    join public.independent_workers w on w.profile_id = d.worker_id
    where d.object_name = p_name and d.worker_id = auth.uid() and d.status = 'awaiting_upload'
      and d.upload_expires_at > now() and w.verification_status <> 'suspended')
$$;

-- True only inside the caller's own window, which admin_open_worker_document opens and audits first.
create or replace function public.worker_document_admin_read_is_open(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_super_admin() and exists (
    select 1 from public.independent_worker_documents d
    where d.object_name = p_name and d.read_open_for = auth.uid() and d.read_open_until > now() and d.file_queued_at is null)
$$;

revoke all on function public.worker_document_upload_is_open(text), public.worker_document_admin_read_is_open(text)
  from public, anon, authenticated, service_role;
grant execute on function public.worker_document_upload_is_open(text), public.worker_document_admin_read_is_open(text) to authenticated;

-- The only two policies on this bucket. There is deliberately no washer SELECT, and no UPDATE or DELETE for anyone.
-- Operation names were probed on local Storage v1.88.0. A different name on another version refuses the route, which fails closed.
drop policy if exists iwd_storage_insert_open_slot on storage.objects;
create policy iwd_storage_insert_open_slot on storage.objects for insert to authenticated
  with check (bucket_id = 'worker-verification-documents' and storage.operation() = 'storage.object.upload'
    and public.worker_document_upload_is_open(name));
drop policy if exists iwd_storage_select_admin_open_read on storage.objects;
create policy iwd_storage_select_admin_open_read on storage.objects for select to authenticated
  using (bucket_id = 'worker-verification-documents' and storage.operation() = 'storage.object.get_authenticated'
    and public.worker_document_admin_read_is_open(name));

insert into public.notification_categories (category, source_increment, key_prefixes, subject_types, recipient_kind, description) values
  ('independent_worker.documents', 'W19', array['worker_documents'], array['independent_worker_document', 'independent_worker'], 'worker',
   'A washer''s document was reviewed or account status changed. The text is fixed and never holds the reason.')
on conflict (category) do nothing;

notify pgrst, 'reload schema';

-- ROLLBACK (reverse order n to l; run after b2cm is rolled back):
-- begin;
-- drop policy if exists iwd_storage_select_admin_open_read on storage.objects;
-- drop policy if exists iwd_storage_insert_open_slot on storage.objects;
-- drop function if exists public.worker_document_admin_read_is_open(text), public.worker_document_upload_is_open(text),
--   public.worker_document_retire_file(uuid, text);
-- alter table public.platform_settings drop column if exists worker_document_uploads_enabled;
-- drop trigger if exists independent_worker_documents_queue_file_on_delete on public.independent_worker_documents;
-- drop function if exists public.independent_worker_documents_queue_file_on_delete();
-- drop table if exists public.independent_worker_document_file_queue, public.independent_worker_documents,
--   public.independent_worker_document_types;
-- delete from public.notification_categories where category = 'independent_worker.documents';
-- commit;
-- The bucket can be dropped only after the job or the Storage API has emptied it (objects_bucketId_fkey, and SQL cannot delete
-- objects). Then, through the Storage API: delete bucket worker-verification-documents.
-- Irreversible: files already removed. Dropping the queue while files remain would lose track of them, so empty the bucket first.
