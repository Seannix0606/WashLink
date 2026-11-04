-- J7 / W15 (PLAN section 6; D-79, D-80; FINAL_REVIEW F-C2): the required-training booking gate (w6h) is keyed on the
-- roster row's link history, so ending the link (owner or worker) no longer re-opens assignment. Covers the verifier
-- probe (P1) and P2..P5, the gate lifting, the unchanged scope, the documented undetectable path P6 (W15-L1), and the
-- private roster_link_history table. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

create temporary table w15_ids (label text primary key, id uuid) on commit drop;
grant all on w15_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w15_ids where label = p_label $$;
create function pg_temp.assign(p_row text, p_booking text) returns text language sql as $$
  select test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id(p_row), pg_temp.id(p_booking))) $$;
create function pg_temp.history(p_row text) returns text language sql stable security definer as $$
  select coalesce(string_agg(u.email || ':' || h.source, ',' order by u.email), '-')
  from public.roster_link_history h join auth.users u on u.id = h.user_id where h.worker_row_id = pg_temp.id(p_row) $$;
create function pg_temp.hist_access() returns text language sql as $$
  select test_helpers.attempt('select count(*) from public.roster_link_history') || ','
      || test_helpers.attempt(format('insert into public.roster_link_history (worker_row_id, user_id, source) values (%L, %L, %L)',
                                     pg_temp.id('rn1'), pg_temp.id('wn'), 'link')) || ','
      || test_helpers.attempt('update public.roster_link_history set source = ''link''') || ','
      || test_helpers.attempt('delete from public.roster_link_history') $$;

-- ---------- fixtures (as probe_fc2.sql: verified s1 of o1, trainee wt with an accepted enrollment, linked row rt, booking b2) ----------
insert into w15_ids values ('a1', test_helpers.create_super_admin('w15g-a1@local.test')), ('c1', test_helpers.create_customer('w15g-c1@local.test'));
insert into w15_ids select 'o' || n, test_helpers.create_owner('w15g-o' || n || '@local.test') from generate_series(1, 2) n;
insert into w15_ids select l, test_helpers.create_worker_profile(test_helpers.create_worker('w15g-' || l || '@local.test'))
from unnest(array['wt', 'w2', 'wp', 'wu', 'w5', 'wx', 'wn', 'wk']) l;
insert into w15_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
                           ('s3', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1')));
insert into w15_ids values ('p1', test_helpers.create_training_program(pg_temp.id('s1')));
select count(test_helpers.add_training_session(pg_temp.id('p1'), test_helpers.manila_today() + n)) as sessions from generate_series(1, 3) n;
select test_helpers.open_training_program(pg_temp.id('p1')) is not null as opened;
insert into w15_ids select 'r' || substr(l, 2), test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id(l))
from unnest(array['wt', 'wp', 'w5', 'wx', 'wk']) l;
insert into w15_ids select 'e' || substr(l, 2), test_helpers.create_accepted_enrollment(pg_temp.id('p1'), pg_temp.id(l))
from unnest(array['wt', 'wp', 'wn']) l;
insert into w15_ids values ('b2', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s1'))),
                           ('b3', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s1'), 'accepted')),
                           ('b4', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s3')));
-- P5 fixture: b3 assigned to r5 BEFORE w5 enrolls (trusted), then w5's enrollment is accepted.
update public.bookings set assigned_worker_id = pg_temp.id('r5') where id = pg_temp.id('b3');
insert into w15_ids values ('e5', test_helpers.create_accepted_enrollment(pg_temp.id('p1'), pg_temp.id('w5')));

-- ---------- P1: the verifier probe (probe_fc2.sql) ----------
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('rt', 'b2'), '23514', 'w15_probe_owner_unlinks_trainee_then_assign_refused');
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('rt'))), 'succeeded',
          'w15_probe_owner_unlinks_trainee_then_assign_refused');
select is(pg_temp.assign('rt', 'b2'), '23514', 'w15_probe_owner_unlinks_trainee_then_assign_refused');
select test_helpers.act_as_service();
select is((select status from public.training_enrollments where id = pg_temp.id('et')) || ',' ||
          coalesce((select assigned_worker_id::text from public.bookings where id = pg_temp.id('b2')), '-'),
          'accepted,-', 'w15_probe_owner_unlinks_trainee_then_assign_refused');
select is((select user_id is null from public.workers where id = pg_temp.id('rt')), true, 'w15_probe_owner_unlinks_trainee_then_assign_refused');

