-- J15 (W10): counting policy per status (D-3, D-36, P58). Drafts, offers, declines and withdrawals create no
-- relationship; accepted-not-started is pending_start; only active counts; terminated / expired / effectively expired
-- end it; a lost verification, an inactive, transferred or deleted shop suspend it (and a restored verification
-- reinstates it); an owner account deletion makes it owner_removed. W9 has no revoked / suspended contract status.
-- Roster links, applications, training and certificates never count. Stored = live after each transition.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j15r-a1@local.test')::text, true);
create temporary table j15r_ids (label text primary key, id uuid) on commit drop;
grant all on j15r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j15r_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.rel(p_worker text, p_owner text) returns text language sql stable
as $$ select test_helpers.relationship_row(pg_temp.id(p_worker), pg_temp.id(p_owner)) $$;
create function pg_temp.cnt(p_worker text) returns integer language sql stable
as $$ select public.worker_distinct_qualifying_owner_count(pg_temp.id(p_worker), null) $$;
create function pg_temp.mismatches() returns integer language sql stable as $$
  select count(*)::int from public.worker_owner_relationships r
  where r.owner_id is not null and test_helpers.relationship_row(r.worker_id, r.owner_id) <> test_helpers.relationship_live(r.worker_id, r.owner_id) $$;
create function pg_temp.active(p_label text, p_owner text, p_shop text, p_worker text, p_end date default null) returns uuid language plpgsql as $$
declare
  contract_id uuid := test_helpers.create_active_test_contract('j15r-' || p_owner || '@local.test', pg_temp.id(p_shop), pg_temp.id(p_worker),
                                                               'j15r-' || p_worker || '@local.test', p_end);
begin
  insert into j15r_ids values (p_label, contract_id);
  return contract_id;
end $$;
insert into j15r_ids select 'o' || n, test_helpers.create_owner('j15r-o' || n || '@local.test') from generate_series(1, 9) n;
insert into j15r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j15r-w' || n || '@local.test')) from generate_series(1, 11) n;
insert into j15r_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 9) n;

-- ---------- offers never create a relationship ----------
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w' || n)) from generate_series(1, 2) n;
insert into j15r_ids values ('c1', test_helpers.create_test_contract_draft('j15r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'))),
                            ('c2', test_helpers.create_test_contract_draft('j15r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w2')));
select is(pg_temp.rel('w1', 'o1'), 'none', 'j15_draft_and_sent_offer_create_no_relationship');
select test_helpers.fill_test_contract_draft(pg_temp.id(c), 'j15r-o1@local.test') from unnest(array['c1', 'c2']) c;
select test_helpers.send_test_contract(pg_temp.id(c), 'j15r-o1@local.test') from unnest(array['c1', 'c2']) c;
select is(pg_temp.rel('w1', 'o1') || ',' || pg_temp.rel('w2', 'o1'), 'none,none', 'j15_draft_and_sent_offer_create_no_relationship');
select test_helpers.act_as_worker('j15r-w1@local.test');
select is((public.decline_worker_contract_version(pg_temp.id('c1'), (select pending_version_id from public.my_worker_contracts()))).status, 'declined',
          'j15_declined_offer_not_counted');
select test_helpers.act_as_service();
select is(pg_temp.rel('w1', 'o1') || ',' || pg_temp.cnt('w1'), 'none,0', 'j15_declined_offer_not_counted');
select test_helpers.act_as_owner('j15r-o1@local.test');
select public.withdraw_worker_contract_version(pg_temp.id('c2'), (select pending_version_id from public.owner_worker_contracts()
                                                                   where contract_id = pg_temp.id('c2')));
select test_helpers.act_as_service();
select is((select status from public.worker_contracts where id = pg_temp.id('c2')) || ',' || pg_temp.rel('w2', 'o1') || ',' || pg_temp.cnt('w2'),
          'withdrawn,none,0', 'j15_withdrawn_offer_not_counted');

-- ---------- accepted, active, terminated (worker / owner) ----------
insert into j15r_ids values ('c3', test_helpers.create_accepted_test_contract('j15r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w3'), 'j15r-w3@local.test'));
select is(pg_temp.rel('w3', 'o1') || ',' || pg_temp.cnt('w3'), 'pending_start,contract_accepted_not_started,0,0',
          'j15_accepted_not_started_pending_start_not_counted');
