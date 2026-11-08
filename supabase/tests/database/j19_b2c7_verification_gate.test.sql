-- B2C-7: a washer can only be verified with every required document approved, through the RPC. Losing verification runs the D-92 path,
-- and replacing an approved document changes nothing (D-110). Washers verified without documents are reset (D-116).
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('admin', test_helpers.create_super_admin('b2c7-gate-admin@local.test')),
  ('c1', test_helpers.create_customer('b2c7-gate-c1@local.test')),
  ('none', test_helpers.create_worker('b2c7-gate-none@local.test')),
  ('one', test_helpers.create_worker('b2c7-gate-one@local.test')),
  ('sub', test_helpers.create_worker('b2c7-gate-sub@local.test')),
  ('rej', test_helpers.create_worker('b2c7-gate-rej@local.test')),
  ('all', test_helpers.create_worker('b2c7-gate-all@local.test')),
  ('opt', test_helpers.create_worker('b2c7-gate-opt@local.test')),
  ('wa', test_helpers.create_worker('b2c7-gate-wa@local.test')),
  ('wb', test_helpers.create_worker('b2c7-gate-wb@local.test')),
  ('wr', test_helpers.create_worker('b2c7-gate-wr@local.test')),
  ('wk', test_helpers.create_worker('b2c7-gate-wk@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50, worker_document_uploads_enabled = true;
insert into public.independent_workers (profile_id) select id from ids where k in ('none', 'one', 'sub', 'rej', 'all', 'opt');
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  select id, 'verified', 14.5995, 120.9842, 20, true, now() from ids where k in ('wa', 'wb', 'wr', 'wk');
insert into public.independent_worker_services select id, pg_temp.id('svc') from ids where k in ('wa', 'wb', 'wr', 'wk');
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select i.id, d, 0, 1440 from ids i cross join generate_series(0, 6) d where i.k in ('wa', 'wb', 'wr', 'wk');

select test_helpers.create_worker_document(pg_temp.id('one'), 'government_id', 'approved');
select test_helpers.create_worker_document(pg_temp.id('sub'), t.key, 'submitted') from public.independent_worker_document_types t;
select test_helpers.create_worker_document(pg_temp.id('rej'), 'government_id', 'approved');
select test_helpers.create_worker_document(pg_temp.id('rej'), 'selfie', 'rejected');
select test_helpers.give_worker_approved_documents(pg_temp.id('all'));
select test_helpers.give_worker_approved_documents(pg_temp.id('opt'));
select test_helpers.give_worker_approved_documents(pg_temp.id('wb'));
select test_helpers.give_worker_approved_documents(pg_temp.id('wk'));
insert into ids values ('wa_gov', test_helpers.create_worker_document(pg_temp.id('wa'), 'government_id', 'approved')),
                       ('wa_new', test_helpers.create_worker_document(pg_temp.id('wa'), 'government_id', 'submitted'));
select test_helpers.create_worker_document(pg_temp.id('wa'), 'selfie', 'approved');

create function pg_temp.manila(p_days integer) returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + p_days + interval '10 hours') at time zone 'Asia/Manila' $$;
create function pg_temp.book(p_key text, p_days integer) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id('c1'));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, 'Blue gate', 'Ring twice', false, pg_temp.manila(p_days), 'key-b2c7-' || p_key) r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.accept(p_key text, p_worker text) returns void language plpgsql as $$
begin
  perform test_helpers.act_as(pg_temp.id(p_worker));
  perform public.accept_dispatch_request((select d.id from public.dispatch_requests d
    where d.booking_id = pg_temp.id(p_key) and d.worker_id = pg_temp.id(p_worker) and d.status = 'offered'));
  perform test_helpers.act_as_service();
end;
$$;
create function pg_temp.booking(p_key text) returns text language sql stable as $$
  select status from public.service_bookings where id = pg_temp.id(p_key) $$;
create function pg_temp.verification(p_key text) returns text language sql stable security definer as $$
  select verification_status from public.independent_workers where profile_id = pg_temp.id(p_key) $$;
create function pg_temp.verify_call(p_key text) returns text language sql stable as $$
  select format('select public.admin_review_independent_worker(%L, ''verified'', null)', pg_temp.id(p_key)) $$;
