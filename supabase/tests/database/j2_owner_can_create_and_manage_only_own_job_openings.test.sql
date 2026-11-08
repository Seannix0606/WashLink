-- J2 (W4): an owner creates, edits and deletes job openings for their own shops only; drafts
-- are private; pay and terms are optional and stored exactly as entered (P16-P18).
-- Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j2-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j2-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j2-o2@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('j2-w1@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j2-c1@local.test')::text, true);
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s1u', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.o2_draft', test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'Other owner draft')::text, true);
select set_config('fx.o2_pub', test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'Other owner published')::text, true);
select set_config('fx.o2_paused', test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'Other owner paused')::text, true);
select set_config('fx.o2_closed', test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'Other owner closed')::text, true);
select set_config('fx.o2_archived', test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'Other owner archived')::text, true);
-- Trusted session (fixture): place the other owner's rows in every status.
update public.job_openings set status = 'published', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.o2_pub')::uuid;
update public.job_openings set status = 'paused', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.o2_paused')::uuid;
update public.job_openings set status = 'closed', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.o2_closed')::uuid;
update public.job_openings set status = 'archived', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.o2_archived')::uuid;
select set_config('fx.o1_pub', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Owner one published')::text, true);

-- ---------- create ----------
select test_helpers.act_as_owner('j2-o1@local.test');
select lives_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1')::uuid, 'Car wash attendant') $$,
                'j2_owner_can_create_draft_for_own_shop');
select is((select count(*)::int from public.job_openings
           where shop_id = current_setting('fx.s1')::uuid and title = 'Car wash attendant' and status = 'draft'),
          1, 'j2_owner_can_create_draft_for_own_shop');
select set_config('fx.j1', (select id::text from public.job_openings where title = 'Car wash attendant'), true);

select lives_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1u')::uuid, 'Pending shop draft') $$,
                'j2_owner_can_create_draft_while_shop_unverified');
select is((select count(*)::int from public.job_openings where shop_id = current_setting('fx.s1u')::uuid),
          1, 'j2_owner_can_create_draft_while_shop_unverified');

select throws_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s2')::uuid, 'Hijack draft') $$,
                 '42501', 'You can create job openings only for your own shop.',
                 'j2_owner_cannot_create_opening_for_another_owners_shop');
select throws_ok($$ insert into public.job_openings (shop_id, title) values (gen_random_uuid(), 'No shop draft') $$,
                 '42501', 'You can create job openings only for your own shop.',
                 'j2_owner_cannot_create_opening_for_another_owners_shop');

select test_helpers.act_as_customer('j2-c1@local.test');
select throws_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1')::uuid, 'Customer draft') $$,
                 '42501', 'Only owner accounts can create job openings.', 'j2_customer_and_worker_cannot_create_openings');
select test_helpers.act_as_worker('j2-w1@local.test');
select throws_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1')::uuid, 'Worker draft') $$,
                 '42501', 'Only owner accounts can create job openings.', 'j2_customer_and_worker_cannot_create_openings');

select test_helpers.act_as_owner('j2-o1@local.test');
select lives_ok($$
  insert into public.job_openings (shop_id, owner_id, title, created_at, updated_at, first_published_at, status_changed_at)
  values (current_setting('fx.s1')::uuid, current_setting('fx.o2')::uuid, 'Forged stamps draft',
          '2000-01-01', '2000-01-01', '2000-01-01', '2000-01-01')
$$, 'j2_insert_forces_owner_and_server_stamps');
select is((select row(owner_id = current_setting('fx.o1')::uuid, created_at > '2001-01-01', updated_at > '2001-01-01',
                      first_published_at is null, status_changed_at is null)::text
           from public.job_openings where title = 'Forged stamps draft'),
          row(true, true, true, true, true)::text, 'j2_insert_forces_owner_and_server_stamps');

-- ---------- edit / delete own drafts ----------
select lives_ok($$
  update public.job_openings set description = '  Wash and dry cars  ', duties = array[' Rinse ', 'rinse', 'Dry', '  ']
  where id = current_setting('fx.j1')::uuid
$$, 'j2_owner_can_edit_own_draft');
select is((select row(description, duties)::text from public.job_openings where id = current_setting('fx.j1')::uuid),
          row('Wash and dry cars'::text, array['Rinse', 'Dry'])::text, 'j2_owner_can_edit_own_draft');

select lives_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1')::uuid, 'Draft to delete') $$,
                'j2_owner_can_delete_own_draft_only');
