-- J18 (W8): owner account deletion (untrusted, like GoTrue) cascades the owner's templates, versions and clauses
-- and keeps the audit trail; the platform standard (and a version published by a since-deleted super_admin) and
-- other owners' templates survive unchanged; bookings (quote, rating), shop verification, job openings, training,
-- certifications and applications are unchanged with contract templates present. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18t-a1@local.test')::text, true);
select set_config('fx.a2', test_helpers.create_super_admin('j18t-a2@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j18t-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j18t-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j18t-c1@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j18t-by@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j18t-w' || n || '@local.test'))) from generate_series(1, 2) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j18t-w' || n || '@local.test' $$;
create temporary table j18t_ids (label text primary key, id uuid) on commit drop;
grant all on j18t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18t_ids where label = p_label $$;
insert into j18t_ids values ('pt', (select id from public.contract_templates where scope = 'platform')),
  ('p1', test_helpers.latest_platform_contract_version()),
  ('t1', test_helpers.create_test_contract_template('j18t-o1@local.test', 'Owner one template')),
  ('t3', test_helpers.create_test_contract_template('j18t-o2@local.test', 'Owner two template')),
  ('s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)),
  ('s_pending', test_helpers.create_shop(current_setting('fx.o2')::uuid, 'pending'));
insert into j18t_ids values ('t1v2', test_helpers.save_test_template_version(pg_temp.id('t1'), 'j18t-o1@local.test', '{"schedule": "Mornings."}',
  '[{"section_number": 15, "heading": "Uniform", "body": "The shop lends a uniform."}]'));
select test_helpers.act_as_owner('j18t-o1@local.test');
insert into j18t_ids select 't2', id from public.create_owner_contract_template('Derived template', pg_temp.id('t1v2'));
select test_helpers.act_as_admin('j18t-a2@local.test');
insert into j18t_ids select 'p2', id from public.publish_platform_contract_template_version(1, (
  select jsonb_agg(jsonb_build_object('section_number', section_number, 'clause_key', clause_key, 'kind', kind, 'heading', heading,
                                      'body', case when clause_key = 'schedule' then '[Shop: describe the working days and hours {{schedule_summary}}.]' else body end,
                                      'requires_owner_input', requires_owner_input) order by section_number, position)
  from public.contract_template_clauses where version_id = pg_temp.id('p1')));
select test_helpers.act_as_service();
create temporary table j18t_before on commit drop as
  select v.id, v.content_hash, (select count(*) from public.contract_template_clauses c where c.version_id = v.id) as clauses
  from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id
  where t.scope = 'platform' or t.id = pg_temp.id('t3');
create function pg_temp.untrusted() returns void language sql as $$
  select test_helpers.act_as_service();
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.unchanged() returns boolean language sql stable security definer as $$
  select not exists (select 1 from j18t_before b left join public.contract_template_versions v on v.id = b.id
                     where v.id is null or v.content_hash <> b.content_hash
                        or (select count(*) from public.contract_template_clauses c where c.version_id = b.id) <> b.clauses
                        or v.content_hash <> public.contract_template_version_hash(v.id)) $$;

-- ---------- owner account deletion ----------
select pg_temp.untrusted();
select lives_ok(format('delete from auth.users where id = %L', current_setting('fx.o1')), 'j18_w8_owner_account_deletion_cascades_templates_and_keeps_audit');
select test_helpers.act_as_service();
select is((select count(*)::int from public.contract_templates where owner_id = current_setting('fx.o1')::uuid or id in (pg_temp.id('t1'), pg_temp.id('t2')))
          + (select count(*)::int from public.contract_template_versions where template_id in (pg_temp.id('t1'), pg_temp.id('t2')))
          + (select count(*)::int from public.contract_template_clauses where version_id = pg_temp.id('t1v2')), 0,
          'j18_w8_owner_account_deletion_cascades_templates_and_keeps_audit');
select is((select array_agg(action || ':' || coalesce(payload ->> 'deleted_by', payload ->> 'changed_by') order by id) from public.workforce_audit_events
           where subject_id = pg_temp.id('t1')), array['contract_template.created:owner', 'contract_template.version_saved:owner',
           'contract_template.version_saved:owner', 'contract_template.deleted:owner_account_deleted'],
          'j18_w8_owner_account_deletion_cascades_templates_and_keeps_audit');
select is((select count(*)::int from public.workforce_audit_events where subject_id = pg_temp.id('t2') and action = 'contract_template.deleted'
           and subject_profile_id = current_setting('fx.o1')::uuid), 1, 'j18_w8_owner_account_deletion_cascades_templates_and_keeps_audit');

-- ---------- platform standard and other owners survive ----------
select ok(pg_temp.unchanged(), 'j18_w8_platform_template_survives_owner_deletion');
select is((select row(status, current_version_number)::text from public.contract_templates where id = pg_temp.id('pt')), row('active', 2)::text,
          'j18_w8_platform_template_survives_owner_deletion');
select pg_temp.untrusted();
select lives_ok(format('delete from auth.users where id = %L', current_setting('fx.a2')), 'j18_w8_platform_template_survives_owner_deletion');
select test_helpers.act_as_service();
select is((select row(saved_by is null, saved_by_role, version_number)::text from public.contract_template_versions where id = pg_temp.id('p2')),
          row(true, 'super_admin', 2)::text, 'j18_w8_platform_template_survives_owner_deletion');
select ok(pg_temp.unchanged(), 'j18_w8_platform_template_survives_owner_deletion');
select test_helpers.act_as_owner('j18t-o2@local.test');
select is((select row(newer_standard_available, base_platform_version_number)::text from public.owner_contract_templates()), row(true, 1)::text,
          'j18_w8_platform_template_survives_owner_deletion');
select is((public.save_owner_contract_template_version(pg_temp.id('t3'), 1, pg_temp.id('p2'), '{}', '[]')).version_number, 2,
          'j18_w8_platform_template_survives_owner_deletion');

-- ---------- bookings, verification ----------
select test_helpers.act_as_service();
select test_helpers.set_shop_price(pg_temp.id('s2'), 'Sedan', 'Basic Wash', 250.00);
select test_helpers.act_as_customer('j18t-c1@local.test');
select lives_ok(format($$ insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
                         values ('J18 W8', %L, 'Sedan', 'Basic Wash', 'Test address', now() + interval '2 days', %L) $$,
                       current_setting('fx.c1'), pg_temp.id('s2')), 'j18_w8_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
select is((select quoted_price from public.bookings where customer_name = 'J18 W8'), 250.00::numeric, 'j18_w8_booking_quote_rating_and_verification_unchanged');
update public.bookings set booking_status = 'completed' where customer_name = 'J18 W8';
select test_helpers.act_as_customer('j18t-c1@local.test');
select lives_ok($$ update public.bookings set customer_rating_stars = 5 where customer_name = 'J18 W8' $$,
                'j18_w8_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_admin('j18t-a1@local.test');
select lives_ok(format('update public.shops set verification_status = %L where id = %L', 'approved', pg_temp.id('s_pending')),
                'j18_w8_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
select is((select row(verification_reviewed_by = current_setting('fx.a1')::uuid, public.shop_has_recorded_verification(id))::text
           from public.shops where id = pg_temp.id('s_pending')), row(true, true)::text, 'j18_w8_booking_quote_rating_and_verification_unchanged');

-- ---------- job openings, training, certifications, applications ----------
insert into j18t_ids values ('c1', test_helpers.issue_test_certification(pg_temp.id('s2'), pg_temp.w(1), 'j18t-o2@local.test')),
  ('job', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s2'), 'J18T trainees welcome')));
select is((select row(status, issuer_kind)::text from public.certifications where id = pg_temp.id('c1')), row('active', 'shop_issued')::text,
          'j18_w8_job_opening_training_and_certification_flows_unchanged');
select is((select status from public.job_openings where id = pg_temp.id('job')), 'published', 'j18_w8_job_opening_training_and_certification_flows_unchanged');
select test_helpers.act_as(pg_temp.w(2));
select is((public.create_job_application(pg_temp.id('job'), null, true, 'w5_v1')).status, 'submitted',
          'j18_w8_job_opening_training_and_certification_flows_unchanged');

select * from finish();
rollback;
