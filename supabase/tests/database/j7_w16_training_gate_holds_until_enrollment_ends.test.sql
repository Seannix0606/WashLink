-- J7 / W16 (PLAN section 5; D-83, D-84; W15 VERDICT SEC-5): the required-training booking gate holds while the enrollment
-- is accepted, required_initial and not completed. Deleting the training shop or recording a failed assessment no longer
-- lifts it, a booking pre-assigned at a deleted shop cannot start, and it lifts only when the enrollment really ends or
-- completes. W16-L1 (an owner cancel at 0 attended days) is pinned as a limitation. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

create temporary table j7w16_ids (label text primary key, id uuid) on commit drop;
grant all on j7w16_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j7w16_ids where label = p_label $$;
create function pg_temp.email(p_tag text) returns text language sql immutable as $$ select 'j7w16-' || p_tag || '@local.test' $$;
create function pg_temp.assign(p_row text, p_booking text) returns text language sql as $$
  select test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id(p_row), pg_temp.id(p_booking))) $$;
create function pg_temp.set_status(p_booking text, p_status text) returns text language sql as $$
  select test_helpers.attempt(format('update public.bookings set booking_status = %L where id = %L', p_status, pg_temp.id(p_booking))) $$;
create function pg_temp.progress(p_tag text) returns text language sql stable security definer as $$
  select public.training_enrollment_progress_status_of(pg_temp.id('e_' || p_tag)) $$;
create function pg_temp.enrollment(p_tag text) returns text language sql stable security definer as $$
  select status || ',shop_null=' || (shop_id is null)::text from public.training_enrollments where id = pg_temp.id('e_' || p_tag) $$;
create function pg_temp.booking(p_label text) returns text language sql stable security definer as $$
  select booking_status || ',' || coalesce((select label from j7w16_ids i where i.id = b.assigned_worker_id), '-') || ',shop_null=' || (shop_id is null)::text
  from public.bookings b where b.id = pg_temp.id(p_label) $$;

-- A trainee of p_tag: own training shop s_<tag> of the owner, an open program with 3 past days, a linked roster row and an accepted enrollment.
create function pg_temp.trainee(p_tag text) returns void language plpgsql as $$
begin
  insert into j7w16_ids values ('s_' || p_tag, test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
  insert into j7w16_ids values ('p_' || p_tag, test_helpers.create_training_program(pg_temp.id('s_' || p_tag)));
  perform test_helpers.add_training_session(pg_temp.id('p_' || p_tag), test_helpers.manila_today() - n) from generate_series(1, 3) n;
  perform test_helpers.open_training_program(pg_temp.id('p_' || p_tag));
  insert into j7w16_ids values ('w_' || p_tag, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email(p_tag))));
  insert into j7w16_ids values ('r_' || p_tag, test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('w_' || p_tag)));
  insert into j7w16_ids values ('e_' || p_tag, test_helpers.create_accepted_enrollment(pg_temp.id('p_' || p_tag), pg_temp.id('w_' || p_tag)));
end $$;
-- The failed-assessment fixture (PLAN section 5): 3 past days attended, then a recorded fail by the owner. Returns the assessment id.
create function pg_temp.fail(p_tag text) returns uuid language plpgsql as $$
declare
  session_ids uuid[];
  session_id uuid;
  items integer;
  assessment public.training_assessments;
begin
  select array_agg(s.id) into session_ids from public.training_sessions s where s.program_id = pg_temp.id('p_' || p_tag);
  select cardinality(p.assessment_checklist) into items from public.training_programs p where p.id = pg_temp.id('p_' || p_tag);
  perform test_helpers.act_as_owner(pg_temp.email('o1'));
  foreach session_id in array session_ids loop
    perform public.record_training_attendance(pg_temp.id('e_' || p_tag), session_id, 'present');
  end loop;
  assessment := public.record_training_assessment(pg_temp.id('e_' || p_tag), array_fill(false, array[items]), 'failed', null, 'Did not meet the checklist yet');
  perform test_helpers.act_as_service();
  return assessment.id;
end $$;
create function pg_temp.owner_deletes_shop(p_tag text) returns text language plpgsql as $$
declare
  result text;
