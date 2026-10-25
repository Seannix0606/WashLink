-- J8 (certification half, W7; closes W3 C-W3-1): no client role (anon, authenticated, service_role) writes any
-- W7 table directly; issued facts and snapshots are immutable for EVERY session (trusted included); only the
-- issuing shop's current owner changes status; only the certificate worker asks for a review and only the
-- issuing owner decides it; history is append-only; certificates are deleted only by cascade. Local Docker
-- stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j8c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j8c-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j8c-o2@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j8c-cu@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j8c-by@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j8c-w' || n || '@local.test'))) from generate_series(1, 4) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j8c-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j8c_ids (label text primary key, id uuid) on commit drop;
grant all on j8c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j8c_ids where label = p_label $$;
select test_helpers.act_as_owner('j8c-o1@local.test');
select (public.set_shop_certification_validity(current_setting('fx.s1')::uuid, 1)).validity_months as validity_one_month;
select test_helpers.act_as_service();
insert into j8c_ids values ('c1', test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(1), 'j8c-o1@local.test')),
  ('c2', test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(2), 'j8c-o1@local.test')),
  ('e4', test_helpers.complete_training(current_setting('fx.s1')::uuid, pg_temp.w(4), 'j8c-o1@local.test')),
  ('roster_t', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.w(3)));
select test_helpers.designate_trainer(c.program_id, pg_temp.id('roster_t')) is not null as trainer_designated
from public.certifications c where c.id = pg_temp.id('c1');
select test_helpers.act_as_owner('j8c-o1@local.test');
select (public.transition_certification(pg_temp.id('c2'), 'active', 'suspended', 'Suspended while a complaint is checked')).status as c2_suspended;
insert into j8c_ids select 'ra1', id from public.record_certification_reassessment(pg_temp.id('c1'), array[true, true], 'passed');
select test_helpers.act_as(pg_temp.w(2));
insert into j8c_ids select 'r2', id from public.request_certification_review(pg_temp.id('c2'), 'I was not working on the day of the complaint.');
create function pg_temp.sql(p_kind text, p_table text) returns text language sql stable as $$
  select case p_kind
    when 'insert' then format('insert into public.%I default values', p_table)
    when 'update' then format('update public.%I set updated_at = now()', p_table)
    else format('delete from public.%I', p_table) end
$$;
create temporary table j8c_writes on commit drop as
select k.kind, t.tbl from unnest(array['insert', 'update', 'delete']) k(kind),
  unnest(array['shop_certification_policies', 'certifications', 'certification_status_events', 'certification_review_requests',
               'certification_reassessments']) t(tbl);
grant all on j8c_writes to public;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$   -- service_role has no test_helpers usage
begin
  execute p_sql;
  return 'succeeded';
exception when others then
  return sqlstate;
end $$;
create function pg_temp.denied_writes() returns int language sql as $$
  select count(*)::int from j8c_writes where pg_temp.try(pg_temp.sql(kind, tbl)) = '42501'
$$;
create function pg_temp.move_sql(p_label text, p_from text, p_to text) returns text language sql stable
as $$ select format('select public.transition_certification(%L, %L, %L, %L)', pg_temp.id(p_label), p_from, p_to, 'A reason that is long enough here') $$;
create function pg_temp.renew_sql(p_label text) returns text language sql stable
as $$ select format('select public.renew_certification(%L, %L, %L)', pg_temp.id(p_label), pg_temp.id('ra1'), 'w7_issuer_v1') $$;
create function pg_temp.reassess_sql(p_label text) returns text language sql stable
as $$ select format('select public.record_certification_reassessment(%L, %L, %L)', pg_temp.id(p_label), '{true,true}', 'passed') $$;
create function pg_temp.decide_sql(p_decision text default 'reinstate') returns text language sql stable
as $$ select format('select public.decide_certification_review(%L, %L, %L)', pg_temp.id('r2'), p_decision, 'A decision reason that is long enough') $$;
create function pg_temp.request_sql(p_label text) returns text language sql stable
as $$ select format('select public.request_certification_review(%L, %L)', pg_temp.id(p_label), 'Please review this decision for me.') $$;

-- ---------- direct writes ----------
select test_helpers.act_as(pg_temp.w(1));
select is(pg_temp.denied_writes(), 15, 'j8_cert_direct_writes_denied_for_clients_and_service_role');
select test_helpers.act_as_owner('j8c-o1@local.test');
select is(pg_temp.denied_writes(), 15, 'j8_cert_direct_writes_denied_for_clients_and_service_role');
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select set_config('role', 'service_role', true);
select is(pg_temp.denied_writes(), 15, 'j8_cert_direct_writes_denied_for_clients_and_service_role');
select set_config('role', 'none', true);
select test_helpers.act_as_service();
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public'
           and table_name in (select distinct tbl from j8c_writes) and grantee in ('anon', 'authenticated', 'service_role')
           and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')), 0, 'j8_cert_direct_writes_denied_for_clients_and_service_role');

