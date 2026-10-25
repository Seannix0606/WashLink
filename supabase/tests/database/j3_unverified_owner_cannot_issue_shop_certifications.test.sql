-- J3 (certification half, W7; closes W2 R-4): only the CURRENT owner of a shop with a recorded verification
-- issues, renews or reinstates shop-issued certifications; losing verification later never voids issued ones
-- (the issue-time snapshot stays) and still allows protective suspension / revocation. Local Docker stack only;
-- synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j3c-a1@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j3c-c1@local.test')::text, true);
select count(test_helpers.create_owner('j3c-' || l || '@local.test')) from unnest(array['pending', 'rejected', 'changes', 'noreview', 'inactive', 'ok', 'other']) l;
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j3c-w' || n || '@local.test'))) from generate_series(1, 12) n;
create function pg_temp.u(p_label text) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j3c-' || p_label || '@local.test' $$;
create temporary table j3c_ids (label text primary key, id uuid) on commit drop;
grant all on j3c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j3c_ids where label = p_label $$;
insert into j3c_ids values
  ('s_pending', test_helpers.create_shop(pg_temp.u('pending'), 'pending')), ('s_rejected', test_helpers.create_shop(pg_temp.u('rejected'), 'rejected')),
  ('s_changes', test_helpers.create_shop(pg_temp.u('changes'), 'changes_requested')),
  ('s_noreview', test_helpers.create_shop(pg_temp.u('noreview'), 'approved')),
  ('s_inactive', test_helpers.create_verified_shop(pg_temp.u('inactive'), current_setting('fx.a1')::uuid)),
  ('s_lose', test_helpers.create_verified_shop(pg_temp.u('ok'), current_setting('fx.a1')::uuid)),
  ('s_evt', test_helpers.create_shop(pg_temp.u('ok'), 'pending'));
update public.shops set is_active = false where id = pg_temp.id('s_inactive');
insert into j3c_ids select 'e_' || l, test_helpers.complete_training(pg_temp.id('s_' || l), pg_temp.u('w' || n), 'j3c-' || l || '@local.test')
from (values ('pending', 1), ('rejected', 2), ('changes', 3), ('noreview', 4), ('inactive', 5)) v(l, n);
select test_helpers.act_as_admin('j3c-a1@local.test');
update public.shops set verification_status = 'approved' where id = pg_temp.id('s_evt');
select test_helpers.act_as_service();
insert into j3c_ids values ('e_evt', test_helpers.complete_training(pg_temp.id('s_evt'), pg_temp.u('w6'), 'j3c-ok@local.test')),
  ('e_after', test_helpers.complete_training(pg_temp.id('s_lose'), pg_temp.u('w7'), 'j3c-ok@local.test')),
  ('c_keep', test_helpers.issue_test_certification(pg_temp.id('s_lose'), pg_temp.u('w8'), 'j3c-ok@local.test')),
  ('c_susp', test_helpers.issue_test_certification(pg_temp.id('s_lose'), pg_temp.u('w9'), 'j3c-ok@local.test')),
  ('c_prot', test_helpers.issue_test_certification(pg_temp.id('s_lose'), pg_temp.u('w10'), 'j3c-ok@local.test'));
insert into j3c_ids values ('roster_t', test_helpers.create_roster_worker(pg_temp.u('ok'), pg_temp.u('w11')));
select test_helpers.designate_trainer(e.program_id, pg_temp.id('roster_t')) is not null as trainer_designated
from public.training_enrollments e where e.id = pg_temp.id('e_after');
create function pg_temp.cur(p_enrollment uuid) returns uuid language sql stable security definer
as $$ select public.current_training_assessment_id(p_enrollment) $$;
create function pg_temp.issue_sql(p_label text) returns text language sql stable
as $$ select format('select public.issue_certification(%L, %L, %L)', pg_temp.id(p_label), pg_temp.cur(pg_temp.id(p_label)), 'w7_issuer_v1') $$;

-- ---------- unverified shops cannot issue ----------
create function pg_temp.issue_as_owner(p_label text) returns text language plpgsql as $$
begin
  perform test_helpers.act_as_owner('j3c-' || p_label || '@local.test');
  return test_helpers.attempt(pg_temp.issue_sql('e_' || p_label));