begin
  perform test_helpers.act_as_owner(pg_temp.email('o1'));
  result := test_helpers.attempt(format('delete from public.shops where id = %L', pg_temp.id('s_' || p_tag)));
  perform test_helpers.act_as_service();
  return result;
end $$;
create function pg_temp.book(p_label text, p_shop text default 's_main', p_status text default 'accepted') returns void language sql as $$
  insert into j7w16_ids values (p_label, test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id(p_shop), p_status)) $$;

-- ---------- fixtures ----------
insert into j7w16_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1'))), ('c1', test_helpers.create_customer(pg_temp.email('c1'))),
                             ('o1', test_helpers.create_owner(pg_temp.email('o1'))), ('o2', test_helpers.create_owner(pg_temp.email('o2')));
insert into j7w16_ids values ('s_main', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
                             ('s_o2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1')));

-- ---------- the verifier probe (probe_sec5.sql): the owner deletes the training shop, then assigns at another own shop ----------
select pg_temp.trainee('pr');
select pg_temp.book('b_pr');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_pr', 'b_pr'), '23514', 'w16_probe_owner_deletes_training_shop_then_assign_refused');
select test_helpers.act_as_service();
select is(pg_temp.owner_deletes_shop('pr'), 'succeeded', 'w16_probe_owner_deletes_training_shop_then_assign_refused');
select is((select count(*)::int from public.shops where id = pg_temp.id('s_pr')), 0, 'w16_probe_owner_deletes_training_shop_then_assign_refused');
select is(pg_temp.enrollment('pr') || ',' || pg_temp.progress('pr'), 'accepted,shop_null=true,shop_removed', 'w16_probe_owner_deletes_training_shop_then_assign_refused');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_pr', 'b_pr'), '23514', 'w16_probe_owner_deletes_training_shop_then_assign_refused');
select test_helpers.act_as_service();
select is(pg_temp.booking('b_pr'), 'accepted,-,shop_null=false', 'w16_probe_owner_deletes_training_shop_then_assign_refused');

-- ---------- the owner identity needs no shop on the enrollment ----------
select is((select e.owner_id = w.owner_id and e.owner_id = pg_temp.id('o1') and e.shop_id is null
            from public.training_enrollments e, public.workers w where e.id = pg_temp.id('e_pr') and w.id = pg_temp.id('r_pr')), true,
          'w16_owner_identity_survives_shop_deletion');
select is(public.roster_worker_in_required_training(pg_temp.id('r_pr'), pg_temp.id('s_main')), true, 'w16_owner_identity_survives_shop_deletion');
select is(public.roster_worker_in_required_training(pg_temp.id('r_pr'), null), true, 'w16_owner_identity_survives_shop_deletion');
select is(public.roster_worker_in_required_training(pg_temp.id('r_pr'), pg_temp.id('s_o2')), false, 'w16_owner_identity_survives_shop_deletion');

-- ---------- a recorded fail does not end the arrangement ----------
select pg_temp.trainee('f');
select pg_temp.book('b_f');
select pg_temp.fail('f') is not null as failed_f;
select is(pg_temp.enrollment('f') || ',' || pg_temp.progress('f'), 'accepted,shop_null=false,failed', 'w16_failed_assessment_then_assign_refused');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_f', 'b_f'), '23514', 'w16_failed_assessment_then_assign_refused');
select test_helpers.act_as_service();

select pg_temp.trainee('fs');
select pg_temp.book('b_fs');
update public.bookings set assigned_worker_id = pg_temp.id('r_fs') where id = pg_temp.id('b_fs');
select pg_temp.fail('fs') is not null as failed_fs;
select test_helpers.act_as_worker(pg_temp.email('fs'));
select throws_ok(format('update public.bookings set booking_status = %L where id = %L', 'in_progress', pg_temp.id('b_fs')), '23514',
                 'You are in required training with this shop and cannot start customer bookings until the training ends.',
                 'w16_failed_assessment_preassigned_booking_cannot_start');
select test_helpers.act_as_service();
select is(pg_temp.booking('b_fs'), 'accepted,r_fs,shop_null=false', 'w16_failed_assessment_preassigned_booking_cannot_start');

