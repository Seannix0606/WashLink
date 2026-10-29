-- J2 (W14): worker reports of job openings (W14 PLAN 3.4, D-50, P73). Only a worker with a worker profile who can read
-- the opening reports it (published at a shop with a recorded verification, or non-draft and applied); six categories;
-- statement 20..1000; one open report per worker and opening; at most 3 reports per worker and opening and 10 open per
-- worker; reported_snapshot written once; a second reporter joins the active case; the reporter withdraws. Local Docker
-- stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create temporary table j2r_ids (label text primary key, id uuid) on commit drop;
grant all on j2r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j2r_ids where label = p_label $$;
insert into j2r_ids values ('a1', test_helpers.create_super_admin('j2r-a1@local.test'));
insert into j2r_ids values ('o1', test_helpers.create_owner('j2r-o1@local.test'));
insert into j2r_ids values ('cu', test_helpers.create_customer('j2r-cu@local.test'));
insert into j2r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j2r-w' || n || '@local.test')) from generate_series(1, 4) n;
insert into j2r_ids values ('tr', test_helpers.create_worker('j2r-tr@local.test'));
insert into j2r_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j2r_ids values ('s2', test_helpers.create_shop(pg_temp.id('o1')));   -- approved without a recorded review
insert into j2r_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test washer')));
insert into j2r_ids values ('jd', test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test draft'));
insert into j2r_ids values ('ju', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s2'), 'Local test unverified')));
insert into j2r_ids values ('jp', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test paused')));
select test_helpers.create_job_application(pg_temp.id('jp'), pg_temp.id('w2')) is not null as applied;
update public.job_openings set status = 'paused', status_changed_at = now() where id = pg_temp.id('jp');
insert into j2r_ids select 'jl' || n, test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test limit ' || n))
  from generate_series(1, 11) n;
select test_helpers.designate_trainer(test_helpers.create_training_program(pg_temp.id('s1')),
                                      test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('tr'))) is not null as trainer;
create function pg_temp.report(p_opening uuid, p_category text default 'age_requirement',
                               p_statement text default 'This local test posting asks for an age limit') returns text language sql as $$
  select test_helpers.attempt(format('select public.report_job_opening(%L, %L, %L)', p_opening, p_category, p_statement)) $$;
create function pg_temp.withdraw_open(p_opening uuid) returns text language sql as $$
  select test_helpers.attempt(format('select public.withdraw_job_opening_report(%L)',
    (select m.report_id from public.my_job_opening_reports() m where m.job_opening_id = p_opening and m.status = 'open'))) $$;

-- ---------- reports ----------
insert into j2r_ids values ('r1', test_helpers.report_test_job_opening(pg_temp.id('j1'), 'j2r-w1@local.test'));
select ok(pg_temp.id('r1') is not null, 'w14_worker_reports_published_opening');
select is((select r.status || ',' || r.category || ',' || r.opening_status_at_report || ',' || c.status || ',' || c.opening_title_snapshot
           from public.job_opening_reports r join public.job_opening_moderation_cases c on c.id = r.case_id where r.id = pg_temp.id('r1')),
          'open,age_requirement,published,open,Local test washer', 'w14_worker_reports_published_opening');
select is((select reporter_id from public.job_opening_reports where id = pg_temp.id('r1')), pg_temp.id('w1'), 'w14_worker_reports_published_opening');
select test_helpers.act_as_worker('j2r-w1@local.test');
select is((select count(*)::int from public.my_job_opening_reports() where report_id = pg_temp.id('r1') and can_withdraw and status = 'open'), 1,
          'w14_worker_reports_published_opening');
select test_helpers.act_as_service();

insert into j2r_ids values ('r2', test_helpers.report_test_job_opening(pg_temp.id('jp'), 'j2r-w2@local.test', 'worker_fee_or_deposit',
                                                                       'The applied posting asks for a cash deposit first'));
select is((select opening_status_at_report || ',' || category from public.job_opening_reports where id = pg_temp.id('r2')),
          'paused,worker_fee_or_deposit', 'w14_worker_reports_applied_paused_opening');

select test_helpers.act_as_worker('j2r-w1@local.test');
select is(array[pg_temp.report(pg_temp.id('jp')), pg_temp.report(pg_temp.id('jd')), pg_temp.report(pg_temp.id('ju')), pg_temp.report(gen_random_uuid())],
          array['42501', '42501', '42501', '42501'], 'w14_report_refused_for_unreadable_or_draft_opening');
select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jd'), 'other', 'This draft should not be reportable'),
                 '42501', 'Job opening not found.', 'w14_report_refused_for_unreadable_or_draft_opening');

select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jl1'), 'rude_owner', 'This posting is not acceptable at all'),
                 '22023', 'Choose a report reason.', 'w14_report_category_22023_and_statement_23514');
select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jl1'), null, 'This posting is not acceptable at all'),
                 '22023', 'Choose a report reason.', 'w14_report_category_22023_and_statement_23514');
select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jl1'), 'other', '   too short   '),
                 '23514', 'Write 20 to 1000 characters.', 'w14_report_category_22023_and_statement_23514');