select lives_ok($$ delete from public.job_openings where title = 'Draft to delete' $$, 'j2_owner_can_delete_own_draft_only');
select is((select count(*)::int from public.job_openings where title = 'Draft to delete'), 0, 'j2_owner_can_delete_own_draft_only');
select is((select status from public.transition_job_opening(current_setting('fx.o1_pub')::uuid, 'draft', 'published')),
          'published', 'j2_owner_can_delete_own_draft_only');
with deleted as (delete from public.job_openings where id = current_setting('fx.o1_pub')::uuid returning 1)
select is(count(*)::int, 0, 'j2_owner_can_delete_own_draft_only') from deleted;
select is((select count(*)::int from public.job_openings where id = current_setting('fx.o1_pub')::uuid), 1,
          'j2_owner_can_delete_own_draft_only');

-- ---------- another owner's openings ----------
select is((select count(*)::int from public.job_openings where shop_id = current_setting('fx.s2')::uuid
              or owner_id = current_setting('fx.o2')::uuid),
          0, 'j2_owner_cannot_read_another_owners_openings');
select is((select count(*)::int from public.job_openings where id in (
             current_setting('fx.o2_draft')::uuid, current_setting('fx.o2_pub')::uuid, current_setting('fx.o2_paused')::uuid,
             current_setting('fx.o2_closed')::uuid, current_setting('fx.o2_archived')::uuid)),
          0, 'j2_owner_cannot_read_another_owners_openings');

with updated as (update public.job_openings set title = 'Hijacked title' where id = current_setting('fx.o2_draft')::uuid returning 1)
select is(count(*)::int, 0, 'j2_owner_cannot_update_another_owners_opening') from updated;
with updated as (update public.job_openings set benefits = 'Hijacked' where id = current_setting('fx.o2_pub')::uuid returning 1)
select is(count(*)::int, 0, 'j2_owner_cannot_update_another_owners_opening') from updated;
with deleted as (delete from public.job_openings where id = current_setting('fx.o2_draft')::uuid returning 1)
select is(count(*)::int, 0, 'j2_owner_cannot_delete_another_owners_opening') from deleted;
select throws_ok($$ select public.transition_job_opening(current_setting('fx.o2_draft')::uuid, 'draft', 'published') $$,
                 '42501', 'Job opening not found.', 'j2_owner_cannot_transition_another_owners_opening');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.o2_pub')::uuid, 'published', 'paused') $$,
                 '42501', 'Job opening not found.', 'j2_owner_cannot_transition_another_owners_opening');
select throws_ok($$ select public.transition_job_opening(gen_random_uuid(), 'draft', 'published') $$,
                 '42501', 'Job opening not found.', 'j2_owner_cannot_transition_another_owners_opening');

select test_helpers.act_as_service();
select is((select row(title, benefits, status)::text from public.job_openings where id = current_setting('fx.o2_draft')::uuid),
          row('Other owner draft'::text, null::text, 'draft'::text)::text, 'j2_owner_cannot_update_another_owners_opening');
select is((select row(benefits, status)::text from public.job_openings where id = current_setting('fx.o2_pub')::uuid),
          row(null::text, 'published'::text)::text, 'j2_owner_cannot_update_another_owners_opening');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.o2_draft')::uuid),
          1, 'j2_owner_cannot_delete_another_owners_opening');
select is((select row(status, status_changed_at, first_published_at)::text from public.job_openings
           where id = current_setting('fx.o2_draft')::uuid),
          row('draft'::text, null::timestamptz, null::timestamptz)::text, 'j2_owner_cannot_transition_another_owners_opening');

-- ---------- immutable shop and server stamps ----------
select test_helpers.act_as_owner('j2-o1@local.test');
select throws_ok($$ update public.job_openings set shop_id = current_setting('fx.s1u')::uuid where id = current_setting('fx.j1')::uuid $$,
                 '42501', 'This job opening field cannot be changed.', 'j2_owner_cannot_move_opening_to_another_shop');
select throws_ok($$ update public.job_openings set shop_id = current_setting('fx.s2')::uuid where id = current_setting('fx.j1')::uuid $$,
                 '42501', 'This job opening field cannot be changed.', 'j2_owner_cannot_move_opening_to_another_shop');
select throws_ok($$ update public.job_openings set created_at = '2000-01-01' where id = current_setting('fx.j1')::uuid $$,
                 '42501', 'This job opening field cannot be changed.', 'j2_server_stamps_cannot_be_forged');
select throws_ok($$ update public.job_openings set first_published_at = now() where id = current_setting('fx.j1')::uuid $$,
                 '42501', 'This job opening field cannot be changed.', 'j2_server_stamps_cannot_be_forged');
