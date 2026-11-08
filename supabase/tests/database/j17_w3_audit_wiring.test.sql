-- J17 (W3): every wired W2 sensitive action writes its audit event (AC7), the R-4 review log
-- survives reviewer deletion and is trusted SQL only since W13 (AC6, D-70), failed link attempts write no
-- link event, and no payload carries private data (AC8). Local Docker stack only; synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j17w-c1@local.test')::text, true);
select set_config('fx.c2', test_helpers.create_customer('j17w-c2@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17w-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17w-o2@local.test')::text, true);
select set_config('fx.o3', test_helpers.create_owner('j17w-o3@local.test')::text, true);
select set_config('fx.uw', test_helpers.create_worker('j17w-w1@local.test')::text, true);
select set_config('fx.uw2', test_helpers.create_worker('j17w-w2@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17w-admin@local.test')::text, true);
select set_config('fx.admin2', test_helpers.create_super_admin('j17w-admin2@local.test')::text, true);
select set_config('fx.s_a', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_r', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_cr', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_sub', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'changes_requested')::text, true);
select set_config('fx.s_reset', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'approved')::text, true);
select set_config('fx.s_del', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s_spoof', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.r2', test_helpers.create_roster_worker(current_setting('fx.o2')::uuid, current_setting('fx.uw')::uuid)::text, true);
select set_config('fx.r3', test_helpers.create_roster_worker(current_setting('fx.o3')::uuid, current_setting('fx.uw')::uuid)::text, true);

-- Synthetic private values that must never reach an audit payload.
update public.profiles set phone_number = '0917 555 0202' where id = current_setting('fx.o1')::uuid;
insert into public.worker_profiles (profile_id, availability_status) values (current_setting('fx.uw')::uuid, 'flexible');
insert into public.worker_private_contacts (profile_id, contact_phone, contact_email, preferred_contact_method)
values (current_setting('fx.uw')::uuid, '+63 917 555 0101', 'j17w-private-contact@local.test', 'phone');

create function pg_temp.event_count(p_action text, p_subject uuid) returns int language sql as $$
  select count(*)::int from public.workforce_audit_events where action = p_action and subject_id = p_subject
$$;
create function pg_temp.last_payload(p_action text, p_subject uuid) returns jsonb language sql as $$
  select payload from public.workforce_audit_events where action = p_action and subject_id = p_subject
  order by id desc limit 1
$$;
create function pg_temp.decision(p_shop uuid) returns jsonb language sql as $$
  select jsonb_build_object('n', count(*), 'from', min(payload ->> 'from_status'), 'to', min(payload ->> 'to_status'),
                            'reviewed_by', min(payload ->> 'reviewed_by'), 'actor', min(actor_id::text))
  from public.workforce_audit_events where action = 'shop.verification_decided' and subject_id = p_shop
$$;

-- ---------- shop verification decisions ----------
select test_helpers.act_as_admin('j17w-admin@local.test');
update public.shops set verification_status = 'approved' where id = current_setting('fx.s_a')::uuid;
update public.shops set verification_status = 'rejected' where id = current_setting('fx.s_r')::uuid;
update public.shops set verification_status = 'changes_requested', verification_notes = 'Private note: call 0917 555 0404'
where id = current_setting('fx.s_cr')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.decision(current_setting('fx.s_a')::uuid),
          jsonb_build_object('n', 1, 'from', 'pending', 'to', 'approved', 'reviewed_by', current_setting('fx.admin'), 'actor', current_setting('fx.admin')),
          'w3_audit_written_on_shop_verification_decision');
select is(pg_temp.decision(current_setting('fx.s_r')::uuid),
          jsonb_build_object('n', 1, 'from', 'pending', 'to', 'rejected', 'reviewed_by', current_setting('fx.admin'), 'actor', current_setting('fx.admin')),
          'w3_audit_written_on_shop_verification_decision');
select is(pg_temp.decision(current_setting('fx.s_cr')::uuid),
          jsonb_build_object('n', 1, 'from', 'pending', 'to', 'changes_requested', 'reviewed_by', current_setting('fx.admin'), 'actor', current_setting('fx.admin')),
          'w3_audit_written_on_shop_verification_decision');
