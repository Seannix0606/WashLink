-- J17 (W5): job application privileges and RLS, cross-tenant isolation, the narrow applicant
-- read path (no private contacts, no worker_profiles widening), internal functions, pinning,
-- realtime exclusion and cascades. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17w5-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17w5-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17w5-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j17w5-c1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j17w5-w' || n || '@local.test'))) from generate_series(1, 5) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j17w5-w' || n || '@local.test' $$;
insert into public.worker_private_contacts (profile_id, contact_phone, contact_email, preferred_contact_method)
values (pg_temp.w(1), '+63 917 000 0001', 'j17w5-w1-private@local.test', 'phone');
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17W5 one'))::text, true);
select set_config('fx.j1b', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17W5 one b'))::text, true);
select set_config('fx.j1c', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17W5 one c'))::text, true);
select set_config('fx.j2', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'J17W5 two'))::text, true);
create temporary table j17w5_apps (label text primary key, id uuid) on commit drop;
grant all on j17w5_apps to public;
insert into j17w5_apps
select label, test_helpers.create_job_application(current_setting('fx.' || opening)::uuid, pg_temp.w(n), st)
from (values ('w1_j1', 'j1', 1, 'submitted'), ('w2_j1', 'j1', 2, 'draft'), ('w3_j1', 'j1', 3, 'rejected'),
             ('w4_j1', 'j1', 4, 'under_review'), ('w5_j1', 'j1', 5, 'withdrawn'), ('w2_j1b', 'j1b', 2, 'accepted'),
             ('w3_j1b', 'j1b', 3, 'closed'), ('w2_j1c', 'j1c', 2, 'draft'), ('w3_j1c', 'j1c', 3, 'submitted'),
             ('w1_j2', 'j2', 1, 'submitted')) v(label, opening, n, st);
create function pg_temp.app(p_label text) returns uuid language sql stable as $$ select id from j17w5_apps where label = p_label $$;
update public.job_openings set status = 'paused' where id = current_setting('fx.j1c')::uuid;

-- ---------- privileges and RLS ----------
select ok((select relrowsecurity from pg_class where oid = 'public.job_applications'::regclass),
          'j17_job_applications_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
           cross join unnest(array['anon', 'authenticated', 'service_role']) r
           where has_table_privilege(r, 'public.job_applications', p)),
          0, 'j17_job_applications_rls_enabled_and_no_client_write_privileges');
select ok(has_table_privilege('authenticated', 'public.job_applications', 'select')
          and not has_table_privilege('anon', 'public.job_applications', 'select'),
          'j17_job_applications_rls_enabled_and_no_client_write_privileges');
select is((select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'job_applications'),
          array['ja_no_client_delete', 'ja_no_client_insert', 'ja_no_client_update', 'ja_select_owner_non_draft', 'ja_select_worker_own'],
          'j17_job_applications_rls_enabled_and_no_client_write_privileges');

-- ---------- reads ----------
select test_helpers.act_as(pg_temp.w(1));
select is((select array_agg(l.label order by l.label) from public.job_applications a join j17w5_apps l on l.id = a.id),
          array['w1_j1', 'w1_j2'], 'j17_worker_cannot_read_other_workers_applications');
select test_helpers.act_as(pg_temp.w(2));
select is((select array_agg(l.label order by l.label) from public.job_applications a join j17w5_apps l on l.id = a.id),
          array['w2_j1', 'w2_j1b', 'w2_j1c'], 'j17_worker_cannot_read_other_workers_applications');
select test_helpers.act_as_owner('j17w5-o1@local.test');
select is((select array_agg(l.label order by l.label) from public.job_applications a join j17w5_apps l on l.id = a.id),
          array['w1_j1', 'w2_j1b', 'w3_j1', 'w3_j1b', 'w3_j1c', 'w4_j1', 'w5_j1'], 'j17_owner_reads_applications_only_for_own_openings');
select is((select count(*)::int from public.job_applications where status = 'draft'), 0, 'j17_owner_cannot_read_draft_applications');
select test_helpers.act_as_owner('j17w5-o2@local.test');
select is((select array_agg(l.label) from public.job_applications a join j17w5_apps l on l.id = a.id), array['w1_j2'],
          'j17_owner_reads_applications_only_for_own_openings');
