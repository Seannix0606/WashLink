-- J15 (W13): contract expiry notice wording (W13 PLAN 3.4, section 6 test 5; D-72; closes W12 C2 / W12-L9).
-- worker_contracts_audit() is the w9j body except the two `expired` notice bodies: the worker reads that the contract
-- "reached the end date written in it, so WashLink now shows it as expired" and that what this means depends on the
-- contract terms and the law; the owner reads the same first sentence and that what this means for the owner and the
-- worker depends on the contract terms and the law (fix cycle 1, W13 C2). Title 'Contract expired', category, key and
-- every other notice body are unchanged; still one notice per party; an expired contract still stops counting. Expiry runs through
-- the real W12 runner as pg_cron would (trusted session; runner technique of j13_w12_scheduled_jobs); backdating is a
-- TEST-ONLY time shift. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create temporary table j15e_ids (label text primary key, id uuid) on commit drop;
grant all on j15e_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j15e_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j15e-' || p_label || '@local.test' $$;
create function pg_temp.run() returns jsonb language plpgsql as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('washlink.scheduled_job', '', true);   -- TEST-ONLY: a new transaction for each scheduled run
  return public.run_workforce_scheduled_job('worker_contract_expiry');
end $$;
create function pg_temp.body(p_label text, p_party text, p_title text) returns text language sql stable security definer as $$
  select string_agg(n.body, ' | ' order by n.created_at, n.id) from public.notifications n join public.worker_contracts c on c.id = n.subject_id
  where c.id = pg_temp.id(p_label) and n.title = p_title and n.recipient_id = case p_party when 'worker' then c.worker_id else c.owner_id end $$;
create function pg_temp.notes_of(p_label text) returns text language sql stable security definer as $$
  select count(*) filter (where n.recipient_id = c.worker_id) || ',' || count(*) filter (where n.recipient_id = c.owner_id)
  from public.worker_contracts c join public.notifications n on n.subject_id = c.id and n.title = 'Contract expired' where c.id = pg_temp.id(p_label) $$;
create function pg_temp.shop_label(p_label text) returns text language sql stable security definer as $$
  select public.notification_safe_label(c.shop_name_snapshot, 'The shop') from public.worker_contracts c where c.id = pg_temp.id(p_label) $$;
insert into j15e_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j15e_ids select 'o' || n, test_helpers.create_owner(pg_temp.email('o' || n)) from generate_series(1, 2) n;
insert into j15e_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('w' || n))) from generate_series(1, 4) n;
insert into j15e_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
                            ('s2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1')));
-- k1 active and k2 accepted, both past their end date; k3 ended by the worker; k4 ended by the owner.
insert into j15e_ids values ('k1', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w1'), pg_temp.email('w1'),
                                                                            test_helpers.manila_today()));
insert into j15e_ids values ('k2', test_helpers.create_accepted_test_contract(pg_temp.email('o2'), pg_temp.id('s2'), pg_temp.id('w2'), pg_temp.email('w2'),
                                                                              test_helpers.manila_today()));
insert into j15e_ids values ('k3', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w3'), pg_temp.email('w3')));
insert into j15e_ids values ('k4', test_helpers.create_active_test_contract(pg_temp.email('o2'), pg_temp.id('s2'), pg_temp.id('w4'), pg_temp.email('w4')));
select test_helpers.act_as_worker(pg_temp.email('w3'));
select (public.terminate_worker_contract(pg_temp.id('k3'), (select revision from public.worker_contracts where id = pg_temp.id('k3')),
                                         'Ending this before the season closes.')).status;
select test_helpers.act_as_owner(pg_temp.email('o2'));
select (public.terminate_worker_contract(pg_temp.id('k4'), (select revision from public.worker_contracts where id = pg_temp.id('k4')),
                                         'The shop is closing this branch soon.')).status;
select test_helpers.act_as_service();
select count(test_helpers.backdate_test_worker_contract(pg_temp.id(k), 3)) as backdated from unnest(array['k1', 'k2']) k;
select set_config('fx.before', test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), true);
select set_config('fx.first_run', pg_temp.run()::text, true);