end $$;
select is((select array_agg(pg_temp.issue_as_owner(l) order by l) from unnest(array['changes', 'pending', 'rejected']) l),
          array['23514', '23514', '23514'], 'j3_pending_rejected_changes_requested_shop_cannot_issue');
select test_helpers.act_as_owner('j3c-pending@local.test');
select throws_ok(pg_temp.issue_sql('e_pending'), '23514', 'Only a verified shop can issue certifications.',
                 'j3_pending_rejected_changes_requested_shop_cannot_issue');
select test_helpers.act_as_service();
select is((select array_agg(pg_temp.issue_as_owner(l) order by l) from unnest(array['inactive', 'noreview']) l),
          array['23514', '23514'], 'j3_inactive_or_unreviewed_approved_shop_cannot_issue');
select test_helpers.act_as_owner('j3c-noreview@local.test');
select throws_ok(pg_temp.issue_sql('e_noreview'), '23514', 'Only a verified shop can issue certifications.',
                 'j3_inactive_or_unreviewed_approved_shop_cannot_issue');
select test_helpers.act_as_service();
select is((select count(*)::int from public.certifications where enrollment_id in (select id from j3c_ids where label like 'e\_%')), 0,
          'j3_pending_rejected_changes_requested_shop_cannot_issue');

-- ---------- only the current owner ----------
select test_helpers.act_as_owner('j3c-other@local.test');
select throws_ok(pg_temp.issue_sql('e_after'), '42501', 'Training enrollment not found.', 'j3_other_owner_cannot_issue_for_foreign_enrollment');
select test_helpers.act_as(pg_temp.u('w11'));
select throws_ok(pg_temp.issue_sql('e_after'), '42501', 'Only the shop owner can issue certifications.', 'j3_trainer_cannot_issue');
select test_helpers.act_as(pg_temp.u('w7'));
select throws_ok(pg_temp.issue_sql('e_after'), '42501', 'Only the shop owner can issue certifications.', 'j3_worker_customer_super_admin_anon_cannot_issue');
select test_helpers.act_as_customer('j3c-c1@local.test');
select throws_ok(pg_temp.issue_sql('e_after'), '42501', 'Only the shop owner can issue certifications.', 'j3_worker_customer_super_admin_anon_cannot_issue');
select test_helpers.act_as_admin('j3c-a1@local.test');
select throws_ok(pg_temp.issue_sql('e_after'), '42501', 'Only the shop owner can issue certifications.', 'j3_worker_customer_super_admin_anon_cannot_issue');
select test_helpers.act_as_anon();
select throws_ok(pg_temp.issue_sql('e_after'), '42501', null, 'j3_worker_customer_super_admin_anon_cannot_issue');

-- ---------- verification snapshot (approval decided by a super_admin, audited) ----------
select test_helpers.act_as_owner('j3c-ok@local.test');
insert into j3c_ids select 'c_evt', id from public.issue_certification(pg_temp.id('e_evt'), pg_temp.cur(pg_temp.id('e_evt')), 'w7_issuer_v1');
select test_helpers.act_as_service();
select is((select row(c.shop_verification_status_at_issue, c.shop_verified_by_at_issue = current_setting('fx.a1')::uuid,
                      c.shop_verified_at_at_issue = s.verification_reviewed_at)::text
           from public.certifications c join public.shops s on s.id = c.shop_id where c.id = pg_temp.id('c_evt')),
          row('approved', true, true)::text, 'j3_verification_snapshot_records_status_reviewer_time_and_event');
select is((select shop_verification_event_id from public.certifications where id = pg_temp.id('c_evt')),
          (select max(id) from public.workforce_audit_events where action = 'shop.verification_decided' and subject_id = pg_temp.id('s_evt')
             and payload ->> 'to_status' = 'approved'), 'j3_verification_snapshot_records_status_reviewer_time_and_event');
select ok((select shop_verification_event_id is not null from public.certifications where id = pg_temp.id('c_evt')),
          'j3_verification_snapshot_records_status_reviewer_time_and_event');
select is((select shop_verification_event_id from public.certifications where id = pg_temp.id('c_keep')), null,
          'j3_verification_snapshot_records_status_reviewer_time_and_event');