select pg_temp.trainee('fr');
select pg_temp.book('b_fr');
select set_config('fx.assessment_fr', pg_temp.fail('fr')::text, true);
-- A designated trainer: a too-short reason gets the rule refusal (23514), which shows the trainer may record while the shop exists.
insert into j7w16_ids values ('w_tr', test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('tr'))));
insert into j7w16_ids values ('r_tr', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('w_tr')));
select test_helpers.designate_trainer(pg_temp.id('p_fr'), pg_temp.id('r_tr')) is not null as designated_tr;
select test_helpers.act_as_worker(pg_temp.email('tr'));
select is(test_helpers.attempt(format('select public.correct_training_assessment(%L, array[true, true], %L, null, %L)', current_setting('fx.assessment_fr'), 'passed', 'short')),
          '23514', 'w16_failed_then_shop_removed_still_gated');
select test_helpers.act_as_service();
select is(pg_temp.owner_deletes_shop('fr'), 'succeeded', 'w16_failed_then_shop_removed_still_gated');
select is(pg_temp.enrollment('fr') || ',' || pg_temp.progress('fr'), 'accepted,shop_null=true,failed', 'w16_failed_then_shop_removed_still_gated');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_fr', 'b_fr'), '23514', 'w16_failed_then_shop_removed_still_gated');
-- PLAN section 4: in this state only the worker can end the hold; the owner can neither cancel nor correct.
select is(test_helpers.attempt(format('select public.cancel_training_enrollment(%L, %L)', pg_temp.id('e_fr'), 'Ending this after the removal')), '42501',
          'w16_failed_then_shop_removed_still_gated');
select is(test_helpers.attempt(format('select public.correct_training_assessment(%L, array[true, true], %L, null, %L)', current_setting('fx.assessment_fr'), 'passed', 'Second review of the checklist')),
          '42501', 'w16_failed_then_shop_removed_still_gated');
select test_helpers.act_as_worker(pg_temp.email('tr'));
select is(test_helpers.attempt(format('select public.correct_training_assessment(%L, array[true, true], %L, null, %L)', current_setting('fx.assessment_fr'), 'passed', 'Second review of the checklist')),
          '42501', 'w16_failed_then_shop_removed_still_gated');
select test_helpers.act_as_service();

-- ---------- the link history still decides after the shop is gone ----------
select pg_temp.trainee('ur');
select pg_temp.book('b_ur');
select is(pg_temp.owner_deletes_shop('ur'), 'succeeded', 'w16_unlink_after_shop_removal_still_gated');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('r_ur'))) || ',' || pg_temp.assign('r_ur', 'b_ur'),
          'succeeded,23514', 'w16_unlink_after_shop_removal_still_gated');
select test_helpers.act_as_service();

-- ---------- D-83 P3: a booking pre-assigned at the deleted shop (bookings.shop_id goes null) ----------
select pg_temp.trainee('dn');
select pg_temp.book('b_dn', 's_dn');
update public.bookings set assigned_worker_id = pg_temp.id('r_dn') where id = pg_temp.id('b_dn');
select is(pg_temp.owner_deletes_shop('dn'), 'succeeded', 'w16_preassigned_booking_on_deleted_shop_cannot_start');
select is(pg_temp.booking('b_dn'), 'accepted,r_dn,shop_null=true', 'w16_preassigned_booking_on_deleted_shop_cannot_start');
select test_helpers.act_as_worker(pg_temp.email('dn'));
select throws_ok(format('update public.bookings set booking_status = %L where id = %L', 'in_progress', pg_temp.id('b_dn')), '23514',
                 'You are in required training with this shop and cannot start customer bookings until the training ends.',
                 'w16_preassigned_booking_on_deleted_shop_cannot_start');
select test_helpers.act_as_service();
select is(pg_temp.booking('b_dn'), 'accepted,r_dn,shop_null=true', 'w16_preassigned_booking_on_deleted_shop_cannot_start');

-- A roster row with no enrollment at the same owner is unaffected by the null-shop path.
insert into j7w16_ids values ('s_nn', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
                             ('w_nn', test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('nn'))));
