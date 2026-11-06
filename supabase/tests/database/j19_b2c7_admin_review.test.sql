-- B2C-7: opening is audited first, approval needs the opener and an unchanged file, a rejection reason reaches the washer but never a
-- notification or the audit log. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('a1', test_helpers.create_super_admin('b2c7-rev-a1@local.test')),
  ('a2', test_helpers.create_super_admin('b2c7-rev-a2@local.test')),
  ('c1', test_helpers.create_customer('b2c7-rev-c1@local.test')),
  ('w1', test_helpers.create_worker('b2c7-rev-w1@local.test')),
  ('w2', test_helpers.create_worker('b2c7-rev-w2@local.test'));
update public.platform_settings set worker_document_uploads_enabled = true;
insert into public.independent_workers (profile_id) select id from ids where k in ('w1', 'w2');
insert into ids values
  ('d1', test_helpers.create_worker_document(pg_temp.id('w1'), 'government_id', 'submitted')),
  ('d2', test_helpers.create_worker_document(pg_temp.id('w1'), 'selfie', 'submitted'));

create function pg_temp.status(p_key text) returns text language sql stable security definer as $$
  select status from public.independent_worker_documents where id = pg_temp.id(p_key) $$;
create function pg_temp.name_of(p_key text) returns text language sql stable security definer as $$
  select object_name from public.independent_worker_documents where id = pg_temp.id(p_key) $$;
create function pg_temp.open(p_key text, p_admin text default 'a1') returns void language plpgsql as $$
begin
  perform test_helpers.act_as(pg_temp.id(p_admin));
  perform * from public.admin_open_worker_document(pg_temp.id(p_key));
  perform test_helpers.act_as_service();
end;
$$;
create function pg_temp.review(p_key text, p_decision text, p_reason text default null) returns void language plpgsql as $$
begin
  perform test_helpers.act_as(pg_temp.id('a1'));
  perform * from public.admin_review_worker_document(pg_temp.id(p_key), p_decision, p_reason);
  perform test_helpers.act_as_service();
end;
$$;

-- ---------- open ----------
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok(format($$ select * from public.admin_open_worker_document(%L) $$, pg_temp.id('d1')), '42501', 'Only a platform administrator can do this.', 'open_refused_for_non_admin');
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok(format($$ select * from public.admin_open_worker_document(%L) $$, pg_temp.id('d1')), '42501', 'Only a platform administrator can do this.', 'open_refused_for_customer');

select test_helpers.act_as(pg_temp.id('a2'));
select results_eq(format($$ select object_name, content_type from public.admin_open_worker_document(%L) $$, pg_temp.id('d1')),
                  format($$ values (%L::text, 'image/jpeg'::text) $$, pg_temp.name_of('d1')), 'open_is_audited');
select test_helpers.act_as_service();
select is((select count(*)::int || ',' || min(payload::text) || ',' || min(actor_id::text) from public.workforce_audit_events
           where action = 'independent_worker_document.opened' and subject_id = pg_temp.id('d1') and subject_profile_id = pg_temp.id('w1')),
          '1,{"document_type": "government_id"},' || pg_temp.id('a2'), 'open_is_audited');
select is((select read_open_until - now() from public.independent_worker_documents where id = pg_temp.id('d1')), interval '60 seconds', 'open_is_audited');

-- D-113: another admin having opened it is not enough.
select test_helpers.act_as(pg_temp.id('a1'));
select throws_ok(format($$ select * from public.admin_review_worker_document(%L, 'approved') $$, pg_temp.id('d1')), '23514', 'Open this document before approving it.', 'approve_refused_until_admin_opened_file');
select throws_ok(format($$ select * from public.admin_review_worker_document(%L, 'approved') $$, pg_temp.id('d2')), '23514', 'Open this document before approving it.', 'approve_refused_until_admin_opened_file');

select pg_temp.open('d1');
select test_helpers.act_as_service();
update storage.objects set version = 'someone-else' where bucket_id = 'worker-verification-documents' and name = pg_temp.name_of('d1');
select test_helpers.act_as(pg_temp.id('a1'));
select throws_ok(format($$ select * from public.admin_review_worker_document(%L, 'approved') $$, pg_temp.id('d1')), '23514', 'This file changed after it was uploaded. Reject it and ask for a new one.', 'approve_refused_when_object_version_changed');
select test_helpers.act_as_service();
update storage.objects set version = 'fixture-version' where bucket_id = 'worker-verification-documents' and name = pg_temp.name_of('d1');

