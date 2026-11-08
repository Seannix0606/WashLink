-- W10 (C6, D-40, P64): trusted (no-JWT SQL) contract repairs are forward-only: accepted / active -> terminated /
-- expired, or stamps without a status change. They can never revive an ended contract, reopen a declined or withdrawn
-- offer, activate an accepted contract or clear ended_at. Every other W9 guard behaviour is unchanged (flag writes
-- through the RPCs, FK cascades, locked columns, column whitelist, no client writes). Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w10t-a1@local.test')::text, true);
create temporary table w10t_ids (label text primary key, id uuid) on commit drop;
grant all on w10t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w10t_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.status(p_label text) returns text language sql stable security definer
as $$ select status from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.repair(p_label text, p_set text) returns text language sql as $$
  select test_helpers.attempt(format('update public.worker_contracts set %s where id = %L', p_set, pg_temp.id(p_label))) $$;
insert into w10t_ids select 'o' || n, test_helpers.create_owner('w10t-o' || n || '@local.test') from generate_series(1, 2) n;
insert into w10t_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('w10t-w' || n || '@local.test')) from generate_series(1, 8) n;
insert into w10t_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 2) n;
insert into w10t_ids values ('cT', test_helpers.create_active_test_contract('w10t-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'w10t-w1@local.test'));
select test_helpers.act_as_worker('w10t-w1@local.test');
select public.terminate_worker_contract(pg_temp.id('cT'), pg_temp.rev('cT'), 'Leaving for studies this term.');
select test_helpers.act_as_service();
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w' || n)) from generate_series(2, 3) n;
insert into w10t_ids values ('cD', test_helpers.create_test_contract_draft('w10t-o1@local.test', pg_temp.id('s1'), pg_temp.id('w2'))),
                            ('cW', test_helpers.create_test_contract_draft('w10t-o1@local.test', pg_temp.id('s1'), pg_temp.id('w3')));
select test_helpers.fill_test_contract_draft(pg_temp.id(c), 'w10t-o1@local.test') from unnest(array['cD', 'cW']) c;
select test_helpers.send_test_contract(pg_temp.id(c), 'w10t-o1@local.test') from unnest(array['cD', 'cW']) c;
select test_helpers.act_as_worker('w10t-w2@local.test');
select public.decline_worker_contract_version(pg_temp.id('cD'), (select pending_version_id from public.my_worker_contracts()));
select test_helpers.act_as_owner('w10t-o1@local.test');
select public.withdraw_worker_contract_version(pg_temp.id('cW'), (select pending_version_id from public.owner_worker_contracts() where contract_id = pg_temp.id('cW')));
select test_helpers.act_as_service();
insert into w10t_ids values ('cA', test_helpers.create_accepted_test_contract('w10t-o1@local.test', pg_temp.id('s1'), pg_temp.id('w4'), 'w10t-w4@local.test')),
  ('cX', test_helpers.create_active_test_contract('w10t-o1@local.test', pg_temp.id('s1'), pg_temp.id('w5'), 'w10t-w5@local.test')),
  ('cE', test_helpers.create_accepted_test_contract('w10t-o2@local.test', pg_temp.id('s2'), pg_temp.id('w6'), 'w10t-w6@local.test')),
  ('cL', test_helpers.create_active_test_contract('w10t-o2@local.test', pg_temp.id('s2'), pg_temp.id('w7'), 'w10t-w7@local.test'));

-- ---------- refused ----------
select is(array[pg_temp.repair('cT', 'status = ''active'''), pg_temp.repair('cT', 'status = ''active'', ended_at = null, ended_by = null, end_reason = null'),
                pg_temp.repair('cT', 'status = ''accepted''')],
          array_fill('42501'::text, array[3]), 'w10_trusted_repair_cannot_revive_terminated_contract');
select is(pg_temp.status('cT') || ',' || test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), 'terminated,ended,contract_terminated,0',
          'w10_trusted_repair_cannot_revive_terminated_contract');
select is(array[pg_temp.repair('cD', 'status = ''sent_for_review'''), pg_temp.repair('cD', 'status = ''terminated'''),
                pg_temp.repair('cW', 'status = ''sent_for_review'''), pg_temp.repair('cW', 'status = ''expired''')],
          array_fill('42501'::text, array[4]), 'w10_trusted_repair_cannot_reopen_declined_or_withdrawn');
select is(pg_temp.status('cD') || ',' || pg_temp.status('cW') || ',' || test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o1')),
          'declined,withdrawn,none', 'w10_trusted_repair_cannot_reopen_declined_or_withdrawn');
select is(array[pg_temp.repair('cA', 'status = ''active'', activated_at = now()'), pg_temp.repair('cX', 'status = ''accepted'''),
                pg_temp.repair('cA', 'status = ''draft''')],
          array_fill('42501'::text, array[3]), 'w10_trusted_repair_cannot_activate_accepted_contract');
select is(pg_temp.status('cA') || ',' || test_helpers.relationship_row(pg_temp.id('w4'), pg_temp.id('o1')), 'accepted,pending_start,contract_accepted_not_started,0',
          'w10_trusted_repair_cannot_activate_accepted_contract');
select is(array[pg_temp.repair('cT', 'ended_at = null'), pg_temp.repair('cD', 'ended_at = null')],
          array_fill('42501'::text, array[2]), 'w10_trusted_repair_cannot_null_ended_at');
select ok((select ended_at is not null from public.worker_contracts where id = pg_temp.id('cT')), 'w10_trusted_repair_cannot_null_ended_at');

-- ---------- allowed: forward to terminated / expired ----------
select is(pg_temp.repair('cX', 'status = ''terminated'''), 'succeeded', 'w10_trusted_repair_active_to_terminated_allowed_and_ends_relationship');
select is((select status || ',' || ended_by || ',' || (ended_at is not null) from public.worker_contracts where id = pg_temp.id('cX'))
          || ',' || test_helpers.relationship_row(pg_temp.id('w5'), pg_temp.id('o1')),
          'terminated,trusted_session,true,ended,contract_terminated,0', 'w10_trusted_repair_active_to_terminated_allowed_and_ends_relationship');
select is((select payload ->> 'changed_by' from public.workforce_audit_events where action = 'worker_owner_relationship.status_changed'
           and subject_profile_id = pg_temp.id('w5') order by id desc limit 1), 'trusted_session',
          'w10_trusted_repair_active_to_terminated_allowed_and_ends_relationship');
select is(pg_temp.repair('cE', 'status = ''expired'', ended_at = now()'), 'succeeded', 'w10_trusted_repair_active_to_terminated_allowed_and_ends_relationship');
select is(test_helpers.relationship_row(pg_temp.id('w6'), pg_temp.id('o2')), 'ended,contract_expired,0',
          'w10_trusted_repair_active_to_terminated_allowed_and_ends_relationship');

-- ---------- every other W9 guard behaviour is unchanged ----------
select is(array[pg_temp.repair('cL', format('owner_id = %L', pg_temp.id('o1'))), pg_temp.repair('cL', 'start_date = start_date - 1'),
                pg_temp.repair('cL', 'decline_note = ''Repair note''')],
          array_fill('42501'::text, array[3]), 'w10_w9_guard_behaviour_otherwise_unchanged');
select is(array[pg_temp.repair('cT', 'updated_at = now()'), pg_temp.repair('cL', 'activated_at = activated_at')],
          array['succeeded', 'succeeded'], 'w10_w9_guard_behaviour_otherwise_unchanged');
select test_helpers.act_as_owner('w10t-o2@local.test');
select is(test_helpers.attempt(format('update public.worker_contracts set status = ''terminated'' where id = %L', pg_temp.id('cL'))), '42501',
          'w10_w9_guard_behaviour_otherwise_unchanged');
select is((public.terminate_worker_contract(pg_temp.id('cL'), pg_temp.rev('cL'), 'The shop is closing this branch.')).status, 'terminated',
          'w10_w9_guard_behaviour_otherwise_unchanged');
select test_helpers.act_as_service();
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('o2')), 'w10_w9_guard_behaviour_otherwise_unchanged');
select ok((select prosrc ~ 'W10 \(D-40, P64\)' and obj_description(oid, 'pg_proc') like 'W9:%W10: forward-only trusted repairs.'
           and proconfig = array['search_path=public, pg_temp'] from pg_proc where oid = 'public.worker_contracts_guard_write()'::regprocedure)
          and exists (select 1 from pg_trigger where tgname = 'worker_contracts_guard_write' and tgrelid = 'public.worker_contracts'::regclass
                      and tgenabled = 'O'), 'w10_w9_guard_behaviour_otherwise_unchanged');

select * from finish();
rollback;
