-- B2C-7: one authorization test for each of the nine functions added to the j17 list, across anon, customer, owner, washer and admin.
-- Each row states every role's actual outcome, so a loosened function fails with a readable diff. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
create function pg_temp.name_of(p text) returns text language sql stable security definer as $$
  select object_name from public.independent_worker_documents where id = pg_temp.id(p) $$;
insert into ids values
  ('admin', test_helpers.create_super_admin('b2c7-auth-admin@local.test')),
  ('admin2', test_helpers.create_super_admin('b2c7-auth-admin2@local.test')),
  ('customer', test_helpers.create_customer('b2c7-auth-c@local.test')),
  ('owner', test_helpers.create_owner('b2c7-auth-o@local.test')),
  ('washer', test_helpers.create_worker('b2c7-auth-w@local.test')),
  ('other', test_helpers.create_worker('b2c7-auth-w2@local.test'));
update public.platform_settings set worker_document_uploads_enabled = true;
insert into public.independent_workers (profile_id) select id from ids where k in ('washer', 'other');
insert into ids values
  ('slot', test_helpers.create_worker_document(pg_temp.id('washer'), 'selfie', 'awaiting_upload')),
  ('other_slot', test_helpers.create_worker_document(pg_temp.id('other'), 'selfie', 'awaiting_upload')),
  ('doc', test_helpers.create_worker_document(pg_temp.id('other'), 'government_id', 'submitted'));
select test_helpers.create_worker_document_object(pg_temp.name_of('slot'));

-- service_role has no usage on test_helpers, so the role is reset before any helper runs and the attempt is local.
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'succeeded';
exception when others then
  return sqlstate;
end;
$$;

-- Tries a statement as each role in turn and returns role=outcome pairs. Roles that may mutate state come last.
create function pg_temp.outcomes(p_sql text, p_roles text[]) returns text language plpgsql as $$
declare
  who text;
  out_parts text[] := '{}';
  result text;
begin
  foreach who in array p_roles loop
    perform set_config('role', 'none', true);
    if who = 'anon' then
      perform test_helpers.act_as_anon();
    elsif who = 'service' then
      perform test_helpers.act_as_service();
      perform set_config('role', 'service_role', true);
    else
      perform test_helpers.act_as(pg_temp.id(who));
    end if;
    result := pg_temp.try(p_sql);
    out_parts := out_parts || (who || '=' || result);
  end loop;
  perform set_config('role', 'none', true);
  perform test_helpers.act_as_service();
  return array_to_string(out_parts, ' ');
end;
$$;
-- The boolean a helper returns for a role, or the refusal.
create function pg_temp.answer(p_sql text, p_who text) returns text language plpgsql as $$
declare
  result boolean;
  answer_text text;
begin
  if p_who = 'anon' then
    perform test_helpers.act_as_anon();
  else
    perform test_helpers.act_as(pg_temp.id(p_who));
  end if;
  begin
    execute p_sql into result;
    answer_text := result::text;
  exception when others then
    answer_text := sqlstate;
  end;
  perform test_helpers.act_as_service();
  return p_who || '=' || answer_text;
end;
$$;

select is(pg_temp.outcomes($$ select * from public.begin_worker_document_upload('government_id') $$, array['anon', 'customer', 'owner', 'admin', 'service', 'washer']),
          'anon=42501 customer=42501 owner=42501 admin=42501 service=42501 washer=succeeded', 'begin_upload_authorization');
select is(pg_temp.outcomes(format($$ select * from public.submit_worker_document_upload(%L) $$, pg_temp.id('slot')), array['anon', 'customer', 'owner', 'admin', 'other', 'service', 'washer']),
          'anon=42501 customer=42501 owner=42501 admin=42501 other=42501 service=42501 washer=succeeded', 'submit_upload_authorization');
select is(pg_temp.outcomes($$ select * from public.my_worker_documents() $$, array['anon', 'customer', 'owner', 'admin', 'service', 'washer']),
          'anon=42501 customer=42501 owner=42501 admin=42501 service=42501 washer=succeeded', 'my_documents_authorization');
select is(pg_temp.outcomes($$ select * from public.admin_worker_document_overview() $$, array['anon', 'customer', 'owner', 'washer', 'service', 'admin']),
          'anon=42501 customer=42501 owner=42501 washer=42501 service=42501 admin=succeeded', 'admin_overview_authorization');
select is(pg_temp.outcomes(format($$ select * from public.admin_worker_documents(%L) $$, pg_temp.id('other')), array['anon', 'customer', 'owner', 'washer', 'other', 'service', 'admin']),
          'anon=42501 customer=42501 owner=42501 washer=42501 other=42501 service=42501 admin=succeeded', 'admin_documents_authorization');
select is(pg_temp.outcomes(format($$ select * from public.admin_open_worker_document(%L) $$, pg_temp.id('doc')), array['anon', 'customer', 'owner', 'washer', 'other', 'service', 'admin']),
          'anon=42501 customer=42501 owner=42501 washer=42501 other=42501 service=42501 admin=succeeded', 'admin_open_authorization');
select is(pg_temp.outcomes(format($$ select * from public.admin_review_worker_document(%L, 'approved') $$, pg_temp.id('doc')), array['anon', 'customer', 'owner', 'washer', 'other', 'service', 'admin']),
          'anon=42501 customer=42501 owner=42501 washer=42501 other=42501 service=42501 admin=succeeded', 'admin_review_document_authorization');

