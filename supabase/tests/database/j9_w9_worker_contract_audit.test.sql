-- W9 audit and notifications (P54): every transition writes its audit event; payloads carry ids, status / kind words
-- and small counts only (no text, names, reasons, dates or hashes); refused actions write nothing; at most one
-- notification per recipient and event (idempotent keys); notification texts pass the W3 safety checks.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w9a-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w9a-o1@local.test')::text, true);
create temporary table w9a_ids (label text primary key, id uuid) on commit drop;
grant all on w9a_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w9a_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.offer(p_label text, p_shop text, p_worker text) returns uuid language plpgsql as $$
declare
  contract_id uuid := test_helpers.create_test_contract_draft('w9a-o1@local.test', pg_temp.id(p_shop), pg_temp.id(p_worker));
begin
  insert into w9a_ids values (p_label, contract_id);
  perform test_helpers.fill_test_contract_draft(contract_id, 'w9a-o1@local.test', '{}', null, '{"pay_details": "Daily pay of KOALA amount"}');
  return test_helpers.send_test_contract(contract_id, 'w9a-o1@local.test');
end $$;
insert into w9a_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1'))),
  ('s2', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1'))), ('s3', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1')));
insert into w9a_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('w9a-w' || n || '@local.test')) from generate_series(1, 7) n;
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w' || n)) from generate_series(1, 5) n;
insert into w9a_ids values ('app6', test_helpers.create_accepted_application(pg_temp.id('s2'), pg_temp.id('w6')));
select test_helpers.create_accepted_application(pg_temp.id('s3'), pg_temp.id('w7'));

-- ---------- every transition ----------
insert into w9a_ids values ('cA', test_helpers.create_test_contract_draft('w9a-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1')));
select test_helpers.act_as_owner('w9a-o1@local.test');
select public.discard_worker_contract_draft(pg_temp.id('cA'), (select v.version_id from public.worker_contract_versions(pg_temp.id('cA')) v));
select test_helpers.act_as_service();
select pg_temp.offer('cB', 's1', 'w2');
select test_helpers.act_as_owner('w9a-o1@local.test');
select public.withdraw_worker_contract_version(pg_temp.id('cB'), (select pending_version_id from public.owner_worker_contracts() where contract_id = pg_temp.id('cB')));
select test_helpers.act_as_service();
insert into w9a_ids values ('cCv1', pg_temp.offer('cC', 's1', 'w3'));
select test_helpers.act_as_worker('w9a-w3@local.test');
select public.decline_worker_contract_version(pg_temp.id('cC'), pg_temp.id('cCv1'), 'Prefer weekends PLATYPUS.');
select test_helpers.act_as_service();
select pg_temp.offer('cD', 's1', 'w4');
select test_helpers.accept_test_contract(pg_temp.id('cD'), 'w9a-w4@local.test');
select test_helpers.act_as_owner('w9a-o1@local.test');
insert into w9a_ids values ('cDv2', (public.create_worker_contract_amendment(pg_temp.id('cD'), pg_temp.rev('cD'))).id);
select public.discard_worker_contract_draft(pg_temp.id('cD'), pg_temp.id('cDv2'));
select public.create_worker_contract_amendment(pg_temp.id('cD'), pg_temp.rev('cD'));
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('cD'), 'w9a-o1@local.test', '{"schedule": "Weekends only for the season."}');
select test_helpers.send_test_contract(pg_temp.id('cD'), 'w9a-o1@local.test');
select test_helpers.accept_test_contract(pg_temp.id('cD'), 'w9a-w4@local.test');
select test_helpers.act_as_owner('w9a-o1@local.test');
select public.activate_worker_contract(pg_temp.id('cD'), pg_temp.rev('cD'));
select public.terminate_worker_contract(pg_temp.id('cD'), pg_temp.rev('cD'), 'Closing this branch EMU for renovation.');
select test_helpers.act_as_owner('w9a-o1@local.test');
insert into w9a_ids values ('cE', (public.create_worker_contract_draft(pg_temp.id('s1'), pg_temp.id('w5'), test_helpers.latest_platform_contract_version(),
                                   'employee', test_helpers.manila_today(), test_helpers.manila_today())).id);
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('cE'), 'w9a-o1@local.test');
select test_helpers.send_test_contract(pg_temp.id('cE'), 'w9a-o1@local.test');
select test_helpers.accept_test_contract(pg_temp.id('cE'), 'w9a-w5@local.test');
select public.expire_worker_contracts(test_helpers.manila_today() + 1);
select pg_temp.offer('cF', 's2', 'w6');
select test_helpers.accept_test_contract(pg_temp.id('cF'), 'w9a-w6@local.test');
insert into w9a_ids values ('cG', test_helpers.create_test_contract_draft('w9a-o1@local.test', pg_temp.id('s3'), pg_temp.id('w7')));
-- Refused actions write nothing.
select set_config('fx.audit_before', (select count(*)::text from public.workforce_audit_events), true);
select set_config('fx.notes_before', (select count(*)::text from public.notifications), true);
select test_helpers.act_as_owner('w9a-o1@local.test');
select test_helpers.attempt(format($$ select public.send_worker_contract_version(%L, 1, 'w9_owner_send_v1', null, 0) $$, pg_temp.id('cG')));
select test_helpers.attempt(format($$ select public.terminate_worker_contract(%L, %s, 'short') $$, pg_temp.id('cF'), pg_temp.rev('cF')));
select test_helpers.act_as_worker('w9a-w6@local.test');
select test_helpers.attempt(format($$ select public.terminate_worker_contract(%L, 0, 'Stale revision used here.') $$, pg_temp.id('cF')));
select test_helpers.act_as_service();
select is((select count(*)::text from public.workforce_audit_events) || ',' || (select count(*)::text from public.notifications),
          current_setting('fx.audit_before') || ',' || current_setting('fx.notes_before'), 'w9_refused_action_writes_nothing');