-- W3-L5: the payload reviewed_by is the W2 server-stamped column, so a client-supplied
-- reviewer is ignored and payload.reviewed_by = actor_id for a super-admin decision.
select test_helpers.act_as_admin('j17w-admin@local.test');
update public.shops set verification_status = 'approved', verification_reviewed_by = current_setting('fx.o1')::uuid
where id = current_setting('fx.s_spoof')::uuid;
select test_helpers.act_as_service();
select is((select jsonb_build_object('reviewed_by', payload ->> 'reviewed_by', 'actor', actor_id::text)
           from public.workforce_audit_events
           where action = 'shop.verification_decided' and subject_id = current_setting('fx.s_spoof')::uuid),
          jsonb_build_object('reviewed_by', current_setting('fx.admin'), 'actor', current_setting('fx.admin')),
          'w3_decision_payload_reviewed_by_equals_actor_id');
select is((select array_agg(distinct subject_profile_id) from public.workforce_audit_events
           where action = 'shop.verification_decided'
             and subject_id in (current_setting('fx.s_a')::uuid, current_setting('fx.s_r')::uuid, current_setting('fx.s_cr')::uuid)),
          array[current_setting('fx.o1')::uuid], 'w3_audit_written_on_shop_verification_decision');

-- ---------- owner (re)submission ----------
select test_helpers.act_as_owner('j17w-o1@local.test');
select (public.submit_shop_for_verification(current_setting('fx.s_sub')::uuid)).id is not null as submitted;
select test_helpers.act_as_service();
select is(pg_temp.last_payload('shop.verification_submitted', current_setting('fx.s_sub')::uuid),
          '{"from_status": "changes_requested", "to_status": "pending"}'::jsonb, 'w3_audit_written_on_shop_submission');
select test_helpers.act_as_owner('j17w-o1@local.test');
select (public.submit_shop_for_verification(current_setting('fx.s_sub')::uuid)).id is not null as resubmitted;
select test_helpers.act_as_service();
select is(pg_temp.event_count('shop.verification_submitted', current_setting('fx.s_sub')::uuid), 2,
          'w3_audit_written_on_shop_submission');

-- ---------- S6 identity reset ----------
select test_helpers.act_as_owner('j17w-o1@local.test');
update public.shops set name = 'J17W Renamed Wash' where id = current_setting('fx.s_reset')::uuid;
select test_helpers.act_as_service();
select is((select verification_status from public.shops where id = current_setting('fx.s_reset')::uuid), 'pending',
          'w3_audit_written_on_shop_identity_reset');
select is(pg_temp.last_payload('shop.verification_reset_by_identity_change', current_setting('fx.s_reset')::uuid),
          '{"from_status": "approved", "to_status": "pending", "changed_fields": ["name"]}'::jsonb,
          'w3_audit_written_on_shop_identity_reset');
-- The S6 reset is its own action: never recorded as a review decision, and the owner (who made
-- the edit) gets no "is now Pending review" decision notice.
select is(pg_temp.event_count('shop.verification_decided', current_setting('fx.s_reset')::uuid), 0,
          'w3_shop_identity_reset_is_not_a_decision');
select is((select count(*)::int from public.notifications where subject_id = current_setting('fx.s_reset')::uuid), 0,
          'w3_shop_identity_reset_is_not_a_decision');

-- ---------- R-4: history survives deletion of the reviewing admin ----------
select test_helpers.act_as_admin('j17w-admin2@local.test');
update public.shops set verification_status = 'approved' where id = current_setting('fx.s_del')::uuid;
select test_helpers.act_as_service();
delete from auth.users where id = current_setting('fx.admin2')::uuid;
select is((select verification_reviewed_by from public.shops where id = current_setting('fx.s_del')::uuid), null::uuid,
          'w3_shop_review_history_survives_reviewer_deletion');
select is(pg_temp.event_count('shop.verification_decided', current_setting('fx.s_del')::uuid), 1,
          'w3_shop_review_history_survives_reviewer_deletion');
