-- W6 audit and notifications (W3 pattern): every program, session, trainer, enrollment and evidence
-- action is audited with ids / status words / counts only; workers, owners and trainers get the
-- in-app notifications of plan 3.9, once per event, without dates, pay, terms, notes, reasons or
-- names; a refused action writes nothing. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w6n-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w6n-o1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('w6n-' || label || '@local.test')))
from unnest(array['w1', 'w2', 'w3', 'w4', 't1']) label;
create function pg_temp.u(p_label text) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'w6n-' || p_label || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'W6N opening'))::text, true);
create temporary table w6n_ids (label text primary key, id uuid) on commit drop;
grant all on w6n_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w6n_ids where label = p_label $$;
insert into w6n_ids select 'app_' || label, test_helpers.create_job_application(current_setting('fx.j1')::uuid, pg_temp.u(label), 'accepted')
from unnest(array['w1', 'w2', 'w3']) label;
insert into w6n_ids values ('r_t1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u('t1')));
create function pg_temp.notes(p_label text) returns table (category text, title text, body text, idempotency_key text)
language sql stable security definer
as $$ select category, title, body, idempotency_key from public.notifications where recipient_id = pg_temp.u(p_label) and category like 'training%' $$;
create function pg_temp.events() returns setof public.workforce_audit_events language sql stable security definer
as $$ select * from public.workforce_audit_events where action like 'training%' $$;

-- ---------- the flow, through the RPCs ----------
select test_helpers.act_as_owner('w6n-o1@local.test');
insert into w6n_ids select 'p', (public.create_training_program(current_setting('fx.s1')::uuid, 'W6N training')).id;
select count(public.update_training_program_draft(pg_temp.id('p'), 'W6N training', 'Objectives for audit', array['Rinse'], 'Secret terms text',
  3, array['Rinses well', 'Dries well'], 500, 'PHP', 'day', 'Pay detail text', 'Reimbursement text',
  (select updated_at from public.training_programs where id = pg_temp.id('p'))));
select count(public.add_training_session(pg_temp.id('p'), test_helpers.manila_today() + n, 'supervised_training')) from generate_series(1, 3) n;
insert into w6n_ids select 'des_t1', (public.designate_training_trainer(pg_temp.id('p'), pg_temp.id('r_t1'))).id;
select count(public.transition_training_program(pg_temp.id('p'), 'draft', 'open', 'w6_owner_v1'));
insert into w6n_ids select 'e_' || label, (public.invite_to_training(pg_temp.id('p'), pg_temp.id('app_' || label))).id
from unnest(array['w1', 'w2', 'w3']) label;
select test_helpers.act_as(pg_temp.u('w1'));
select count(public.respond_to_training_invitation(pg_temp.id('e_w1'), true, 'w6_v1', (select schedule_changed_at from public.training_programs where id = pg_temp.id('p'))));
select test_helpers.act_as(pg_temp.u('w2'));
select count(public.respond_to_training_invitation(pg_temp.id('e_w2'), false));
select test_helpers.act_as(pg_temp.u('w3'));
select count(public.respond_to_training_invitation(pg_temp.id('e_w3'), true, 'w6_v1', (select schedule_changed_at from public.training_programs where id = pg_temp.id('p'))));
select test_helpers.act_as_owner('w6n-o1@local.test');
insert into w6n_ids select 'extra', (public.add_training_session(pg_temp.id('p'), test_helpers.manila_today() + 9, 'competency_assessment')).id;
select count(public.cancel_training_session(pg_temp.id('extra'), 'Cancel reason text for audit'));
select count(public.cancel_training_enrollment(pg_temp.id('e_w3'), 'Owner reason text for audit'));
select test_helpers.act_as_service();
insert into w6n_ids select 'past' || n, test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - n) from generate_series(1, 3) n;
insert into w6n_ids values ('e_w4', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.u('w4')));
select test_helpers.act_as(pg_temp.u('t1'));
select count(public.record_training_attendance(pg_temp.id('e_w4'), pg_temp.id('past' || n), 'present', 'Progress note text')) from generate_series(1, 3) n;
select count(public.correct_training_attendance((select id from public.training_attendance_records where session_id = pg_temp.id('past1')),
  'present', 'Corrected note text', 'Correction reason text'));
select count(public.record_training_assessment(pg_temp.id('e_w4'), array[true, true], 'passed', 'Assessor comment text'));
select test_helpers.act_as_owner('w6n-o1@local.test');
select count(public.revoke_training_trainer(pg_temp.id('des_t1')));
select test_helpers.act_as_service();

-- ---------- audit ----------
select is((select array_agg(distinct action order by action) from pg_temp.events() where payload ->> 'training_program_id' = pg_temp.id('p')::text),
          array['training_assessment.recorded', 'training_attendance.corrected', 'training_attendance.recorded', 'training_enrollment.invited',
                'training_enrollment.status_changed', 'training_program.created', 'training_program.status_changed', 'training_session.added',
                'training_session.cancelled', 'training_trainer.designated', 'training_trainer.revoked'],
          'w6_audit_written_for_every_program_enrollment_and_evidence_action');
select is((select array_agg(payload ->> 'changed_by' order by payload ->> 'to_status') from pg_temp.events()
           where action = 'training_enrollment.status_changed' and payload ->> 'training_program_id' = pg_temp.id('p')::text),
          array['worker', 'worker', 'owner', 'worker'], 'w6_audit_written_for_every_program_enrollment_and_evidence_action');
select is((select row(subject_type, subject_id, subject_profile_id, actor_id, payload ->> 'recorder_role', payload ->> 'attended_training_days',
                      payload ->> 'required_training_days', payload ->> 'items_met_count', payload ->> 'items_total')::text
           from pg_temp.events() where action = 'training_assessment.recorded'),
          row('training_enrollment', pg_temp.id('e_w4'), pg_temp.u('w4'), pg_temp.u('t1'), 'trainer', '3', '3', '2', '2')::text,
          'w6_audit_written_for_every_program_enrollment_and_evidence_action');