-- Each helper tells a caller only about the caller's own slot or window.
select is(concat_ws(' ',
    pg_temp.answer(format($$ select public.worker_document_upload_is_open(%L) $$, pg_temp.name_of('other_slot')), 'anon'),
    pg_temp.answer(format($$ select public.worker_document_upload_is_open(%L) $$, pg_temp.name_of('other_slot')), 'customer'),
    pg_temp.answer(format($$ select public.worker_document_upload_is_open(%L) $$, pg_temp.name_of('other_slot')), 'owner'),
    pg_temp.answer(format($$ select public.worker_document_upload_is_open(%L) $$, pg_temp.name_of('other_slot')), 'washer'),
    pg_temp.answer(format($$ select public.worker_document_upload_is_open(%L) $$, pg_temp.name_of('other_slot')), 'admin'),
    pg_temp.answer(format($$ select public.worker_document_upload_is_open(%L) $$, pg_temp.name_of('other_slot')), 'other')),
  'anon=42501 customer=false owner=false washer=false admin=false other=true', 'upload_helper_true_only_for_own_open_slot');

-- The admin opened 'doc' above, in the admin_open_authorization test.
select is(concat_ws(' ',
    pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('doc')), 'anon'),
    pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('doc')), 'customer'),
    pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('doc')), 'owner'),
    pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('doc')), 'other'),
    pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('doc')), 'admin2'),
    pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('doc')), 'admin')),
  'anon=42501 customer=false owner=false other=false admin2=false admin=true', 'admin_read_helper_true_only_for_own_window');

-- ---------- each condition of the two helpers, alone: everything else about the row says yes, so only this condition can say no ----------
insert into ids values ('closer', test_helpers.create_worker('b2c7-auth-closer@local.test')),
  ('admin3', test_helpers.create_super_admin('b2c7-auth-admin3@local.test')),
  ('admin4', test_helpers.create_super_admin('b2c7-auth-admin4@local.test'));
insert into public.independent_workers (profile_id) values (pg_temp.id('closer'));
insert into ids select 'closed_' || s, test_helpers.create_worker_document(pg_temp.id('closer'), 'selfie', s)
  from unnest(array['awaiting_upload', 'submitted', 'approved', 'rejected', 'superseded', 'abandoned']) s;
select is((select upload_expires_at > now() from public.independent_worker_documents where id = pg_temp.id('closed_abandoned')), true, 'upload_helper_false_once_slot_left_awaiting');
select is((select string_agg(s || '=' || split_part(pg_temp.answer(format($$ select public.worker_document_upload_is_open(%L) $$, pg_temp.name_of('closed_' || s)), 'closer'), '=', 2), ' ' order by s)
           from unnest(array['abandoned', 'approved', 'awaiting_upload', 'rejected', 'submitted', 'superseded']) s),
          'abandoned=false approved=false awaiting_upload=true rejected=false submitted=false superseded=false', 'upload_helper_false_once_slot_left_awaiting');

insert into ids values ('read_doc', test_helpers.create_worker_document(pg_temp.id('closer'), 'government_id', 'submitted')),
                       ('queued_doc', test_helpers.create_worker_document(pg_temp.id('closer'), 'government_id', 'approved'));
update public.independent_worker_documents set read_open_for = pg_temp.id('admin3'), read_open_until = now() + interval '60 seconds' where id = pg_temp.id('read_doc');
update public.independent_worker_documents set read_open_for = pg_temp.id('admin4'), read_open_until = now() + interval '60 seconds' where id = pg_temp.id('queued_doc');

select is(pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('read_doc')), 'admin3'), 'admin3=true', 'admin_read_helper_false_for_demoted_admin');
update public.profiles set role = 'customer' where id = pg_temp.id('admin3');
select is(pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('read_doc')), 'admin3'), 'admin3=false', 'admin_read_helper_false_for_demoted_admin');

select is(pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('queued_doc')), 'admin4'), 'admin4=true', 'admin_read_helper_false_once_file_is_queued');
update public.independent_worker_documents set file_queued_at = now() where id = pg_temp.id('queued_doc');
select is(pg_temp.answer(format($$ select public.worker_document_admin_read_is_open(%L) $$, pg_temp.name_of('queued_doc')), 'admin4'), 'admin4=false', 'admin_read_helper_false_once_file_is_queued');

select is((select coalesce(string_agg(f, ','), '-') from unnest(array[
    'public.begin_worker_document_upload(text)', 'public.submit_worker_document_upload(uuid)', 'public.my_worker_documents()',
    'public.admin_worker_document_overview()', 'public.admin_worker_documents(uuid)', 'public.admin_open_worker_document(uuid)',
    'public.admin_review_worker_document(uuid,text,text)', 'public.worker_document_upload_is_open(text)', 'public.worker_document_admin_read_is_open(text)',
    'public.worker_document_files_claim(integer)', 'public.worker_document_files_confirm_removed(text[])', 'public.worker_document_retire_file(uuid,text)',
    'public.independent_worker_withdraw_from_work(uuid,text)', 'public.independent_workers_reset_unevidenced()',
    'public.independent_worker_documents_queue_file_on_delete()', 'public.admin_review_independent_worker(uuid,text,text)']) f
  join pg_proc p on p.oid = f::regprocedure
  where not p.prosecdef or not coalesce(p.proconfig::text ~ 'search_path=public, pg_temp', false)), '-', 'definer_functions_pin_search_path');

select * from finish();
rollback;
