-- J3 (W14): approved shops without a recorded super_admin review (D-10 row 14; D-56; W14 PLAN 3.6, P79). The queue lists
-- them with the reviewer state; a super_admin confirms (reviewer stamped, status unchanged, owner notified, publishing and
-- worker visibility restored, owner relationships refreshed) or requests changes / rejects through the W2b / W3 decision
-- path. The stamp trigger is inert without the flag, for non-admins and for reviewed shops. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create temporary table j3u_ids (label text primary key, id uuid) on commit drop;
grant all on j3u_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j3u_ids where label = p_label $$;
insert into j3u_ids values ('a1', test_helpers.create_super_admin('j3u-a1@local.test'));
insert into j3u_ids values ('a2', test_helpers.create_super_admin('j3u-a2@local.test'));
insert into j3u_ids values ('cu', test_helpers.create_customer('j3u-cu@local.test'));
insert into j3u_ids select 'o' || n, test_helpers.create_owner('j3u-o' || n || '@local.test') from generate_series(1, 4) n;
insert into j3u_ids values ('w1', test_helpers.create_worker_profile(test_helpers.create_worker('j3u-w1@local.test')));
insert into j3u_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a2')));
insert into j3u_ids values ('s2', test_helpers.make_test_shop_legacy_unreviewed(test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1')), true));
insert into j3u_ids values ('s3', test_helpers.create_verified_shop(pg_temp.id('o3'), pg_temp.id('cu')));
insert into j3u_ids values ('s4', test_helpers.create_verified_shop(pg_temp.id('o4'), pg_temp.id('a1')));
insert into j3u_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test washer one')));
insert into j3u_ids values ('jd', test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test draft one'));
insert into j3u_ids values ('j3', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s3'), 'Local test washer three')));
insert into j3u_ids values ('k1', test_helpers.create_active_test_contract('j3u-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j3u-w1@local.test'));
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), 'active,contract_active,1', 'w14_confirm_refreshes_owner_relationships');
select test_helpers.delete_test_admin_profile(pg_temp.id('a2')) is not null as admin_deleted;
create function pg_temp.queue() returns text language sql stable as $$
  select coalesce(string_agg(q.shop_name_label || ':' || q.reviewer_state, ',' order by q.shop_name_label), '-')
  from (select case u.shop_id when pg_temp.id('s1') then 's1' when pg_temp.id('s2') then 's2' when pg_temp.id('s3') then 's3' else 'other' end
                 as shop_name_label, u.reviewer_state from public.admin_unreviewed_approved_shops() u) q $$;

-- ---------- queue ----------
select test_helpers.act_as_admin('j3u-a1@local.test');
select ok(pg_temp.queue() like '%s1:reviewer_missing%', 'w14_queue_lists_reviewer_missing_after_admin_deleted');
select is((select verification_reviewed_by from public.shops where id = pg_temp.id('s1')), null, 'w14_queue_lists_reviewer_missing_after_admin_deleted');
select is((select owner_display_name || ',' || is_active::text || ',' || published_opening_count || ',' || active_contract_count || ','
                  || current_certification_count || ',' || suspended_relationship_count
           from public.admin_unreviewed_approved_shops() where shop_id = pg_temp.id('s1')),
          'Local Test Owner,true,2,1,0,1', 'w14_queue_lists_reviewer_missing_after_admin_deleted');   -- j1 + the contract helper's opening
select ok(pg_temp.queue() like '%s2:review_time_missing%', 'w14_queue_lists_legacy_null_review_time');
select ok(pg_temp.queue() like '%s3:reviewer_not_super_admin%', 'w14_queue_lists_reviewer_not_super_admin');
select is((select count(*)::int from public.admin_unreviewed_approved_shops() where shop_id = pg_temp.id('s4')), 0,
          'w14_queue_lists_reviewer_not_super_admin');
select test_helpers.act_as_service();
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), 'suspended,owner_verification_not_current,0',
          'w14_confirm_refreshes_owner_relationships');

