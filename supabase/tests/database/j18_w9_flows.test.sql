-- J18 (W9): retention flows (P53; W5-L10, D-32, D-35) and unchanged existing flows. Owner account deletion keeps sent
-- and accepted contracts for the worker and removes never-sent drafts and unsent amendment drafts; shop deletion (by
-- the owner, untrusted) keeps contracts, removes never-sent drafts, withdraws a sent amendment and retains accepted
-- application snapshots for the worker; worker account deletion keeps accepted contracts for the owner and removes the
-- rest; bookings, quotes, ratings, verification, applications, training, certifications and templates still work.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18n-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j18n-cu@local.test')::text, true);
create temporary table j18n_ids (label text primary key, id uuid) on commit drop;
grant all on j18n_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18n_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.row_of(p_label text) returns text language sql stable security definer as $$
  select coalesce((select status || ',' || (owner_id is null)::text || ',' || (shop_id is null)::text || ',' || (worker_id is null)::text
                   from public.worker_contracts where id = pg_temp.id(p_label)), 'gone') $$;
create function pg_temp.deal(p_label text, p_owner text, p_shop text, p_worker text, p_stage text) returns uuid language plpgsql as $$
declare
  contract_id uuid := test_helpers.create_test_contract_draft('j18n-' || p_owner || '@local.test', pg_temp.id(p_shop), pg_temp.id(p_worker));
begin
  insert into j18n_ids values (p_label, contract_id);
  if p_stage in ('sent', 'accepted') then
    perform test_helpers.fill_test_contract_draft(contract_id, 'j18n-' || p_owner || '@local.test');
    perform test_helpers.send_test_contract(contract_id, 'j18n-' || p_owner || '@local.test');
  end if;
  if p_stage = 'accepted' then
    perform test_helpers.accept_test_contract(contract_id, 'j18n-' || p_worker || '@local.test');
  end if;
  return contract_id;
end $$;
insert into j18n_ids select 'o' || n, test_helpers.create_owner('j18n-o' || n || '@local.test') from generate_series(1, 3) n;
insert into j18n_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j18n-w' || n || '@local.test')) from generate_series(1, 10) n;
insert into j18n_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1'))),
  ('s2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.fx('a1'))), ('s3', test_helpers.create_verified_shop(pg_temp.id('o3'), pg_temp.fx('a1')));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w' || n)) from generate_series(1, 4) n;
insert into j18n_ids select 'app' || n, test_helpers.create_accepted_application(pg_temp.id('s2'), pg_temp.id('w' || n)) from generate_series(5, 7) n;
select test_helpers.create_accepted_application(pg_temp.id('s3'), pg_temp.id('w' || n)) from generate_series(8, 10) n;
select test_helpers.create_job_application(test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s2'), 'Submitted only')),
                                           pg_temp.id('w8'), 'submitted');
select pg_temp.deal('c1', 'o1', 's1', 'w1', 'accepted'), pg_temp.deal('c2', 'o1', 's1', 'w2', 'sent'), pg_temp.deal('c3', 'o1', 's1', 'w3', 'draft'),
       pg_temp.deal('c4', 'o1', 's1', 'w4', 'accepted');
select test_helpers.act_as_owner('j18n-o1@local.test');
insert into j18n_ids values ('c4v2', (public.create_worker_contract_amendment(pg_temp.id('c4'), (select revision from public.owner_worker_contracts()
                                      where contract_id = pg_temp.id('c4')))).id);
select test_helpers.act_as_service();
select pg_temp.deal('c5', 'o2', 's2', 'w5', 'accepted'), pg_temp.deal('c6', 'o2', 's2', 'w6', 'draft'), pg_temp.deal('c7', 'o2', 's2', 'w7', 'accepted');
select test_helpers.act_as_owner('j18n-o2@local.test');
insert into j18n_ids values ('c7v2', (public.create_worker_contract_amendment(pg_temp.id('c7'), (select revision from public.owner_worker_contracts()
                                      where contract_id = pg_temp.id('c7')))).id);
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c7'), 'j18n-o2@local.test', '{"schedule": "Weekends only for the season."}');
select test_helpers.send_test_contract(pg_temp.id('c7'), 'j18n-o2@local.test');
select pg_temp.deal('c8', 'o3', 's3', 'w8', 'accepted'), pg_temp.deal('c9', 'o3', 's3', 'w9', 'sent');

-- ---------- owner account deletion ----------
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('o1')), 'j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker');
select is(array[pg_temp.row_of('c1'), pg_temp.row_of('c2'), pg_temp.row_of('c3'), pg_temp.row_of('c4')],
          array['accepted,true,true,false', 'sent_for_review,true,true,false', 'gone', 'accepted,true,true,false'],
          'j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker');
select is((select count(*)::int from public.contract_versions where id = pg_temp.id('c4v2')), 0,
          'j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker');
select test_helpers.act_as_worker('j18n-w2@local.test');
select is((select array_to_string(allowed_actions, ' ') || ',' || owner_removed::text || ',' || shop_removed::text from public.my_worker_contracts()),
          'decline,true,true', 'j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker');
select is((public.decline_worker_contract_version(pg_temp.id('c2'), (select pending_version_id from public.my_worker_contracts()))).status, 'declined',
          'j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker');
select test_helpers.act_as_worker('j18n-w1@local.test');
select is((select owner_name || ',' || status from public.my_worker_contracts()), 'Local Test Owner,accepted',
          'j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker');