-- ---------- P2: the worker unlinks the own row, the owner assigns it ----------
select test_helpers.act_as_worker('w15g-wp@local.test');
select lives_ok(format('select public.unlink_my_roster_entry(%L)', pg_temp.id('rp')), 'w15_worker_self_unlink_then_owner_assign_refused');
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('rp', 'b2'), '23514', 'w15_worker_self_unlink_then_owner_assign_refused');

-- ---------- P3: linked BEFORE the invitation, unlinked, then invited and accepted ----------
select test_helpers.act_as_service();
insert into w15_ids values ('ru', test_helpers.create_roster_worker(pg_temp.id('o1'))),
                           ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'W15 opening')));
insert into w15_ids values ('appu', test_helpers.create_job_application(pg_temp.id('j1'), pg_temp.id('wu'), 'accepted'));
select test_helpers.act_as_owner('w15g-o1@local.test');
select set_config('fx.code_u', (select link_code from public.create_roster_link_code(pg_temp.id('ru'))), true);
select test_helpers.act_as_worker('w15g-wu@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_u'))), 'linked', 'w15_link_before_training_then_unlink_still_gated');
select lives_ok(format('select public.unlink_my_roster_entry(%L)', pg_temp.id('ru')), 'w15_link_before_training_then_unlink_still_gated');
select test_helpers.act_as_owner('w15g-o1@local.test');
insert into w15_ids select 'eu', (public.invite_to_training(pg_temp.id('p1'), pg_temp.id('appu'))).id;
select test_helpers.act_as_worker('w15g-wu@local.test');
select is((public.respond_to_training_invitation(pg_temp.id('eu'), true, 'w6_v1',
          (select schedule_changed_at from public.training_programs where id = pg_temp.id('p1')))).status, 'accepted',
          'w15_link_before_training_then_unlink_still_gated');
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('ru', 'b2'), '23514', 'w15_link_before_training_then_unlink_still_gated');

-- ---------- P4 (D-80): a second account accepts a new code for rt ----------
select set_config('fx.code_t', (select link_code from public.create_roster_link_code(pg_temp.id('rt'))), true);
select test_helpers.act_as_worker('w15g-w2@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_t'))), 'linked', 'w15_relinked_row_to_other_account_still_gated');
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('rt', 'b2'), '23514', 'w15_relinked_row_to_other_account_still_gated');
select test_helpers.act_as_worker('w15g-w2@local.test');
select lives_ok(format('select public.unlink_my_roster_entry(%L)', pg_temp.id('rt')), 'w15_relinked_row_to_other_account_still_gated');
select test_helpers.act_as_service();
insert into w15_ids values ('r2', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('w2')));
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('r2', 'b2'), 'succeeded', 'w15_relinked_row_to_other_account_still_gated');

-- ---------- P5: a booking assigned before training cannot start after the unlink ----------
-- Through the API nobody can start it: bookings has no super_admin update policy and the former worker no longer passes
-- the w2c assigned-worker policy, so both updates match 0 rows. The w6h start branch is then exercised by a session that
-- carries the super_admin JWT but bypasses RLS (not trusted: it has a JWT), so the trigger runs and must see the history.
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('r5'))), 'succeeded',
          'w15_preassigned_booking_cannot_start_after_unlink');
select test_helpers.act_as_admin('w15g-a1@local.test');
select set_config('fx.start_admin', test_helpers.attempt(format('update public.bookings set booking_status = ''in_progress'' where id = %L', pg_temp.id('b3'))), true);
select test_helpers.act_as_worker('w15g-w5@local.test');
select set_config('fx.start_worker', test_helpers.attempt(format('update public.bookings set booking_status = ''in_progress'' where id = %L', pg_temp.id('b3'))), true);
select test_helpers.act_as_service();
select is(current_setting('fx.start_admin') || ',' || current_setting('fx.start_worker') || ',' || (select booking_status from public.bookings where id = pg_temp.id('b3')),
          'succeeded,succeeded,accepted', 'w15_preassigned_booking_cannot_start_after_unlink');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('a1'), 'role', 'authenticated')::text, true);
select is(test_helpers.attempt(format('update public.bookings set booking_status = ''in_progress'' where id = %L', pg_temp.id('b3'))), '23514',
          'w15_preassigned_booking_cannot_start_after_unlink');
select test_helpers.act_as_service();
select is((select booking_status || ',' || public.roster_worker_in_required_training(assigned_worker_id, shop_id) from public.bookings where id = pg_temp.id('b3')),
          'accepted,true', 'w15_preassigned_booking_cannot_start_after_unlink');