select throws_ok($$ update public.job_openings set status_changed_at = now() where id = current_setting('fx.j1')::uuid $$,
                 '42501', 'This job opening field cannot be changed.', 'j2_server_stamps_cannot_be_forged');
select throws_ok($$ update public.job_openings set owner_id = current_setting('fx.o2')::uuid where id = current_setting('fx.j1')::uuid $$,
                 '42501', null, 'j2_server_stamps_cannot_be_forged');
select lives_ok($$ update public.job_openings set updated_at = '2000-01-01' where id = current_setting('fx.j1')::uuid $$,
                'j2_server_stamps_cannot_be_forged');
select ok((select updated_at > '2001-01-01' from public.job_openings where id = current_setting('fx.j1')::uuid),
          'j2_server_stamps_cannot_be_forged');

-- ---------- visibility ----------
select is((select count(*)::int from public.job_openings where id = current_setting('fx.o2_draft')::uuid), 0, 'j2_drafts_never_visible_to_others');
select test_helpers.act_as_worker('j2-w1@local.test');
select is((select count(*)::int from public.job_openings where status = 'draft'), 0, 'j2_drafts_never_visible_to_others');
select test_helpers.act_as_customer('j2-c1@local.test');
select is((select count(*)::int from public.job_openings), 0, 'j2_drafts_never_visible_to_others');
select test_helpers.act_as_admin('j2-a1@local.test');
select is((select count(*)::int from public.job_openings where status = 'draft'), 0, 'j2_drafts_never_visible_to_others');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.job_openings'), '42501', 'j2_drafts_never_visible_to_others');

select test_helpers.act_as_worker('j2-w1@local.test');
select is((select array_agg(id::text order by id) from public.job_openings),
          (select array_agg(x order by x) from unnest(array[current_setting('fx.o2_pub'), current_setting('fx.o1_pub')]) x),
          'j2_published_opening_visible_to_workers_only');
select test_helpers.act_as_customer('j2-c1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.o2_pub')::uuid), 0,
          'j2_published_opening_visible_to_workers_only');
select test_helpers.act_as_anon();
select is(test_helpers.attempt($$ select 1 from public.job_openings where status = 'published' $$), '42501',
          'j2_published_opening_visible_to_workers_only');
select test_helpers.act_as_owner('j2-o1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.o2_pub')::uuid), 0,
          'j2_published_opening_visible_to_workers_only');
select test_helpers.act_as_admin('j2-a1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.o2_pub')::uuid), 1,
          'j2_published_opening_visible_to_workers_only');

-- ---------- compensation: optional, stored as entered, no defaults (P16) ----------
select test_helpers.act_as_owner('j2-o1@local.test');
select is((select row(compensation_min_amount, compensation_max_amount, compensation_currency, compensation_period,
                      compensation_details, benefits, other_terms, schedule_details)::text
           from public.job_openings where id = current_setting('fx.j1')::uuid),
          '(,,,,,,,)', 'j2_compensation_is_optional_and_stored_as_entered');
select lives_ok($$ update public.job_openings set compensation_min_amount = 500, compensation_max_amount = 700.5,
                     compensation_currency = 'PHP', compensation_period = 'day', compensation_details = 'Plus 10% commission'
                   where id = current_setting('fx.j1')::uuid $$, 'j2_compensation_is_optional_and_stored_as_entered');
select is((select row(compensation_min_amount, compensation_max_amount, compensation_currency, compensation_period, compensation_details)::text
           from public.job_openings where id = current_setting('fx.j1')::uuid),
          '(500.00,700.50,PHP,day,"Plus 10% commission")', 'j2_compensation_is_optional_and_stored_as_entered');
select lives_ok($$ update public.job_openings set compensation_min_amount = 600.25, compensation_max_amount = null
                   where id = current_setting('fx.j1')::uuid $$, 'j2_compensation_is_optional_and_stored_as_entered');
select is((select row(compensation_min_amount, compensation_max_amount)::text from public.job_openings where id = current_setting('fx.j1')::uuid),
          '(600.25,)', 'j2_compensation_is_optional_and_stored_as_entered');

select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'job_openings' and column_default is not null
             and column_name in ('description', 'work_location', 'openings_count', 'job_type', 'minimum_years_experience',
               'experience_requirement', 'availability_requirement', 'schedule_details', 'compensation_min_amount',
               'compensation_max_amount', 'compensation_currency', 'compensation_period', 'compensation_details',
               'benefits', 'other_terms', 'required_training', 'applicant_requirement', 'certification_expectations',
               'application_deadline', 'application_instructions')),
          0, 'j2_compensation_columns_have_no_default');