-- ---------- the two new bodies ----------
select is(current_setting('fx.first_run')::jsonb ->> 'changed', '2', 'w13_expiry_notice_worker_body_uses_record_wording');
select is(pg_temp.body('k1', 'worker', 'Contract expired'),
          'Your contract with ' || pg_temp.shop_label('k1') || ' reached the end date written in it, so WashLink now shows it as expired. '
          || 'What this means for your work depends on the contract terms and the law.', 'w13_expiry_notice_worker_body_uses_record_wording');
select is(pg_temp.body('k2', 'worker', 'Contract expired'),
          'Your contract with ' || pg_temp.shop_label('k2') || ' reached the end date written in it, so WashLink now shows it as expired. '
          || 'What this means for your work depends on the contract terms and the law.', 'w13_expiry_notice_worker_body_uses_record_wording');
select is(pg_temp.body('k1', 'owner', 'Contract expired') || ' | ' || pg_temp.body('k2', 'owner', 'Contract expired'),
          'A contract reached the end date written in it, so WashLink now shows it as expired. What this means for you and the worker '
          || 'depends on the contract terms and the law. | A contract reached the end date written in it, so WashLink now shows it as '
          || 'expired. What this means for you and the worker depends on the contract terms and the law.',
          'w13_expiry_notice_owner_body_uses_record_wording');

-- ---------- no contract notice and no live body says "has expired" ----------
select is((select count(*)::int from public.notifications where category = 'worker_contract' and body ilike '%has expired%'), 0,
          'w13_no_notification_body_says_has_expired');
select is((select strpos(prosrc, 'has expired') from pg_proc where oid = 'public.worker_contracts_audit()'::regprocedure), 0,
          'w13_no_notification_body_says_has_expired');

-- ---------- title, category, key and audit link unchanged ----------
select is((select string_agg(distinct n.title || '|' || n.category || '|' || (n.idempotency_key = 'worker_contract:' || c.id || ':' || e.id)
                                       || '|' || n.subject_type, ',')
           from public.notifications n join public.worker_contracts c on c.id = n.subject_id
           join public.workforce_audit_events e on e.subject_id = c.id and e.action = 'worker_contract.expired'
           where c.id in (pg_temp.id('k1'), pg_temp.id('k2')) and n.title = 'Contract expired'),
          'Contract expired|worker_contract|true|worker_contract', 'w13_expiry_notice_title_category_and_key_unchanged');
select is((select concat_ws('|', n.source_increment, n.key_prefixes::text, n.subject_types::text, n.recipient_kind)
           from public.notification_categories n where n.category = 'worker_contract'),
          'W9|{worker_contract}|{worker_contract}|either_party', 'w13_expiry_notice_title_category_and_key_unchanged');

-- ---------- every other contract notice body unchanged ----------
select is(pg_temp.body('k1', 'worker', 'Contract offer'), pg_temp.shop_label('k1') || ' sent you a contract draft to review. It applies only if you accept it.',
          'w13_other_contract_notice_bodies_unchanged');
select is(pg_temp.body('k1', 'owner', 'Contract accepted') || ' | ' || pg_temp.body('k1', 'worker', 'Contract started'),
          'A worker accepted your contract offer. | ' || pg_temp.shop_label('k1') || ' recorded that your contract has started.',
          'w13_other_contract_notice_bodies_unchanged');
select is(pg_temp.body('k3', 'owner', 'Contract ended') || ' | ' || pg_temp.body('k4', 'worker', 'Contract ended'),
          'A worker ended a contract. Open it to see the reason. | ' || pg_temp.shop_label('k4') || ' ended a contract. Open it to see the reason.',
          'w13_other_contract_notice_bodies_unchanged');