-- ---------- shop deletion by its owner (untrusted) ----------
select test_helpers.act_as_owner('j18n-o2@local.test');
select lives_ok(format('delete from public.shops where id = %L', pg_temp.id('s2')), 'j18_w9_shop_deletion_keeps_contracts_and_removes_never_sent_drafts');
select test_helpers.act_as_service();
select is(array[pg_temp.row_of('c5'), pg_temp.row_of('c6'), pg_temp.row_of('c7')], array['accepted,false,true,false', 'gone', 'accepted,false,true,false'],
          'j18_w9_shop_deletion_keeps_contracts_and_removes_never_sent_drafts');
select is((select state from public.contract_versions where id = pg_temp.id('c7v2')) || ',' ||
          (select (pending_version_id is null and current_version_id <> pg_temp.id('c7v2') and shop_removed_at is not null)::text
           from public.worker_contracts where id = pg_temp.id('c7')), 'withdrawn,true', 'j18_w9_shop_deletion_keeps_contracts_and_removes_never_sent_drafts');
select test_helpers.act_as_owner('j18n-o2@local.test');
select is((select string_agg(contract_id::text || ':' || array_length(allowed_actions, 1)::text, ',') from public.owner_worker_contracts()
           where cardinality(allowed_actions) > 0), null, 'j18_w9_shop_deletion_keeps_contracts_and_removes_never_sent_drafts');
select is((select count(*)::int from public.retained_job_application_records), 0, 'j18_w9_accepted_application_snapshot_retained_after_shop_deletion');
select test_helpers.act_as_worker('j18n-w5@local.test');
select is((select string_agg(application_id::text || ':' || status || ':' || (opening_snapshot ->> 'title'), ',') from public.my_retained_application_records()),
          pg_temp.id('app5') || ':accepted:Local test washer', 'j18_w9_accepted_application_snapshot_retained_after_shop_deletion');
select test_helpers.act_as_service();
select is((select count(*)::int from public.retained_job_application_records where application_id in (pg_temp.id('app5'), pg_temp.id('app6'), pg_temp.id('app7')))
          || ',' || (select count(*) from public.retained_job_application_records), '3,7', 'j18_w9_accepted_application_snapshot_retained_after_shop_deletion');   -- + 4 from the o1 deletion
select is((select count(*)::int from public.job_applications where id in (pg_temp.id('app5'), pg_temp.id('app6'), pg_temp.id('app7'))), 0,
          'j18_w9_accepted_application_snapshot_retained_after_shop_deletion');

-- ---------- worker account deletion ----------
select lives_ok(format('delete from auth.users where id in (%L, %L)', pg_temp.id('w8'), pg_temp.id('w9')),
                'j18_w9_worker_account_deletion_keeps_accepted_contracts_for_owner');
select is(array[pg_temp.row_of('c8'), pg_temp.row_of('c9')], array['accepted,false,false,true', 'gone'],
          'j18_w9_worker_account_deletion_keeps_accepted_contracts_for_owner');
select test_helpers.act_as_owner('j18n-o3@local.test');
select is((select worker_name || ',' || worker_removed::text || ',' || array_to_string(allowed_actions, ' ') from public.owner_worker_contracts()),
          'Local Test Worker,true,activate terminate', 'j18_w9_worker_account_deletion_keeps_accepted_contracts_for_owner');
select is((select string_agg(party_role || ':' || party_name, ',' order by party_role) from public.worker_contract_acceptances(pg_temp.id('c8'))),
          'owner:Local Test Owner,worker:Local Test Worker', 'j18_w9_worker_account_deletion_keeps_accepted_contracts_for_owner');

-- ---------- existing flows unchanged ----------
select test_helpers.act_as_service();
select test_helpers.set_shop_price(pg_temp.id('s3'), 'Sedan', 'Basic Wash', 250.00);
select test_helpers.act_as_customer('j18n-cu@local.test');
select lives_ok(format($$ insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
                         values ('J18 W9', %L, 'Sedan', 'Basic Wash', 'Test address', now() + interval '2 days', %L) $$, pg_temp.fx('cu'), pg_temp.id('s3')),
                'j18_w9_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
select is((select quoted_price::text || ',' || public.shop_has_recorded_verification(shop_id)::text from public.bookings where customer_name = 'J18 W9'),
          '250.00,true', 'j18_w9_booking_quote_rating_and_verification_unchanged');
insert into j18n_ids values ('cert', test_helpers.issue_test_certification(pg_temp.id('s3'), pg_temp.id('w10'), 'j18n-o3@local.test')),
  ('tpl', test_helpers.create_test_contract_template('j18n-o3@local.test', 'Still works'));
select is((select status from public.certifications where id = pg_temp.id('cert')) || ',' || (select status from public.contract_templates where id = pg_temp.id('tpl')),
          'active,active', 'j18_w9_application_training_certification_and_template_flows_unchanged');

insert into j18n_ids values ('job', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s3'), 'J18N trainees welcome')));
select test_helpers.act_as_worker('j18n-w10@local.test');
select is((public.create_job_application(pg_temp.id('job'), null, true, 'w5_v1')).status, 'submitted',
          'j18_w9_application_training_certification_and_template_flows_unchanged');
select test_helpers.act_as_service();

select * from finish();
rollback;