select test_helpers.act_as_customer('j17w5-c1@local.test');
select is((select count(*)::int from public.job_applications), 0, 'j17_customer_anon_and_super_admin_read_no_applications');
select test_helpers.act_as_admin('j17w5-a1@local.test');
select is((select count(*)::int from public.job_applications), 0, 'j17_customer_anon_and_super_admin_read_no_applications');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.job_applications'), '42501', 'j17_customer_anon_and_super_admin_read_no_applications');

-- ---------- cross-tenant writes ----------
select test_helpers.act_as_owner('j17w5-o2@local.test');
select throws_ok($$ select public.transition_job_application(pg_temp.app('w4_j1'), 'under_review', 'rejected') $$,
                 '42501', 'Job application not found.', 'j17_owner_cannot_transition_another_owners_applications');
select throws_ok($$ select public.transition_job_application(pg_temp.app('w1_j1'), 'submitted', 'under_review') $$,
                 '42501', 'Job application not found.', 'j17_owner_cannot_transition_another_owners_applications');
select test_helpers.act_as(pg_temp.w(2));
select throws_ok($$ select public.transition_job_application(pg_temp.app('w1_j1'), 'submitted', 'withdrawn') $$,
                 '42501', 'Job application not found.', 'j17_worker_cannot_transition_or_edit_another_workers_application');
select test_helpers.act_as(pg_temp.w(1));
select throws_ok($$ select public.update_job_application_draft(pg_temp.app('w2_j1'), 'Hijack', now()) $$,
                 '42501', 'Job application not found.', 'j17_worker_cannot_transition_or_edit_another_workers_application');
select throws_ok($$ select public.delete_job_application_draft(pg_temp.app('w2_j1')) $$,
                 '42501', 'Job application not found.', 'j17_worker_cannot_transition_or_edit_another_workers_application');
select throws_ok($$ select public.transition_job_application(pg_temp.app('w2_j1'), 'draft', 'submitted', 'w5_v1') $$,
                 '42501', 'Job application not found.', 'j17_worker_cannot_transition_or_edit_another_workers_application');
select test_helpers.act_as_service();
select is((select array_agg(status order by label) from public.job_applications a join j17w5_apps l on l.id = a.id
           where l.label in ('w1_j1', 'w2_j1', 'w4_j1')), array['submitted', 'draft', 'under_review'],
          'j17_worker_cannot_transition_or_edit_another_workers_application');

-- ---------- applicant read path ----------
select test_helpers.act_as_owner('j17w5-o1@local.test');
select is((select array_agg(l.label order by l.label) from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid) p
           join j17w5_apps l on l.id = p.application_id), array['w1_j1', 'w4_j1'],
          'j17_applicant_profiles_only_for_own_opening_and_sharing_statuses');
select is((select array_agg(l.label order by l.label) from public.applicant_profiles_for_job_opening(current_setting('fx.j1b')::uuid) p
           join j17w5_apps l on l.id = p.application_id), array['w2_j1b'],
          'j17_applicant_profiles_only_for_own_opening_and_sharing_statuses');
select is((select row(display_name, headline, availability_status)::text
           from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid) where application_id = pg_temp.app('w1_j1')),
          row('Local Test Worker', 'Local test car wash worker', 'flexible')::text,
          'j17_applicant_profiles_only_for_own_opening_and_sharing_statuses');
select throws_ok($$ select * from public.applicant_profiles_for_job_opening(current_setting('fx.j2')::uuid) $$,
                 '42501', 'Job opening not found.', 'j17_applicant_profiles_only_for_own_opening_and_sharing_statuses');
select test_helpers.act_as(pg_temp.w(1));
select throws_ok($$ select * from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid) $$,
                 '42501', 'Job opening not found.', 'j17_applicant_profiles_only_for_own_opening_and_sharing_statuses');
select test_helpers.act_as_admin('j17w5-a1@local.test');
select throws_ok($$ select * from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid) $$,
                 '42501', 'Job opening not found.', 'j17_applicant_profiles_only_for_own_opening_and_sharing_statuses');
