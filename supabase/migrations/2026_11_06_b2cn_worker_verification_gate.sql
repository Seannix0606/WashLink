-- =============================================================
-- WashLink B2C n (B2C-7) - verifying a washer now needs approved documents, in the database, on every path.
-- Rejected and suspended need a reason the washer can read (D-117). Washers already verified without approved documents move to
-- pending when this runs (D-116). The trusted job's two functions are here: removal counts only when the database sees that the
-- object row is gone, so a false report removes nothing (D-121). The job itself is not deployed or scheduled anywhere.
-- admin_review_independent_worker keeps its signature, so its ACL stays. Functions that read storage.objects set row_security = off, so
-- an owner without BYPASSRLS gets an error instead of seeing no rows and reporting a file gone. Local proof only (D-10, D-11).
-- =============================================================

-- Fails closed: with no required type, nobody has a complete set (D-109).
create or replace function public.independent_worker_has_required_documents(p_worker uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.independent_worker_document_types t where t.is_required)
    and not exists (
      select 1 from public.independent_worker_document_types t
      where t.is_required and not exists (
        select 1 from public.independent_worker_documents d
        where d.worker_id = p_worker and d.document_type = t.key and d.status = 'approved'))
$$;
revoke all on function public.independent_worker_has_required_documents(uuid) from public, anon, authenticated, service_role;