-- ---------- before confirmation: not publishable, not visible ----------
select test_helpers.act_as_worker('j3u-w1@local.test');
select is((select count(*)::int from public.job_openings where id = pg_temp.id('j1')), 0, 'w14_confirm_restores_publish_and_worker_visibility');
select test_helpers.act_as_owner('j3u-o1@local.test');
select throws_ok(format('select public.transition_job_opening(%L, %L, %L)', pg_temp.id('jd'), 'draft', 'published'), '42501',
                 'Only a verified shop can publish job openings.', 'w14_confirm_restores_publish_and_worker_visibility');

-- ---------- confirm ----------
select test_helpers.act_as_admin('j3u-a1@local.test');
select is((select verification_status from public.rereview_approved_shop(pg_temp.id('s1'), 'confirm_approval')), 'approved',
          'w14_confirm_stamps_reviewer_without_status_change');
select test_helpers.act_as_service();
select is((select verification_status || ',' || (verification_reviewed_by = pg_temp.id('a1'))::text || ',' || (verification_reviewed_at = now())::text
           from public.shops where id = pg_temp.id('s1')), 'approved,true,true', 'w14_confirm_stamps_reviewer_without_status_change');
select is((select string_agg(action || ':' || coalesce(payload ->> 'from_reviewer_state', '') || ':' || coalesce(payload ->> 'to_status', ''), ',')
           from public.workforce_audit_events where subject_id = pg_temp.id('s1') and action like 'shop.verification_%'),
          'shop.verification_rereviewed:reviewer_missing:approved', 'w14_confirm_stamps_reviewer_without_status_change');
select is((select string_agg(title || '|' || body, ',') from public.notifications where recipient_id = pg_temp.id('o1') and category like 'shop_verification.%'),
          'Shop verification confirmed|WashLink confirmed the verification of ' || (select name from public.shops where id = pg_temp.id('s1')) || '.',
          'w14_confirm_stamps_reviewer_without_status_change');
select is(public.shop_has_recorded_verification(pg_temp.id('s1')), true, 'w14_confirm_restores_publish_and_worker_visibility');
select test_helpers.act_as_worker('j3u-w1@local.test');
select is((select count(*)::int from public.job_openings where id = pg_temp.id('j1')), 1, 'w14_confirm_restores_publish_and_worker_visibility');
select test_helpers.act_as_owner('j3u-o1@local.test');
select is((public.transition_job_opening(pg_temp.id('jd'), 'draft', 'published')).status, 'published', 'w14_confirm_restores_publish_and_worker_visibility');
select test_helpers.act_as_service();
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), 'active,contract_active,1', 'w14_confirm_refreshes_owner_relationships');

-- ---------- request changes / reject through the decision path ----------
select test_helpers.act_as_admin('j3u-a1@local.test');
select throws_ok(format('select public.rereview_approved_shop(%L, %L)', pg_temp.id('s2'), 'request_changes'), '23514',
                 'Write notes of 20 to 1000 characters.', 'w14_rereview_notes_required');
select throws_ok(format('select public.rereview_approved_shop(%L, %L, %L)', pg_temp.id('s2'), 'reject', 'too short'), '23514',
                 'Write notes of 20 to 1000 characters.', 'w14_rereview_notes_required');
select throws_ok(format('select public.rereview_approved_shop(%L, %L)', pg_temp.id('s2'), 'approve'), '22023',
                 'Choose confirm approval, request changes or reject.', 'w14_rereview_notes_required');
select is((select verification_status from public.rereview_approved_shop(pg_temp.id('s2'), 'request_changes',
                                                                         'Upload a current business permit for this shop.')),
          'changes_requested', 'w14_request_changes_and_reject_use_decision_path');
select is((select verification_status from public.rereview_approved_shop(pg_temp.id('s3'), 'reject', 'The documents do not match this shop address.')),
          'rejected', 'w14_request_changes_and_reject_use_decision_path');