-- ---------- issued facts are write-once for every session (trusted, even with the flag) ----------
select set_config('washlink.certification_write', pg_temp.id('c1')::text, true);
select is((select count(*)::int from unnest(array[
    'expires_at = now() + interval ''10 years''', 'issued_at = now() - interval ''1 year''', 'validity_months = 36',
    'evidence_snapshot = ''{}''::jsonb', 'shop_verification_status_at_issue = ''approved''', 'shop_verified_at_at_issue = now()',
    'approved_by = null', 'assessor_display_name = ''Someone else''', 'certification_title = ''Government licence''',
    'worker_id = ' || quote_literal(pg_temp.w(3)), 'enrollment_id = gen_random_uuid()', 'attended_training_days = 30']) s
  where test_helpers.attempt(format('update public.certifications set %s where id = %L', s, pg_temp.id('c1'))) = '42501'), 12,
  'j8_cert_issue_fields_and_snapshots_immutable_for_every_session');
select throws_ok(format('update public.certifications set issuer_attestation_version = %L where id = %L', 'w7_issuer_v1', pg_temp.id('c1')),
                 '42501', 'Certification records cannot be edited.', 'j8_cert_issue_fields_and_snapshots_immutable_for_every_session');
select set_config('washlink.certification_write', '', true);
select throws_ok(format('update public.certifications set status = %L, status_reason = %L where id = %L', 'revoked',
                        'Trusted session without the action flag', pg_temp.id('c1')),
                 '42501', 'Certifications change only through the certification actions.', 'j8_cert_issue_fields_and_snapshots_immutable_for_every_session');
select is((select row(status, validity_months, issuer_kind)::text from public.certifications where id = pg_temp.id('c1')),
          row('active', 1, 'shop_issued')::text, 'j8_cert_issue_fields_and_snapshots_immutable_for_every_session');

-- ---------- other owner, worker, trainer ----------
select test_helpers.act_as_owner('j8c-o2@local.test');
select throws_ok(pg_temp.move_sql('c1', 'active', 'suspended'), '42501', 'Certification not found.', 'j8_other_owner_cannot_change_or_renew');
select throws_ok(pg_temp.renew_sql('c1'), '42501', 'Certification not found.', 'j8_other_owner_cannot_change_or_renew');
select throws_ok(pg_temp.reassess_sql('c1'), '42501', 'Only the shop owner or a designated trainer can record training.', 'j8_other_owner_cannot_change_or_renew');
select throws_ok(format('select public.set_shop_certification_validity(%L, 6)', current_setting('fx.s1')), '42501', 'Shop not found.',
                 'j8_other_owner_cannot_change_or_renew');
select is((select count(*)::int from public.certifications) + (select count(*)::int from public.shop_certification_policies), 0,
          'j8_other_owner_cannot_change_or_renew');
select test_helpers.act_as(pg_temp.w(1));
select throws_ok(pg_temp.move_sql('c1', 'active', 'revoked'), '42501', 'This certification status change is not allowed.', 'j8_worker_cannot_change_own_certification');
select throws_ok(pg_temp.renew_sql('c1'), '42501', 'Only the shop owner can issue certifications.', 'j8_worker_cannot_change_own_certification');
select throws_ok(pg_temp.reassess_sql('c1'), '42501', 'Only the shop owner or a designated trainer can record training.', 'j8_worker_cannot_change_own_certification');
select is(test_helpers.attempt(format('update public.certifications set status = %L where id = %L', 'active', pg_temp.id('c1'))), '42501',
          'j8_worker_cannot_change_own_certification');
select test_helpers.act_as(pg_temp.w(3));
select throws_ok(format('select public.issue_certification(%L, gen_random_uuid(), %L)', pg_temp.id('e4'), 'w7_issuer_v1'), '42501',
                 'Only the shop owner can issue certifications.', 'j8_trainer_cannot_issue_or_change_status');
select throws_ok(pg_temp.move_sql('c1', 'active', 'suspended'), '42501', 'Certification not found.', 'j8_trainer_cannot_issue_or_change_status');
select throws_ok(pg_temp.renew_sql('c1'), '42501', 'Only the shop owner can issue certifications.', 'j8_trainer_cannot_issue_or_change_status');
select throws_ok(pg_temp.decide_sql(), '42501', 'Certification not found.', 'j8_trainer_cannot_issue_or_change_status');

-- ---------- append-only history (trusted, even with the flag) ----------
select test_helpers.act_as_service();
select set_config('washlink.certification_write', pg_temp.id('c2')::text, true);
select throws_ok(format('update public.certification_status_events set reason = %L where certification_id = %L', 'Edited reason that is long enough',
                        pg_temp.id('c2')), '42501', 'Certification records cannot be edited.', 'j8_events_reviews_reassessments_append_only');