-- The file each approved required document was approved on is still the file in storage. Reads storage.objects.
create or replace function public.independent_worker_document_versions_match(p_worker uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
set row_security = off
as $$
  select not exists (
    select 1 from public.independent_worker_documents d
    join public.independent_worker_document_types t on t.key = d.document_type and t.is_required
    left join storage.objects o on o.bucket_id = 'worker-verification-documents' and o.name = d.object_name
    where d.worker_id = p_worker and d.status = 'approved' and (o.version is null or o.version is distinct from d.object_version))
$$;
revoke all on function public.independent_worker_document_versions_match(uuid) from public, anon, authenticated, service_role;

-- Moved out of admin_review_independent_worker unchanged (b2ci): closes offers, returns unstarted jobs, leaves started ones.
create or replace function public.independent_worker_withdraw_from_work(p_worker uuid, p_actor_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offer_bookings uuid[];
  job_bookings uuid[];
  target uuid;
  started integer := 0;
begin
  with closed as (
    update public.dispatch_requests d set status = 'declined', responded_at = now()
      where d.worker_id = p_worker and d.status = 'offered' returning d.booking_id)
  select coalesce(array_agg(c.booking_id), '{}') into offer_bookings from closed c;
  foreach target in array offer_bookings loop
    perform public.service_dispatch_sweep(target);
  end loop;
  -- The status filter is rechecked after each lock, so a job the washer just started is left for the admin.
  select coalesce(array_agg(j.id), '{}') into job_bookings from (
    select b.id from public.service_bookings b
      where b.worker_id = p_worker and b.status in ('accepted', 'worker_on_the_way') order by b.id for update) j;
  foreach target in array job_bookings loop
    perform public.service_booking_requeue(target, p_actor_kind, 'Washer no longer available.');
  end loop;
  select count(*)::int into started from public.service_bookings b
    where b.worker_id = p_worker and b.status in ('arrived', 'in_progress');
  return jsonb_build_object('offers_closed', cardinality(offer_bookings),
    'bookings_returned_to_search', cardinality(job_bookings), 'started_jobs_left', started);
end;
$$;
revoke all on function public.independent_worker_withdraw_from_work(uuid, text) from public, anon, authenticated, service_role;

-- The one path that writes a reviewed status. Any status other than verified withdraws the washer from work, and started jobs stay for the
-- admin to cancel. Callers check who is asking and lock the worker row first. Also used when a required document is revoked.
create or replace function public.independent_worker_apply_status(p_worker uuid, p_status text, p_note text)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.independent_workers;
  payload jsonb := jsonb_build_object('verification_status', p_status);
begin
  update public.independent_workers set verification_status = p_status, verification_note = p_note,
      verified_at = case when p_status = 'verified' then now() end, verified_by = auth.uid(),
      is_online = case when p_status = 'verified' then is_online else false end, updated_at = now()
    where profile_id = p_worker returning * into result;
  if p_status <> 'verified' then
    payload := payload || public.independent_worker_withdraw_from_work(p_worker, 'super_admin');
  end if;
  perform public.record_workforce_audit_event('independent_worker.reviewed', 'independent_worker', p_worker, p_worker, payload);
  return result;
end;
$$;
revoke all on function public.independent_worker_apply_status(uuid, text, text) from public, anon, authenticated, service_role;

-- Verifying needs documents. Rejecting and suspending need a reason the washer can read. No one reviews their own account.
create or replace function public.admin_review_independent_worker(p_worker uuid, p_status text, p_note text default null)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.independent_workers;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  previous_status text;
begin
  perform public.b2c_require_super_admin();
  if p_status is null or p_status not in ('verified', 'rejected', 'suspended', 'pending') then
    raise exception 'Choose a verification status.' using errcode = '22023';
  end if;
  -- Waits for a document review in progress, so the check below reads the result. Always worker then document.
  select w.verification_status into previous_status from public.independent_workers w where w.profile_id = p_worker for update;
  if previous_status is null then
    raise exception 'Worker not found.' using errcode = '42501';
  end if;
  if p_worker = auth.uid() then
    raise exception 'You can''t review your own washer account.' using errcode = '23514';
  end if;
  if p_status = 'verified' and not public.independent_worker_has_required_documents(p_worker) then
    raise exception 'Approve every required document before verifying this washer.' using errcode = '23514';
  end if;
  if p_status = 'verified' and not public.independent_worker_document_versions_match(p_worker) then
    raise exception 'A document file changed after it was approved. Revoke it and ask for a new one before verifying this washer.' using errcode = '23514';
  end if;
  if p_status in ('rejected', 'suspended') and char_length(coalesce(clean_note, '')) not between 10 and 500 then
    raise exception 'Give a reason of 10 to 500 characters.' using errcode = '23514';
  end if;
  result := public.independent_worker_apply_status(p_worker, p_status, clean_note);
  -- Fixed text, never the note. The washer reads the note in their setup screen.
  if p_status <> 'verified' and p_status is distinct from previous_status then
    perform public.enqueue_notification_safely(p_worker, 'independent_worker.documents', 'Your washer account',
      case p_status when 'suspended' then 'WashLink has suspended your washer account. Open your washer setup to see why.'
        when 'rejected' then 'WashLink has not approved your washer account. Open your washer setup to see why.'
        else 'Your washer account is back under review, and you won''t get new requests for now. Open your washer setup for details.' end,
      'worker_documents:' || p_worker || ':status:' || p_status || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint, 'independent_worker', p_worker);
  end if;
  return result;
end;
$$;

-- D-116: silent grandfathering would keep the hole this increment closes. Kept, revoked, so pgTAP can prove it.
create or replace function public.independent_workers_reset_unevidenced()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
  reset_count integer := 0;
begin
  for target in
    select w.profile_id from public.independent_workers w
    where w.verification_status = 'verified' and not public.independent_worker_has_required_documents(w.profile_id)
    order by w.profile_id for update
  loop
    update public.independent_workers
      set verification_status = 'pending', verified_at = null, verified_by = null, is_online = false, updated_at = now(),
          verification_note = 'WashLink now needs verification documents from every washer. Upload yours in your washer setup.'
      where profile_id = target;
    perform public.record_workforce_audit_event('independent_worker.verification_reset', 'independent_worker', target, target,
      jsonb_build_object('verification_status', 'pending') || public.independent_worker_withdraw_from_work(target, 'system'));
    perform public.enqueue_notification_safely(target, 'independent_worker.documents', 'Your washer account',
      'WashLink now needs verification documents from you, and you won''t get new requests until they are approved. Open your washer setup for details.',
      'worker_documents:' || target || ':reset', 'independent_worker', target);
    reset_count := reset_count + 1;
  end loop;
  return reset_count;
end;
$$;
revoke all on function public.independent_workers_reset_unevidenced() from public, anon, authenticated, service_role;

select public.independent_workers_reset_unevidenced();

-- Trusted job, step 1. Late signed-upload tokens can land up to 2 hours after a slot closed, so an object with no live row is
-- queued once it is older than 3 hours. A row in abandoned or superseded is not live, and its file has no reader. Signed-upload tokens
-- can no longer be minted (D-124), so this is now a second line of defence for any route that lands a file outside a live row.
create or replace function public.worker_document_files_claim(p_limit integer)
returns table (object_name text)
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Choose a limit between 1 and 1000.' using errcode = '22023';
  end if;
  -- The row lock settles a race with a slow submit: a slot being submitted is skipped, and a submit that waits here then sees abandoned.
  perform public.worker_document_retire_file(expired.id, 'abandoned') from (
    select d.id from public.independent_worker_documents d
    where d.status = 'awaiting_upload' and d.upload_expires_at <= now() for update skip locked) expired;

  with stray as (
    select o.name, d.id from storage.objects o
    left join public.independent_worker_documents d on d.object_name = o.name
    where o.bucket_id = 'worker-verification-documents' and o.created_at < now() - interval '3 hours'
      and (d.id is null or d.status in ('abandoned', 'superseded'))
  ), queued as (
    insert into public.independent_worker_document_file_queue (object_name)
      select s.name from stray s on conflict (object_name) do nothing
  )
  update public.independent_worker_documents d
    set file_queued_at = coalesce(d.file_queued_at, now()), file_removed_at = null, updated_at = now()
    from stray s where s.id = d.id;

  return query
    with picked as (
      select q.object_name from public.independent_worker_document_file_queue q
      order by q.queued_at, q.object_name limit p_limit for update skip locked
    ), bumped as (
      update public.independent_worker_document_file_queue q
        set attempts = q.attempts + 1, last_attempt_at = now()
        from picked p where p.object_name = q.object_name
        returning q.object_name, q.queued_at
    )
    select b.object_name from bumped b order by b.queued_at, b.object_name;
end;
$$;

-- Trusted job, step 2. Believes nothing the caller says: a name is cleared only when no object row remains.
create or replace function public.worker_document_files_confirm_removed(p_names text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  confirmed integer := 0;
begin
  with gone as (
    delete from public.independent_worker_document_file_queue q
      where q.object_name = any (coalesce(p_names, '{}'))
        and not exists (select 1 from storage.objects o
                        where o.bucket_id = 'worker-verification-documents' and o.name = q.object_name)
      returning q.object_name
  ), stamped as (
    update public.independent_worker_documents d set file_removed_at = now(), updated_at = now()
      from gone g where g.object_name = d.object_name
  )
  select count(*)::int into confirmed from gone;
  if confirmed > 0 then
    perform public.record_workforce_audit_event('independent_worker_document.files_removed', 'independent_worker_document', null, null,
      jsonb_build_object('files_removed', confirmed));
  end if;
  return confirmed;
end;
$$;

-- What the runbook watches: everything the job has yet to clear, not only what it has already queued, so the number isn't understated.
-- An expired slot counts even if nothing landed in it, because the job has not looked yet.
create or replace function public.admin_worker_document_overview()
returns table (documents_to_review bigint, files_waiting_for_removal bigint, oldest_file_waiting_since timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  perform public.b2c_require_super_admin();
  return query
    with waiting as (
      select q.object_name, q.queued_at as since from public.independent_worker_document_file_queue q
      union all
      select d.object_name, d.upload_expires_at from public.independent_worker_documents d
        where d.status = 'awaiting_upload' and d.upload_expires_at <= now()
      union all
      select o.name, o.created_at from storage.objects o
        left join public.independent_worker_documents d on d.object_name = o.name
        where o.bucket_id = 'worker-verification-documents' and (d.id is null or d.status in ('abandoned', 'superseded'))
    )
    select (select count(*) from public.independent_worker_documents d where d.status = 'submitted'),
      (select count(distinct w.object_name) from waiting w), (select min(w.since) from waiting w);
end;
$$;
revoke all on function public.admin_worker_document_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_worker_document_overview() to authenticated;

revoke all on function public.worker_document_files_claim(integer), public.worker_document_files_confirm_removed(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.worker_document_files_claim(integer), public.worker_document_files_confirm_removed(text[]) to service_role;

notify pgrst, 'reload schema';

-- ROLLBACK (first of the B2C-7 blocks; reverse order n to l):
-- Re-run admin_review_independent_worker from 2026_11_06_b2ci_worker_lifecycle.sql. That removes the document gate and the required
-- reasons, so no washer may be verified until this is deliberate. Then:
-- begin;
-- drop function if exists public.admin_worker_document_overview(), public.worker_document_files_confirm_removed(text[]),
--   public.worker_document_files_claim(integer), public.independent_workers_reset_unevidenced(),
--   public.independent_worker_apply_status(uuid, text, text), public.independent_worker_withdraw_from_work(uuid, text),
--   public.independent_worker_document_versions_match(uuid), public.independent_worker_has_required_documents(uuid);
-- commit;
-- Irreversible: washers reset to pending, bookings returned to search, and removed files.