select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jl1'), 'other', repeat('x', 1001)),
                 '23514', 'Write 20 to 1000 characters.', 'w14_report_category_22023_and_statement_23514');

select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('j1'), 'misleading_terms', 'A second report of the same posting'),
                 '23505', 'You already reported this job opening.', 'w14_duplicate_open_report_23505');
select test_helpers.act_as_service();
select is((select count(*)::int from public.job_opening_reports where reporter_id = pg_temp.id('w1')), 1, 'w14_duplicate_open_report_23505');

-- ---------- limits: 10 open per worker, 3 per worker and opening ----------
select test_helpers.act_as_worker('j2r-w3@local.test');
select is((select array_agg(pg_temp.report(pg_temp.id('jl' || n)) order by n) from generate_series(1, 10) n), array_fill('succeeded'::text, array[10]),
          'w14_report_limits_23514');
select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jl11'), 'other', 'One report too many for this worker'),
                 '23514', 'You have reached the report limit. Wait for WashLink to review your reports.', 'w14_report_limits_23514');
select test_helpers.act_as_worker('j2r-w4@local.test');
select is(pg_temp.report(pg_temp.id('jl11')), 'succeeded', 'w14_report_limits_23514');
select is(pg_temp.withdraw_open(pg_temp.id('jl11')), 'succeeded', 'w14_report_limits_23514');
select is(pg_temp.report(pg_temp.id('jl11')), 'succeeded', 'w14_report_limits_23514');
select is(pg_temp.withdraw_open(pg_temp.id('jl11')), 'succeeded', 'w14_report_limits_23514');
select is(pg_temp.report(pg_temp.id('jl11')), 'succeeded', 'w14_report_limits_23514');
select is(pg_temp.withdraw_open(pg_temp.id('jl11')), 'succeeded', 'w14_report_limits_23514');
select throws_ok(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jl11'), 'other', 'A fourth report of the same posting'),
                 '23514', 'You have reached the report limit. Wait for WashLink to review your reports.', 'w14_report_limits_23514');

-- ---------- snapshot written once ----------
select test_helpers.act_as_service();
select set_config('fx.snap', (select reported_snapshot::text from public.job_opening_reports where id = pg_temp.id('r1')), true);
select test_helpers.act_as_owner('j2r-o1@local.test');
update public.job_openings set benefits = 'Free lunch every working day' where id = pg_temp.id('j1');
select test_helpers.act_as_service();
select is(array[test_helpers.attempt(format($$ update public.job_opening_reports set reported_snapshot = '{}'::jsonb where id = %L $$, pg_temp.id('r1'))),
                (select set_config('washlink.job_opening_report_write', pg_temp.id('r1')::text, true) is not null)::text,
                test_helpers.attempt(format($$ update public.job_opening_reports set reported_snapshot = '{}'::jsonb where id = %L $$, pg_temp.id('r1')))],
          array['42501', 'true', '42501'], 'w14_reported_snapshot_write_once');
select set_config('washlink.job_opening_report_write', '', true);
select is((select reported_snapshot::text from public.job_opening_reports where id = pg_temp.id('r1')), current_setting('fx.snap'),
          'w14_reported_snapshot_write_once');
select ok((select reported_snapshot ->> 'benefits' is null and reported_snapshot ->> 'title' = 'Local test washer'
           from public.job_opening_reports where id = pg_temp.id('r1')), 'w14_reported_snapshot_write_once');

-- ---------- second reporter joins the active case ----------
insert into j2r_ids values ('r3', test_helpers.report_test_job_opening(pg_temp.id('j1'), 'j2r-w2@local.test', 'misleading_terms',
                                                                       'The pay shown in this posting is misleading'));
select is((select count(distinct case_id)::int || ',' || count(*)::int from public.job_opening_reports where job_opening_id = pg_temp.id('j1')),
          '1,2', 'w14_second_reporter_joins_active_case');

-- ---------- withdraw ----------
select test_helpers.act_as_worker('j2r-w2@local.test');
select throws_ok(format('select public.withdraw_job_opening_report(%L)', pg_temp.id('r1')), '42501', 'Report not found.',
                 'w14_reporter_withdraws_open_report');
select test_helpers.act_as_worker('j2r-w1@local.test');
select is((select status from public.withdraw_job_opening_report(pg_temp.id('r1'))), 'withdrawn', 'w14_reporter_withdraws_open_report');
select throws_ok(format('select public.withdraw_job_opening_report(%L)', pg_temp.id('r1')), '23514', 'This report is no longer open.',
                 'w14_reporter_withdraws_open_report');

-- ---------- owner, customer and trainer cannot report ----------
select test_helpers.act_as_owner('j2r-o1@local.test');
select set_config('fx.o', pg_temp.report(pg_temp.id('j1')), true);
select test_helpers.act_as_customer('j2r-cu@local.test');
select set_config('fx.c', pg_temp.report(pg_temp.id('j1')), true);
select test_helpers.act_as_worker('j2r-tr@local.test');
select is(array[current_setting('fx.o'), current_setting('fx.c'), pg_temp.report(pg_temp.id('j1'))], array['42501', '42501', '42501'],
          'w14_owner_customer_trainer_cannot_report');

select * from finish();
rollback;
