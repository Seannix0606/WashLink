-- J18 (W11): retention flows and unchanged existing flows with the W11 holds and tables. Owner account deletion keeps
-- the WashLink review (now issuer_unavailable for any later one) and the reported problem (raiser id nulled, role kept);
-- worker account deletion removes the worker's reviews and the problems of never-accepted contracts (both audited) and
-- keeps the problems of accepted contracts; bookings, quotes, ratings and the shop verification review are unchanged;
-- the W7 shop review, W9 contract and W10 relationship lifecycles behave as before. Local Docker stack only; backdating
-- a shop request is a TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18o-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j18o-cu@local.test')::text, true);
create temporary table j18o_ids (label text primary key, id uuid) on commit drop;
grant all on j18o_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18o_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
insert into j18o_ids select 'o' || n, test_helpers.create_owner('j18o-o' || n || '@local.test') from generate_series(1, 4) n;
insert into j18o_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j18o-w' || n || '@local.test')) from generate_series(1, 4) n;
insert into j18o_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 4) n;
insert into j18o_ids values ('c1', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('w1'), 'j18o-o1@local.test')),
  ('c2', test_helpers.issue_test_certification(pg_temp.id('s2'), pg_temp.id('w2'), 'j18o-o2@local.test'));
select count(test_helpers.suspend_test_certification(pg_temp.id(c), o)) as suspended
from (values ('c1', 'j18o-o1@local.test'), ('c2', 'j18o-o2@local.test')) v(c, o);
insert into j18o_ids values ('r1', test_helpers.request_test_shop_review(pg_temp.id('c1'), 'j18o-w1@local.test')),
  ('r2', test_helpers.request_test_shop_review(pg_temp.id('c2'), 'j18o-w2@local.test'));
select count(test_helpers.backdate_shop_review_request(pg_temp.id(r), 15)) as overdue from unnest(array['r1', 'r2']) r;
create function pg_temp.open(p_n int) returns uuid language plpgsql as $$
begin
  perform test_helpers.act_as_worker('j18o-w' || p_n || '@local.test');
  insert into j18o_ids values ('rv' || p_n, (public.open_certification_platform_review(pg_temp.id('c' || p_n), 'suspended',
                                             'Please review the shop decision on my certificate')).id);
  perform test_helpers.act_as_service();
  return pg_temp.id('rv' || p_n);
end $$;
select count(pg_temp.open(n)) as opened from generate_series(1, 2) n;
insert into j18o_ids values ('k1', test_helpers.create_active_test_contract('j18o-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j18o-w1@local.test')),
  ('k3', test_helpers.create_active_test_contract('j18o-o3@local.test', pg_temp.id('s3'), pg_temp.id('w2'), 'j18o-w2@local.test'));
select test_helpers.create_accepted_application(pg_temp.id('s2'), pg_temp.id('w2')) is not null as w2_applied;
insert into j18o_ids values ('k2', test_helpers.create_test_contract_draft('j18o-o2@local.test', pg_temp.id('s2'), pg_temp.id('w2')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k2'), 'j18o-o2@local.test') is not null as filled,
       test_helpers.send_test_contract(pg_temp.id('k2'), 'j18o-o2@local.test') is not null as sent;
insert into j18o_ids values ('d1', test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j18o-o1@local.test')),
  ('d2', test_helpers.raise_test_contract_dispute(pg_temp.id('k2'), 'j18o-w2@local.test')),
  ('d3', test_helpers.raise_test_contract_dispute(pg_temp.id('k3'), 'j18o-w2@local.test'));

-- ---------- owner account deletion ----------
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('o1')), 'j18_w11_owner_account_deletion_keeps_review_and_dispute');
select is((select row(p.status, c.owner_id is null, c.status)::text from public.certification_platform_reviews p join public.certifications c on c.id = p.certification_id
           where p.id = pg_temp.id('rv1')), '(open,t,suspended)', 'j18_w11_owner_account_deletion_keeps_review_and_dispute');
select is((select row(d.status, d.raised_by is null, d.raised_by_role, k.owner_id is null)::text from public.worker_contract_disputes d
           join public.worker_contracts k on k.id = d.contract_id where d.id = pg_temp.id('d1')), '(open,t,owner,t)',
          'j18_w11_owner_account_deletion_keeps_review_and_dispute');
select test_helpers.act_as_worker('j18o-w1@local.test');
select is((select row(m.raised_by_me, m.can_respond, m.status)::text from public.my_contract_disputes() m where m.dispute_id = pg_temp.id('d1')), '(f,t,open)',
          'j18_w11_owner_account_deletion_keeps_review_and_dispute');
select test_helpers.act_as_admin('j18o-a1@local.test');
select is((public.decide_certification_platform_review(pg_temp.id('rv1'), 1, 'reinstate', 'The issuing owner is gone and the record is sound')).status,
          'reinstated', 'j18_w11_owner_account_deletion_keeps_review_and_dispute');
select ok(public.admin_contract_dispute_case(pg_temp.id('d1')) -> 'contract' ->> 'owner_removed' = 'true', 'j18_w11_owner_account_deletion_keeps_review_and_dispute');

-- ---------- worker account deletion ----------
select test_helpers.act_as_service();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('w2')), 'j18_w11_worker_account_deletion_cascades_and_audits');
select is((select count(*)::int from public.certification_platform_reviews where id = pg_temp.id('rv2'))
          || ',' || (select count(*) from public.worker_contract_disputes where id = pg_temp.id('d2'))
          || ',' || (select status || ':' || (raised_by is null) from public.worker_contract_disputes where id = pg_temp.id('d3')), '0,0,open:true',
          'j18_w11_worker_account_deletion_cascades_and_audits');