insert into j7w16_ids values ('r_nn', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('w_nn')));
select pg_temp.book('b_nn', 's_nn');
update public.bookings set assigned_worker_id = pg_temp.id('r_nn') where id = pg_temp.id('b_nn');
select is(pg_temp.owner_deletes_shop('nn'), 'succeeded', 'w16_null_shop_booking_non_trainee_row_unaffected');
select test_helpers.act_as_worker(pg_temp.email('nn'));
select is(pg_temp.set_status('b_nn', 'in_progress'), 'succeeded', 'w16_null_shop_booking_non_trainee_row_unaffected');
select test_helpers.act_as_service();
select is(pg_temp.booking('b_nn'), 'in_progress,r_nn,shop_null=true', 'w16_null_shop_booking_non_trainee_row_unaffected');

-- ---------- the gate lifts when the training truly completes ----------
select pg_temp.trainee('c');
select pg_temp.book('b_c');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_c', 'b_c'), '23514', 'w16_gate_lifts_on_true_completion');
select test_helpers.act_as_service();
select test_helpers.record_training_completion(pg_temp.id('e_c'), pg_temp.email('o1')) is not null as completed_c;
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_c', 'b_c'), 'succeeded', 'w16_gate_lifts_on_true_completion');
select test_helpers.act_as_service();

select pg_temp.trainee('cr');
select pg_temp.book('b_cr');
select test_helpers.record_training_completion(pg_temp.id('e_cr'), pg_temp.email('o1')) is not null as completed_cr;
select is(pg_temp.owner_deletes_shop('cr') || ',' || pg_temp.progress('cr'), 'succeeded,completed', 'w16_completed_then_shop_removed_stays_lifted');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_cr', 'b_cr'), 'succeeded', 'w16_completed_then_shop_removed_stays_lifted');
select test_helpers.act_as_service();

select pg_temp.trainee('cp');
select pg_temp.book('b_cp');
select set_config('fx.assessment_cp', pg_temp.fail('cp')::text, true);
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_cp', 'b_cp'), '23514', 'w16_failed_corrected_to_pass_lifts');
select is((public.correct_training_assessment(current_setting('fx.assessment_cp')::uuid, array[true, true], 'passed', null, 'Second review of the checklist')).result,
          'passed', 'w16_failed_corrected_to_pass_lifts');
select is(pg_temp.assign('r_cp', 'b_cp'), 'succeeded', 'w16_failed_corrected_to_pass_lifts');
select test_helpers.act_as_service();

-- ---------- the gate lifts when the enrollment ends (D-84 release paths) ----------
select pg_temp.trainee('wf');
select pg_temp.book('b_wf');
select pg_temp.fail('wf') is not null as failed_wf;
select test_helpers.act_as_worker(pg_temp.email('wf'));
select is((public.withdraw_from_training(pg_temp.id('e_wf'))).status, 'withdrawn', 'w16_gate_lifts_on_withdrawal_after_failed');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_wf', 'b_wf'), 'succeeded', 'w16_gate_lifts_on_withdrawal_after_failed');
select test_helpers.act_as_service();

select pg_temp.trainee('wr');
select pg_temp.book('b_wr');
select is(pg_temp.owner_deletes_shop('wr'), 'succeeded', 'w16_gate_lifts_on_withdrawal_after_shop_removed');
select test_helpers.act_as_worker(pg_temp.email('wr'));
select is((public.withdraw_from_training(pg_temp.id('e_wr'))).status, 'withdrawn', 'w16_gate_lifts_on_withdrawal_after_shop_removed');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(pg_temp.assign('r_wr', 'b_wr'), 'succeeded', 'w16_gate_lifts_on_withdrawal_after_shop_removed');
select test_helpers.act_as_service();

select pg_temp.trainee('cf');
select pg_temp.book('b_cf');
select pg_temp.fail('cf') is not null as failed_cf;
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is((public.cancel_training_enrollment(pg_temp.id('e_cf'), 'Ending this after the recorded result')).status, 'cancelled',
          'w16_gate_lifts_on_owner_cancel_of_failed_and_worker_notified');
select is(pg_temp.assign('r_cf', 'b_cf'), 'succeeded', 'w16_gate_lifts_on_owner_cancel_of_failed_and_worker_notified');
select test_helpers.act_as_service();
select is((select count(*)::int from public.notifications where recipient_id = pg_temp.id('w_cf') and category = 'training.cancelled'), 1,
          'w16_gate_lifts_on_owner_cancel_of_failed_and_worker_notified');

