-- J12 (W11): rules of reported contract problems (D-47; W11 PLAN 3.6, 4). Either party of a SENT contract reports a
-- problem (the worker can ask WashLink to look at an owner termination), up to 90 days after the contract ends, with a
-- category that fits how it ended; one open per party, at most 3 per party; the other party answers once; the raiser
-- withdraws; only a super_admin closes, with a resolution kind and a note. Local Docker stack only; moving ended_at into
-- the past uses the W10 forward-only trusted repair (active -> terminated with an explicit ended_at; ended_by becomes
-- trusted_session), a TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j12r-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j12r-cu@local.test')::text, true);
create temporary table j12r_ids (label text primary key, id uuid) on commit drop;
grant all on j12r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j12r_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.drev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contract_disputes where id = pg_temp.id(p_label) $$;
insert into j12r_ids select 'o' || n, test_helpers.create_owner('j12r-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j12r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j12r-w' || n || '@local.test')) from generate_series(1, 4) n;
insert into j12r_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 2) n;
insert into j12r_ids values ('k1', test_helpers.create_active_test_contract('j12r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j12r-w1@local.test')),
  ('k2', test_helpers.create_active_test_contract('j12r-o2@local.test', pg_temp.id('s2'), pg_temp.id('w1'), 'j12r-w1@local.test')),
  ('k4', test_helpers.create_active_test_contract('j12r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w4'), 'j12r-w4@local.test')),
  ('k5', test_helpers.create_active_test_contract('j12r-o2@local.test', pg_temp.id('s2'), pg_temp.id('w2'), 'j12r-w2@local.test')),
  ('k6', test_helpers.create_active_test_contract('j12r-o2@local.test', pg_temp.id('s2'), pg_temp.id('w3'), 'j12r-w3@local.test'));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w3')) is not null as w3_applied;
insert into j12r_ids values ('k3', test_helpers.create_test_contract_draft('j12r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w3')));
select test_helpers.act_as_owner('j12r-o1@local.test');
select (public.terminate_worker_contract(pg_temp.id('k1'), pg_temp.rev('k1'), 'The shop closed this local test position')).ended_by as k1_ended_by;
select test_helpers.act_as_service();
create function pg_temp.raise_sql(p_contract text, p_category text, p_statement text default 'The contract ended without the notice we agreed')
returns text language sql stable
as $$ select format('select public.raise_contract_dispute(%L, %L, %L)', pg_temp.id(p_contract), p_category, p_statement) $$;
create function pg_temp.raise(p_label text, p_contract text, p_category text) returns text language plpgsql as $$
begin
  insert into j12r_ids values (p_label, (public.raise_contract_dispute(pg_temp.id(p_contract), p_category,
                                          'The contract ended without the notice we agreed')).id);
  return p_label;
end $$;
create function pg_temp.dispute(p_label text) returns text language sql stable security definer
as $$ select status || ',' || raised_by_role || ',' || category || ',' || contract_status_at_raise || ',' || revision
       from public.worker_contract_disputes where id = pg_temp.id(p_label) $$;
create function pg_temp.close_sql(p_label text, p_revision int, p_kind text default 'information_shared',
                                  p_note text default 'WashLink shared information about outside help with both parties') returns text language sql stable
as $$ select format('select public.close_contract_dispute(%L, %s, %L, %L)', pg_temp.id(p_label), p_revision, p_kind, p_note) $$;

-- ---------- raise ----------
select test_helpers.act_as_owner('j12r-o1@local.test');
select throws_ok(pg_temp.raise_sql('k1', 'owner_ended_contract'), '23514', 'This category does not match the contract.', 'w11_category_must_match_contract_end');
select throws_ok(pg_temp.raise_sql('k1', 'worker_ended_contract'), '23514', 'This category does not match the contract.', 'w11_category_must_match_contract_end');
select throws_ok(pg_temp.raise_sql('k1', 'pay'), '22023', 'Choose a problem category.', 'w11_category_must_match_contract_end');
select test_helpers.act_as_worker('j12r-w1@local.test');
select throws_ok(pg_temp.raise_sql('k2', 'owner_ended_contract'), '23514', 'This category does not match the contract.', 'w11_category_must_match_contract_end');
select throws_ok(pg_temp.raise_sql('k1', 'other', 'Too short'), '23514', 'Write a statement of 20 to 1000 characters.', 'w11_worker_disputes_owner_termination');
select lives_ok(format($s$ select pg_temp.raise('d1', 'k1', 'owner_ended_contract') $s$), 'w11_worker_disputes_owner_termination');
select test_helpers.act_as_service();
select is(pg_temp.dispute('d1'), 'open,worker,owner_ended_contract,terminated,1', 'w11_worker_disputes_owner_termination');
select is((select raised_by = pg_temp.id('w1') and first_viewed_by_admin_at is null from public.worker_contract_disputes where id = pg_temp.id('d1')), true,
          'w11_worker_disputes_owner_termination');