select test_helpers.act_as_service();
select is((select count(*)::int from pg_proc p, unnest(p.proargnames) arg
           where p.oid = 'public.applicant_profiles_for_job_opening(uuid)'::regprocedure
             and arg ~* '(contact|phone|e_?mail|address)'), 0, 'j17_applicant_profiles_have_no_contact_columns');
select is((select array_agg(arg order by ordinality) from pg_proc p, unnest(p.proargnames) with ordinality arg
           where p.oid = 'public.applicant_profiles_for_job_opening(uuid)'::regprocedure and ordinality > 1),
          array['application_id', 'display_name', 'headline', 'experience_summary', 'years_of_experience', 'skills',
                'preferred_locations', 'availability_status', 'availability_notes', 'profile_updated_at'],
          'j17_applicant_profiles_have_no_contact_columns');
select ok(position('worker_private_contacts' in pg_get_functiondef('public.applicant_profiles_for_job_opening(uuid)'::regprocedure)) = 0,
          'j17_applicant_profiles_have_no_contact_columns');

select test_helpers.act_as_owner('j17w5-o1@local.test');
select is((select count(*)::int from public.worker_private_contacts), 0, 'j17_owner_cannot_read_applicant_private_contacts');
select is((select count(*)::int from public.worker_profiles), 0, 'j17_owner_cannot_read_worker_profiles_table_directly');
select is((select count(*)::int from public.profiles where id = pg_temp.w(1)), 0, 'j17_owner_cannot_read_worker_profiles_table_directly');

select is((select count(*)::int from public.applicant_verified_certifications(pg_temp.app('w1_j1'))), 0,
          'j17_applicant_verified_certifications_authorized_and_empty_until_w7');
select throws_ok($$ select * from public.applicant_verified_certifications(pg_temp.app('w3_j1')) $$,
                 '42501', 'Job application not found.', 'j17_applicant_verified_certifications_authorized_and_empty_until_w7');
select throws_ok($$ select * from public.applicant_verified_certifications(pg_temp.app('w2_j1')) $$,
                 '42501', 'Job application not found.', 'j17_applicant_verified_certifications_authorized_and_empty_until_w7');
select test_helpers.act_as(pg_temp.w(1));
select is((select count(*)::int from public.applicant_verified_certifications(pg_temp.app('w1_j1'))), 0,
          'j17_applicant_verified_certifications_authorized_and_empty_until_w7');
select throws_ok($$ select * from public.applicant_verified_certifications(pg_temp.app('w4_j1')) $$,
                 '42501', 'Job application not found.', 'j17_applicant_verified_certifications_authorized_and_empty_until_w7');
select test_helpers.act_as_owner('j17w5-o2@local.test');
select throws_ok($$ select * from public.applicant_verified_certifications(pg_temp.app('w1_j1')) $$,
                 '42501', 'Job application not found.', 'j17_applicant_verified_certifications_authorized_and_empty_until_w7');

-- ---------- applicants read the paused opening; drafts do not count ----------
select test_helpers.act_as(pg_temp.w(3));
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j1c')::uuid), 1,
          'j17_applicant_opening_policy_needs_non_draft_application');
select test_helpers.act_as(pg_temp.w(2));
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j1c')::uuid), 0,
          'j17_applicant_opening_policy_needs_non_draft_application');
select test_helpers.act_as(pg_temp.w(4));
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j1c')::uuid), 0,
          'j17_applicant_opening_policy_needs_non_draft_application');

-- ---------- functions ----------
select test_helpers.act_as_service();
select is((select count(*)::int from unnest(array[
             'public.job_opening_application_snapshot(public.job_openings)', 'public.job_applications_guard_write()',
             'public.job_applications_normalize()', 'public.job_application_apply_checks(uuid, uuid, uuid)',
             'public.job_applications_audit()', 'public.job_openings_close_applications()',
             'public.job_openings_notify_applicants_on_pause()']) f
           cross join unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, f, 'execute')),
          0, 'j17_w5_internal_functions_not_client_executable');