-- ---------- after shop removal only the worker can end it (no recorder remains) ----------
select pg_temp.trainee('cx');
select is(pg_temp.owner_deletes_shop('cx'), 'succeeded', 'w16_owner_cannot_cancel_after_shop_removed');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(test_helpers.attempt(format('select public.cancel_training_enrollment(%L, %L)', pg_temp.id('e_cx'), 'Ending this after the removal')), '42501',
          'w16_owner_cannot_cancel_after_shop_removed');
select test_helpers.act_as_service();
select is(pg_temp.enrollment('cx'), 'accepted,shop_null=true', 'w16_owner_cannot_cancel_after_shop_removed');

-- ---------- another owner's row linked to the same trainee stays open (D-17 scope) ----------
insert into j7w16_ids values ('r_o2', test_helpers.create_roster_worker(pg_temp.id('o2'), pg_temp.id('w_pr')));
select pg_temp.book('b_o2', 's_o2');
select test_helpers.act_as_owner(pg_temp.email('o2'));
select is(pg_temp.assign('r_o2', 'b_o2'), 'succeeded', 'w16_other_owner_rows_unaffected');
select test_helpers.act_as_worker(pg_temp.email('pr'));
select is(pg_temp.set_status('b_o2', 'in_progress'), 'succeeded', 'w16_other_owner_rows_unaffected');
select test_helpers.act_as_service();

-- ---------- unassigning and completing a booking already in progress are never refused ----------
select pg_temp.trainee('ua');
select pg_temp.book('b_ua1');
select pg_temp.book('b_ua2');
update public.bookings set assigned_worker_id = pg_temp.id('r_ua') where id = pg_temp.id('b_ua1');
update public.bookings set assigned_worker_id = pg_temp.id('r_ua'), booking_status = 'in_progress' where id = pg_temp.id('b_ua2');
select pg_temp.fail('ua') is not null as failed_ua;
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = null where id = %L', pg_temp.id('b_ua1'))), 'succeeded',
          'w16_unassign_and_completion_still_allowed');
select test_helpers.act_as_worker(pg_temp.email('ua'));
select is(pg_temp.set_status('b_ua2', 'completed'), 'succeeded', 'w16_unassign_and_completion_still_allowed');
select test_helpers.act_as_service();
select is(pg_temp.booking('b_ua1') || '|' || pg_temp.booking('b_ua2'), 'accepted,-,shop_null=false|completed,r_ua,shop_null=false', 'w16_unassign_and_completion_still_allowed');

-- ---------- trusted sessions still bypass (w6h behaviour) ----------
select is(pg_temp.assign('r_f', 'b_f'), 'succeeded', 'w16_trusted_session_still_bypasses');

-- ---------- same signature, attributes and privileges as w15a ----------
select is((select count(*)::int || ',' || string_agg(pg_get_function_identity_arguments(p.oid) || ',' || p.prorettype::regtype || ',' || l.lanname || ',' || p.provolatile::text || ','
                   || p.prosecdef::text || ',' || array_to_string(p.proconfig, ';'), '|')
           from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'public'::regnamespace and p.proname = 'roster_worker_in_required_training'),
          '1,p_worker_row_id uuid, p_shop_id uuid,boolean,sql,s,true,search_path=public, pg_temp', 'w16_gate_function_signature_attributes_and_privileges_unchanged');
select is((select string_agg(has_function_privilege(r, 'public.roster_worker_in_required_training(uuid, uuid)', 'execute')::text, ',') from unnest(array['anon', 'authenticated', 'service_role']) r)
          || ',' || (select count(*)::int from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.roster_worker_in_required_training(uuid, uuid)'::regprocedure and a.grantee = 0),
          'false,false,false,0', 'w16_gate_function_signature_attributes_and_privileges_unchanged');

-- ---------- W16-L1 pinned: an owner cancel at 0 attended days lifts the gate; it is recorded and the worker is told ----------
select pg_temp.trainee('zd');
select pg_temp.book('b_zd');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is((public.cancel_training_enrollment(pg_temp.id('e_zd'), 'Ending this before any recorded day')).status || ',' || pg_temp.assign('r_zd', 'b_zd'),
          'cancelled,succeeded', 'w16_limitation_owner_cancel_at_zero_days_then_assign_succeeds');

select * from finish();
rollback;
