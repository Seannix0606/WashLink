-- W11 audit and notifications (spec I; D-48; W11 PLAN 3.9, P71). Every WashLink review and reported-problem transition
-- writes one audit row whose payload carries ids, status / kind words and actor labels only (never statements,
-- reasons, notes, names or dates); notifications use the fixed texts, one per recipient and event; case views are
-- audited and notify nobody; a refused action writes nothing. Local Docker stack only; backdating a shop request is a
-- TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j6o-a1@local.test')::text, true);
create temporary table j6o_ids (label text primary key, id uuid) on commit drop;
grant all on j6o_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j6o_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j6o_ids values ('o1', test_helpers.create_owner('j6o-o1@local.test'));
insert into j6o_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j6o-w' || n || '@local.test')) from generate_series(1, 3) n;
insert into j6o_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1')));
insert into j6o_ids select 'c' || n, test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('w' || n), 'j6o-o1@local.test') from generate_series(1, 3) n;
select count(test_helpers.suspend_test_certification(pg_temp.id('c' || n), 'j6o-o1@local.test')) as suspended from generate_series(1, 3) n;
insert into j6o_ids select 'r' || n, test_helpers.request_test_shop_review(pg_temp.id('c' || n), 'j6o-w' || n || '@local.test') from generate_series(1, 3) n;
select count(test_helpers.backdate_shop_review_request(pg_temp.id('r' || n), 15)) as overdue from generate_series(1, 3) n;
insert into j6o_ids values ('k1', test_helpers.create_active_test_contract('j6o-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j6o-w1@local.test'));
select set_config('fx.first_event', (select coalesce(max(id), 0)::text from public.workforce_audit_events), true);
select set_config('fx.notes_before', (select count(*)::text from public.notifications), true);
select set_config('fx.shop', (select name from public.shops where id = pg_temp.id('s1')), true);
create function pg_temp.open(p_n int) returns uuid language plpgsql as $$
begin
  perform test_helpers.act_as_worker('j6o-w' || p_n || '@local.test');
  insert into j6o_ids values ('rv' || p_n, (public.open_certification_platform_review(pg_temp.id('c' || p_n), 'suspended',
                                             'My private statement about the shop decision')).id);
  perform test_helpers.act_as_service();
  return pg_temp.id('rv' || p_n);
end $$;
create function pg_temp.w11_events() returns setof public.workforce_audit_events language sql stable security definer as $$
  select * from public.workforce_audit_events where id > current_setting('fx.first_event')::bigint
    and (action like 'certification_platform_review.%' or action like 'worker_contract_dispute.%') order by id $$;
create function pg_temp.counts() returns text language sql stable security definer as $$
  select (select count(*) from public.workforce_audit_events) || ',' || (select count(*) from public.notifications) $$;

