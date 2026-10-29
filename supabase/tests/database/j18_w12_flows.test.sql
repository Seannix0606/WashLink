-- J18 (W12): existing flows with the W12 registry and scheduler in place (W12 PLAN 3.2..3.5, P80, P83). Each W3..W14
-- flow still writes exactly the notices it wrote before W12 (one per step, to the right party, none skipped by the
-- registry); bookings, quotes, ratings and the shop decision path are unchanged; mark_notifications_read is unchanged;
-- the raw W7 / W9 / W10 time-driven functions stay internal and still accept a FUTURE test clock (refuse a past one).
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table j18s_ids (label text primary key, id uuid) on commit drop;
grant all on j18s_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18s_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j18s-' || p_label || '@local.test' $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create temporary table j18s_seen (id uuid) on commit drop;
grant all on j18s_seen to public;
-- New notices since the previous call: 'recipient label:category' (created_at is constant in one transaction, so sorted by
-- label and category); marks them seen.
create function pg_temp.step() returns text language plpgsql security definer as $$
declare
  result text;
begin
  select coalesce(string_agg(coalesce(i.label, '?') || ':' || n.category, ',' order by n.created_at, i.label, n.category), '-') into result
  from public.notifications n left join j18s_ids i on i.id = n.recipient_id where n.id not in (select s.id from j18s_seen s);
  insert into j18s_seen select n.id from public.notifications n where n.id not in (select s.id from j18s_seen s);
  return result;
end $$;
insert into j18s_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j18s_ids values ('cu', test_helpers.create_customer(pg_temp.email('cu')));
insert into j18s_ids values ('o1', test_helpers.create_owner(pg_temp.email('o1')));
insert into j18s_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('w' || n))) from generate_series(1, 3) n;
insert into j18s_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
  ('s2', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j18s_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'J18S opening')));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w2')) is not null as w2_applied;
select pg_temp.step() is not null as baseline;

-- ---------- W3..W14 notices: one per step to the right party ----------
select test_helpers.act_as_admin(pg_temp.email('a1'));
update public.shops set verification_status = 'changes_requested', verification_notes = 'Please upload a clearer permit photo here' where id = pg_temp.id('s2');
select test_helpers.act_as_service();
select is(pg_temp.step(), 'o1:shop_verification.status_changed', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
select test_helpers.act_as_worker(pg_temp.email('w1'));
insert into j18s_ids values ('ap1', (public.create_job_application(pg_temp.id('j1'), 'Ready to start next week.', true, 'w5_v1')).id);
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.transition_job_application(pg_temp.id('ap1'), 'submitted', 'under_review')).status;
select test_helpers.act_as_worker(pg_temp.email('w1'));
select (public.transition_job_application(pg_temp.id('ap1'), 'under_review', 'withdrawn')).status;
select test_helpers.act_as_service();
select is(pg_temp.step(), 'o1:job_application.submitted,o1:job_application.withdrawn,w1:job_application.status_changed',
          'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
insert into j18s_ids values ('c3', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('w3'), pg_temp.email('o1')));
select is(pg_temp.step(), 'w3:certification.issued,w3:training.assessment', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
select test_helpers.suspend_test_certification(pg_temp.id('c3'), pg_temp.email('o1')) is not null as suspended;
select is(pg_temp.step(), 'w3:certification.suspended', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
insert into j18s_ids values ('k2', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w2')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k2'), pg_temp.email('o1'));
select test_helpers.send_test_contract(pg_temp.id('k2'), pg_temp.email('o1'));
select is(pg_temp.step(), 'w2:worker_contract', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
select test_helpers.accept_test_contract(pg_temp.id('k2'), pg_temp.email('w2'));
select is(pg_temp.step(), 'o1:worker_contract', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.activate_worker_contract(pg_temp.id('k2'), pg_temp.rev('k2'))).status;
select test_helpers.act_as_service();
select is(pg_temp.step(), 'w2:worker_contract', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
insert into j18s_ids values ('d2', test_helpers.raise_test_contract_dispute(pg_temp.id('k2'), pg_temp.email('w2')));
select is(pg_temp.step(), 'o1:worker_contract_dispute.raised', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');
insert into j18s_ids values ('rp', test_helpers.report_test_job_opening(pg_temp.id('j1'), pg_temp.email('w3')));
insert into j18s_ids select 'case', case_id from public.job_opening_reports where id = pg_temp.id('rp');
select test_helpers.act_as_admin(pg_temp.email('a1'));
select (public.moderate_job_opening(pg_temp.id('case'), 1, 'dismiss', null, null, 'The posting follows the rules after review.')).status;
select test_helpers.act_as_service();
select is(pg_temp.step(), 'w3:job_opening_report.closed', 'j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow');

-- ---------- bookings, quotes, ratings ----------
insert into j18s_ids values ('b1', test_helpers.create_booking_fixture(pg_temp.id('cu'), pg_temp.id('s1'), 'completed'));
select test_helpers.act_as_customer(pg_temp.email('cu'));
select lives_ok(format($$ update public.bookings set customer_rating_stars = 5 where id = %L $$, pg_temp.id('b1')),
                'j18_w12_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
select is((select quoted_price::text || ',' || customer_rating_stars from public.bookings where id = pg_temp.id('b1'))
          || ',' || (select verification_status || ':' || public.shop_has_recorded_verification(id) from public.shops where id = pg_temp.id('s2'))
          || ',' || pg_temp.step(), '250.00,5,changes_requested:false,-', 'j18_w12_booking_quote_rating_and_verification_unchanged');

-- ---------- mark_notifications_read ----------
select test_helpers.act_as_owner(pg_temp.email('o1'));
select is(public.mark_notifications_read(array[(select id from public.notifications where category = 'worker_contract' order by created_at limit 1),
                                               gen_random_uuid()]), 1, 'j18_w12_mark_notifications_read_unchanged');
select is(public.mark_notifications_read() || ',' || public.mark_notifications_read(), '4,0', 'j18_w12_mark_notifications_read_unchanged');
select test_helpers.act_as_service();

-- ---------- the raw W7 / W9 / W10 time-driven functions ----------
select is((select count(*)::int from unnest(array['enqueue_certification_expiry_notices(timestamptz)', 'expire_worker_contracts(date)',
                                                  'refresh_worker_owner_relationships(date)', 'refresh_worker_owner_relationship(uuid, uuid, date)']) f,
                  unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.' || f, 'execute')), 0, 'j18_w12_raw_w7_w9_w10_functions_still_internal_and_accept_test_clock');
select is(array[public.enqueue_certification_expiry_notices(now() + interval '400 days'), public.expire_worker_contracts(test_helpers.manila_today() + 1),
                public.refresh_worker_owner_relationships(test_helpers.manila_today() + 1)], array[0, 0, 0],
          'j18_w12_raw_w7_w9_w10_functions_still_internal_and_accept_test_clock');
select is(array[test_helpers.attempt($$ select public.enqueue_certification_expiry_notices(now() - interval '1 day') $$),
                test_helpers.attempt($$ select public.expire_worker_contracts(current_date - 10) $$),
                test_helpers.attempt($$ select public.refresh_worker_owner_relationships(current_date - 10) $$)],
          array['22023', '22023', '22023'], 'j18_w12_raw_w7_w9_w10_functions_still_internal_and_accept_test_clock');

select * from finish();
rollback;