select test_helpers.act_as_service();
select is((select string_agg(s.verification_status || ',' || s.verification_notes || ',' || (s.verification_reviewed_by = pg_temp.id('a1'))::text, ';' order by s.verification_status)
           from public.shops s where s.id in (pg_temp.id('s2'), pg_temp.id('s3'))),
          'changes_requested,Upload a current business permit for this shop.,true;rejected,The documents do not match this shop address.,true',
          'w14_request_changes_and_reject_use_decision_path');
select is((select string_agg(e.action || ':' || coalesce(e.payload ->> 'to_status', ''), ',' order by e.action)
           from public.workforce_audit_events e where e.subject_id = pg_temp.id('s2') and e.action like 'shop.verification_%'),
          'shop.verification_decided:changes_requested,shop.verification_rereviewed:changes_requested', 'w14_request_changes_and_reject_use_decision_path');
select is((select string_agg(n.category, ',') from public.notifications n where n.recipient_id = pg_temp.id('o3')), 'shop_verification.status_changed',
          'w14_request_changes_and_reject_use_decision_path');

-- ---------- refusals ----------
select test_helpers.act_as_admin('j3u-a1@local.test');
select throws_ok(format('select public.rereview_approved_shop(%L, %L)', pg_temp.id('s4'), 'confirm_approval'), '23514',
                 'This shop already has a recorded review.', 'w14_rereview_refused_for_reviewed_shop');
select throws_ok(format('select public.rereview_approved_shop(%L, %L)', pg_temp.id('s1'), 'confirm_approval'), '23514',
                 'This shop already has a recorded review.', 'w14_rereview_refused_for_reviewed_shop');
select test_helpers.act_as_service();
select test_helpers.make_test_shop_legacy_unreviewed(pg_temp.id('s4')) is not null as legacy;
select test_helpers.act_as_owner('j3u-o4@local.test');
select throws_ok(format('select public.rereview_approved_shop(%L, %L)', pg_temp.id('s4'), 'confirm_approval'), '42501',
                 'Only a platform administrator can review shops.', 'w14_non_admin_cannot_rereview_or_read_queue');
select is((select count(*)::int from public.admin_unreviewed_approved_shops()), 0, 'w14_non_admin_cannot_rereview_or_read_queue');
select test_helpers.act_as_worker('j3u-w1@local.test');
select is(array[test_helpers.attempt(format('select public.rereview_approved_shop(%L, %L)', pg_temp.id('s4'), 'confirm_approval')),
                (select count(*) from public.admin_unreviewed_approved_shops())::text], array['42501', '0'],
          'w14_non_admin_cannot_rereview_or_read_queue');

-- ---------- the stamp is inert without the flag / for non-admins ----------
select test_helpers.act_as_admin('j3u-a1@local.test');
update public.shops set verification_reviewed_at = now(), verification_reviewed_by = pg_temp.id('a1') where id = pg_temp.id('s4');
select test_helpers.act_as_owner('j3u-o4@local.test');
select set_config('washlink.shop_rereview', pg_temp.id('s4')::text, true);
update public.shops set phone_number = '0000' where id = pg_temp.id('s4');
select set_config('washlink.shop_rereview', '', true);
select test_helpers.act_as_service();
select set_config('washlink.shop_rereview', pg_temp.id('s4')::text, true);
update public.shops set is_active = true where id = pg_temp.id('s4');
select set_config('washlink.shop_rereview', '', true);
select is((select coalesce(verification_reviewed_by::text, 'null') || ',' || coalesce(verification_reviewed_at::text, 'null') || ',' || phone_number
           from public.shops where id = pg_temp.id('s4')), 'null,null,0000', 'w14_stamp_trigger_inert_without_flag');
select is((select count(*)::int from public.workforce_audit_events where subject_id = pg_temp.id('s4') and action = 'shop.verification_rereviewed'), 0,
          'w14_stamp_trigger_inert_without_flag');

select * from finish();
rollback;