select is((select count(*)::int from pg_temp.events() where action = 'training_attendance.recorded' and payload ->> 'enrollment_id' = pg_temp.id('e_w4')::text),
          3, 'w6_audit_written_for_every_program_enrollment_and_evidence_action');
select is((select count(*)::int from pg_temp.events()
           where payload::text ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}' or payload::text ~* '(note text|reason text|secret terms|pay detail|reimbursement text|assessor comment|local test|objectives)'),
          0, 'w6_audit_payload_has_no_dates_notes_reasons_terms_or_names');
select is((select count(*)::int from pg_temp.events(), jsonb_object_keys(payload) k
           where k not in ('training_program_id', 'shop_id', 'enrollment_id', 'session_id', 'from_status', 'to_status', 'session_kind',
                           'attendance_status', 'result', 'recorder_role', 'is_correction', 'attended_training_days', 'required_training_days',
                           'items_met_count', 'items_total', 'changed_by', 'deleted_by')),
          0, 'w6_audit_payload_has_no_dates_notes_reasons_terms_or_names');

-- ---------- notifications ----------
select is((select array_agg(category || '|' || title order by category, title) from pg_temp.notes('w1')),
          array['training.invited|Training invitation', 'training.schedule_changed|Training schedule changed',
                'training.schedule_changed|Training schedule changed'], 'w6_worker_notified_on_invite_cancel_correction_and_assessment');
select is((select array_agg(category order by category) from pg_temp.notes('w3')),
          array['training.cancelled', 'training.invited', 'training.schedule_changed', 'training.schedule_changed'],
          'w6_worker_notified_on_invite_cancel_correction_and_assessment');
select is((select body from pg_temp.notes('w3') where category = 'training.cancelled'),
          format('%s cancelled your enrollment in W6N training.', (select name from public.shops where id = current_setting('fx.s1')::uuid)),
          'w6_worker_notified_on_invite_cancel_correction_and_assessment');
select is((select array_agg(body order by category) from pg_temp.notes('w4')),
          array['W6N training: assessment recorded, Passed. Training completed.', 'A training record for W6N training was corrected.'],
          'w6_worker_notified_on_invite_cancel_correction_and_assessment');
select is((select array_agg(body order by body) from pg_temp.notes('o1')),
          array['A trainer recorded an assessment for W6N training.', 'A worker accepted W6N training.', 'A worker accepted W6N training.',
                'A worker declined W6N training.'], 'w6_owner_notified_on_response_and_trainer_assessment');
select is((select array_agg(body order by body) from pg_temp.notes('t1')),
          array['You are a trainer for W6N training.', 'You are no longer a trainer for W6N training.'], 'w6_trainer_notified_on_designation');
select is((select count(*)::int from pg_temp.notes('w2') where category = 'training.schedule_changed'), 0,
          'w6_schedule_change_notifies_enrolled_workers_once');
select is((select count(distinct idempotency_key)::int from pg_temp.notes('w1') where category = 'training.schedule_changed'), 2,
          'w6_schedule_change_notifies_enrolled_workers_once');
select is((select count(*)::int from pg_temp.notes('w4') where category = 'training.schedule_changed'), 0,
          'w6_schedule_change_notifies_enrolled_workers_once');
select is((select count(*)::int from public.notifications n where n.category like 'training%'
           group by n.recipient_id, n.idempotency_key order by count(*) desc limit 1), 1, 'w6_notifications_idempotent_one_per_event');
select is((select count(*)::int from public.notifications n where n.category = 'training.invited'),
          (select count(*)::int from pg_temp.events() where action = 'training_enrollment.invited' and payload ->> 'changed_by' = 'owner'),
          'w6_notifications_idempotent_one_per_event');
select is((select count(*)::int from public.notifications n where n.category like 'training%'
           and (n.title || ' ' || n.body ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}' or n.title || ' ' || n.body ~* '(php|500|pay|reimburse|terms|note|reason|comment|local test owner|local test worker)')),
          0, 'w6_notification_text_has_no_dates_pay_or_names');
select ok((select bool_and(public.notification_text_is_safe(title) and public.notification_text_is_safe(body)) from public.notifications where category like 'training%'),
          'w6_notification_text_has_no_dates_pay_or_names');

-- ---------- refused actions write nothing ----------
create temporary table w6n_before on commit drop as
  select (select count(*) from public.workforce_audit_events) as events, (select count(*) from public.notifications) as notes;
select test_helpers.act_as(pg_temp.u('t1'));
select is(test_helpers.attempt(format('select public.record_training_assessment(%L, array[true, true], %L)', pg_temp.id('e_w4'), 'passed')), '42501',
          'w6_refused_action_writes_no_audit_or_notification');
select test_helpers.act_as_owner('w6n-o1@local.test');
select is(test_helpers.attempt(format('select public.record_training_assessment(%L, array[true, true], %L)', pg_temp.id('e_w4'), 'passed')), '23505',
          'w6_refused_action_writes_no_audit_or_notification');
select is(test_helpers.attempt(format('select public.invite_to_training(%L, %L)', pg_temp.id('p'), pg_temp.id('app_w1'))), '23505',
          'w6_refused_action_writes_no_audit_or_notification');
select test_helpers.act_as_service();
select is((select row((select count(*) from public.workforce_audit_events) - events, (select count(*) from public.notifications) - notes)::text from w6n_before),
          row(0, 0)::text, 'w6_refused_action_writes_no_audit_or_notification');

select * from finish();
rollback;