delete from public.shops where id = pg_temp.id('s2');
delete from public.shops where id = pg_temp.id('s3');

create temporary table w9a_events on commit drop as
  select e.* from public.workforce_audit_events e
  where (e.subject_type = 'worker_contract' and e.subject_id in (select id from w9a_ids where label ~ '^c[A-G]$'))
     or (e.subject_type = 'job_application_record' and e.subject_id = pg_temp.id('app6'));
select is((select array_agg(distinct action order by action) from w9a_events),
          array['job_application_record.retained', 'worker_contract.accepted', 'worker_contract.activated', 'worker_contract.amendment_created',
                'worker_contract.created', 'worker_contract.declined', 'worker_contract.deleted', 'worker_contract.draft_discarded',
                'worker_contract.expired', 'worker_contract.party_removed', 'worker_contract.sent', 'worker_contract.terminated',
                'worker_contract.withdrawn'], 'w9_audit_written_for_every_transition');
select is((select string_agg(action || ':' || coalesce(payload ->> 'version_kind', '-'), ',' order by id) from w9a_events where subject_id = pg_temp.id('cD')),
          'worker_contract.created:-,worker_contract.sent:initial,worker_contract.accepted:initial,worker_contract.amendment_created:amendment,'
          || 'worker_contract.draft_discarded:amendment,worker_contract.amendment_created:amendment,worker_contract.sent:amendment,'
          || 'worker_contract.accepted:amendment,worker_contract.activated:amendment,worker_contract.terminated:amendment',
          'w9_audit_written_for_every_transition');
select is((select string_agg(action || ':' || coalesce(payload ->> 'deleted_by', payload ->> 'removed_party', payload ->> 'to_status', '-'), ',' order by id)
           from w9a_events where subject_id in (pg_temp.id('cA'), pg_temp.id('cF'), pg_temp.id('cG')) and action ~ '(discarded|removed|deleted)'),
          'worker_contract.draft_discarded:owner_discarded,worker_contract.party_removed:shop,worker_contract.deleted:shop_deleted',
          'w9_audit_written_for_every_transition');
select is((select payload ->> 'ended_by' from w9a_events where subject_id = pg_temp.id('cE') and action = 'worker_contract.expired'), 'system',
          'w9_audit_written_for_every_transition');

-- ---------- payload rules ----------
select is((select count(*)::int from w9a_events e, jsonb_object_keys(e.payload) k
           where k not in ('contract_id', 'version_id', 'version_number', 'version_kind', 'shop_id', 'from_status', 'to_status', 'flag_count',
                           'classification_key', 'party_role', 'changed_by', 'ended_by', 'deleted_by', 'removed_party', 'origin', 'application_id',
                           'record_id', 'removal_reason')), 0, 'w9_audit_payload_has_no_text_names_reasons_dates_or_hashes');
select is((select count(*)::int from w9a_events e where e.payload::text ~* '(KOALA|PLATYPUS|EMU|Local Test|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9a-f]{64}|weekends)'),
          0, 'w9_audit_payload_has_no_text_names_reasons_dates_or_hashes');

-- ---------- notifications ----------
create temporary table w9a_notes on commit drop as
  select n.* from public.notifications n where n.subject_type = 'worker_contract' and n.subject_id in (select id from w9a_ids where label ~ '^c[A-G]$');
select is((select count(*)::int from w9a_notes n where n.idempotency_key !~ ('^worker_contract:' || n.subject_id || ':[0-9]+$')
           or not exists (select 1 from w9a_events e where e.id = split_part(n.idempotency_key, ':', 3)::bigint and e.subject_id = n.subject_id)), 0,
          'w9_notifications_one_per_event_idempotent');
select is((select count(*)::int from (select recipient_id, idempotency_key from w9a_notes group by 1, 2 having count(*) > 1) d), 0,
          'w9_notifications_one_per_event_idempotent');
select is((select count(*)::int from w9a_notes n where public.enqueue_notification(n.recipient_id, n.category, n.title, n.body, n.idempotency_key,
           n.subject_type, n.subject_id) <> n.id) || ',' || (select count(*) from public.notifications n where n.subject_type = 'worker_contract'
             and n.subject_id in (select id from w9a_ids where label ~ '^c[A-G]$')),
          '0,' || (select count(*) from w9a_notes), 'w9_notifications_one_per_event_idempotent');
select is((select string_agg(title, ',' order by title) from w9a_notes where subject_id = pg_temp.id('cE')),
          'Contract accepted,Contract expired,Contract expired,Contract offer', 'w9_notifications_one_per_event_idempotent');
select ok((select bool_and(public.notification_text_is_safe(title) and public.notification_text_is_safe(body) and category = 'worker_contract'
                           and (title || body) !~* '(KOALA|PLATYPUS|EMU|Local Test Owner|Local Test Worker)') from w9a_notes)
          and (select count(*) from w9a_notes) >= 12, 'w9_notification_texts_pass_safety_checks');

select * from finish();
rollback;