select is((select array_agg(action || ':' || (payload ->> 'changed_by') order by action) from public.workforce_audit_events
           where action like '%.deleted' and (payload ->> 'platform_review_id' = pg_temp.id('rv2')::text or payload ->> 'dispute_id' = pg_temp.id('d2')::text)),
          array['certification_platform_review.deleted:worker_profile_deleted', 'worker_contract_dispute.deleted:contract_deleted'],
          'j18_w11_worker_account_deletion_cascades_and_audits');

-- ---------- bookings, quotes, ratings, shop verification ----------
select test_helpers.set_shop_price(pg_temp.id('s4'), 'Sedan', 'Basic Wash', 250.00);
select test_helpers.act_as_customer('j18o-cu@local.test');
select lives_ok(format($$ insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
                         values ('J18 W11', %L, 'Sedan', 'Basic Wash', 'Test address', now() + interval '2 days', %L) $$, pg_temp.fx('cu'), pg_temp.id('s4')),
                'j18_w11_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
update public.bookings set booking_status = 'completed' where customer_name = 'J18 W11';
select test_helpers.act_as_customer('j18o-cu@local.test');
select lives_ok($$ update public.bookings set customer_rating_stars = 4 where customer_name = 'J18 W11' $$, 'j18_w11_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_admin('j18o-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Please upload a clearer permit.' where id = pg_temp.id('s3');
select test_helpers.act_as_service();
select is((select quoted_price::text || ',' || customer_rating_stars from public.bookings where customer_name = 'J18 W11')
          || ',' || (select verification_status || ':' || public.shop_has_recorded_verification(id) from public.shops where id = pg_temp.id('s3')),
          '250.00,4,changes_requested:false', 'j18_w11_booking_quote_rating_and_verification_unchanged');

-- ---------- W7 / W9 / W10 lifecycles ----------
insert into j18o_ids values ('c4', test_helpers.issue_test_certification(pg_temp.id('s4'), pg_temp.id('w4'), 'j18o-o4@local.test'));
select test_helpers.suspend_test_certification(pg_temp.id('c4'), 'j18o-o4@local.test') is not null as c4_suspended;
insert into j18o_ids values ('r4', test_helpers.request_test_shop_review(pg_temp.id('c4'), 'j18o-w4@local.test'));
select test_helpers.act_as_owner('j18o-o4@local.test');
select is((public.decide_certification_review(pg_temp.id('r4'), 'reinstate', 'The shop checked again and reinstates it')).status, 'reinstated',
          'j18_w11_w7_w9_w10_lifecycles_unchanged');
select test_helpers.act_as_service();
insert into j18o_ids values ('k4', test_helpers.create_active_test_contract('j18o-o4@local.test', pg_temp.id('s4'), pg_temp.id('w4'), 'j18o-w4@local.test'));
select test_helpers.act_as_worker('j18o-w4@local.test');
select public.terminate_worker_contract(pg_temp.id('k4'), pg_temp.rev('k4'), 'Moving to another province soon.') is not null as k4_terminated;
select test_helpers.act_as_service();
select is((select array_agg(replace(action, 'certification.', '') order by id) from public.workforce_audit_events
           where subject_type = 'certification' and subject_id = pg_temp.id('c4')),
          array['issued', 'status_changed', 'review_requested', 'status_changed', 'review_decided'], 'j18_w11_w7_w9_w10_lifecycles_unchanged');
select is((select array_agg(replace(action, 'worker_contract.', '') order by id) from public.workforce_audit_events
           where subject_type = 'worker_contract' and subject_id = pg_temp.id('k4')),
          array['created', 'sent', 'accepted', 'activated', 'terminated'], 'j18_w11_w7_w9_w10_lifecycles_unchanged');
select is((select status || ',' || ended_by from public.worker_contracts where id = pg_temp.id('k4')) || ',' || test_helpers.relationship_row(pg_temp.id('w4'), pg_temp.id('o4'))
          || ',' || (select count(*) from public.certification_platform_reviews where certification_id = pg_temp.id('c4'))
          || ',' || (select count(*) from public.worker_contract_disputes where contract_id = pg_temp.id('k4')),
          'terminated,worker,ended,contract_terminated,0,0,0', 'j18_w11_w7_w9_w10_lifecycles_unchanged');

select * from finish();
rollback;
