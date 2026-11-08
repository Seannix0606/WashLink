-- J17 (W6): training privileges and RLS, per-audience reads (owner, designated trainer, worker),
-- no reads for customers / super_admin / anon, no contact columns, invoker progress view, internal
-- functions, anon denial, pinning, realtime exclusion and the worker-account cascade.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17w6-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17w6-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17w6-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j17w6-c1@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j17w6-by@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j17w6-' || label || '@local.test')))
from unnest(array['w1', 'w2', 'w3', 't1']) label;
create function pg_temp.u(p_label text) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j17w6-' || p_label || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j17w6_ids (label text primary key, id uuid) on commit drop;
grant all on j17w6_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17w6_ids where label = p_label $$;
create function pg_temp.labels(p_ids uuid[]) returns text[] language sql stable
as $$ select array_agg(label order by label) from j17w6_ids where id = any (p_ids) $$;
insert into j17w6_ids values ('p', test_helpers.create_training_program(current_setting('fx.s1')::uuid)),
  ('p_draft', test_helpers.create_training_program(current_setting('fx.s1')::uuid)),
  ('p_other', test_helpers.create_training_program(current_setting('fx.s1')::uuid)),
  ('q', test_helpers.create_training_program(current_setting('fx.s2')::uuid));
insert into j17w6_ids values ('d_p', test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - 1)),
  ('d_other', test_helpers.add_training_session(pg_temp.id('p_other'), test_helpers.manila_today() + 1)),
  ('d_q', test_helpers.add_training_session(pg_temp.id('q'), test_helpers.manila_today() + 1));
select test_helpers.open_training_program(pg_temp.id(l)) from unnest(array['p', 'p_other', 'q']) l;
insert into j17w6_ids values ('r_t1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u('t1')));
insert into j17w6_ids values ('des_p', test_helpers.designate_trainer(pg_temp.id('p'), pg_temp.id('r_t1'))),
  ('des_draft', test_helpers.designate_trainer(pg_temp.id('p_draft'), pg_temp.id('r_t1')));
insert into j17w6_ids values ('e_w1', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.u('w1'))),
  ('e_w3', test_helpers.create_accepted_enrollment(pg_temp.id('q'), pg_temp.u('w3')));
insert into public.training_enrollments (program_id, shop_id, owner_id, worker_id, shop_name_snapshot, program_title_snapshot, owner_display_name_snapshot)
select id, shop_id, owner_id, pg_temp.u('w2'), 'Shop', title, 'Owner' from public.training_programs where id = pg_temp.id('p');
insert into j17w6_ids select 'e_w2', id from public.training_enrollments where worker_id = pg_temp.u('w2');
select test_helpers.act_as_owner('j17w6-o1@local.test');
select count(public.record_training_attendance(pg_temp.id('e_w1'), pg_temp.id('d_p'), 'present'));
create function pg_temp.reads() returns text language sql as $$
  select concat_ws(' | ',
    (select array_to_string(pg_temp.labels(array_agg(id)), ',') from public.training_programs),
    (select array_to_string(pg_temp.labels(array_agg(id)), ',') from public.training_enrollments),
    (select array_to_string(pg_temp.labels(array_agg(id)), ',') from public.training_sessions),
    (select count(*)::text from public.training_attendance_records),
    (select count(*)::text from public.training_enrollment_progress),
    (select count(*)::text from public.training_program_trainers)) $$;

-- ---------- privileges, RLS, policies ----------
select test_helpers.act_as_service();
create temporary table j17w6_tables on commit drop as
  select unnest(array['training_programs', 'training_program_trainers', 'training_sessions', 'training_enrollments',
                      'training_attendance_records', 'training_assessments']) as t;
select is((select count(*)::int from pg_class c join j17w6_tables x on x.t = c.relname where c.relnamespace = 'public'::regnamespace and c.relrowsecurity),
          6, 'j17_training_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from j17w6_tables x cross join unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
           cross join unnest(array['anon', 'authenticated', 'service_role']) r where has_table_privilege(r, 'public.' || x.t, p)),
          0, 'j17_training_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from j17w6_tables x where has_table_privilege('authenticated', 'public.' || x.t, 'select')
           and not has_table_privilege('anon', 'public.' || x.t, 'select') and not has_table_privilege('service_role', 'public.' || x.t, 'select')),
          6, 'j17_training_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies p join j17w6_tables x on x.t = p.tablename
           where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(p.qual, p.with_check) = 'false'),
          18, 'j17_training_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies p join j17w6_tables x on x.t = p.tablename where p.schemaname = 'public' and p.cmd = 'ALL'),
          0, 'j17_training_tables_rls_enabled_and_no_client_write_privileges');