select test_helpers.act_as_owner('j15r-o1@local.test');
select public.activate_worker_contract(pg_temp.id('c3'), pg_temp.rev('c3'));
select test_helpers.act_as_service();
select is(pg_temp.rel('w3', 'o1') || ',' || pg_temp.cnt('w3'), 'active,contract_active,1,1', 'j15_active_counted');
select test_helpers.act_as_worker('j15r-w3@local.test');
select public.terminate_worker_contract(pg_temp.id('c3'), pg_temp.rev('c3'), 'I found work closer to home.');
select test_helpers.act_as_service();
select is(pg_temp.rel('w3', 'o1') || ',' || pg_temp.cnt('w3'), 'ended,contract_terminated,0,0', 'j15_terminated_by_worker_ended_not_counted');
select pg_temp.active('c4', 'o2', 's2', 'w4');
select test_helpers.act_as_owner('j15r-o2@local.test');
select public.terminate_worker_contract(pg_temp.id('c4'), pg_temp.rev('c4'), 'The shop is closing this branch.');
select test_helpers.act_as_service();
select is(pg_temp.rel('w4', 'o2') || ',' || pg_temp.cnt('w4'), 'ended,contract_terminated,0,0', 'j15_terminated_by_owner_ended_not_counted');

-- ---------- expiry (function) and effective expiry (live) ----------
select pg_temp.active('c5', 'o2', 's2', 'w5', test_helpers.manila_today() + 5);
select is(public.expire_worker_contracts(test_helpers.manila_today() + 10), 1, 'j15_expired_by_function_ended_not_counted');
select is(pg_temp.rel('w5', 'o2') || ',' || pg_temp.cnt('w5'), 'ended,contract_expired,0,0', 'j15_expired_by_function_ended_not_counted');
select pg_temp.active('c6', 'o3', 's3', 'w6', test_helpers.manila_today() + 5);
select is(array[test_helpers.relationship_live(pg_temp.id('w6'), pg_temp.id('o3'), test_helpers.manila_today() + 6),
                public.worker_distinct_qualifying_owner_count(pg_temp.id('w6'), test_helpers.manila_today() + 6)::text,
                test_helpers.relationship_live(pg_temp.id('w6'), pg_temp.id('o3'), test_helpers.manila_today() + 5), pg_temp.cnt('w6')::text],
          array['ended,contract_expired,0', '0', 'active,contract_active,1', '1'], 'j15_effectively_expired_not_counted_live');

