-- J16 / W15 (PLAN section 6; D-79): keying the training booking gate on roster link history refuses no unlink, withdraw,
-- decline or re-link. A worker can always leave a roster row or a training, and an owner can always end a link.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temporary table j16w15_ids (label text primary key, id uuid) on commit drop;
grant all on j16w15_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j16w15_ids where label = p_label $$;
create function pg_temp.link_of(p_row text) returns text language sql stable security definer as $$
  select coalesce((select u.email from public.workers w join auth.users u on u.id = w.user_id where w.id = pg_temp.id(p_row)), '-') $$;
create function pg_temp.enrollment(p_label text) returns text language sql stable security definer as $$
  select status from public.training_enrollments where id = pg_temp.id(p_label) $$;

-- ---------- fixtures: verified s1 of o1, open required program p1, trainees wa / wb linked to ra / rb ----------
insert into j16w15_ids values ('a1', test_helpers.create_super_admin('j16w15-a1@local.test')), ('o1', test_helpers.create_owner('j16w15-o1@local.test'));
insert into j16w15_ids select l, test_helpers.create_worker_profile(test_helpers.create_worker('j16w15-' || l || '@local.test'))
from unnest(array['wa', 'wb', 'wd']) l;
insert into j16w15_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j16w15_ids values ('p1', test_helpers.create_training_program(pg_temp.id('s1'))),
                              ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'J16 W15 opening')));
select count(test_helpers.add_training_session(pg_temp.id('p1'), test_helpers.manila_today() + n)) as sessions from generate_series(1, 3) n;
select test_helpers.open_training_program(pg_temp.id('p1')) is not null as opened;
insert into j16w15_ids select 'r' || substr(l, 2), test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id(l)) from unnest(array['wa', 'wb', 'wd']) l;
insert into j16w15_ids select 'e' || substr(l, 2), test_helpers.create_accepted_enrollment(pg_temp.id('p1'), pg_temp.id(l)) from unnest(array['wa', 'wb']) l;
insert into j16w15_ids values ('appd', test_helpers.create_job_application(pg_temp.id('j1'), pg_temp.id('wd'), 'accepted'));

-- ---------- the worker unlinks the own row during required training ----------
select test_helpers.act_as_worker('j16w15-wa@local.test');
select lives_ok(format('select public.unlink_my_roster_entry(%L)', pg_temp.id('ra')), 'j16_w15_worker_unlinks_own_row_during_required_training');
select test_helpers.act_as_service();
select is(pg_temp.link_of('ra') || ',' || pg_temp.enrollment('ea'), '-,accepted', 'j16_w15_worker_unlinks_own_row_during_required_training');

-- ---------- the owner's unlink of a trainee row is not refused ----------
select test_helpers.act_as_owner('j16w15-o1@local.test');
select is(test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('rb'))), 'succeeded',
          'j16_w15_owner_unlink_during_required_training_not_refused');
select test_helpers.act_as_service();
select is(pg_temp.link_of('rb') || ',' || pg_temp.enrollment('eb'), '-,accepted', 'j16_w15_owner_unlink_during_required_training_not_refused');

-- ---------- the worker withdraws after the unlink ----------
select test_helpers.act_as_worker('j16w15-wa@local.test');
select is((public.withdraw_from_training(pg_temp.id('ea'))).status, 'withdrawn', 'j16_w15_worker_withdraws_after_unlink');
select test_helpers.act_as_service();
select is(pg_temp.enrollment('ea'), 'withdrawn', 'j16_w15_worker_withdraws_after_unlink');

-- ---------- a worker with a history row declines an invitation ----------
select is((select count(*)::int from public.roster_link_history where worker_row_id = pg_temp.id('rd') and user_id = pg_temp.id('wd')), 1,
          'j16_w15_worker_declines_invitation_with_history_row');
select test_helpers.act_as_owner('j16w15-o1@local.test');
insert into j16w15_ids select 'ed', (public.invite_to_training(pg_temp.id('p1'), pg_temp.id('appd'))).id;
select test_helpers.act_as_worker('j16w15-wd@local.test');
select is((public.respond_to_training_invitation(pg_temp.id('ed'), false)).status, 'declined', 'j16_w15_worker_declines_invitation_with_history_row');
select test_helpers.act_as_service();
select is(pg_temp.enrollment('ed') || ',' || pg_temp.link_of('rd'), 'declined,j16w15-wd@local.test', 'j16_w15_worker_declines_invitation_with_history_row');

-- ---------- the worker re-links after the unlink (new code accepted) ----------
select test_helpers.act_as_owner('j16w15-o1@local.test');
select set_config('fx.code_a', (select link_code from public.create_roster_link_code(pg_temp.id('ra'))), true);
select test_helpers.act_as_worker('j16w15-wa@local.test');
select is((select result from public.accept_roster_link_code(current_setting('fx.code_a'))), 'linked', 'j16_w15_worker_relinks_after_unlink');
select test_helpers.act_as_service();
select is(pg_temp.link_of('ra'), 'j16w15-wa@local.test', 'j16_w15_worker_relinks_after_unlink');
select is((select count(*)::int from public.roster_link_history where worker_row_id = pg_temp.id('ra')), 1, 'j16_w15_worker_relinks_after_unlink');

select * from finish();
rollback;
