-- J2 (W13): the keyset-paged super_admin moderation queue (W13 PLAN 3.3, section 6 test 4; D-71; closes W14 N3).
-- admin_job_opening_moderation_queue_page returns the w14e queue columns plus total_count, oldest first (opened_at, id),
-- in pages of p_limit (default 50, 1..100) after a two-part cursor; it is super_admin only (0 rows for other signed-in
-- roles; anon and service_role cannot execute), returns no statement, reporter or note, and its rows equal the rows of the
-- unchanged 200-row W14 queue. Seven active cases (opened 70..10 minutes ago, the newest now) and one dismissed case,
-- all through the real report_job_opening / moderate_job_opening RPCs. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create temporary table j2q_ids (label text primary key, id uuid) on commit drop;
grant all on j2q_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j2q_ids where label = p_label $$;
insert into j2q_ids values ('a1', test_helpers.create_super_admin('j2q-a1@local.test'));
insert into j2q_ids values ('o1', test_helpers.create_owner('j2q-o1@local.test'));
insert into j2q_ids values ('cu', test_helpers.create_customer('j2q-cu@local.test'));
insert into j2q_ids values ('w1', test_helpers.create_worker_profile(test_helpers.create_worker('j2q-w1@local.test')));
insert into j2q_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j2q_ids select 'j' || n, test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test queue opening ' || n))
  from generate_series(1, 8) n;
insert into j2q_ids select 'r' || n, test_helpers.report_test_job_opening(pg_temp.id('j' || n), 'j2q-w1@local.test') from generate_series(1, 8) n;
insert into j2q_ids select 'c' || n, r.case_id from generate_series(1, 8) n join public.job_opening_reports r on r.id = pg_temp.id('r' || n);
-- c1 oldest (70 minutes ago) .. c6 (20 minutes ago), c7 opened now; c8 (80 minutes ago) is dismissed.
select count(test_helpers.backdate_test_moderation_case(pg_temp.id('c' || n), (8 - n) * 10)) as backdated from generate_series(1, 6) n;
select test_helpers.backdate_test_moderation_case(pg_temp.id('c8'), 80) is not null as backdated_dismissed;
select set_config('fx.lifted', (select count(*)::text from public.job_opening_moderation_cases where status = 'lifted'), true);
select test_helpers.act_as_admin('j2q-a1@local.test');
select (public.moderate_job_opening(pg_temp.id('c8'), 1, 'dismiss', null, null, 'The posting follows the rules after review.')).status;
select test_helpers.act_as_service();
select set_config('fx.dismissed', (select count(*)::text from public.job_opening_moderation_cases where status = 'dismissed'), true);
select test_helpers.act_as_admin('j2q-a1@local.test');

create temporary table j2q_pages (page integer, pos integer, case_id uuid, opened_at timestamptz, total_count integer) on commit drop;
grant all on j2q_pages to public;
create function pg_temp.walk(p_limit integer) returns text language plpgsql as $$
declare
  page_no integer := 0;
  last_at timestamptz;
  last_id uuid;
  got integer;
  sizes text := '';
begin
  loop
    page_no := page_no + 1;
    insert into j2q_pages
    select page_no, row_number() over (order by q.opened_at, q.case_id), q.case_id, q.opened_at, q.total_count
    from public.admin_job_opening_moderation_queue_page('active', last_at, last_id, p_limit) q;
    get diagnostics got = row_count;
    sizes := sizes || case when page_no > 1 then ',' else '' end || got;
    exit when got = 0 or page_no > 10;
    select p.opened_at, p.case_id into last_at, last_id from j2q_pages p where p.page = page_no order by p.pos desc limit 1;
  end loop;
  return sizes;
end $$;
create function pg_temp.page_ids(p_status text, p_limit integer default 50) returns text language sql as $$
  select coalesce(string_agg(q.case_id::text, ',' order by q.opened_at, q.case_id), '-')
  from public.admin_job_opening_moderation_queue_page(p_status, null, null, p_limit) q $$;