-- ---------- unassigning a trainee row is never refused ----------
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = null where id = %L', pg_temp.id('b3'))), 'succeeded',
          'w15_unassigning_trainee_row_still_allowed');
select test_helpers.act_as_service();
select is((select coalesce(assigned_worker_id::text, '-') from public.bookings where id = pg_temp.id('b3')), '-', 'w15_unassigning_trainee_row_still_allowed');

-- ---------- the gate lifts after withdraw or completion ----------
select test_helpers.act_as_worker('w15g-wp@local.test');
select is((public.withdraw_from_training(pg_temp.id('ep'))).status, 'withdrawn', 'w15_gate_lifts_after_withdraw_or_completion');
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('rp', 'b2'), 'succeeded', 'w15_gate_lifts_after_withdraw_or_completion');
select test_helpers.act_as_service();
insert into w15_ids values ('pc', test_helpers.create_training_program(pg_temp.id('s1')));
select count(test_helpers.add_training_session(pg_temp.id('pc'), test_helpers.manila_today() - n)) as past_sessions from generate_series(1, 3) n;
select test_helpers.open_training_program(pg_temp.id('pc')) is not null as opened_pc;
insert into w15_ids values ('ex', test_helpers.create_accepted_enrollment(pg_temp.id('pc'), pg_temp.id('wx')));
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('rx'))) || ',' || pg_temp.assign('rx', 'b2'),
          'succeeded,23514', 'w15_gate_lifts_after_withdraw_or_completion');
select test_helpers.act_as_service();
select test_helpers.record_training_completion(pg_temp.id('ex'), 'w15g-o1@local.test') is not null as completed;
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('rx', 'b2'), 'succeeded', 'w15_gate_lifts_after_withdraw_or_completion');

-- ---------- another owner's row linked to the trainee is unaffected (D-17 scope) ----------
select test_helpers.act_as_service();
insert into w15_ids values ('ro2', test_helpers.create_roster_worker(pg_temp.id('o2'), pg_temp.id('wt')));
select test_helpers.act_as_owner('w15g-o2@local.test');
select is(pg_temp.assign('ro2', 'b4'), 'succeeded', 'w15_other_owner_rows_unaffected');

-- ---------- P6 (W15-L1): rows never linked to the trainee are not detected ----------
select test_helpers.act_as_service();
insert into w15_ids values ('rn1', test_helpers.create_roster_worker(pg_temp.id('o1'))), ('rd', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('wn')));
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.assign('rn1', 'b2'), 'succeeded', 'w15_limitation_never_linked_name_only_row_not_detected');
select is(test_helpers.attempt(format('delete from public.workers where id = %L', pg_temp.id('rd'))), 'succeeded',
          'w15_limitation_never_linked_name_only_row_not_detected');
with x as (insert into public.workers (owner_id, name) values (auth.uid(), 'W15 re-created row') returning id) insert into w15_ids select 'rn2', id from x;
select is(pg_temp.assign('rn2', 'b2'), 'succeeded', 'w15_limitation_never_linked_name_only_row_not_detected');

-- ---------- history: one `link` row per link, none on unlink, no duplicate on re-link ----------
select test_helpers.act_as_service();
select is(pg_temp.history('rt') || '|' || pg_temp.history('ru') || '|' || pg_temp.history('rn1'),
          'w15g-w2@local.test:link,w15g-wt@local.test:link|w15g-wu@local.test:link|-', 'w15_link_history_recorded_for_code_link_and_trusted_insert');
select test_helpers.act_as_owner('w15g-o1@local.test');
select set_config('fx.code_u2', (select link_code from public.create_roster_link_code(pg_temp.id('ru'))), true);
select test_helpers.act_as_worker('w15g-wu@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_u2'))), 'linked', 'w15_link_history_recorded_for_code_link_and_trusted_insert');
select test_helpers.act_as_service();
select is(pg_temp.history('ru') || '|' || (select count(*) from public.roster_link_history where user_id = pg_temp.id('wu')),
          'w15g-wu@local.test:link|1', 'w15_link_history_recorded_for_code_link_and_trusted_insert');
-- Fix cycle 1 (SEC-1): a no-op `set user_id = user_id` neither raises nor writes history.
delete from public.roster_link_history where worker_row_id = pg_temp.id('rk');
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(test_helpers.attempt(format('update public.workers set user_id = user_id where id = %L', pg_temp.id('rk'))), 'succeeded',
          'w15_noop_user_id_update_writes_no_history');