select pg_temp.review('d1', 'approved');
select is(pg_temp.status('d1') || ',' || (select count(*)::text from public.independent_workers where profile_id = pg_temp.id('w1') and verification_status = 'pending'),
          'approved,1', 'approve_refused_until_admin_opened_file');

-- ---------- replacing an approved copy ----------
insert into ids values ('d1b', test_helpers.create_worker_document(pg_temp.id('w1'), 'government_id', 'submitted'));
select pg_temp.open('d1b');
select pg_temp.review('d1b', 'approved');
select is(pg_temp.status('d1') || ',' || pg_temp.status('d1b'), 'superseded,approved', 'approve_supersedes_old_approved_and_queues_file');
select is((select count(*)::int from public.independent_worker_document_file_queue where object_name = pg_temp.name_of('d1')), 1, 'approve_supersedes_old_approved_and_queues_file');
select test_helpers.act_as(pg_temp.id('a1'));
select throws_ok(format($$ select * from public.admin_open_worker_document(%L) $$, pg_temp.id('d1')), '55000', 'This document has no file to open.', 'open_refused_once_file_is_queued');

-- ---------- reject ----------
select throws_ok(format($$ select * from public.admin_review_worker_document(%L, 'rejected') $$, pg_temp.id('d2')), '23514', 'Give a reason of 10 to 500 characters.', 'reject_needs_reason');
select throws_ok(format($$ select * from public.admin_review_worker_document(%L, 'rejected', '  short  ') $$, pg_temp.id('d2')), '23514', 'Give a reason of 10 to 500 characters.', 'reject_needs_reason');
select pg_temp.review('d2', 'rejected', 'SMOKE-REASON the face is not visible');
select test_helpers.act_as(pg_temp.id('w1'));
select is((select review_reason from public.my_worker_documents() where document_type = 'selfie'), 'SMOKE-REASON the face is not visible', 'reject_reason_visible_to_washer');
select test_helpers.act_as_service();
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.id('w1') and category = 'independent_worker.documents'
             and subject_id = pg_temp.id('d2')), 1, 'reject_notification_has_no_reason');
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.id('w1')
             and (title || body) ilike '%SMOKE-REASON%'), 0, 'reject_notification_has_no_reason');

select is((select count(*)::int from public.workforce_audit_events where subject_type = 'independent_worker_document' and subject_profile_id = pg_temp.id('w1')
             and (payload::text ilike '%SMOKE-REASON%' or payload::text like '%' || pg_temp.id('w1') || '%' or payload::text ~* '(object_name|path|file_name|filename|size_bytes)')), 0,
          'audit_payload_has_no_path_or_reason');
select is((select string_agg(distinct k, ',' order by k) from public.workforce_audit_events e, jsonb_object_keys(e.payload) k
           where e.subject_type = 'independent_worker_document'), 'decision,document_type', 'audit_payload_has_no_path_or_reason');

-- The washer's activity feed says WashLink opened a file. It names no admin, no path and no reason (PLAN section 15 asked for this decision).
select test_helpers.act_as(pg_temp.id('w1'));
select is((select count(*)::int from public.my_workforce_activity(null, 100) a where a.action = 'independent_worker_document.opened'
             and a.actor_label = 'washlink' and a.details = '{}'::jsonb), 3, 'washer_activity_shows_open_without_path_or_admin');
select test_helpers.act_as_service();

-- ---------- a rejected replacement changes nothing (D-110) ----------
update public.independent_workers set verification_status = 'verified', verified_at = now() where profile_id = pg_temp.id('w2');
insert into ids values ('keep', test_helpers.create_worker_document(pg_temp.id('w2'), 'government_id', 'approved')),
                       ('new', test_helpers.create_worker_document(pg_temp.id('w2'), 'government_id', 'submitted'));
select pg_temp.review('new', 'rejected', 'This new photo is unreadable');
select is(pg_temp.status('keep') || ',' || pg_temp.status('new') || ',' || (select verification_status from public.independent_workers where profile_id = pg_temp.id('w2')),
          'approved,rejected,verified', 'reject_new_keeps_old_approved_and_verified');