-- Withdrawn, declined and party-removed bodies (and every branch above) keep their exact W9 literals in the live body.
select is((select count(*)::int from pg_proc p, unnest(array[
             ''' sent you a contract draft to review. It applies only if you accept it.''', ''' withdrew a contract offer.''',
             '''A worker accepted your contract offer.''', '''A worker declined your contract offer.''',
             ''' recorded that your contract has started.''', '''A worker ended a contract. Open it to see the reason.''',
             ''' ended a contract. Open it to see the reason.''', '''A contract''''s other party left WashLink. Your contract record is kept.''',
             '''Contract offer withdrawn''', '''Contract declined''', '''Contract party left''']) s
           where p.oid = 'public.worker_contracts_audit()'::regprocedure and strpos(p.prosrc, s) > 0), 11,
          'w13_other_contract_notice_bodies_unchanged');
-- With the two W13 strings swapped back, the live body is byte-identical to w9j (md5 of the w9j lines 31..115 source).
select is((select md5(replace(replace(prosrc,
             '''Your contract with '' || shop_label || '' reached the end date written in it, so WashLink now shows it as expired. What this means for your work depends on the contract terms and the law.''',
             '''Your contract with '' || shop_label || '' reached its end date and has expired.'''),
             '''A contract reached the end date written in it, so WashLink now shows it as expired. What this means for you and the worker depends on the contract terms and the law.''',
             '''A contract reached its end date and has expired.'''))
           from pg_proc where oid = 'public.worker_contracts_audit()'::regprocedure),
          '70f3611014d8f651ce15dc230a820540', 'w13_other_contract_notice_bodies_unchanged');
-- The live body is exactly the w13d body that the w13a preflight accepts on a re-run (W13 S4).
select is((select md5(prosrc) from pg_proc where oid = 'public.worker_contracts_audit()'::regprocedure),
          'aebb4ecc7ac975d3c1d47dc20307774a', 'w13_other_contract_notice_bodies_unchanged');

-- ---------- still one notice per party; a second run creates nothing ----------
select is(pg_temp.notes_of('k1') || '|' || pg_temp.notes_of('k2') || '|' || pg_temp.notes_of('k3') || '|' || pg_temp.notes_of('k4'), '1,1|1,1|0,0|0,0',
          'w13_expiry_still_one_notice_per_party');
select is((pg_temp.run() ->> 'processed') || '|' || pg_temp.notes_of('k1') || '|' || pg_temp.notes_of('k2'), '0|1,1|1,1',
          'w13_expiry_still_one_notice_per_party');

-- ---------- an expired contract still stops counting ----------
select is(current_setting('fx.before') || '>' || test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')),
          'active,contract_active,1>ended,contract_expired,0', 'w13_expired_contract_still_stops_counting');
select is((select string_agg(status || ':' || ended_by, ',' order by status) from public.worker_contracts where id in (pg_temp.id('k1'), pg_temp.id('k2'))),
          'expired:system,expired:system', 'w13_expired_contract_still_stops_counting');

-- ---------- the function keeps its W9 marker, records W13, stays internal and wired ----------
select is((select obj_description(p.oid, 'pg_proc') from pg_proc p where p.oid = 'public.worker_contracts_audit()'::regprocedure),
          'W9: worker contracts (created by the W9 migrations). W13: expiry notice wording (D-72).', 'w13_audit_function_comment_records_w13');
select ok((select p.prosecdef and p.proconfig = array['search_path=public, pg_temp']
                  and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
                  and not has_function_privilege('service_role', p.oid, 'execute')
           from pg_proc p where p.oid = 'public.worker_contracts_audit()'::regprocedure)
          and exists (select 1 from pg_trigger t where t.tgrelid = 'public.worker_contracts'::regclass and t.tgname = 'worker_contracts_audit'
                      and t.tgfoid = 'public.worker_contracts_audit()'::regprocedure and not t.tgisinternal),
          'w13_audit_function_comment_records_w13');

select * from finish();
rollback;