select test_helpers.act_as_worker('j12r-w1@local.test');
select throws_ok(pg_temp.raise_sql('k1', 'other'), '23505', 'You already reported a problem with this contract.', 'w11_one_open_dispute_per_party_23505');
select test_helpers.act_as_owner('j12r-o2@local.test');
select lives_ok(format($s$ select pg_temp.raise('d2', 'k2', 'contract_terms') $s$), 'w11_owner_raises_terms_dispute');
select test_helpers.act_as_service();
select is(pg_temp.dispute('d2'), 'open,owner,contract_terms,active,1', 'w11_owner_raises_terms_dispute');
select test_helpers.act_as_owner('j12r-o1@local.test');
select lives_ok(format($s$ select pg_temp.raise('d1o', 'k1', 'contract_terms') $s$), 'w11_one_open_dispute_per_party_23505');

-- ---------- unsent drafts ----------
select throws_ok(pg_temp.raise_sql('k3', 'contract_terms'), '23514', 'Only a contract that was sent can be reported.', 'w11_unsent_draft_cannot_be_disputed');
select test_helpers.act_as_worker('j12r-w3@local.test');
select throws_ok(pg_temp.raise_sql('k3', 'contract_terms'), '42501', 'Contract not found.', 'w11_unsent_draft_cannot_be_disputed');
select test_helpers.act_as_worker('j12r-w2@local.test');
select throws_ok(pg_temp.raise_sql('k1', 'contract_terms'), '42501', 'Contract not found.', 'w11_unsent_draft_cannot_be_disputed');

-- ---------- 90-day window ----------
select test_helpers.act_as_service();
update public.worker_contracts set status = 'terminated', ended_at = now() - interval '89 days' where id = pg_temp.id('k4');
update public.worker_contracts set status = 'terminated', ended_at = now() - interval '91 days' where id = pg_temp.id('k6');
select test_helpers.act_as_owner('j12r-o1@local.test');
select throws_ok(pg_temp.raise_sql('k4', 'worker_ended_contract'), '23514', 'This category does not match the contract.', 'w11_category_must_match_contract_end');
select lives_ok(format($s$ select pg_temp.raise('d4', 'k4', 'other') $s$), 'w11_ninety_day_window_after_end');
select is((public.withdraw_contract_dispute(pg_temp.id('d4'))).status, 'withdrawn', 'w11_ninety_day_window_after_end');
select test_helpers.act_as_owner('j12r-o2@local.test');
select throws_ok(pg_temp.raise_sql('k6', 'other'), '23514', 'Problems can be reported up to 90 days after a contract ends.',
                 'w11_ninety_day_window_after_end');
select test_helpers.act_as_worker('j12r-w3@local.test');
select throws_ok(pg_temp.raise_sql('k6', 'other'), '23514', 'Problems can be reported up to 90 days after a contract ends.', 'w11_ninety_day_window_after_end');

-- ---------- at most 3 per party ----------
select test_helpers.act_as_owner('j12r-o2@local.test');
create function pg_temp.raise_and_withdraw(p_count int) returns int language plpgsql as $$
declare
  n int;
begin
  for n in 1 .. p_count loop
    perform pg_temp.raise('m' || n, 'k5', 'other');
    perform public.withdraw_contract_dispute((select id from j12r_ids where label = 'm' || n));
  end loop;
  return (select count(*)::int from public.my_contract_disputes() m where m.contract_id = pg_temp.id('k5') and m.status = 'withdrawn');
end $$;
select is(pg_temp.raise_and_withdraw(3), 3, 'w11_max_three_per_party');
select throws_ok(pg_temp.raise_sql('k5', 'other'), '23514', 'You can report at most 3 problems with this contract.', 'w11_max_three_per_party');
select test_helpers.act_as_worker('j12r-w2@local.test');
select lives_ok(format($s$ select pg_temp.raise('m4', 'k5', 'other') $s$), 'w11_max_three_per_party');

-- ---------- response ----------
select test_helpers.act_as_owner('j12r-o2@local.test');
select throws_ok(format('select public.respond_to_contract_dispute(%L, %L)', pg_temp.id('d2'), 'The shop adds its side of the story here'),
                 '42501', 'Only the other party can add a response.', 'w11_other_party_responds_once');