-- ---------- suspended: verification lost / restored, inactive, transferred, deleted ----------
select pg_temp.active('c7', 'o4', 's4', 'w7');
select test_helpers.act_as_admin('j15r-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = pg_temp.id('s4');
select test_helpers.act_as_service();
select is(pg_temp.rel('w7', 'o4') || ',' || pg_temp.cnt('w7'), 'suspended,owner_verification_not_current,0,0',
          'j15_shop_verification_lost_suspended_not_counted');
select test_helpers.act_as_admin('j15r-a1@local.test');
update public.shops set verification_status = 'approved' where id = pg_temp.id('s4');
select test_helpers.act_as_service();
select is(pg_temp.rel('w7', 'o4') || ',' || pg_temp.cnt('w7'), 'active,contract_active,1,1', 'j15_verification_restored_reinstated_counted');
select test_helpers.act_as_owner('j15r-o4@local.test');
update public.shops set is_active = false where id = pg_temp.id('s4');
select test_helpers.act_as_service();
select is(pg_temp.rel('w7', 'o4') || ',' || pg_temp.cnt('w7'), 'suspended,owner_verification_not_current,0,0', 'j15_shop_inactive_suspended');
select pg_temp.active('c8', 'o5', 's5', 'w8');
update public.shops set owner_id = pg_temp.id('o9') where id = pg_temp.id('s5');   -- trusted repair (shops never change hands in the app)
select is(pg_temp.rel('w8', 'o5') || ',' || pg_temp.cnt('w8'), 'suspended,shop_owner_changed,0,0', 'j15_shop_owner_transfer_suspended');
select is(pg_temp.rel('w8', 'o9'), 'none', 'j15_shop_owner_transfer_suspended');
select pg_temp.active('c9', 'o6', 's6', 'w9');
select test_helpers.act_as_owner('j15r-o6@local.test');
delete from public.shops where id = pg_temp.id('s6');
select test_helpers.act_as_service();
select is(pg_temp.rel('w9', 'o6') || ',' || pg_temp.cnt('w9') || ',' || (select status from public.worker_contracts where id = pg_temp.id('c9')),
          'suspended,shop_removed,0,0,active', 'j15_shop_deleted_suspended_shop_removed');

-- ---------- owner account deleted ----------
select pg_temp.active('c10', 'o7', 's7', 'w10');
insert into j15r_ids values ('rel10', (select id from public.worker_owner_relationships where worker_id = pg_temp.id('w10') and owner_id = pg_temp.id('o7')));
delete from auth.users where id = pg_temp.id('o7');
select is((select status || ',' || status_reason || ',' || qualifying_contract_count || ',' || (owner_id is null) || ',' || (owner_removed_at is not null)
           || ',' || counts_toward_goal from public.worker_owner_relationships where id = pg_temp.id('rel10')),
          'owner_removed,owner_account_removed,0,true,true,false', 'j15_owner_account_deleted_owner_removed_not_counted');
select test_helpers.act_as_worker('j15r-w10@local.test');
select is((select owner_name || ',' || owner_removed || ',' || status || ',' || counts_toward_goal from public.my_owner_relationships()),
          'Local Test Owner,true,owner_removed,false', 'j15_owner_account_deleted_owner_removed_not_counted');
select is((select qualifying_owner_count from public.my_owner_relationship_progress()), 0, 'j15_owner_account_deleted_owner_removed_not_counted');
select test_helpers.act_as_service();

-- ---------- vocabulary: no revoked / suspended contract status ----------
select ok((select pg_get_constraintdef(oid) !~ '(revoked|suspended)' and pg_get_constraintdef(oid) ~ 'terminated'
           from pg_constraint where conrelid = 'public.worker_contracts'::regclass and conname = 'wc_status_check'),
          'j15_no_revoked_or_suspended_contract_status_exists');

-- ---------- roster links, applications, training and certificates never count ----------
select test_helpers.create_roster_worker(pg_temp.id('o8'), pg_temp.id('w11'));
select test_helpers.create_accepted_application(pg_temp.id('s8'), pg_temp.id('w11'));
select test_helpers.issue_test_certification(pg_temp.id('s8'), pg_temp.id('w11'), 'j15r-o8@local.test');
select is(array[(select count(*)::int from public.workers where user_id = pg_temp.id('w11')),
                (select count(*)::int from public.job_applications where worker_id = pg_temp.id('w11') and status = 'accepted'),
                (select count(*)::int from public.training_enrollments where worker_id = pg_temp.id('w11')),
                (select count(*)::int from public.certifications where worker_id = pg_temp.id('w11')),
                (select count(*)::int from public.worker_owner_relationships where worker_id = pg_temp.id('w11')), pg_temp.cnt('w11')],
          array[1, 1, 1, 1, 0, 0], 'j15_roster_link_application_training_and_certificate_never_count');
select test_helpers.act_as_worker('j15r-w11@local.test');
select is((select qualifying_owner_count || ',' || remaining_owner_count from public.my_owner_relationship_progress())
          || ',' || (select count(*) from public.my_owner_relationships()), '0,3,0', 'j15_roster_link_application_training_and_certificate_never_count');
select test_helpers.act_as_service();

-- ---------- stored = live ----------
select is(pg_temp.mismatches(), 0, 'j15_stored_status_matches_live_after_each_transition');
select is((select count(*)::int from public.worker_owner_relationships r join j15r_ids w on w.id = r.worker_id where w.label ~ '^w'), 8,
          'j15_stored_status_matches_live_after_each_transition');
select test_helpers.act_as_admin('j15r-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = pg_temp.id('s2');
select test_helpers.act_as_service();
update public.profiles set role = 'customer' where id = pg_temp.id('o3');   -- trusted repair (D-8)
select is(pg_temp.rel('w6', 'o3') || ',' || pg_temp.mismatches(), 'suspended,owner_role_changed,0,0',
          'j15_stored_status_matches_live_after_each_transition');

select * from finish();
rollback;