create function pg_temp.review_status(p_key text, p_status text, p_note text default null) returns void language plpgsql as $$
begin
  perform public.admin_review_independent_worker(pg_temp.id(p_key), p_status, p_note);
end;
$$;

-- ---------- the gate ----------
select test_helpers.act_as(pg_temp.id('admin'));
select throws_ok(pg_temp.verify_call('none'), '23514', 'Approve every required document before verifying this washer.', 'verify_refused_with_no_documents');
select is(pg_temp.verification('none'), 'pending', 'verify_refused_with_no_documents');
select throws_ok(pg_temp.verify_call('one'), '23514', 'Approve every required document before verifying this washer.', 'verify_refused_with_one_of_two_approved');
select throws_ok(pg_temp.verify_call('sub'), '23514', 'Approve every required document before verifying this washer.', 'verify_refused_with_submitted_only');
select throws_ok(pg_temp.verify_call('rej'), '23514', 'Approve every required document before verifying this washer.', 'verify_refused_with_rejected_document');

-- Zero required types fails closed, even for a washer with a full set.
select test_helpers.act_as_service();
update public.independent_worker_document_types set is_required = false;
select test_helpers.act_as(pg_temp.id('admin'));
select throws_ok(pg_temp.verify_call('all'), '23514', 'Approve every required document before verifying this washer.', 'verify_refused_when_no_required_types_exist');
select test_helpers.act_as_service();
update public.independent_worker_document_types set is_required = true;

-- The file approved is the file still there.
update storage.objects set version = 'someone-else' where bucket_id = 'worker-verification-documents'
  and name in (select object_name from public.independent_worker_documents where worker_id = pg_temp.id('all') and document_type = 'selfie');
select test_helpers.act_as(pg_temp.id('admin'));
select throws_ok(pg_temp.verify_call('all'), '23514', 'A document file changed after it was approved. Revoke it and ask for a new one before verifying this washer.', 'verify_refused_when_approved_file_changed');
select test_helpers.act_as_service();
update storage.objects set version = 'fixture-version' where bucket_id = 'worker-verification-documents'
  and name in (select object_name from public.independent_worker_documents where worker_id = pg_temp.id('all') and document_type = 'selfie');

-- No one reviews their own account, on any status.
insert into ids values ('self', test_helpers.create_super_admin('b2c7-gate-self@local.test'));
insert into public.independent_workers (profile_id) values (pg_temp.id('self'));
select test_helpers.give_worker_approved_documents(pg_temp.id('self'));
insert into ids values ('self_doc', test_helpers.create_worker_document(pg_temp.id('self'), 'selfie', 'submitted'));
select test_helpers.act_as(pg_temp.id('self'));
select throws_ok(pg_temp.verify_call('self'), '23514', 'You can''t review your own washer account.', 'admin_cannot_verify_self');
select throws_ok(format($$ select public.admin_review_independent_worker(%L, 'pending') $$, pg_temp.id('self')), '23514', 'You can''t review your own washer account.', 'admin_cannot_verify_self');
select throws_ok(format($$ select * from public.admin_review_worker_document(%L, 'approved') $$, pg_temp.id('self_doc')), '23514', 'You can''t open or review your own documents.', 'admin_cannot_review_own_document');
select throws_ok(format($$ select * from public.admin_open_worker_document(%L) $$, pg_temp.id('self_doc')), '23514', 'You can''t open or review your own documents.', 'admin_cannot_review_own_document');

select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok(pg_temp.verify_call('all'), '42501', 'Only a platform administrator can do this.', 'verify_refused_for_customer');
select test_helpers.act_as(pg_temp.id('none'));
select throws_ok(pg_temp.verify_call('none'), '42501', 'Only a platform administrator can do this.', 'verify_refused_for_washer_on_self');
select test_helpers.act_as(pg_temp.id('all'));
select throws_ok(pg_temp.verify_call('all'), '42501', 'Only a platform administrator can do this.', 'verify_refused_for_washer_on_self');

