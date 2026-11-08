-- =============================================================
-- WashLink W13c - keyset-paged job opening moderation queue for super_admin (W13 PLAN 3.3; D-71; closes W14 N3).
-- Requires w14b, w14e, w13a. Idempotent.
-- admin_job_opening_moderation_queue_page(p_status, p_after_opened_at, p_after_id, p_limit) returns the w14e queue columns
-- plus total_count (every case matching the status filter), oldest first, in pages of p_limit (default 50, 1..100) after
-- the cursor (opened_at, id) of the last row of the previous page. Same status validation (22023), same super_admin /
-- profile-role check as w14e (any other caller gets 0 rows), same lateral report counts and categories; no statements,
-- reporters or notes; not audited (no personal data, as w14e). The w14e 200-row function is NOT replaced (compatibility;
-- the W14 tests keep using it). A later change to the queue query must change both (w13_queue_page_rows_equal_old_queue_rows).
-- Messages (22023): 'Choose a case status.', 'Page size must be between 1 and 100.', 'Give both parts of the page cursor.'
-- =============================================================

create or replace function public.admin_job_opening_moderation_queue_page(p_status text default 'active',
                                                                         p_after_opened_at timestamptz default null,
                                                                         p_after_id uuid default null,
                                                                         p_limit integer default 50)
returns table (case_id uuid, status text, revision integer, report_count integer, open_report_count integer, categories text[],
               opening_status text, opening_present boolean, opening_title_snapshot text, shop_name_snapshot text, opened_at timestamptz,
               status_changed_at timestamptz, total_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  matching integer;
begin
  if p_status is null or p_status not in ('active', 'open', 'dismissed', 'paused_by_washlink', 'changes_submitted', 'lifted',
                                          'closed_by_washlink', 'resolved_owner_closed') then
    raise exception 'Choose a case status.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Page size must be between 1 and 100.' using errcode = '22023';
  end if;
  if (p_after_opened_at is null) <> (p_after_id is null) then
    raise exception 'Give both parts of the page cursor.' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    return;
  end if;
  select count(*)::integer into matching
  from public.job_opening_moderation_cases c
  where (p_status = 'active' and c.status in ('open', 'paused_by_washlink', 'changes_submitted')) or c.status = p_status;
  return query
  select c.id, c.status, c.revision, k.report_count, k.open_report_count, k.categories, j.status, j.id is not null,
         c.opening_title_snapshot, c.shop_name_snapshot, c.opened_at, c.status_changed_at, matching
  from public.job_opening_moderation_cases c
  left join public.job_openings j on j.id = c.job_opening_id
  cross join lateral (select count(*)::integer as report_count, (count(*) filter (where r.status = 'open'))::integer as open_report_count,
                             coalesce(array_agg(distinct r.category order by r.category), '{}') as categories
                      from public.job_opening_reports r where r.case_id = c.id) k
  where ((p_status = 'active' and c.status in ('open', 'paused_by_washlink', 'changes_submitted')) or c.status = p_status)
    and (p_after_id is null or (c.opened_at, c.id) > (p_after_opened_at, p_after_id))
  order by c.opened_at, c.id
  limit p_limit;
end;
$$;

revoke all on function public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer) from public, anon, service_role;
grant execute on function public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer) to authenticated;

comment on function public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer) is
  'W13: keyset-paged super_admin moderation queue with a total count (D-71); same rows as admin_job_opening_moderation_queue (W14).';

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W13 rollbacks in reverse order d..a; revert the W13 frontend paging with it)
-- -------------------------------------------------------------
-- drop function if exists public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer);