create temporary table j17w5_rpcs (signature text) on commit drop;
insert into j17w5_rpcs values ('public.create_job_application(uuid, text, boolean, text)'),
  ('public.update_job_application_draft(uuid, text, timestamptz)'), ('public.delete_job_application_draft(uuid)'),
  ('public.transition_job_application(uuid, text, text, text)'), ('public.job_application_notice_version()'),
  ('public.search_job_openings(text, text, text, text, text, boolean, numeric, text, integer, integer)'),
  ('public.applicant_profiles_for_job_opening(uuid)'), ('public.applicant_verified_certifications(uuid)'),
  ('public.worker_has_applied_to_job_opening(uuid)');
select is((select count(*)::int from j17w5_rpcs where has_function_privilege('anon', signature, 'execute')
              or has_function_privilege('service_role', signature, 'execute')
              or not has_function_privilege('authenticated', signature, 'execute')), 0, 'j17_w5_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select throws_ok($$ select public.transition_job_application(gen_random_uuid(), 'submitted', 'withdrawn') $$, '42501', null, 'j17_w5_rpcs_denied_to_anon');
select throws_ok($$ select * from public.search_job_openings() $$, '42501', null, 'j17_w5_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from unnest(array[
             'public.job_opening_application_snapshot(public.job_openings)', 'public.job_applications_guard_write()',
             'public.worker_has_applied_to_job_opening(uuid)', 'public.job_application_apply_checks(uuid, uuid, uuid)',
             'public.create_job_application(uuid, text, boolean, text)', 'public.update_job_application_draft(uuid, text, timestamptz)',
             'public.delete_job_application_draft(uuid)', 'public.transition_job_application(uuid, text, text, text)',
             'public.applicant_profiles_for_job_opening(uuid)', 'public.applicant_verified_certifications(uuid)',
             'public.job_applications_audit()', 'public.job_openings_close_applications()',
             'public.job_openings_notify_applicants_on_pause()']) signature
           join pg_proc p on p.oid = to_regprocedure(signature)
           where p.prosecdef and p.proconfig = array['search_path=public, pg_temp']),
          13, 'j17_w5_definer_functions_pin_pg_temp_last');
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'washlink_private') and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting where setting like 'search_path=%pg_temp')),
          array['handle_new_user'], 'j17_w5_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_applications'),
          0, 'j17_job_applications_not_in_realtime_publication');
select is((select count(*)::int from pg_publication where pubname = 'supabase_realtime' and puballtables), 0,
          'j17_job_applications_not_in_realtime_publication');
select is((select prosecdef from pg_proc
           where oid = 'public.search_job_openings(text, text, text, text, text, boolean, numeric, text, integer, integer)'::regprocedure),
          false, 'j17_search_job_openings_is_security_invoker');

-- ---------- cascades ----------
select test_helpers.act_as(pg_temp.w(4));
select lives_ok($$ delete from public.worker_profiles where profile_id = auth.uid() $$, 'j17_worker_profile_deletion_cascades_applications_and_keeps_audit');
select test_helpers.act_as_service();
select is((select count(*)::int from public.job_applications where worker_id = pg_temp.w(4)), 0,
          'j17_worker_profile_deletion_cascades_applications_and_keeps_audit');
select is((select payload ->> 'deleted_by' from public.workforce_audit_events
           where action = 'job_application.deleted' and subject_id = pg_temp.app('w4_j1')), 'worker_profile_deleted',
          'j17_worker_profile_deletion_cascades_applications_and_keeps_audit');
select test_helpers.act_as_owner('j17w5-o2@local.test');
select lives_ok($$ delete from public.shops where id = current_setting('fx.s2')::uuid $$, 'j17_shop_and_owner_deletion_cascade_applications');
select test_helpers.act_as_service();
select lives_ok($$ delete from auth.users where id = current_setting('fx.o1')::uuid $$, 'j17_shop_and_owner_deletion_cascade_applications');
select is((select count(*)::int from public.job_applications a join j17w5_apps l on l.id = a.id), 0,
          'j17_shop_and_owner_deletion_cascade_applications');
select is((select count(distinct subject_id)::int from public.workforce_audit_events
           where action = 'job_application.deleted' and subject_id in (select id from j17w5_apps)), 10,
          'j17_shop_and_owner_deletion_cascade_applications');

select * from finish();
rollback;