create function pg_temp.expected_ids(p_labels text[]) returns text language sql as $$
  select string_agg(pg_temp.id(l)::text, ',' order by o) from unnest(p_labels) with ordinality as x(l, o) $$;
create function pg_temp.attempt_page(p_args text) returns text language sql as $$
  select test_helpers.attempt('select count(*) from public.admin_job_opening_moderation_queue_page(' || p_args || ')') $$;

-- ---------- default call: oldest first, pages of 50 ----------
select is((select count(*)::int from public.admin_job_opening_moderation_queue_page()), 7, 'w13_queue_page_oldest_first_default_50');
select is(pg_temp.page_ids('active'), pg_temp.expected_ids(array['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']), 'w13_queue_page_oldest_first_default_50');
select is((select pg_get_function_arguments(oid) from pg_proc
           where oid = 'public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer)'::regprocedure),
          'p_status text DEFAULT ''active''::text, p_after_opened_at timestamp with time zone DEFAULT NULL::timestamp with time zone, '
          || 'p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50', 'w13_queue_page_oldest_first_default_50');

-- ---------- keyset walk: 3 + 3 + 1, then an empty page; no gaps or duplicates ----------
select is(pg_temp.walk(3), '3,3,1,0', 'w13_queue_page_keyset_no_gaps_or_duplicates');
select is((select string_agg(case_id::text, ',' order by page, pos) from j2q_pages), pg_temp.page_ids('active'),
          'w13_queue_page_keyset_no_gaps_or_duplicates');