-- ---------- reads per audience: programs | enrollments | sessions | attendance | progress | trainers ----------
select test_helpers.act_as_owner('j17w6-o1@local.test');
select is(pg_temp.reads(), 'p,p_draft,p_other | e_w1,e_w2 | d_other,d_p | 1 | 2 | 2', 'j17_owner_reads_only_own_programs_and_enrollments');
select test_helpers.act_as_owner('j17w6-o2@local.test');
select is(pg_temp.reads(), 'q | e_w3 | d_q | 0 | 1 | 0', 'j17_owner_reads_only_own_programs_and_enrollments');
select test_helpers.act_as(pg_temp.u('t1'));
select is(pg_temp.reads(), 'p | e_w1 | d_p | 1 | 1 | 2', 'j17_trainer_reads_only_designated_programs');
select is((select count(*)::int from public.training_programs where id = pg_temp.id('p_draft')), 0, 'j17_draft_programs_owner_only');
select test_helpers.act_as(pg_temp.u('w1'));
select is(pg_temp.reads(), 'p | e_w1 | d_p | 1 | 1 | 0', 'j17_worker_reads_only_own_enrollments_and_evidence');
select test_helpers.act_as(pg_temp.u('w2'));
select is(pg_temp.reads(), 'p | e_w2 | d_p | 0 | 1 | 0', 'j17_worker_reads_only_own_enrollments_and_evidence');
select is((select count(*)::int from public.training_programs where status = 'draft'), 0, 'j17_draft_programs_owner_only');
select throws_ok($$ select * from public.training_evidence_for_enrollment(pg_temp.id('e_w1')) $$, '42501', 'Training enrollment not found.',
                 'j17_worker_reads_only_own_enrollments_and_evidence');
select throws_ok($$ select * from public.training_roster_for_program(pg_temp.id('p')) $$, '42501', 'Training program not found.',
                 'j17_worker_reads_only_own_enrollments_and_evidence');
select test_helpers.act_as(pg_temp.u('w1'));
select is((select count(*)::int from public.training_evidence_for_enrollment(pg_temp.id('e_w1'))), 1, 'j17_worker_reads_only_own_enrollments_and_evidence');
select is((select count(*)::int from public.trainers_for_training_program(pg_temp.id('p'))), 1, 'j17_worker_reads_only_own_enrollments_and_evidence');
select test_helpers.act_as(pg_temp.u('t1'));
select is((select array_agg(enrollment_id) from public.training_roster_for_program(pg_temp.id('p'))), array[pg_temp.id('e_w1')],
          'j17_trainer_reads_only_designated_programs');
select throws_ok($$ select * from public.training_roster_for_program(pg_temp.id('p_other')) $$, '42501', 'Training program not found.',
                 'j17_trainer_reads_only_designated_programs');
select throws_ok($$ select * from public.training_roster_for_program(pg_temp.id('p_draft')) $$, '42501', 'Training program not found.',
                 'j17_draft_programs_owner_only');
select test_helpers.act_as_owner('j17w6-o2@local.test');
select throws_ok($$ select * from public.training_evidence_for_enrollment(pg_temp.id('e_w1')) $$, '42501', 'Training enrollment not found.',
                 'j17_owner_reads_only_own_programs_and_enrollments');
select throws_ok($$ select * from public.trainers_for_training_program(pg_temp.id('p')) $$, '42501', 'Training program not found.',
                 'j17_owner_reads_only_own_programs_and_enrollments');
