-- J5 (W5): application status transitions are validated per actor (W5 PLAN 3.3 matrix), stale
-- requests are refused, writes go through the RPCs only, and closing an opening closes its open
-- applications. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j5-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j5-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j5-o2@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j5-w' || n || '@local.test')))
from generate_series(1, 8) n;
-- Lookup helpers run as the fixture session (definer) so they also resolve rows hidden by RLS.
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j5-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s3', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j5_openings (label text primary key, id uuid) on commit drop;
grant all on j5_openings to public;
insert into j5_openings
select label, test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.' || shop)::uuid, 'J5 ' || label))
from (values ('flow', 's1'), ('close', 's1'), ('archive', 's1'), ('pause', 's1'), ('accept', 's2'), ('recheck', 's1'),
             ('unverified', 's3'), ('matrix_draft', 's1'), ('matrix_submitted', 's1'), ('matrix_under_review', 's1'),
             ('matrix_shortlisted', 's1'), ('matrix_accepted', 's1'), ('matrix_rejected', 's1'), ('matrix_withdrawn', 's1'),
             ('matrix_closed', 's1')) v(label, shop);
create function pg_temp.jo(p_label text) returns uuid language sql stable
as $$ select id from j5_openings where label = p_label $$;
create function pg_temp.app(p_label text, p_worker int) returns uuid language sql stable security definer
as $$ select a.id from public.job_applications a where a.job_opening_id = pg_temp.jo(p_label) and a.worker_id = pg_temp.w(p_worker)
      order by a.created_at desc limit 1 $$;
-- Runs one transition and rolls it back; returns 'allowed' or the SQLSTATE.
create function pg_temp.try_transition(p_id uuid, p_from text, p_to text) returns text language plpgsql
as $$
begin
  begin
    perform public.transition_job_application(p_id, p_from, p_to, 'w5_v1');
    raise exception using errcode = 'P0J50', message = 'j5 rollback';
  exception when others then
    return case when sqlstate = 'P0J50' then 'allowed' else sqlstate end;
  end;
end;
$$;

-- ---------- owner pipeline ----------
select test_helpers.act_as(pg_temp.w(1));
select public.create_job_application(pg_temp.jo('flow'), null, true, 'w5_v1') is not null as applied_1;
select test_helpers.act_as(pg_temp.w(2));
select public.create_job_application(pg_temp.jo('flow'), null, true, 'w5_v1') is not null as applied_2;
select test_helpers.act_as(pg_temp.w(3));
select public.create_job_application(pg_temp.jo('flow'), null, true, 'w5_v1') is not null as applied_3;
select test_helpers.act_as(pg_temp.w(4));
select public.create_job_application(pg_temp.jo('flow'), null, true, 'w5_v1') is not null as applied_4;
select test_helpers.act_as_owner('j5-o1@local.test');
select is((select status from public.transition_job_application(pg_temp.app('flow', 1), 'submitted', 'under_review')), 'under_review',
          'j5_owner_can_move_submitted_to_under_review_shortlisted_accepted');
select is((select row(status_changed_at = now(), updated_at = now(), decided_at is null)::text from public.job_applications
           where id = pg_temp.app('flow', 1)), row(true, true, true)::text, 'j5_server_stamps_set_on_transition');
select is((select status from public.transition_job_application(pg_temp.app('flow', 1), 'under_review', 'shortlisted')), 'shortlisted',
          'j5_owner_can_move_submitted_to_under_review_shortlisted_accepted');
select is((select status from public.transition_job_application(pg_temp.app('flow', 1), 'shortlisted', 'accepted')), 'accepted',
          'j5_owner_can_move_submitted_to_under_review_shortlisted_accepted');
select is((select row(decided_at = now(), withdrawn_at is null, closed_at is null)::text from public.job_applications
           where id = pg_temp.app('flow', 1)), row(true, true, true)::text, 'j5_server_stamps_set_on_transition');
select is((select status from public.transition_job_application(pg_temp.app('flow', 2), 'submitted', 'rejected')), 'rejected',
          'j5_owner_can_reject_from_submitted_under_review_shortlisted');
select is((select status from public.transition_job_application(pg_temp.app('flow', 3), 'submitted', 'under_review')), 'under_review',
          'j5_owner_can_reject_from_submitted_under_review_shortlisted');
select is((select status from public.transition_job_application(pg_temp.app('flow', 3), 'under_review', 'rejected')), 'rejected',
          'j5_owner_can_reject_from_submitted_under_review_shortlisted');