-- ---------- transitions ----------
select count(pg_temp.open(n)) as opened from generate_series(1, 3) n;
select test_helpers.act_as_admin('j6o-a1@local.test');
select (public.decide_certification_platform_review(pg_temp.id('rv1'), 1, 'uphold', 'My private reason to keep the decision')).status as decided;
select test_helpers.act_as_worker('j6o-w2@local.test');
select (public.withdraw_certification_platform_review(pg_temp.id('rv2'))).status as withdrawn;
select test_helpers.act_as_owner('j6o-o1@local.test');
select (public.transition_certification(pg_temp.id('c3'), 'suspended', 'active', 'The shop checked again and reinstates it')).status as reinstated;
select test_helpers.act_as_service();
insert into j6o_ids values ('d1', test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j6o-w1@local.test', 'other', 'My private dispute statement here')),
  ('d2', test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j6o-o1@local.test', 'contract_terms', 'The owner private dispute statement'));
select test_helpers.act_as_owner('j6o-o1@local.test');
select (public.respond_to_contract_dispute(pg_temp.id('d1'), 'The owner private response statement')).status as responded;
select (public.withdraw_contract_dispute(pg_temp.id('d2'))).status as d2_withdrawn;
select test_helpers.act_as_admin('j6o-a1@local.test');
select set_config('fx.before_views', pg_temp.counts(), true);
select public.admin_contract_dispute_case(pg_temp.id('d1')) is not null as viewed, public.admin_certification_platform_review_case(pg_temp.id('rv1')) is not null as viewed2;
select set_config('fx.after_views', pg_temp.counts(), true);
select (public.close_contract_dispute(pg_temp.id('d1'), 2, 'information_shared', 'My private closing note for both parties')).status as closed;
select test_helpers.act_as_service();

select is((select array_agg(action order by id) from pg_temp.w11_events()),
          array['certification_platform_review.opened', 'certification_platform_review.opened', 'certification_platform_review.opened',
                'certification_platform_review.decided', 'certification_platform_review.withdrawn', 'certification_platform_review.resolved_by_shop',
                'worker_contract_dispute.raised', 'worker_contract_dispute.raised', 'worker_contract_dispute.responded', 'worker_contract_dispute.withdrawn',
                'worker_contract_dispute.case_viewed', 'certification_platform_review.case_viewed', 'worker_contract_dispute.closed'],
          'w11_audit_actions_for_each_transition');
select is((select array_agg(e.payload ->> 'changed_by' || ':' || coalesce(e.payload ->> 'decision', '-') || ':' || e.actor_role order by e.id)
           from pg_temp.w11_events() e where e.action not like '%case_viewed'),
          array['worker:-:worker', 'worker:-:worker', 'worker:-:worker', 'super_admin:upheld:super_admin', 'worker:-:worker', 'issuing_owner:-:owner',
                'worker:-:worker', 'owner:-:owner', 'owner:-:owner', 'owner:-:owner', 'super_admin:-:super_admin'], 'w11_audit_actions_for_each_transition');
select is((select payload from pg_temp.w11_events() where action = 'certification_platform_review.opened' order by id limit 1),
          jsonb_build_object('certification_id', pg_temp.id('c1'), 'platform_review_id', pg_temp.id('rv1'), 'basis', 'shop_decision_overdue',
                             'from_status', null, 'to_status', 'open', 'decision', null, 'escalated_from_request', pg_temp.id('r1'), 'changed_by', 'worker'),
          'w11_audit_actions_for_each_transition');

-- ---------- payload privacy ----------
select is((select count(*)::int from pg_temp.w11_events() e
           where e.payload::text ~* '(private|statement|reason|note|Local Test|j6o|@)' or e.payload::text ~ '\d{4}-\d{2}-\d{2}'), 0,
          'w11_audit_payload_has_no_statements_reasons_notes_or_names');
select is((select count(*)::int from pg_temp.w11_events() e, jsonb_object_keys(e.payload) k
           where k not in ('certification_id', 'platform_review_id', 'basis', 'from_status', 'to_status', 'decision', 'escalated_from_request', 'changed_by',
                           'dispute_id', 'contract_id', 'category', 'raised_by_role', 'resolution_kind', 'version_id', 'contract_block')), 0,
          'w11_audit_payload_has_no_statements_reasons_notes_or_names');

-- ---------- notifications ----------
select is((select array_agg(n.category || '|' || case n.recipient_id when pg_temp.id('o1') then 'owner' when pg_temp.id('w1') then 'w1' else 'other' end
                            || '|' || n.body order by n.created_at, n.category, n.recipient_id = pg_temp.id('o1'), n.idempotency_key)
           from public.notifications n where n.category like 'certification_platform_review.%' or n.category like 'worker_contract_dispute.%'),
          array['certification_platform_review.decided|w1|WashLink reviewed your certification for Local test training: decision kept.',
                'certification_platform_review.decided|owner|WashLink reviewed a certification decision for Local test training.',
                'certification_platform_review.opened|owner|A worker asked WashLink to review a certification decision for Local test training.',
                'certification_platform_review.opened|owner|A worker asked WashLink to review a certification decision for Local test training.',
                'certification_platform_review.opened|owner|A worker asked WashLink to review a certification decision for Local test training.',
                'worker_contract_dispute.closed|w1|WashLink closed a reported contract problem. Open it to read the note.',
                'worker_contract_dispute.closed|owner|WashLink closed a reported contract problem. Open it to read the note.',
                'worker_contract_dispute.raised|w1|' || current_setting('fx.shop') || ': a problem with your contract was reported to WashLink. You can add your side.',
                'worker_contract_dispute.raised|owner|A worker reported a problem with a contract to WashLink. You can add your side.'],
          'w11_notifications_fixed_text_one_per_event');
select is((select count(*)::int from public.notifications n where (n.category like 'certification_platform_review.%' or n.category like 'worker_contract_dispute.%')
             and (n.body || n.title) ~* '(private|j6o|Local Test Admin|Local Test Owner|Local Test Worker)'), 0, 'w11_notifications_fixed_text_one_per_event');
select is((select array_agg(distinct split_part(n.idempotency_key, ':', 1) || ':' || split_part(n.idempotency_key, ':', 3))
           from public.notifications n where n.category like 'certification_platform_review.%' or n.category like 'worker_contract_dispute.%'),
          array['certification_platform_review:decided', 'certification_platform_review:opened', 'contract_dispute:closed', 'contract_dispute:raised'],
          'w11_notifications_fixed_text_one_per_event');

-- ---------- case views: audited, no notifications ----------
select is(split_part(current_setting('fx.after_views'), ',', 1)::int - split_part(current_setting('fx.before_views'), ',', 1)::int || ','
          || (split_part(current_setting('fx.after_views'), ',', 2)::int - split_part(current_setting('fx.before_views'), ',', 2)::int), '2,0',
          'w11_case_view_audits_without_notifications');
select is((select count(*)::int from public.notifications where category ~ 'case_view'), 0, 'w11_case_view_audits_without_notifications');

-- ---------- refused actions write nothing ----------
select set_config('fx.before_refused', pg_temp.counts(), true);
select test_helpers.act_as_worker('j6o-w1@local.test');
select is(array[test_helpers.attempt(format('select public.open_certification_platform_review(%L, %L, %L)', pg_temp.id('c1'), 'suspended', 'Please look again at it')),
                test_helpers.attempt(format('select public.raise_contract_dispute(%L, %L, %L)', pg_temp.id('k1'), 'other', 'Short')),
                test_helpers.attempt(format('select public.respond_to_contract_dispute(%L, %L)', pg_temp.id('d1'), 'The worker answers its own report'))],
          array['23514', '23514', '42501'], 'w11_refused_action_writes_nothing');
select test_helpers.act_as_service();
select is(pg_temp.counts(), current_setting('fx.before_refused'), 'w11_refused_action_writes_nothing');

select * from finish();
rollback;