select test_helpers.act_as_customer('j17w6-c1@local.test');
select is(pg_temp.reads(), '0 | 0 | 0', 'j17_customer_anon_super_admin_read_no_training_rows');
select test_helpers.act_as_admin('j17w6-a1@local.test');
select is(pg_temp.reads(), '0 | 0 | 0', 'j17_customer_anon_super_admin_read_no_training_rows');
select throws_ok($$ select * from public.training_roster_for_program(pg_temp.id('p')) $$, '42501', 'Training program not found.',
                 'j17_customer_anon_super_admin_read_no_training_rows');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.training_programs'), '42501', 'j17_customer_anon_super_admin_read_no_training_rows');
select is(test_helpers.attempt('select count(*) from public.training_enrollment_progress'), '42501', 'j17_customer_anon_super_admin_read_no_training_rows');

-- ---------- columns, view, functions ----------
select test_helpers.act_as_service();
select is((select count(*)::int from information_schema.columns where table_schema = 'public'
           and (table_name like 'training\_%') and column_name ~* '(contact|phone|e_?mail)'), 0, 'j17_training_reads_have_no_contact_columns');
select is((select count(*)::int from pg_proc p, unnest(coalesce(p.proargnames, '{}')) arg
           where p.oid in ('public.training_roster_for_program(uuid)'::regprocedure, 'public.training_evidence_for_enrollment(uuid)'::regprocedure,
                           'public.trainers_for_training_program(uuid)'::regprocedure) and arg ~* '(contact|phone|e_?mail|address|headline)'),
          0, 'j17_training_reads_have_no_contact_columns');
select ok(position('worker_private_contacts' in pg_get_functiondef('public.training_roster_for_program(uuid)'::regprocedure)) = 0
          and position('worker_private_contacts' in pg_get_functiondef('public.training_evidence_for_enrollment(uuid)'::regprocedure)) = 0,
          'j17_training_reads_have_no_contact_columns');
select ok((select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.training_enrollment_progress'::regclass),
          'j17_progress_view_is_security_invoker');
select ok(has_table_privilege('authenticated', 'public.training_enrollment_progress', 'select')
          and not has_table_privilege('anon', 'public.training_enrollment_progress', 'select')
          and not has_table_privilege('authenticated', 'public.training_enrollment_progress', 'insert'), 'j17_progress_view_is_security_invoker');
create temporary table j17w6_internal on commit drop as select unnest(array[
  'training_programs_normalize()', 'training_programs_guard_write()', 'training_program_trainers_guard_write()',
  'is_authorised_training_recorder(uuid)', 'training_enrollment_terms_snapshot(training_programs)', 'training_sessions_guard_write()',
  'training_enrollments_guard_write()', 'shops_remove_unenrolled_training_programs()', 'training_evidence_guard_write()',
  'training_enrollment_attended_days(uuid)', 'training_enrollment_progress_status_of(uuid)', 'training_enrollment_is_completed(uuid)',
  'lock_owned_training_program(uuid)', 'training_upcoming_supervised_days(uuid)', 'touch_training_schedule(uuid)',
  'lock_training_enrollment_for_actor(uuid)', 'lock_training_enrollment_for_recorder(uuid)',
  'insert_training_assessment(uuid, boolean[], text, text, uuid, text, text)', 'roster_worker_in_required_training(uuid, uuid)',
  'training_enrollment_is_live(uuid)', 'workers_revoke_unlinked_trainers()',
  'bookings_guard_training_assignment()', 'training_labels(uuid, text, text)', 'training_programs_audit()', 'training_sessions_audit()',
  'training_program_trainers_audit()', 'training_enrollments_audit()', 'training_evidence_audit()']) as sig;
create temporary table j17w6_rpcs on commit drop as select unnest(array[
  'create_training_program(uuid, text)', 'update_training_program_draft(uuid, text, text, text[], text, integer, text[], numeric, text, text, text, text, timestamptz)',
  'delete_training_program_draft(uuid)', 'add_training_session(uuid, date, text, time, time, text)', 'cancel_training_session(uuid, text)',
  'delete_training_session_draft(uuid)', 'transition_training_program(uuid, text, text, text)', 'designate_training_trainer(uuid, uuid)',
  'revoke_training_trainer(uuid)', 'training_enrollment_notice_version()', 'invite_to_training(uuid, uuid)',
  'respond_to_training_invitation(uuid, boolean, text, timestamp with time zone)', 'withdraw_from_training(uuid)',
  'cancel_training_enrollment(uuid, text)', 'record_training_attendance(uuid, uuid, text, text)', 'correct_training_attendance(uuid, text, text, text)',
  'record_training_assessment(uuid, boolean[], text, text, text)', 'correct_training_assessment(uuid, boolean[], text, text, text, text)',
  'training_roster_for_program(uuid)', 'training_evidence_for_enrollment(uuid)', 'trainers_for_training_program(uuid)',
  'is_current_training_program_owner(uuid)', 'is_designated_training_trainer(uuid)', 'worker_holds_training_enrollment(uuid)',
  'can_read_training_program(uuid)', 'can_read_training_evidence(uuid)', 'training_progress_status(text, boolean, integer, integer, boolean, text)']) as sig;
select is((select count(*)::int from j17w6_internal i where to_regprocedure('public.' || i.sig) is not null), 28, 'j17_w6_internal_functions_not_client_executable');
select is((select count(*)::int from j17w6_internal i cross join unnest(array['public', 'anon', 'authenticated', 'service_role']) r
           where r <> 'public' and has_function_privilege(r, to_regprocedure('public.' || i.sig), 'execute')), 0, 'j17_w6_internal_functions_not_client_executable');
select is((select count(*)::int from j17w6_rpcs x where has_function_privilege('authenticated', to_regprocedure('public.' || x.sig), 'execute')),
          27, 'j17_w6_rpcs_denied_to_anon');
select is((select count(*)::int from j17w6_rpcs x cross join unnest(array['anon', 'service_role']) r
           where has_function_privilege(r, to_regprocedure('public.' || x.sig), 'execute')), 0, 'j17_w6_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select is(test_helpers.attempt(format('select public.record_training_attendance(%L, %L, %L)', pg_temp.id('e_w1'), pg_temp.id('d_p'), 'present')),
          '42501', 'j17_w6_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from (select to_regprocedure('public.' || sig) f from j17w6_internal union all select to_regprocedure('public.' || sig) from j17w6_rpcs) x
           join pg_proc p on p.oid = x.f where p.prosecdef
             and not coalesce(p.proconfig @> array['search_path=public, pg_temp'], false)), 0, 'j17_w6_definer_functions_pin_pg_temp_last');