-- F17: a size in bytes would fail the audit rule at 1e6. The audit stores kilobytes, so the largest allowed file goes through.
insert into ids values ('big', test_helpers.create_worker_document(pg_temp.id('w2'), 'selfie', 'awaiting_upload'));
select test_helpers.create_worker_document_object(pg_temp.name_of('big'), 'image/png', 10485760);
select test_helpers.act_as(pg_temp.id('w2'));
select is((select size_bytes from public.submit_worker_document_upload(pg_temp.id('big'))), 10485760, 'audit_accepts_ten_mib_document');
select test_helpers.act_as_service();
select is((select payload ->> 'size_kb' from public.workforce_audit_events where action = 'independent_worker_document.submitted' and subject_id = pg_temp.id('big')),
          '10240', 'audit_accepts_ten_mib_document');

select test_helpers.act_as(pg_temp.id('w2'));
select throws_ok(format($$ select * from public.admin_review_worker_document(%L, 'approved') $$, pg_temp.id('big')), '42501', 'Only a platform administrator can do this.', 'review_refused_for_washer_on_own_document');

select is((select count(*)::int from pg_proc p, unnest(p.proargnames) a where p.proname in ('admin_worker_documents', 'admin_worker_document_overview')
             and a in ('object_name', 'object_version', 'path', 'name', 'read_open_for')), 0, 'admin_lists_have_no_path_column');

-- ---------- overview ----------
select test_helpers.act_as_service();
update public.independent_worker_document_file_queue set queued_at = timestamptz '2026-01-02 03:04:05+00' where object_name = pg_temp.name_of('d1');
select test_helpers.act_as(pg_temp.id('a1'));
select results_eq($$ select documents_to_review, files_waiting_for_removal, oldest_file_waiting_since from public.admin_worker_document_overview() $$,
                  $$ values (1::bigint, 1::bigint, timestamptz '2026-01-02 03:04:05+00') $$,
                  'overview_counts_queue');

-- ---------- the overview also counts what the job has yet to find ----------
select test_helpers.act_as_service();
insert into ids values ('expired', test_helpers.create_worker_document(pg_temp.id('w1'), 'selfie', 'awaiting_upload'));
update public.independent_worker_documents set upload_expires_at = timestamptz '2026-01-01 00:00:00+00' where id = pg_temp.id('expired');
select test_helpers.create_worker_document_object(gen_random_uuid() || '/' || gen_random_uuid());
select test_helpers.act_as(pg_temp.id('a1'));
select results_eq($$ select files_waiting_for_removal, oldest_file_waiting_since from public.admin_worker_document_overview() $$,
                  $$ values (3::bigint, timestamptz '2026-01-01 00:00:00+00') $$, 'overview_counts_expired_slots_and_orphans');
-- A file with both a queue row and an object row counts once. d1 has both.
select test_helpers.act_as_service();
select is((select count(*)::int from storage.objects where name = pg_temp.name_of('d1')) || ',' || (select count(*)::int from public.independent_worker_document_file_queue where object_name = pg_temp.name_of('d1')),
          '1,1', 'overview_counts_expired_slots_and_orphans');

-- ---------- D-118: a stolen session is limited, and the pinned version is checked at open ----------
insert into ids values ('v', test_helpers.create_worker_document(pg_temp.id('w2'), 'government_id', 'submitted'));
update storage.objects set version = 'someone-else' where bucket_id = 'worker-verification-documents' and name = pg_temp.name_of('v');
select test_helpers.act_as(pg_temp.id('a2'));
select throws_ok(format($$ select * from public.admin_open_worker_document(%L) $$, pg_temp.id('v')), '23514', 'This file changed after it was uploaded. Reject it and ask for a new one.', 'open_refused_when_object_version_changed');
select test_helpers.act_as_service();
update storage.objects set version = 'fixture-version' where bucket_id = 'worker-verification-documents' and name = pg_temp.name_of('v');

-- a2 opened d1 once above, so 59 more reach the cap. The count is per admin: a1 is not affected.
create function pg_temp.open_times(p_key text, p_times integer) returns integer language plpgsql as $$
begin
  for i in 1 .. p_times loop
    perform * from public.admin_open_worker_document(pg_temp.id(p_key));
  end loop;
  return p_times;
end;
$$;
select test_helpers.act_as(pg_temp.id('a2'));
select is(pg_temp.open_times('v', 59), 59, 'open_capped_at_60_per_admin_per_hour');
select throws_ok(format($$ select * from public.admin_open_worker_document(%L) $$, pg_temp.id('v')), '23514', 'You have opened 60 documents in the last hour. Try again later.', 'open_capped_at_60_per_admin_per_hour');
select test_helpers.act_as(pg_temp.id('a1'));
select is((select count(*)::int from public.admin_open_worker_document(pg_temp.id('v'))), 1, 'open_cap_is_per_admin');

select * from finish();
rollback;