-- ---------- prepare renew / reinstate, then lose verification ----------
select test_helpers.act_as_owner('j3c-ok@local.test');
select is((public.transition_certification(pg_temp.id('c_susp'), 'active', 'suspended', 'Suspended pending a quality check')).status,
          'suspended', 'j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate');
select is((public.set_shop_certification_validity(pg_temp.id('s_lose'), 1)).validity_months::int, 1,
          'j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate');
select test_helpers.act_as_service();
insert into j3c_ids values ('c_renew', test_helpers.issue_test_certification(pg_temp.id('s_lose'), pg_temp.u('w12'), 'j3c-ok@local.test'));
select test_helpers.act_as_owner('j3c-ok@local.test');
insert into j3c_ids select 'r_renew', id from public.record_certification_reassessment(pg_temp.id('c_renew'), array[true, true], 'passed');
select test_helpers.act_as(pg_temp.u('w9'));
insert into j3c_ids select 'rr_susp', id from public.request_certification_review(pg_temp.id('c_susp'), 'I followed every step of the checklist.');
select test_helpers.act_as_admin('j3c-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Local test: new photo needed'
where id = pg_temp.id('s_lose');

select test_helpers.act_as_owner('j3c-ok@local.test');
select throws_ok(pg_temp.issue_sql('e_after'), '23514', 'Only a verified shop can issue certifications.',
                 'j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate');
select throws_ok(format('select public.renew_certification(%L, %L, %L)', pg_temp.id('c_renew'), pg_temp.id('r_renew'), 'w7_issuer_v1'),
                 '23514', 'Only a verified shop can issue certifications.', 'j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate');
select throws_ok(format('select public.transition_certification(%L, %L, %L, %L)', pg_temp.id('c_susp'), 'suspended', 'active',
                        'Reinstated after the quality check passed'),
                 '23514', 'Only a verified shop can reinstate certifications.', 'j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate');
select throws_ok(format('select public.decide_certification_review(%L, %L, %L)', pg_temp.id('rr_susp'), 'reinstate',
                        'Reinstated after the quality check passed'),
                 '23514', 'Only a verified shop can reinstate certifications.', 'j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate');
select is((select status from public.certifications where id = pg_temp.id('c_susp')), 'suspended',
          'j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate');
select is((public.transition_certification(pg_temp.id('c_prot'), 'active', 'suspended', 'Suspended after a customer complaint')).status,
          'suspended', 'j3_owner_who_lost_verification_can_still_suspend_or_revoke');
select is((public.transition_certification(pg_temp.id('c_prot'), 'suspended', 'revoked', 'Revoked after the complaint was confirmed')).status,
          'revoked', 'j3_owner_who_lost_verification_can_still_suspend_or_revoke');
select is((public.transition_certification(pg_temp.id('c_susp'), 'suspended', 'revoked', 'Revoked after the quality check failed')).status,
          'revoked', 'j3_owner_who_lost_verification_can_still_suspend_or_revoke');

-- ---------- issued certificates survive the loss ----------
select test_helpers.act_as_service();
select is((select row(status, public.certification_effective_status(status, expires_at, now()), shop_verification_status_at_issue)::text
           from public.certifications where id = pg_temp.id('c_keep')), row('active', 'active', 'approved')::text,
          'j3_issued_certification_survives_later_loss_of_verification');
select ok(public.worker_holds_current_certification(pg_temp.u('w8')), 'j3_issued_certification_survives_later_loss_of_verification');
select test_helpers.act_as(pg_temp.u('w8'));
select is((select row(status, effective_status, issuing_shop_present, issuing_shop_currently_verified)::text from public.my_certifications()),
          row('active', 'active', true, false)::text, 'j3_issued_certification_survives_later_loss_of_verification');
select test_helpers.act_as_service();
select is((select count(*)::int from public.notifications n join public.certifications c on c.worker_id = n.recipient_id
           where c.id = pg_temp.id('c_keep') and n.category like 'certification%' and n.category <> 'certification.issued'), 0,
          'j3_issued_certification_survives_later_loss_of_verification');

select * from finish();
rollback;