-- W13 (D-70): the view is trusted SQL only; read it in the trusted session.
select is((select jsonb_build_object('reviewed_by', reviewed_by, 'to_status', to_status, 'actor_role', actor_role)
           from public.shop_verification_review_log where shop_id = current_setting('fx.s_del')::uuid),
          jsonb_build_object('reviewed_by', current_setting('fx.admin2')::uuid, 'to_status', 'approved', 'actor_role', 'super_admin'),
          'w3_shop_review_history_survives_reviewer_deletion');

-- ---------- review log view: trusted SQL only (W13, D-70; was w3_shop_review_log_view_is_super_admin_only) ----------
select test_helpers.act_as_admin('j17w-admin@local.test');
select is(test_helpers.attempt('select count(*) from public.shop_verification_review_log'), '42501',
          'w3_shop_review_log_view_is_trusted_sql_only');
select test_helpers.act_as_owner('j17w-o1@local.test');
select is(test_helpers.attempt('select count(*) from public.shop_verification_review_log'), '42501',
          'w3_shop_review_log_view_is_trusted_sql_only');
select test_helpers.act_as_customer('j17w-c1@local.test');
select is(test_helpers.attempt('select count(*) from public.shop_verification_review_log'), '42501',
          'w3_shop_review_log_view_is_trusted_sql_only');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.shop_verification_review_log'), '42501',
          'w3_shop_review_log_view_is_trusted_sql_only');

-- ---------- roster link code issued ----------
select test_helpers.act_as_owner('j17w-o1@local.test');
insert into public.workers (owner_id, name, phone_number) values (auth.uid(), 'J17W Roster One', '0917 555 0303');
select test_helpers.act_as_service();
select set_config('fx.r1', (select id::text from public.workers where name = 'J17W Roster One'), true);
select test_helpers.act_as_owner('j17w-o1@local.test');
select set_config('fx.code', (select link_code from public.create_roster_link_code(current_setting('fx.r1')::uuid)), true);
select test_helpers.act_as_service();
select is(pg_temp.event_count('roster.link_code_issued', current_setting('fx.r1')::uuid), 1, 'w3_audit_written_on_link_code_issue');
select is((select array_agg(k) from jsonb_object_keys(pg_temp.last_payload('roster.link_code_issued', current_setting('fx.r1')::uuid)) k),
          array['expires_at'], 'w3_audit_written_on_link_code_issue');

-- ---------- failed link attempt: no link event ----------
select test_helpers.act_as_worker('j17w-w2@local.test');
select is((select result from public.accept_roster_link_code('AAAAAAAAAAAA')), 'invalid_or_expired',
          'w3_failed_link_attempt_writes_no_link_event');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events
           where action like 'roster.%' and (actor_id = current_setting('fx.uw2')::uuid or subject_profile_id = current_setting('fx.uw2')::uuid)),
          0, 'w3_failed_link_attempt_writes_no_link_event');

-- ---------- link accepted ----------
select test_helpers.act_as_worker('j17w-w1@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code'))), 'linked',
          'w3_audit_written_on_roster_link_accept');
select test_helpers.act_as_service();
select is((select jsonb_build_object('actor', actor_id, 'subject_profile', subject_profile_id, 'payload', payload)
           from public.workforce_audit_events where action = 'roster.linked' and subject_id = current_setting('fx.r1')::uuid),
          jsonb_build_object('actor', current_setting('fx.uw')::uuid, 'subject_profile', current_setting('fx.uw')::uuid,
                             'payload', jsonb_build_object('owner_id', current_setting('fx.o1')::uuid)),
          'w3_audit_written_on_roster_link_accept');

-- ---------- worker unlink, owner unlink ----------
select test_helpers.act_as_worker('j17w-w1@local.test');
select public.unlink_my_roster_entry(current_setting('fx.r1')::uuid);
select test_helpers.act_as_service();
select is(pg_temp.last_payload('roster.unlinked', current_setting('fx.r1')::uuid) ->> 'unlinked_by', 'worker',
          'w3_audit_written_on_worker_unlink');