select is((select count(distinct case_id)::int || ',' || count(*)::int from j2q_pages), '7,7', 'w13_queue_page_keyset_no_gaps_or_duplicates');
-- Two cases with the same opened_at are split by id (the cursor's second part).
select test_helpers.act_as_service();
select test_helpers.backdate_test_moderation_case(pg_temp.id('c3'), 10) is not null as tie;   -- c3 now opened with c2
select test_helpers.act_as_admin('j2q-a1@local.test');
delete from j2q_pages;
select is(pg_temp.walk(2), '2,2,2,1,0', 'w13_queue_page_keyset_no_gaps_or_duplicates');
select is((select string_agg(case_id::text, ',' order by page, pos) from j2q_pages), pg_temp.page_ids('active'),
          'w13_queue_page_keyset_no_gaps_or_duplicates');

-- ---------- total_count = every case matching the status filter, on every page ----------
select is((select string_agg(distinct total_count::text, ',') from j2q_pages), '7', 'w13_queue_page_total_count_matches_filter');
select is((select string_agg(distinct q.total_count::text, ',') from public.admin_job_opening_moderation_queue_page('dismissed', null, null, 1) q),
          current_setting('fx.dismissed'), 'w13_queue_page_total_count_matches_filter');
select ok(pg_temp.id('c8') in (select q.case_id from public.admin_job_opening_moderation_queue_page('dismissed', null, null, 100) q),
          'w13_queue_page_total_count_matches_filter');
select is((select count(*)::int from public.admin_job_opening_moderation_queue_page('lifted', null, null, 100)), current_setting('fx.lifted')::int,
          'w13_queue_page_total_count_matches_filter');

-- ---------- the newest case is reachable (the old queue stops at 200; the page walk never does) ----------
select is((select case_id from j2q_pages order by page desc, pos desc limit 1), pg_temp.id('c7'), 'w13_queue_page_newest_case_reachable');
select is((select q.case_id from public.admin_job_opening_moderation_queue_page('active', (select opened_at from j2q_pages where case_id = pg_temp.id('c6')),
                                                                                pg_temp.id('c6'), 1) q), pg_temp.id('c7'),
          'w13_queue_page_newest_case_reachable');

-- ---------- same rows as the W14 queue (every column but total_count) ----------
select is((select string_agg(to_jsonb(q)::text, '|' order by q.opened_at, q.case_id)
           from (select case_id, status, revision, report_count, open_report_count, categories, opening_status, opening_present,
                        opening_title_snapshot, shop_name_snapshot, opened_at, status_changed_at
                 from public.admin_job_opening_moderation_queue_page('active', null, null, 100)) q),
          (select string_agg(to_jsonb(q)::text, '|' order by q.opened_at, q.case_id) from public.admin_job_opening_moderation_queue('active') q),
          'w13_queue_page_rows_equal_old_queue_rows');
select is((select string_agg(to_jsonb(q)::text, '|' order by q.opened_at, q.case_id)
           from (select case_id, status, revision, report_count, open_report_count, categories, opening_status, opening_present,
                        opening_title_snapshot, shop_name_snapshot, opened_at, status_changed_at
                 from public.admin_job_opening_moderation_queue_page('dismissed', null, null, 100)) q),
          (select string_agg(to_jsonb(q)::text, '|' order by q.opened_at, q.case_id) from public.admin_job_opening_moderation_queue('dismissed') q),
          'w13_queue_page_rows_equal_old_queue_rows');

-- ---------- validation (22023) ----------
select is(array[pg_temp.attempt_page('''active'', null, null, 0'), pg_temp.attempt_page('''active'', null, null, 101'),
                pg_temp.attempt_page('''active'', null, null, null'), pg_temp.attempt_page('''active'', null, null, 1'),
                pg_temp.attempt_page('''active'', null, null, 100')],
          array['22023', '22023', '22023', 'succeeded', 'succeeded'], 'w13_queue_page_limit_bounds_22023');
select throws_ok('select * from public.admin_job_opening_moderation_queue_page(''active'', null, null, 0)', '22023',
                 'Page size must be between 1 and 100.', 'w13_queue_page_limit_bounds_22023');
select is(array[pg_temp.attempt_page('''active'', now(), null, 3'), pg_temp.attempt_page(format('''active'', null, %L, 3', pg_temp.id('c1'))),
                pg_temp.attempt_page('''bogus'', null, null, 3')],
          array['22023', '22023', '22023'], 'w13_queue_page_cursor_needs_both_parts_22023');
select throws_ok(format('select * from public.admin_job_opening_moderation_queue_page(%L, null, %L, 3)', 'active', pg_temp.id('c1')), '22023',
                 'Give both parts of the page cursor.', 'w13_queue_page_cursor_needs_both_parts_22023');

-- ---------- super_admin only ----------
select test_helpers.act_as_owner('j2q-o1@local.test');
select is((select count(*)::int from public.admin_job_opening_moderation_queue_page()), 0, 'w13_queue_page_super_admin_only');
select test_helpers.act_as_worker('j2q-w1@local.test');
select is((select count(*)::int from public.admin_job_opening_moderation_queue_page()), 0, 'w13_queue_page_super_admin_only');
select test_helpers.act_as_customer('j2q-cu@local.test');
select is((select count(*)::int from public.admin_job_opening_moderation_queue_page()), 0, 'w13_queue_page_super_admin_only');
select test_helpers.act_as_anon();
select is(pg_temp.attempt_page(''), '42501', 'w13_queue_page_super_admin_only');
select test_helpers.act_as_service();
select ok(has_function_privilege('authenticated', 'public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer)', 'execute')
          and not has_function_privilege('anon', 'public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer)', 'execute')
          and not has_function_privilege('service_role', 'public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer)', 'execute'),
          'w13_queue_page_super_admin_only');

-- ---------- no statements, reporters or notes; definer with a pinned search_path; W13 comment ----------
select is((select array_to_string(p.proargnames[5:], ',') from pg_proc p
           where p.oid = 'public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer)'::regprocedure),
          'case_id,status,revision,report_count,open_report_count,categories,opening_status,opening_present,opening_title_snapshot,'
          || 'shop_name_snapshot,opened_at,status_changed_at,total_count', 'w13_queue_page_has_no_statement_reporter_or_note_columns');
select ok((select p.prosecdef and p.proconfig = array['search_path=public, pg_temp'] and p.provolatile = 's'
                  and obj_description(p.oid, 'pg_proc') like 'W13%'
                  and array_to_string(p.proargnames, ',') !~ '(statement|reporter|note|message|admin)'
           from pg_proc p where p.oid = 'public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer)'::regprocedure),
          'w13_queue_page_has_no_statement_reporter_or_note_columns');

select * from finish();
rollback;