select test_helpers.act_as(pg_temp.id('admin'));
select lives_ok(pg_temp.verify_call('all'), 'verify_allowed_with_all_approved');
select is(pg_temp.verification('all'), 'verified', 'verify_allowed_with_all_approved');

select test_helpers.act_as_service();
insert into public.independent_worker_document_types (key, label, instructions, is_required) values ('extra_optional', 'Extra', 'Optional file', false);
select test_helpers.act_as(pg_temp.id('admin'));
select lives_ok(pg_temp.verify_call('opt'), 'optional_type_not_needed');

-- ---------- reasons (D-117) ----------
select throws_ok(format($$ select public.admin_review_independent_worker(%L, 'suspended', 'short') $$, pg_temp.id('none')), '23514', 'Give a reason of 10 to 500 characters.', 'suspend_needs_reason');
select throws_ok(format($$ select public.admin_review_independent_worker(%L, 'suspended') $$, pg_temp.id('none')), '23514', 'Give a reason of 10 to 500 characters.', 'suspend_needs_reason');
select throws_ok(format($$ select public.admin_review_independent_worker(%L, 'rejected', '          ') $$, pg_temp.id('none')), '23514', 'Give a reason of 10 to 500 characters.', 'reject_status_needs_reason');
select lives_ok(format($$ select public.admin_review_independent_worker(%L, 'pending') $$, pg_temp.id('none')), 'pending_allows_no_reason');

-- ---------- bookings ----------
select pg_temp.book('accepted', 2);
select pg_temp.book('started', 3);
select pg_temp.book('offer', 4);
select pg_temp.book('reset_job', 5);
select pg_temp.accept('accepted', 'wa');
select pg_temp.accept('started', 'wa');
select pg_temp.accept('reset_job', 'wr');
update public.service_bookings set status = 'worker_on_the_way' where id = pg_temp.id('started');
update public.service_bookings set status = 'arrived' where id = pg_temp.id('started');

-- ---------- replacing an approved document changes nothing (D-110) ----------
select test_helpers.act_as(pg_temp.id('admin'));
select count(*) from public.admin_open_worker_document(pg_temp.id('wa_new'));
select count(*) from public.admin_review_worker_document(pg_temp.id('wa_new'), 'approved');
select test_helpers.act_as_service();
select is(pg_temp.verification('wa') || ',' || (select status from public.independent_worker_documents where id = pg_temp.id('wa_gov')), 'verified,superseded', 'replacing_approved_leaves_washer_verified');
select is(pg_temp.booking('accepted') || ',' || (select worker_id::text from public.service_bookings where id = pg_temp.id('accepted')),
          'accepted,' || pg_temp.id('wa'), 'replacing_approved_leaves_jobs_alone');

-- ---------- revoking ends verification through the D-92 path ----------
select test_helpers.act_as(pg_temp.id('admin'));
select count(*) from public.admin_review_worker_document(pg_temp.id('wa_new'), 'rejected', 'This ID has been reported as not genuine');
select test_helpers.act_as_service();
select is(pg_temp.verification('wa') || ',' || (select verification_note from public.independent_workers where profile_id = pg_temp.id('wa')),
          'pending,This ID has been reported as not genuine', 'revoking_required_document_moves_to_pending');
select is((select count(*)::int from public.dispatch_requests where worker_id = pg_temp.id('wa') and status = 'offered'), 0, 'revoking_closes_offers');
select is(pg_temp.booking('accepted') || ',' || coalesce((select worker_id::text from public.service_bookings where id = pg_temp.id('accepted')), 'nobody'),
          'searching_for_worker,nobody', 'revoking_requeues_accepted_job');
select is(pg_temp.booking('started') || ',' || (select worker_id::text from public.service_bookings where id = pg_temp.id('started')),
          'arrived,' || pg_temp.id('wa'), 'revoking_leaves_started_job');
