-- =============================================================
-- WashLink W14e - job opening report and moderation reads (spec A, B, H; D-53; W14 PLAN 3.5, P73, P77). Requires w4c,
-- w5b, w14b, w14d. Idempotent. Definer, scoped to auth.uid() and the profile role; a wrong role or no JWT returns 0 rows.
--   my_job_opening_reports           the reporter's own reports and the outcome kind only.
--   owner_job_opening_moderation     the owner's DECIDED cases (never open or dismissed ones, which would reveal a report),
--                                    the reason kind, the WashLink message and the history; never reports, counts,
--                                    statements, the admin note or the administrator (P73, D-53).
--   admin_job_opening_moderation_queue  super_admin; no statements; not audited (no personal data).
--   admin_job_opening_moderation_case   super_admin; VOLATILE; every call writes job_opening_moderation.case_viewed FIRST
--                                    (an audit failure aborts the read); reporters shown as "Reporter n" only (P77).
-- =============================================================

create or replace function public.my_job_opening_reports()
returns table (report_id uuid, job_opening_id uuid, opening_title_snapshot text, shop_name_snapshot text, category text, statement text,
               status text, outcome text, created_at timestamptz, closed_at timestamptz, can_withdraw boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.job_opening_id, c.opening_title_snapshot, c.shop_name_snapshot, r.category, r.statement, r.status, r.outcome,
         r.created_at, r.closed_at, r.status = 'open'
  from public.job_opening_reports r
  join public.job_opening_moderation_cases c on c.id = r.case_id
  where auth.uid() is not null and r.reporter_id = auth.uid() and coalesce(public.current_user_profile_role() = 'worker', false)
  order by (r.status <> 'open'), r.created_at desc, r.id;
$$;

create or replace function public.owner_job_opening_moderation()
returns table (case_id uuid, job_opening_id uuid, status text, reason_kind text, owner_message text, owner_change_note text,
               status_changed_at timestamptz, can_submit_changes boolean, history jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.job_opening_id, c.status, c.reason_kind, c.owner_message, c.owner_change_note, c.status_changed_at,
         c.status = 'paused_by_washlink' and j.updated_at > c.status_changed_at
           and public.job_opening_moderation_changed_since_pause(c.id, j),   -- the same test as submit_job_opening_changes (N5)
         coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'reason_kind', a.reason_kind, 'owner_message', a.owner_message,
                                                       'created_at', a.created_at) order by a.created_at, a.id)
                   from public.job_opening_moderation_actions a where a.case_id = c.id and a.action <> 'dismissed'), '[]'::jsonb)
  from public.job_opening_moderation_cases c
  join public.job_openings j on j.id = c.job_opening_id
  where auth.uid() is not null and j.owner_id = auth.uid() and public.is_current_job_opening_owner(j.id)
    and c.status not in ('open', 'dismissed')
  order by (c.status not in ('paused_by_washlink', 'changes_submitted')), c.status_changed_at desc, c.id;
$$;