select is((select status from public.transition_job_application(pg_temp.app('flow', 4), 'submitted', 'under_review')), 'under_review',
          'j5_owner_can_reject_from_submitted_under_review_shortlisted');
select is((select status from public.transition_job_application(pg_temp.app('flow', 4), 'under_review', 'shortlisted')), 'shortlisted',
          'j5_owner_can_reject_from_submitted_under_review_shortlisted');
select is((select status from public.transition_job_application(pg_temp.app('flow', 4), 'shortlisted', 'rejected')), 'rejected',
          'j5_owner_can_reject_from_submitted_under_review_shortlisted');
select is((select count(*)::int from public.job_applications where job_opening_id = pg_temp.jo('flow') and status = 'rejected'
           and decided_at = now()), 3, 'j5_server_stamps_set_on_transition');
select throws_ok($$ select public.transition_job_application(pg_temp.app('flow', 2), 'under_review', 'shortlisted') $$,
                 '55000', 'This application changed. Refresh and try again.', 'j5_stale_transition_rejected');
select throws_ok($$ select public.transition_job_application(pg_temp.app('flow', 1), 'shortlisted', 'accepted') $$,
                 '55000', 'This application changed. Refresh and try again.', 'j5_stale_transition_rejected');

-- ---------- worker: submit, withdraw ----------
select test_helpers.act_as(pg_temp.w(1));
select is((select status from public.transition_job_application(pg_temp.app('flow', 1), 'accepted', 'withdrawn')), 'withdrawn',
          'j5_worker_can_withdraw_from_submitted_under_review_shortlisted_accepted');
select is((select withdrawn_at = now() and decided_at is not null from public.job_applications where id = pg_temp.app('flow', 1)),
          true, 'j5_server_stamps_set_on_transition');
select set_config('fx.d1', (select id from public.create_job_application(pg_temp.jo('recheck'), 'Draft one', false))::text, true);
select is((select status from public.transition_job_application(current_setting('fx.d1')::uuid, 'draft', 'submitted', 'w5_v1')),
          'submitted', 'j5_worker_can_submit_own_draft');
select is((select row(submitted_at = now(), notice_version, opening_snapshot is not null)::text from public.job_applications
           where id = current_setting('fx.d1')::uuid), row(true, 'w5_v1', true)::text, 'j5_worker_can_submit_own_draft');
select is((select status from public.transition_job_application(current_setting('fx.d1')::uuid, 'submitted', 'withdrawn')), 'withdrawn',
          'j5_worker_can_withdraw_from_submitted_under_review_shortlisted_accepted');

select test_helpers.act_as(pg_temp.w(2));
select set_config('fx.d2', (select id from public.create_job_application(pg_temp.jo('recheck'), null, false))::text, true);
select throws_ok($$ select public.transition_job_application(current_setting('fx.d2')::uuid, 'draft', 'submitted', null) $$,
                 '23514', 'Review the training and work notice before applying.', 'j5_submit_rechecks_deadline_status_and_verification');
select test_helpers.act_as_owner('j5-o1@local.test');
select is((select status from public.transition_job_opening(pg_temp.jo('recheck'), 'published', 'paused')), 'paused',
          'j5_submit_rechecks_deadline_status_and_verification');
select test_helpers.act_as(pg_temp.w(2));
select throws_ok($$ select public.transition_job_application(current_setting('fx.d2')::uuid, 'draft', 'submitted', 'w5_v1') $$,
                 '23514', 'This job opening is paused and is not accepting applications.', 'j5_submit_rechecks_deadline_status_and_verification');
select test_helpers.act_as_service();
update public.job_openings set status = 'published', application_deadline = (now() at time zone 'Asia/Manila')::date - 1
where id = pg_temp.jo('recheck');
select test_helpers.act_as(pg_temp.w(2));
select throws_ok($$ select public.transition_job_application(current_setting('fx.d2')::uuid, 'draft', 'submitted', 'w5_v1') $$,
                 '23514', 'The application deadline for this opening has passed.', 'j5_submit_rechecks_deadline_status_and_verification');