select throws_ok(format('delete from public.certification_status_events where certification_id = %L', pg_temp.id('c2')), '42501',
                 'Certification records cannot be edited.', 'j8_events_reviews_reassessments_append_only');
select set_config('washlink.certification_write', pg_temp.id('ra1')::text, true);
select throws_ok(format('update public.certification_reassessments set items_met = %L where id = %L', '{false,false}', pg_temp.id('ra1')), '42501',
                 'Certification records cannot be edited.', 'j8_events_reviews_reassessments_append_only');
select set_config('washlink.certification_write', '', true);
select throws_ok(format('update public.certification_review_requests set worker_statement = %L where id = %L', 'An edited statement of the worker',
                        pg_temp.id('r2')), '42501', 'Review requests change only through the certification actions.', 'j8_events_reviews_reassessments_append_only');

-- ---------- review request / decision audiences ----------
create function pg_temp.as_role(p_who text, p_sql text) returns text language plpgsql as $$
begin
  case p_who
    when 'o1' then perform test_helpers.act_as_owner('j8c-o1@local.test');
    when 'o2' then perform test_helpers.act_as_owner('j8c-o2@local.test');
    when 'w2' then perform test_helpers.act_as(pg_temp.w(2));
    when 'w3' then perform test_helpers.act_as(pg_temp.w(3));
    when 'cu' then perform test_helpers.act_as_customer('j8c-cu@local.test');
    when 'admin' then perform test_helpers.act_as_admin('j8c-a1@local.test');
    else perform test_helpers.act_as_anon();
  end case;
  return test_helpers.attempt(p_sql);
end $$;
select is((select array_agg(pg_temp.as_role(x, pg_temp.request_sql('c2')) order by x) from unnest(array['admin', 'anon', 'cu', 'o1', 'o2', 'w3']) x),
          array['42501', '42501', '42501', '42501', '42501', '42501'], 'j8_review_request_only_by_certificate_worker');
select test_helpers.act_as_owner('j8c-o1@local.test');
select throws_ok(pg_temp.request_sql('c2'), '42501', 'Certification not found.', 'j8_review_request_only_by_certificate_worker');
select is((select array_agg(pg_temp.as_role(x, pg_temp.decide_sql()) order by x) from unnest(array['admin', 'anon', 'cu', 'o2', 'w2', 'w3']) x),
          array['42501', '42501', '42501', '42501', '42501', '42501'], 'j8_review_decision_only_by_issuing_owner');
select test_helpers.act_as(pg_temp.w(2));
select throws_ok(pg_temp.decide_sql(), '42501', 'Certification not found.', 'j8_review_decision_only_by_issuing_owner');
select test_helpers.act_as_service();
select is((select status from public.certification_review_requests where id = pg_temp.id('r2')), 'open', 'j8_review_decision_only_by_issuing_owner');
select is((select array_agg(pg_temp.as_role(x, pg_temp.move_sql('c1', 'active', 'suspended')) order by x) from unnest(array['admin', 'anon', 'cu']) x),
          array['42501', '42501', '42501'], 'j8_customer_super_admin_anon_cannot_change_certifications');
select test_helpers.act_as_admin('j8c-a1@local.test');
select throws_ok(pg_temp.move_sql('c1', 'active', 'suspended'), '42501', 'Certification not found.', 'j8_customer_super_admin_anon_cannot_change_certifications');
select throws_ok(format('select public.set_shop_certification_validity(%L, 6)', current_setting('fx.s1')), '42501', 'Shop not found.',
                 'j8_customer_super_admin_anon_cannot_change_certifications');
select test_helpers.act_as_service();
select is((select row(status, status_reason)::text from public.certifications where id = pg_temp.id('c1')), row('active', null)::text,
          'j8_customer_super_admin_anon_cannot_change_certifications');

-- ---------- deletion only by cascade ----------
select throws_ok(format('delete from public.certifications where id = %L', pg_temp.id('c1')), '42501', 'Certification records cannot be edited.',
                 'j8_certifications_deleted_only_by_cascade');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
select lives_ok(format('delete from auth.users where id = %L', pg_temp.w(2)), 'j8_certifications_deleted_only_by_cascade');
select test_helpers.act_as_service();
select is((select count(*)::int from public.certifications where id = pg_temp.id('c2'))
          + (select count(*)::int from public.certification_status_events where certification_id = pg_temp.id('c2'))
          + (select count(*)::int from public.certification_review_requests where id = pg_temp.id('r2')), 0,
          'j8_certifications_deleted_only_by_cascade');
select is((select payload ->> 'deleted_by' from public.workforce_audit_events where action = 'certification.deleted' and subject_id = pg_temp.id('c2')),
          'worker_profile_deleted', 'j8_certifications_deleted_only_by_cascade');

select * from finish();
rollback;