select test_helpers.act_as_owner('j17w-o1@local.test');
select set_config('fx.code2', (select link_code from public.create_roster_link_code(current_setting('fx.r1')::uuid)), true);
select test_helpers.act_as_worker('j17w-w1@local.test');
select result from public.accept_roster_link_code(current_setting('fx.code2'));
select test_helpers.act_as_owner('j17w-o1@local.test');
update public.workers set user_id = null where id = current_setting('fx.r1')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.last_payload('roster.unlinked', current_setting('fx.r1')::uuid) ->> 'unlinked_by', 'owner',
          'w3_audit_written_on_owner_unlink');

-- ---------- linked roster row deleted by its owner ----------
select test_helpers.act_as_owner('j17w-o2@local.test');
delete from public.workers where id = current_setting('fx.r2')::uuid;
select test_helpers.act_as_service();
select is((select jsonb_build_object('subject_profile', subject_profile_id, 'by', payload ->> 'unlinked_by')
           from public.workforce_audit_events where action = 'roster.unlinked' and subject_id = current_setting('fx.r2')::uuid),
          jsonb_build_object('subject_profile', current_setting('fx.uw')::uuid, 'by', 'roster_entry_deleted'),
          'w3_audit_written_on_linked_roster_row_delete');
select is((select array_agg(body) from public.notifications
           where recipient_id = current_setting('fx.uw')::uuid and subject_id = current_setting('fx.r2')::uuid),
          array['A shop removed the link between your account and its roster.'],
          'w3_owner_row_delete_notifies_worker_shop_removed');

-- ---------- worker profile deleted: by the worker, and by account deletion ----------
select test_helpers.act_as_worker('j17w-w2@local.test');
insert into public.worker_profiles (profile_id, availability_status) values (auth.uid(), 'part_time');
delete from public.worker_profiles where profile_id = auth.uid();
select test_helpers.act_as_service();
select is(pg_temp.last_payload('worker_profile.deleted', current_setting('fx.uw2')::uuid) ->> 'deleted_by', 'self',
          'w3_audit_written_on_worker_profile_delete');
delete from auth.users where id = current_setting('fx.uw')::uuid;
select is(pg_temp.last_payload('worker_profile.deleted', current_setting('fx.uw')::uuid) ->> 'deleted_by', 'account_deleted',
          'w3_audit_written_on_worker_profile_delete');
select is(pg_temp.last_payload('roster.unlinked', current_setting('fx.r3')::uuid) ->> 'unlinked_by', 'account_deleted',
          'w3_audit_written_on_worker_profile_delete');

-- ---------- trusted role change audited; a rejected client change writes nothing ----------
update public.profiles set role = 'owner' where id = current_setting('fx.c1')::uuid;
select is(pg_temp.last_payload('profile.role_changed', current_setting('fx.c1')::uuid),
          '{"from_role": "customer", "to_role": "owner"}'::jsonb, 'w3_audit_written_on_trusted_role_change');
select test_helpers.act_as_customer('j17w-c2@local.test');
select is(test_helpers.attempt($$update public.profiles set role = 'owner' where id = auth.uid()$$), '42501',
          'w3_audit_written_on_trusted_role_change');

-- ---------- no private data in any payload ----------
select test_helpers.act_as_service();
select cmp_ok((select count(*)::int from public.workforce_audit_events
               where subject_profile_id in (current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)),
              '>=', 10, 'w3_no_private_data_in_audit_payloads');
select is((select count(*)::int from public.workforce_audit_events
           where payload::text ilike any (array[
             '%0917 555 0202%', '%917 555 0101%', '%0917 555 0303%', '%0917 555 0404%', '%Private note%',
             '%private-contact%', '%@%', '%code_hash%', '%' || current_setting('fx.code') || '%',
             '%' || current_setting('fx.code2') || '%', '%' || current_setting('fx.s_del') || '/%'])),
          0, 'w3_no_private_data_in_audit_payloads');

select * from finish();
rollback;