select test_helpers.act_as_service();
select is(test_helpers.attempt(format('update public.workers set user_id = user_id where id = %L', pg_temp.id('rk'))) || ',' || pg_temp.history('rk'),
          'succeeded,-', 'w15_noop_user_id_update_writes_no_history');

-- Fix cycle 1 (SEC-7): the backfill restores ended links from roster.linked AND roster.unlinked audit rows, idempotently.
-- wt was linked to rt by a trusted insert (no roster.linked row), so only the owner's roster.unlinked row names wt.
delete from public.roster_link_history where worker_row_id = pg_temp.id('rt');
select is((select current_count || ',' || audit_count from public.backfill_roster_link_history()), '1,2', 'w15_backfill_uses_linked_and_unlinked_audit_rows');
select is(pg_temp.history('rt'), 'w15g-w2@local.test:backfill_audit,w15g-wt@local.test:backfill_audit', 'w15_backfill_uses_linked_and_unlinked_audit_rows');
select is((select current_count || ',' || audit_count from public.backfill_roster_link_history()), '0,0', 'w15_backfill_uses_linked_and_unlinked_audit_rows');

-- ---------- the history table is private ----------
select is((select c.relrowsecurity::text || ',' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'roster_link_history')
           from pg_class c where c.oid = 'public.roster_link_history'::regclass), 'true,0', 'w15_link_history_has_rls_and_no_client_access');
select test_helpers.act_as_anon();
select is(pg_temp.hist_access(), '42501,42501,42501,42501', 'w15_link_history_has_rls_and_no_client_access');
select test_helpers.act_as_customer('w15g-c1@local.test');
select is(pg_temp.hist_access(), '42501,42501,42501,42501', 'w15_link_history_has_rls_and_no_client_access');
select test_helpers.act_as_owner('w15g-o1@local.test');
select is(pg_temp.hist_access(), '42501,42501,42501,42501', 'w15_link_history_has_rls_and_no_client_access');
select test_helpers.act_as_worker('w15g-wt@local.test');
select is(pg_temp.hist_access(), '42501,42501,42501,42501', 'w15_link_history_has_rls_and_no_client_access');
select test_helpers.act_as_admin('w15g-a1@local.test');
select is(pg_temp.hist_access(), '42501,42501,42501,42501', 'w15_link_history_has_rls_and_no_client_access');
select test_helpers.act_as_service();
select set_config('fx.rn1', pg_temp.id('rn1')::text, true), set_config('fx.wn', pg_temp.id('wn')::text, true);
set local role service_role;
select throws_ok('select count(*) from public.roster_link_history', '42501', null, 'w15_link_history_has_rls_and_no_client_access');
select throws_ok(format('insert into public.roster_link_history (worker_row_id, user_id, source) values (%L, %L, %L)',
                        current_setting('fx.rn1'), current_setting('fx.wn'), 'link'), '42501', null, 'w15_link_history_has_rls_and_no_client_access');
select throws_ok('update public.roster_link_history set source = ''link''', '42501', null, 'w15_link_history_has_rls_and_no_client_access');
select throws_ok('delete from public.roster_link_history', '42501', null, 'w15_link_history_has_rls_and_no_client_access');
reset role;

-- ---------- neither function is client-executable ----------
select is((select string_agg(has_function_privilege(r, f, 'execute')::text, ',' order by r, f)
           from unnest(array['anon', 'authenticated', 'service_role']) r,
                unnest(array['public.roster_worker_in_required_training(uuid, uuid)', 'public.record_roster_link_history()',
                             'public.backfill_roster_link_history()']) f),
          'false,false,false,false,false,false,false,false,false', 'w15_gate_functions_not_client_executable');

-- ---------- trusted sessions still bypass (w6h behaviour pinned) ----------
select test_helpers.act_as_service();
select is(pg_temp.assign('rt', 'b2'), 'succeeded', 'w15_trusted_session_still_bypasses');

-- ---------- the history is deleted with the roster row and with the account ----------
delete from public.workers where id = pg_temp.id('rt');
select is((select count(*)::int from public.roster_link_history where worker_row_id = pg_temp.id('rt')), 0, 'w15_link_history_cascades_with_roster_row_and_account');
delete from auth.users where id = pg_temp.id('wu');
select is((select count(*)::int from public.roster_link_history where user_id = pg_temp.id('wu') or worker_row_id = pg_temp.id('ru')), 0,
          'w15_link_history_cascades_with_roster_row_and_account');

select * from finish();
rollback;