select set_config('fx.d3', (select id from public.create_job_application(pg_temp.jo('unverified'), null, false))::text, true);
select test_helpers.act_as_admin('j5-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Local test: retake photo'
where id = current_setting('fx.s3')::uuid;
select test_helpers.act_as(pg_temp.w(2));
select throws_ok($$ select public.transition_job_application(current_setting('fx.d3')::uuid, 'draft', 'submitted', 'w5_v1') $$,
                 '23514', 'This shop cannot receive applications until its verification is reviewed.',
                 'j5_submit_rechecks_deadline_status_and_verification');
select is((select array_agg(status) from public.job_applications where id in (current_setting('fx.d2')::uuid, current_setting('fx.d3')::uuid)),
          array['draft', 'draft'], 'j5_submit_rechecks_deadline_status_and_verification');

-- ---------- drafts: edit / delete own only; frozen after submit ----------
select is((select cover_note from public.update_job_application_draft(current_setting('fx.d2')::uuid, '  Edited draft  ',
           (select updated_at from public.job_applications where id = current_setting('fx.d2')::uuid))),
          'Edited draft', 'j5_worker_can_edit_and_delete_own_draft_only');
select throws_ok($$ select public.update_job_application_draft(current_setting('fx.d2')::uuid, 'Stale', now() - interval '1 minute') $$,
                 '55000', 'This application changed. Refresh and try again.', 'j5_stale_draft_update_rejected');
select test_helpers.act_as(pg_temp.w(3));
select throws_ok($$ select public.update_job_application_draft(current_setting('fx.d2')::uuid, 'Hijack', now()) $$,
                 '42501', 'Job application not found.', 'j5_worker_can_edit_and_delete_own_draft_only');
select throws_ok($$ select public.delete_job_application_draft(current_setting('fx.d2')::uuid) $$,
                 '42501', 'Job application not found.', 'j5_worker_can_edit_and_delete_own_draft_only');
select test_helpers.act_as(pg_temp.w(2));
select lives_ok($$ select public.delete_job_application_draft(current_setting('fx.d2')::uuid) $$, 'j5_worker_can_edit_and_delete_own_draft_only');
select is((select count(*)::int from public.job_applications where id = current_setting('fx.d2')::uuid), 0,
          'j5_worker_can_edit_and_delete_own_draft_only');
select test_helpers.act_as(pg_temp.w(1));
select throws_ok($$ select public.update_job_application_draft(current_setting('fx.d1')::uuid, 'Edited after submit',
                    (select updated_at from public.job_applications where id = current_setting('fx.d1')::uuid)) $$,
                 '42501', 'Job application not found.', 'j5_cover_note_frozen_after_submit');
select throws_ok($$ select public.delete_job_application_draft(current_setting('fx.d1')::uuid) $$,
                 '42501', 'Job application not found.', 'j5_cover_note_frozen_after_submit');
select is((select cover_note from public.job_applications where id = current_setting('fx.d1')::uuid), 'Draft one',
          'j5_cover_note_frozen_after_submit');

-- ---------- owners never see drafts ----------
select test_helpers.act_as_owner('j5-o1@local.test');
select is((select count(*)::int from public.job_applications where status = 'draft'), 0, 'j5_owner_cannot_see_or_transition_drafts');
select throws_ok($$ select public.transition_job_application(current_setting('fx.d3')::uuid, 'draft', 'under_review') $$,
                 '42501', 'Job application not found.', 'j5_owner_cannot_see_or_transition_drafts');

-- ---------- direct writes ----------
select test_helpers.act_as(pg_temp.w(1));
select is(test_helpers.attempt(format($$ insert into public.job_applications (job_opening_id, worker_id, shop_id, owner_id)
          values (%L, auth.uid(), %L, %L) $$, pg_temp.jo('pause'), current_setting('fx.s1'), current_setting('fx.o1'))),
          '42501', 'j5_direct_writes_rejected');
select is(test_helpers.attempt(format($$ update public.job_applications set status = 'accepted' where id = %L $$, current_setting('fx.d1'))),
          '42501', 'j5_direct_writes_rejected');
select is(test_helpers.attempt(format($$ delete from public.job_applications where id = %L $$, current_setting('fx.d1'))),
          '42501', 'j5_direct_writes_rejected');
select test_helpers.act_as_owner('j5-o1@local.test');
select is(test_helpers.attempt(format($$ update public.job_applications set status = 'accepted' where id = %L $$, pg_temp.app('flow', 4))),
          '42501', 'j5_direct_writes_rejected');
select is(test_helpers.attempt(format($$ delete from public.job_applications where id = %L $$, pg_temp.app('flow', 4))),
          '42501', 'j5_direct_writes_rejected');
select test_helpers.act_as_service();
select is((select status from public.job_applications where id = pg_temp.app('flow', 4)), 'rejected', 'j5_direct_writes_rejected');

-- ---------- full (from, to, actor) matrix; every outcome rolled back ----------
select count(test_helpers.create_job_application(pg_temp.jo('matrix_' || st), pg_temp.w(8), st))
from unnest(array['draft', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn', 'closed']) st;
create temporary table j5_matrix (actor text, from_status text, to_status text, outcome text) on commit drop;
grant all on j5_matrix to public;
create function pg_temp.run_matrix(p_actor text) returns integer language sql
as $$
  insert into j5_matrix
  select p_actor, f, t, pg_temp.try_transition(pg_temp.app('matrix_' || f, 8), f, t)
  from unnest(array['draft', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn', 'closed']) f,
       unnest(array['draft', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn', 'closed', 'bogus']) t;
  select count(*)::int from j5_matrix where actor = p_actor;
$$;
select test_helpers.act_as(pg_temp.w(8));
select is(pg_temp.run_matrix('worker'), 72, 'j5_disallowed_transitions_rejected');
select test_helpers.act_as_owner('j5-o1@local.test');
select is(pg_temp.run_matrix('owner'), 72, 'j5_disallowed_transitions_rejected');
select test_helpers.act_as_owner('j5-o2@local.test');
select is(pg_temp.run_matrix('other_owner'), 72, 'j5_disallowed_transitions_rejected');
select test_helpers.act_as(pg_temp.w(7));
select is(pg_temp.run_matrix('other_worker'), 72, 'j5_disallowed_transitions_rejected');
select test_helpers.act_as_admin('j5-a1@local.test');
select is(pg_temp.run_matrix('super_admin'), 72, 'j5_super_admin_cannot_transition_applications');
select test_helpers.act_as_service();
select is((select array_agg(from_status || '>' || to_status order by from_status, to_status) from j5_matrix
           where actor = 'worker' and outcome = 'allowed'),
          array['accepted>withdrawn', 'draft>submitted', 'shortlisted>withdrawn', 'submitted>withdrawn', 'under_review>withdrawn'],
          'j5_disallowed_transitions_rejected');
select is((select array_agg(from_status || '>' || to_status order by from_status, to_status) from j5_matrix
           where actor = 'owner' and outcome = 'allowed'),
          array['shortlisted>accepted', 'shortlisted>rejected', 'submitted>rejected', 'submitted>under_review',
                'under_review>accepted', 'under_review>rejected', 'under_review>shortlisted'],
          'j5_disallowed_transitions_rejected');
select is((select count(*)::int from j5_matrix where outcome not in ('allowed', '42501')), 0, 'j5_disallowed_transitions_rejected');
select is((select count(*)::int from j5_matrix where actor in ('other_owner', 'other_worker') and outcome <> '42501'), 0,
          'j5_disallowed_transitions_rejected');
select is((select count(*)::int from j5_matrix where to_status = 'closed' and outcome <> '42501'), 0, 'j5_disallowed_transitions_rejected');
select is((select count(*)::int from j5_matrix where actor = 'super_admin' and outcome <> '42501'), 0,
          'j5_super_admin_cannot_transition_applications');
select is((select count(*)::int from public.job_applications a where a.worker_id = pg_temp.w(8)
           and a.status <> substr((select label from j5_openings where id = a.job_opening_id), 8)), 0,
          'j5_disallowed_transitions_rejected');

-- ---------- accept needs a verified shop ----------
select test_helpers.create_job_application(pg_temp.jo('accept'), pg_temp.w(5), 'under_review') is not null as accept_fixture;
select test_helpers.act_as_admin('j5-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Local test: retake photo'
where id = current_setting('fx.s2')::uuid;
select test_helpers.act_as_owner('j5-o1@local.test');
select is((select status from public.transition_job_application(pg_temp.app('accept', 5), 'under_review', 'shortlisted')), 'shortlisted',
          'j5_accept_requires_verified_shop');
select throws_ok($$ select public.transition_job_application(pg_temp.app('accept', 5), 'shortlisted', 'accepted') $$,
                 '42501', 'Only a verified shop can accept applications.', 'j5_accept_requires_verified_shop');

-- ---------- closing an opening closes open applications ----------
select test_helpers.act_as_service();
select count(test_helpers.create_job_application(pg_temp.jo('close'), pg_temp.w(n), st))
from (values (1, 'draft'), (2, 'submitted'), (3, 'under_review'), (4, 'shortlisted'), (5, 'accepted'), (6, 'rejected'), (7, 'withdrawn')) v(n, st);
select test_helpers.act_as_owner('j5-o1@local.test');
select is((select status from public.transition_job_opening(pg_temp.jo('close'), 'published', 'closed')), 'closed',
          'j5_closing_opening_closes_open_applications');
select test_helpers.act_as_service();
select is((select array_agg(n || ':' || a.status order by n) from generate_series(1, 7) n
           join public.job_applications a on a.id = pg_temp.app('close', n)),
          array['1:closed', '2:closed', '3:closed', '4:closed', '5:accepted', '6:rejected', '7:withdrawn'],
          'j5_closing_opening_closes_open_applications');
select is((select count(*)::int from public.job_applications where job_opening_id = pg_temp.jo('close') and status = 'closed'
           and closed_at = now() and status_changed_at = now()), 4, 'j5_closing_opening_closes_open_applications');
select test_helpers.act_as(pg_temp.w(5));
select is((select status from public.transition_job_application(pg_temp.app('close', 5), 'accepted', 'withdrawn')), 'withdrawn',
          'j5_worker_can_withdraw_after_opening_closed');
select test_helpers.act_as_service();
update public.job_applications set status = 'submitted', closed_at = null where id = pg_temp.app('close', 2);
select test_helpers.act_as_owner('j5-o1@local.test');
select throws_ok($$ select public.transition_job_application(pg_temp.app('close', 2), 'submitted', 'under_review') $$,
                 '23514', 'This job opening is closed.', 'j5_owner_transitions_refused_after_opening_closed');
select test_helpers.act_as(pg_temp.w(2));
select is((select status from public.transition_job_application(pg_temp.app('close', 2), 'submitted', 'withdrawn')), 'withdrawn',
          'j5_worker_can_withdraw_after_opening_closed');

select test_helpers.act_as_service();
select count(test_helpers.create_job_application(pg_temp.jo('archive'), pg_temp.w(n), st))
from (values (1, 'submitted'), (2, 'shortlisted'), (3, 'accepted')) v(n, st);
update public.job_openings set status = 'archived' where id = pg_temp.jo('archive');
select is((select array_agg(a.status order by n) from generate_series(1, 3) n join public.job_applications a on a.id = pg_temp.app('archive', n)),
          array['closed', 'closed', 'accepted'], 'j5_archiving_from_trusted_repair_also_closes');
select is((select count(*)::int from public.workforce_audit_events where action = 'job_application.status_changed'
           and subject_id in (pg_temp.app('archive', 1), pg_temp.app('archive', 2)) and payload ->> 'changed_by' = 'opening_closed'),
          2, 'j5_archiving_from_trusted_repair_also_closes');

-- ---------- pause keeps applications open ----------
select count(test_helpers.create_job_application(pg_temp.jo('pause'), pg_temp.w(n), 'submitted')) from generate_series(1, 2) n;
select test_helpers.act_as_owner('j5-o1@local.test');
select is((select status from public.transition_job_opening(pg_temp.jo('pause'), 'published', 'paused')), 'paused',
          'j5_pausing_opening_keeps_applications_open');
select is((select array_agg(status) from public.job_applications where job_opening_id = pg_temp.jo('pause')), array['submitted', 'submitted'],
          'j5_pausing_opening_keeps_applications_open');
select is((select status from public.transition_job_application(pg_temp.app('pause', 1), 'submitted', 'under_review')), 'under_review',
          'j5_pausing_opening_keeps_applications_open');
select test_helpers.act_as(pg_temp.w(2));
select is((select status from public.transition_job_application(pg_temp.app('pause', 2), 'submitted', 'withdrawn')), 'withdrawn',
          'j5_pausing_opening_keeps_applications_open');
select test_helpers.act_as_admin('j5-a1@local.test');
select throws_ok($$ select public.transition_job_application(pg_temp.app('pause', 1), 'under_review', 'rejected') $$,
                 '42501', 'Job application not found.', 'j5_super_admin_cannot_transition_applications');
select is((select count(*)::int from public.job_applications), 0, 'j5_super_admin_cannot_transition_applications');

-- ---------- trusted repair ----------
select test_helpers.act_as_service();
select lives_ok(format($$ update public.job_applications set status = 'submitted' where id = %L $$, pg_temp.app('pause', 1)),
                'j5_trusted_session_repair_is_audited');
select is((select row(actor_kind, actor_id is null, payload ->> 'from_status', payload ->> 'to_status', payload ->> 'changed_by')::text
           from public.workforce_audit_events where action = 'job_application.status_changed'
             and subject_id = pg_temp.app('pause', 1) order by id desc limit 1),
          row('trusted_session', true, 'under_review', 'submitted', 'trusted_session')::text, 'j5_trusted_session_repair_is_audited');
select is((select updated_at = now() from public.job_applications where id = pg_temp.app('pause', 1)), true,
          'j5_trusted_session_repair_is_audited');

select * from finish();
rollback;