select test_helpers.act_as_worker('j12r-w2@local.test');
select throws_ok(format('select public.respond_to_contract_dispute(%L, %L)', pg_temp.id('d2'), 'The worker adds a side of the story here'),
                 '42501', 'Reported problem not found.', 'w11_other_party_responds_once');
select test_helpers.act_as_worker('j12r-w1@local.test');
select throws_ok(format('select public.respond_to_contract_dispute(%L, %L)', pg_temp.id('d2'), 'Short'),
                 '23514', 'Write a statement of 20 to 1000 characters.', 'w11_other_party_responds_once');
select is((public.respond_to_contract_dispute(pg_temp.id('d2'), '  The worker adds a side of the story here  ')).response_statement,
          'The worker adds a side of the story here', 'w11_other_party_responds_once');
select throws_ok(format('select public.respond_to_contract_dispute(%L, %L)', pg_temp.id('d2'), 'The worker adds a second side here'),
                 '23505', 'A response was already recorded.', 'w11_other_party_responds_once');
select is((select row(m.can_respond, m.can_withdraw, m.raised_by_me, m.responded_at is not null)::text from public.my_contract_disputes() m
           where m.dispute_id = pg_temp.id('d2')), '(f,f,f,t)', 'w11_other_party_responds_once');

-- ---------- withdraw ----------
select test_helpers.act_as_owner('j12r-o1@local.test');
select throws_ok(format('select public.withdraw_contract_dispute(%L)', pg_temp.id('d1')), '42501', 'Reported problem not found.', 'w11_raiser_withdraws');
select test_helpers.act_as_worker('j12r-w1@local.test');
select is((public.withdraw_contract_dispute(pg_temp.id('d1'))).status, 'withdrawn', 'w11_raiser_withdraws');
select throws_ok(format('select public.withdraw_contract_dispute(%L)', pg_temp.id('d1')), '23514', 'This reported problem is no longer open.', 'w11_raiser_withdraws');

-- ---------- close ----------
select set_config('fx.admin_only', 'Only a platform administrator can close disputes.', true);
select test_helpers.act_as_owner('j12r-o2@local.test');
select throws_ok(pg_temp.close_sql('d2', 2), '42501', current_setting('fx.admin_only'), 'w11_non_admin_cannot_close');
select test_helpers.act_as_worker('j12r-w1@local.test');
select throws_ok(pg_temp.close_sql('d2', 2), '42501', current_setting('fx.admin_only'), 'w11_non_admin_cannot_close');
select test_helpers.act_as_customer('j12r-cu@local.test');
select throws_ok(pg_temp.close_sql('d2', 2), '42501', current_setting('fx.admin_only'), 'w11_non_admin_cannot_close');
select test_helpers.act_as_admin('j12r-a1@local.test');
select throws_ok(pg_temp.close_sql('d2', 1), '55000', 'This reported problem changed. Refresh and try again.', 'w11_close_stale_revision_55000');
select throws_ok(pg_temp.close_sql('d2', 2, 'reinstate_contract'), '22023', 'Choose how the problem was closed.', 'w11_super_admin_closes_with_kind_and_note');
select throws_ok(pg_temp.close_sql('d2', 2, 'information_shared', 'Too short'), '23514', 'Write a note of 20 to 1000 characters.',
                 'w11_super_admin_closes_with_kind_and_note');
select is((public.close_contract_dispute(pg_temp.id('d2'), 2, 'referred_outside_washlink', 'WashLink pointed both parties to outside help')).status,
          'closed', 'w11_super_admin_closes_with_kind_and_note');
select throws_ok(pg_temp.close_sql('d2', 3), '23514', 'This reported problem is no longer open.', 'w11_close_stale_revision_55000');
select test_helpers.act_as_service();
select is((select row(status, resolution_kind, closed_by = pg_temp.fx('a1'), closed_at is not null, revision)::text from public.worker_contract_disputes
           where id = pg_temp.id('d2')), '(closed,referred_outside_washlink,t,t,3)', 'w11_super_admin_closes_with_kind_and_note');
select test_helpers.act_as_worker('j12r-w1@local.test');
select is((select m.resolution_note || ',' || m.status from public.my_contract_disputes() m where m.dispute_id = pg_temp.id('d2')),
          'WashLink pointed both parties to outside help,closed', 'w11_super_admin_closes_with_kind_and_note');

select * from finish();
rollback;