update public.job_openings set compensation_min_amount = null, compensation_max_amount = null, compensation_currency = null,
       compensation_period = null where id = current_setting('fx.j1')::uuid;
select throws_ok($$ update public.job_openings set compensation_min_amount = 500 where id = current_setting('fx.j1')::uuid $$,
                 '23514', null, 'j2_compensation_requires_currency_and_period_with_amount');
select throws_ok($$ update public.job_openings set compensation_currency = 'PHP', compensation_period = 'day' where id = current_setting('fx.j1')::uuid $$,
                 '23514', null, 'j2_compensation_requires_currency_and_period_with_amount');
select throws_ok($$ update public.job_openings set compensation_max_amount = 500, compensation_currency = 'PHP' where id = current_setting('fx.j1')::uuid $$,
                 '23514', null, 'j2_compensation_requires_currency_and_period_with_amount');
select throws_ok($$ update public.job_openings set compensation_min_amount = 700, compensation_max_amount = 500,
                     compensation_currency = 'PHP', compensation_period = 'day' where id = current_setting('fx.j1')::uuid $$,
                 '23514', null, 'j2_compensation_requires_currency_and_period_with_amount');
select throws_ok($$ update public.job_openings set compensation_min_amount = 500, compensation_currency = 'USD',
                     compensation_period = 'day' where id = current_setting('fx.j1')::uuid $$,
                 '23514', null, 'j2_compensation_requires_currency_and_period_with_amount');

-- ---------- text and list limits ----------
select is((select count(*)::int from unnest(array[
  $$ update public.job_openings set title = 'ab' $$,
  $$ update public.job_openings set title = repeat('x', 121) $$,
  $$ update public.job_openings set description = repeat('x', 4001) $$,
  $$ update public.job_openings set duties = (select array_agg('duty ' || g) from generate_series(1, 21) g) $$,
  $$ update public.job_openings set duties = array[repeat('x', 201)] $$,
  $$ update public.job_openings set required_skills = (select array_agg('skill ' || g) from generate_series(1, 31) g) $$,
  $$ update public.job_openings set required_skills = array[repeat('x', 61)] $$,
  $$ update public.job_openings set minimum_qualifications = array[repeat('x', 201)] $$,
  $$ update public.job_openings set preferred_qualifications = (select array_agg('q ' || g) from generate_series(1, 21) g) $$,
  $$ update public.job_openings set work_location = repeat('x', 201) $$,
  $$ update public.job_openings set openings_count = 0 $$,
  $$ update public.job_openings set openings_count = 101 $$,
  $$ update public.job_openings set minimum_years_experience = 61 $$,
  $$ update public.job_openings set job_type = 'independent_contractor' $$,
  $$ update public.job_openings set applicant_requirement = 'government_certified' $$,
  $$ update public.job_openings set compensation_period = 'year', compensation_min_amount = 1, compensation_currency = 'PHP' $$,
  $$ update public.job_openings set compensation_min_amount = 10000000, compensation_currency = 'PHP', compensation_period = 'month' $$,
  $$ update public.job_openings set availability_requirement = repeat('x', 301) $$,
  $$ update public.job_openings set benefits = repeat('x', 1001) $$,
  $$ update public.job_openings set other_terms = repeat('x', 2001) $$,
  $$ update public.job_openings set application_instructions = repeat('x', 1001) $$
]) as statement
where test_helpers.attempt(statement || format(' where id = %L', current_setting('fx.j1'))) <> '23514'),
          0, 'j2_text_and_list_limits_enforced');
select is((select title from public.job_openings where id = current_setting('fx.j1')::uuid), 'Car wash attendant',
          'j2_text_and_list_limits_enforced');

-- ---------- at most 50 non-archived openings per shop ----------
select test_helpers.act_as_service();
insert into public.job_openings (shop_id, owner_id, title)
select current_setting('fx.s1u')::uuid, current_setting('fx.o1')::uuid, 'Bulk draft ' || g from generate_series(1, 49) g;
select test_helpers.act_as_owner('j2-o1@local.test');
select throws_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1u')::uuid, 'Draft fifty one') $$,
                 '23514', 'A shop can have at most 50 job openings that are not archived.', 'j2_opening_limit_per_shop');
select test_helpers.act_as_service();
update public.job_openings set status = 'archived' where title = 'Bulk draft 1';
select test_helpers.act_as_owner('j2-o1@local.test');
select lives_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1u')::uuid, 'Draft after archive') $$,
                'j2_opening_limit_per_shop');

select * from finish();
rollback;
