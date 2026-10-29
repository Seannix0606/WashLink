-- =============================================================
-- WashLink W14h - redacted per-user activity, the audited admin audit log, the N6 long-open dispute flag and the
-- moderation summary (spec H, I; D-54; W14 PLAN 3.8, P76, P77). Requires w3b, w11e, w14b, w14f, w14g. Idempotent.
-- my_workforce_activity (every signed-in role; P76): events where the caller is the actor, the subject profile, or a party
--   of the subject worker_contract (the worker only once it was sent). Returns event_id, created_at, action, subject_type,
--   an actor LABEL (you / washlink / washlink_system / shop_owner / worker / someone) and allow-listed payload keys with
--   uuid-shaped values dropped. Never actor_id, subject_id or subject_profile_id. Report privacy (D-53, B1):
--   job_opening_report.* events are shown ONLY to the reporter (the event's subject profile), never through actor_id, so
--   an owner whose close / archive closes the reports (actor = owner) never sees them; the moderation events that would
--   reveal a report (opened, dismissed, case_viewed, deleted) are shown only to an actor who is not the case owner.
--   N7: the person looked up sees purpose = washlink_review on admin_access.* events instead of the stated purpose.
-- admin_workforce_audit_log (super_admin; VOLATILE; P77): full rows plus the purpose / note of admin_access.* events;
--   every search writes workforce_audit.log_searched (filter NAMES, profile_id, actor_id, subject_id, and the
--   subject_type / action_prefix values only when they occur in the audit table, otherwise 'unrecognised' (N4: enum and
--   uuid values only, never free text), result_count) in the same transaction, before the rows are returned. The W3 raw
--   select policy wae_select_super_admin stays (D-54; W13 decides).
-- admin_oversight_access_flags (super_admin; N6): open disputes open >= 30 days with >= 5 case reads.
-- =============================================================

create or replace function public.oversight_flag_open_days()
returns integer language sql immutable set search_path = public, pg_temp as $$ select 30 $$;

create or replace function public.oversight_flag_read_count()
returns integer language sql immutable set search_path = public, pg_temp as $$ select 5 $$;

create or replace function public.my_workforce_activity(p_before_id bigint default null, p_limit integer default 50)
returns table (event_id bigint, created_at timestamptz, action text, subject_type text, actor_label text, details jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a page size between 1 and 100.' using errcode = '22023';
  end if;
  if me is null then
    return;
  end if;
  return query
  with mine as (
    select e.id from public.workforce_audit_events e where e.actor_id = me and (p_before_id is null or e.id < p_before_id)
    union
    select e.id from public.workforce_audit_events e where e.subject_profile_id = me and (p_before_id is null or e.id < p_before_id)
    union
    select e.id from public.workforce_audit_events e
    join public.worker_contracts c on c.id = e.subject_id
    where e.subject_type = 'worker_contract' and (c.owner_id = me or (c.worker_id = me and c.sent_at is not null))
      and (p_before_id is null or e.id < p_before_id)
  )
  select e.id, e.created_at, e.action, e.subject_type,
         case when e.actor_id = me then 'you' when e.actor_role = 'super_admin' then 'washlink'
              when e.actor_id is null then 'washlink_system' when e.actor_role = 'owner' then 'shop_owner'
              when e.actor_role = 'worker' then 'worker' else 'someone' end,
         coalesce((select jsonb_object_agg(k.key, case when k.key = 'purpose' and left(e.action, 13) = 'admin_access.'
                                                         and e.actor_id is distinct from me then to_jsonb('washlink_review'::text)
                                                    else k.value end)
                   from jsonb_each(e.payload) k
                   where k.key = any (array['from_status', 'to_status', 'status', 'decision', 'result', 'category', 'reason_kind', 'basis',
                                            'resolution_kind', 'changed_by', 'deleted_by', 'ended_by', 'party_role', 'version_number',
                                            'version_kind', 'scope', 'purpose', 'access_kind', 'outcome'])
                     and jsonb_typeof(k.value) in ('string', 'number', 'boolean')
                     and not (jsonb_typeof(k.value) = 'string'
                              and (k.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')), '{}'::jsonb)
  from public.workforce_audit_events e
  join mine m on m.id = e.id
  where case when left(e.action, 19) = 'job_opening_report.' then e.subject_profile_id = me   -- the reporter only (B1)
             when e.action in ('job_opening_moderation.opened', 'job_opening_moderation.dismissed',
                               'job_opening_moderation.case_viewed', 'job_opening_moderation.deleted')
               then e.actor_id = me and e.subject_profile_id is distinct from me
             else true end
  order by e.id desc
  limit p_limit;
end;
$$;

create or replace function public.admin_workforce_audit_log(p_action_prefix text default null, p_subject_type text default null,
                                                            p_subject_id uuid default null, p_profile_id uuid default null,
                                                            p_actor_id uuid default null, p_from timestamptz default null,
                                                            p_to timestamptz default null, p_before_id bigint default null,
                                                            p_limit integer default 50)
returns table (event_id bigint, created_at timestamptz, actor_id uuid, actor_role text, actor_kind text, action text, subject_type text,
               subject_id uuid, subject_profile_id uuid, payload jsonb, access_purpose text, access_note text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  rows_json jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can read the audit log.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Choose a page size between 1 and 200.' using errcode = '22023';
  end if;
  if p_action_prefix is not null and p_action_prefix !~ '^[a-z_.]{1,64}$' then
    raise exception 'Use only lowercase letters, dots and underscores in the action filter.' using errcode = '22023';
  end if;
  if p_subject_type is not null and p_subject_type !~ '^[a-z_]{1,40}$' then
    raise exception 'Use only lowercase letters and underscores in the subject type filter.' using errcode = '22023';
  end if;
  if p_from > p_to then
    raise exception 'The start of the range must be before the end.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_id desc), '[]'::jsonb) into rows_json
  from (select e.id as event_id, e.created_at, e.actor_id, e.actor_role, e.actor_kind, e.action, e.subject_type, e.subject_id,
               e.subject_profile_id, e.payload, a.purpose as access_purpose, a.note as access_note
        from public.workforce_audit_events e
        left join public.admin_access_records a
          on left(e.action, 13) = 'admin_access.' and a.id::text = e.payload ->> 'access_record_id'
        where (p_action_prefix is null or left(e.action, char_length(p_action_prefix)) = p_action_prefix)
          and (p_subject_type is null or e.subject_type = p_subject_type)
          and (p_subject_id is null or e.subject_id = p_subject_id)
          and (p_profile_id is null or e.actor_id = p_profile_id or e.subject_profile_id = p_profile_id)
          and (p_actor_id is null or e.actor_id = p_actor_id)
          and (p_from is null or e.created_at >= p_from)
          and (p_to is null or e.created_at <= p_to)
          and (p_before_id is null or e.id < p_before_id)
        order by e.id desc
        limit p_limit) x;
  perform public.record_workforce_audit_event('workforce_audit.log_searched', 'workforce_audit', null, null,
    jsonb_build_object('filters', to_jsonb(array_remove(array[
        case when p_action_prefix is not null then 'action_prefix' end, case when p_subject_type is not null then 'subject_type' end,
        case when p_subject_id is not null then 'subject_id' end, case when p_profile_id is not null then 'profile_id' end,
        case when p_actor_id is not null then 'actor_id' end, case when p_from is not null then 'from' end,
        case when p_to is not null then 'to' end, case when p_before_id is not null then 'before_id' end], null)),
      'profile_id', p_profile_id, 'actor_id', p_actor_id, 'subject_id', p_subject_id,
      'subject_type', case when p_subject_type is null then null
                           when exists (select 1 from public.workforce_audit_events x where x.subject_type = p_subject_type) then p_subject_type
                           else 'unrecognised' end,
      'action_prefix', case when p_action_prefix is null then null
                            when exists (select 1 from public.workforce_audit_events x
                                         where left(x.action, char_length(p_action_prefix)) = p_action_prefix) then p_action_prefix
                            else 'unrecognised' end,
      'result_count', jsonb_array_length(rows_json)));
  return query
  select r.event_id, r.created_at, r.actor_id, r.actor_role, r.actor_kind, r.action, r.subject_type, r.subject_id, r.subject_profile_id,
         r.payload, r.access_purpose, r.access_note
  from jsonb_to_recordset(rows_json) as r(event_id bigint, created_at timestamptz, actor_id uuid, actor_role text, actor_kind text,
                                          action text, subject_type text, subject_id uuid, subject_profile_id uuid, payload jsonb,
                                          access_purpose text, access_note text)
  order by r.event_id desc;
end;
$$;

create or replace function public.admin_oversight_access_flags()
returns table (dispute_id uuid, contract_id uuid, opened_days integer, case_view_count integer, distinct_viewer_count integer,
               last_viewed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    return;
  end if;
  return query
  select d.id, d.contract_id, floor(extract(epoch from now() - d.created_at) / 86400)::integer, v.view_count, v.viewer_count, v.last_at
  from public.worker_contract_disputes d
  cross join lateral (select count(*)::integer as view_count, count(distinct e.actor_id)::integer as viewer_count, max(e.created_at) as last_at
                      from public.workforce_audit_events e
                      where e.subject_type = 'worker_contract' and e.subject_id = d.contract_id
                        and e.action = 'worker_contract_dispute.case_viewed' and e.payload ->> 'dispute_id' = d.id::text) v
  where d.status = 'open' and d.created_at <= now() - make_interval(days => public.oversight_flag_open_days())
    and v.view_count >= public.oversight_flag_read_count()
  order by d.created_at, d.id;
end;
$$;

create or replace function public.admin_moderation_summary()
returns table (open_report_case_count integer, changes_submitted_count integer, paused_by_washlink_count integer,
               oldest_open_case_at timestamptz, unreviewed_approved_shop_count integer, oversight_flag_count integer,
               relationship_lookups_last_30_days integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select count(*)::integer from public.job_opening_moderation_cases c where c.status = 'open'),
         (select count(*)::integer from public.job_opening_moderation_cases c where c.status = 'changes_submitted'),
         (select count(*)::integer from public.job_opening_moderation_cases c where c.status = 'paused_by_washlink'),
         (select min(c.opened_at) from public.job_opening_moderation_cases c where c.status = 'open'),
         (select count(*)::integer from public.shops s where public.shop_lacks_recorded_super_admin_review(s.id)),
         (select count(*)::integer from public.admin_oversight_access_flags()),
         (select count(*)::integer from public.admin_access_records a where a.created_at >= now() - interval '30 days')
  where auth.uid() is not null and public.is_super_admin() and coalesce(public.current_user_profile_role() = 'super_admin', false);
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['oversight_flag_open_days()', 'oversight_flag_read_count()', 'my_workforce_activity(bigint, integer)',
    'admin_workforce_audit_log(text, text, uuid, uuid, uuid, timestamptz, timestamptz, bigint, integer)',
    'admin_oversight_access_flags()', 'admin_moderation_summary()'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a). log_searched audit rows stay (P11).
-- -------------------------------------------------------------
-- drop function if exists public.admin_moderation_summary();
-- drop function if exists public.admin_oversight_access_flags();
-- drop function if exists public.admin_workforce_audit_log(text, text, uuid, uuid, uuid, timestamptz, timestamptz, bigint, integer);
-- drop function if exists public.my_workforce_activity(bigint, integer);
-- drop function if exists public.oversight_flag_read_count();
-- drop function if exists public.oversight_flag_open_days();
