-- W9 problem-term flags (D-33): keyword rules cover every W8-L13 category (incl. common Filipino words), each category
-- flags a sample, locked WashLink clauses are never scanned, flags are stored at seal and shown to both parties, they
-- never block sending, and no rule, statement or notice claims that terms are lawful, valid, approved or compliant.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w9f-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('w9f-o1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('w9f-w1@local.test'))::text, true);
select set_config('fx.w2', test_helpers.create_worker_profile(test_helpers.create_worker('w9f-w2@local.test'))::text, true);
create temporary table w9f_ids (label text primary key, id uuid) on commit drop;
grant all on w9f_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w9f_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into w9f_ids values ('s1', test_helpers.create_verified_shop(pg_temp.fx('o1'), pg_temp.fx('a1')));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.fx('w1'));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.fx('w2'));
create temporary table w9f_samples (category text, sample text) on commit drop;
insert into w9f_samples values
  ('training_fee', 'The worker pays a training fee before starting.'),
  ('training_cost_clawback', 'If the worker leaves early they must repay the training costs.'),
  ('deposit', 'A deposit is kept by the shop.'),
  ('cash_bond', 'The worker gives a cash bond on the first day.'),
  ('work_item_deduction', 'The cost of a lost uniform is deducted from pay.'),
  ('fine_or_penalty', 'Late arrival leads to a penalty.'),
  ('waiver', 'The worker waives any claim for overtime.'),
  ('quitclaim_or_release', 'On leaving the worker signs a quitclaim.'),
  ('exclusivity_or_non_compete', 'The worker agrees not to work for another car wash.'),
  ('liquidated_damages_or_forfeit', 'Leaving without notice means the last salary is forfeited.'),
  ('unpaid_trial_or_customer_work_in_training', 'The first week is an unpaid trial shift.'),
  ('contractor_label', 'The worker is a freelancer for this shop.'),
  ('forum_or_arbitration', 'Disputes go to arbitration chosen by the shop.'),
  ('certificate_government_claim', 'The certificate is TESDA accredited.'),
  ('contract_validity_claim', 'This agreement is legally binding once accepted.');
grant all on w9f_samples to public;

-- ---------- rule coverage ----------
select is((select array_agg(distinct category order by category) from public.contract_problem_term_rules),
          (select array_agg(category order by category) from w9f_samples), 'w9_rules_cover_every_w8_l13_category');
select ok((select bool_and(r.review_status = 'draft_requires_legal_review') from public.contract_problem_term_rules r)
          and (select count(*) from public.contract_problem_term_rules r where r.pattern ~ '(multa|kaltas|bawas|deposito|piyansa)') >= 4,
          'w9_rules_cover_every_w8_l13_category');
select is((select count(*)::int from w9f_samples s where exists (select 1 from public.contract_problem_term_matches(s.sample) m where m.category = s.category)),
          15, 'w9_each_category_flags_sample_text');
select is((select string_agg(m.category, ',' order by m.category) from (values ('May multa kapag late.'), ('Kaltas sa sahod ang sira.'),
           ('Magbigay ng deposito.'), ('Walang bayad ang unang linggo.')) x(t), lateral public.contract_problem_term_matches(x.t) m),
          'deposit,fine_or_penalty,unpaid_trial_or_customer_work_in_training,work_item_deduction', 'w9_each_category_flags_sample_text');
select is((select count(*)::int from public.contract_problem_term_matches('The worker washes cars and keeps the bay tidy.')), 0,
          'w9_each_category_flags_sample_text');
select is((select char_length(excerpt) || ',' || (strpos(excerpt, 'A deposit is kept.') between 55 and 70)::text
           from public.contract_problem_term_matches(repeat('Neutral words here. ', 20) || 'A deposit is kept.' || repeat(' More neutral words.', 20))),
          '160,true', 'w9_each_category_flags_sample_text');

-- ---------- locked clauses are never scanned ----------
insert into w9f_ids values ('c1', test_helpers.create_test_contract_draft('w9f-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w1')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'w9f-o1@local.test');
insert into w9f_ids values ('c1v1', test_helpers.send_test_contract(pg_temp.id('c1'), 'w9f-o1@local.test'));
select ok((select count(*) from public.contract_template_clauses c, lateral public.contract_problem_term_matches(c.heading || E'\n' || c.body) m
           where c.version_id = test_helpers.latest_platform_contract_version() and c.kind = 'locked_safeguard') >= 2, 'w9_locked_clauses_never_flagged');
select is((select flag_count from public.contract_versions where id = pg_temp.id('c1v1')), 0, 'w9_locked_clauses_never_flagged');

-- ---------- flags stored at seal, shown to both parties, never block ----------
insert into w9f_ids values ('c2', test_helpers.create_test_contract_draft('w9f-o1@local.test', pg_temp.id('s1'), pg_temp.fx('w2')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c2'), 'w9f-o1@local.test', '{"listed_deductions": "The cost of damage to equipment is deducted from pay."}',
  '[{"section_number": 7, "heading": "Locker", "body": "The worker pays a deposit for the locker key."}]', '{"pay_details": "Daily pay; may multa for late arrival"}');
insert into w9f_ids values ('c2v1', test_helpers.send_test_contract(pg_temp.id('c2'), 'w9f-o1@local.test'));
select is((select state || ',' || flag_count from public.contract_versions where id = pg_temp.id('c2v1')), 'sent_for_review,3', 'w9_flags_never_block_sending');
select is((select string_agg(coalesce(value_key, section_number || '.' || position) || ':' || rule_key, ',' order by section_number nulls last, position, rule_key)
           from public.contract_version_flags where version_id = pg_temp.id('c2v1')), '7.4:work_item_deduction,7.5:deposit,pay_details:fine_or_penalty',
          'w9_flags_stored_at_seal_and_visible_to_both_parties');
select test_helpers.act_as_owner('w9f-o1@local.test');
select is((select count(*)::int from public.worker_contract_version_flags(pg_temp.id('c2v1'))
           where disclaimer = 'Automatic keyword check. It may miss problems or flag acceptable text. It is not legal advice and WashLink does not check whether terms are lawful.'),
          3, 'w9_flags_stored_at_seal_and_visible_to_both_parties');
select test_helpers.act_as_worker('w9f-w2@local.test');
select is((select string_agg(rule_key || ':' || label, ',' order by section_number nulls last, position) from public.worker_contract_version_flags(pg_temp.id('c2v1'))),
          'work_item_deduction:Deduction for uniform, equipment, damage or shortage,deposit:Deposit,fine_or_penalty:Fine or penalty',
          'w9_flags_stored_at_seal_and_visible_to_both_parties');
select is((select no_match_text from public.worker_contract_flag_notices()), 'No keyword matches. This does not mean the terms are lawful.',
          'w9_flags_stored_at_seal_and_visible_to_both_parties');
select test_helpers.act_as_service();

-- ---------- no legal validation claims ----------
select is((select count(*)::int from (
             select label || ' ' || guidance as t from public.contract_problem_term_rules
             union all select statement_text from public.contract_acknowledgement_texts
             union all select disclaimer || ' ' || no_match_text from public.worker_contract_flag_notices()) x
           where x.t ~* '\m(unlawful|illegal|complian|valid|approved|certified|binding)'), 0, 'w9_flag_texts_make_no_legal_validation_claim');
select ok((select bool_and(guidance ~ 'may need legal review') from public.contract_problem_term_rules)
          and (select bool_and(statement_text ~ 'not an electronic signature' or ack_key ~ 'contractor') from public.contract_acknowledgement_texts),
          'w9_flag_texts_make_no_legal_validation_claim');

select * from finish();
rollback;