select ok((select count(*) from (select to_regprocedure('public.' || sig) f from j17w6_internal union all select to_regprocedure('public.' || sig) from j17w6_rpcs) x
           join pg_proc p on p.oid = x.f where p.prosecdef) >= 40, 'j17_w6_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables pt join j17w6_tables x on x.t = pt.tablename
           where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'), 0, 'j17_training_tables_not_in_realtime_publication');

-- ---------- worker account deletion (untrusted, like GoTrue) removes own training, audit stays ----------
create function pg_temp.act_as_untrusted_bystander() returns void language sql as $$
  select test_helpers.act_as_service();
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
$$;
select pg_temp.act_as_untrusted_bystander();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.u('w1')), 'j17_cascades_remove_training_and_keep_audit');
select test_helpers.act_as_service();
select is((select count(*)::int from public.training_enrollments where id = pg_temp.id('e_w1'))
          + (select count(*)::int from public.training_attendance_records where enrollment_id = pg_temp.id('e_w1')), 0,
          'j17_cascades_remove_training_and_keep_audit');
select is((select array_agg(action || ':' || (payload ->> 'deleted_by') order by action) from public.workforce_audit_events
           where action like 'training_%.deleted' and subject_id = pg_temp.id('e_w1')),
          array['training_attendance.deleted:enrollment_removed', 'training_enrollment.deleted:worker_profile_deleted'],
          'j17_cascades_remove_training_and_keep_audit');
select is((select count(*)::int from public.workforce_audit_events where subject_id = pg_temp.id('e_w1') and action = 'training_attendance.recorded'), 1,
          'j17_cascades_remove_training_and_keep_audit');
select pg_temp.act_as_untrusted_bystander();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.u('t1')), 'j17_cascades_remove_training_and_keep_audit');
select test_helpers.act_as_service();
select is((select count(*)::int from public.training_program_trainers where trainer_id = pg_temp.u('t1')), 0, 'j17_cascades_remove_training_and_keep_audit');

select * from finish();
rollback;