create or replace function public.admin_job_opening_moderation_queue(p_status text default 'active')
returns table (case_id uuid, status text, revision integer, report_count integer, open_report_count integer, categories text[],
               opening_status text, opening_present boolean, opening_title_snapshot text, shop_name_snapshot text, opened_at timestamptz,
               status_changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('active', 'open', 'dismissed', 'paused_by_washlink', 'changes_submitted', 'lifted',
                                          'closed_by_washlink', 'resolved_owner_closed') then
    raise exception 'Choose a case status.' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    return;
  end if;
  return query
  select c.id, c.status, c.revision, k.report_count, k.open_report_count, k.categories, j.status, j.id is not null,
         c.opening_title_snapshot, c.shop_name_snapshot, c.opened_at, c.status_changed_at
  from public.job_opening_moderation_cases c
  left join public.job_openings j on j.id = c.job_opening_id
  cross join lateral (select count(*)::integer as report_count, (count(*) filter (where r.status = 'open'))::integer as open_report_count,
                             coalesce(array_agg(distinct r.category order by r.category), '{}') as categories
                      from public.job_opening_reports r where r.case_id = c.id) k
  where (p_status = 'active' and c.status in ('open', 'paused_by_washlink', 'changes_submitted')) or c.status = p_status
  order by c.opened_at, c.id
  limit 200;
end;
$$;

create or replace function public.admin_job_opening_moderation_case(p_case_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c public.job_opening_moderation_cases;
  o public.job_openings;
  s public.shops;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can read moderation cases.' using errcode = '42501';
  end if;
  select * into c from public.job_opening_moderation_cases x where x.id = p_case_id;
  if c.id is null then
    raise exception 'Moderation case not found.' using errcode = '42501';
  end if;
  perform public.record_workforce_audit_event('job_opening_moderation.case_viewed', 'job_opening', c.job_opening_id, c.owner_id,
    jsonb_build_object('case_id', c.id, 'job_opening_id', c.job_opening_id, 'to_status', c.status));
  select * into o from public.job_openings j where j.id = c.job_opening_id;
  select * into s from public.shops x where x.id = coalesce(o.shop_id, c.shop_id);
  return jsonb_build_object(
    'case', jsonb_build_object('id', c.id, 'job_opening_id', c.job_opening_id, 'status', c.status, 'revision', c.revision,
      'reason_kind', c.reason_kind, 'owner_message', c.owner_message, 'admin_note', c.admin_note, 'owner_change_note', c.owner_change_note,
      'opening_title_snapshot', c.opening_title_snapshot, 'shop_name_snapshot', c.shop_name_snapshot, 'opened_at', c.opened_at,
      'status_changed_at', c.status_changed_at),
    'opening', case when o.id is not null then public.job_opening_application_snapshot(o) || jsonb_build_object('status', o.status,
      'first_published_at', o.first_published_at, 'status_changed_at', o.status_changed_at, 'updated_at', o.updated_at) end,
    'shop', case when s.id is not null then jsonb_build_object('name', s.name, 'verification_status', s.verification_status,
      'is_active', s.is_active, 'has_recorded_verification', public.shop_has_recorded_verification(s.id)) end,
    'reports', coalesce((select jsonb_agg(jsonb_build_object('reporter_label', 'Reporter ' || x.reporter_number, 'category', x.category,
        'statement', x.statement, 'status', x.status, 'outcome', x.outcome, 'created_at', x.created_at, 'reported_snapshot', x.reported_snapshot)
        order by x.created_at, x.id)
      from (select r.*, dense_rank() over (order by f.first_at, r.reporter_id) as reporter_number
            from public.job_opening_reports r
            join (select r2.reporter_id, min(r2.created_at) as first_at from public.job_opening_reports r2 where r2.case_id = c.id
                  group by r2.reporter_id) f on f.reporter_id = r.reporter_id
            where r.case_id = c.id) x), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'actor_role', a.actor_role, 'reason_kind', a.reason_kind,
        'owner_message', a.owner_message, 'opening_snapshot', a.opening_snapshot, 'created_at', a.created_at) order by a.created_at, a.id)
      from public.job_opening_moderation_actions a where a.case_id = c.id), '[]'::jsonb),
    'application_counts', coalesce((select jsonb_object_agg(x.status, x.n) from (select a.status, count(*) as n from public.job_applications a
                                     where a.job_opening_id = c.job_opening_id group by a.status) x), '{}'::jsonb));
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.my_job_opening_reports()',
    'public.owner_job_opening_moderation()',
    'public.admin_job_opening_moderation_queue(text)',
    'public.admin_job_opening_moderation_case(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop function if exists public.admin_job_opening_moderation_case(uuid);
-- drop function if exists public.admin_job_opening_moderation_queue(text);
-- drop function if exists public.owner_job_opening_moderation();
-- drop function if exists public.my_job_opening_reports();