select is((select body from public.notifications where recipient_id = pg_temp.id('wa') and subject_id = pg_temp.id('wa_new') and idempotency_key like '%:rejected'),
          'Your washer account needs attention. You have lost verification and won''t get new requests. Open your washer setup to see why.', 'revoke_notification_says_verification_lost');
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.id('wa') and category = 'independent_worker.documents' and (body ilike '%genuine%' or subject_type = 'independent_worker')), 0, 'revoke_notification_says_verification_lost');
select test_helpers.act_as(pg_temp.id('wa'));
select is((select count(*)::int from public.my_assigned_service_bookings() a where a.booking_id = pg_temp.id('started') and a.address is null and a.customer_phone is null),
          1, 'revoked_washer_masked_and_blocked');
select throws_ok(format($$ select public.advance_service_booking(%L, 'arrived') $$, pg_temp.id('started')), '23514',
                 'WashLink has paused your account. Contact WashLink about this booking.', 'revoked_washer_masked_and_blocked');

-- ---------- reset of washers already verified without documents (D-116) ----------
select test_helpers.act_as_service();
select is(public.independent_workers_reset_unevidenced(), 1, 'reset_demotes_verified_without_documents');
select is(pg_temp.verification('wr'), 'pending', 'reset_demotes_verified_without_documents');
select is(pg_temp.verification('wk'), 'verified', 'reset_keeps_verified_with_documents');
select is(pg_temp.booking('reset_job') || ',' || coalesce((select worker_id::text from public.service_bookings where id = pg_temp.id('reset_job')), 'nobody')
          || ',' || (select e.actor_kind from public.service_booking_status_events e where e.booking_id = pg_temp.id('reset_job') order by e.id desc limit 1),
          'searching_for_worker,nobody,system', 'reset_requeues_unstarted_job');
select is((select payload - 'offers_closed' from public.workforce_audit_events where action = 'independent_worker.verification_reset' and subject_id = pg_temp.id('wr')),
          '{"verification_status": "pending", "bookings_returned_to_search": 1, "started_jobs_left": 0}'::jsonb, 'reset_is_audited');
select test_helpers.act_as(pg_temp.id('wr'));
select matches((select verification_note from public.independent_workers where profile_id = pg_temp.id('wr')), '^WashLink now needs verification documents', 'reset_note_visible_to_washer');
select test_helpers.act_as_service();
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.id('wr') and category = 'independent_worker.documents' and subject_type = 'independent_worker'
             and body like 'WashLink now needs verification documents from you%'), 1, 'reset_notifies_with_fixed_text');

-- Status changes on the review path send fixed text, never the note, and only when the status changes.
select test_helpers.act_as(pg_temp.id('admin'));
select public.admin_review_independent_worker(pg_temp.id('none'), 'suspended', 'SMOKENOTE suspended for a reason') is not null as suspended;
select public.admin_review_independent_worker(pg_temp.id('none'), 'suspended', 'SMOKENOTE a different reason now') is not null as suspended_again;
select public.admin_review_independent_worker(pg_temp.id('none'), 'rejected', 'SMOKENOTE rejected for a reason') is not null as rejected;
select public.admin_review_independent_worker(pg_temp.id('none'), 'pending') is not null as pending;
select public.admin_review_independent_worker(pg_temp.id('none'), 'pending') is not null as pending_again;
select test_helpers.act_as_service();
select is((select string_agg(left(body, 28), ' | ' order by body) from public.notifications where recipient_id = pg_temp.id('none') and subject_type = 'independent_worker'),
          'WashLink has not approved yo | WashLink has suspended your  | Your washer account is back ', 'status_change_notifies_with_fixed_text');
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.id('none') and (title || body) like '%SMOKENOTE%'), 0, 'status_change_notifies_with_fixed_text');

select is((select coalesce(string_agg(f || ':' || r, ','), '-') from unnest(array[
    'public.independent_worker_withdraw_from_work(uuid,text)', 'public.independent_workers_reset_unevidenced()',
    'public.independent_worker_documents_queue_file_on_delete()', 'public.independent_worker_has_required_documents(uuid)',
    'public.worker_document_retire_file(uuid,text)', 'public.independent_worker_apply_status(uuid,text,text)',
    'public.independent_worker_document_versions_match(uuid)']) f, unnest(array['public', 'anon', 'authenticated', 'service_role']) r
  where has_function_privilege(r, f::regprocedure, 'execute')), '-', 'internal_functions_not_callable_by_clients');

select * from finish();
rollback;
