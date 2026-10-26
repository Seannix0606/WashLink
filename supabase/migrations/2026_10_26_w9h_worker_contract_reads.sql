-- =============================================================
-- WashLink W9h - worker contract reads (W9 PLAN 3.8; P48, P51; D-13, D-31). Requires w9c..w9g. Idempotent.
-- SECURITY INVOKER (the caller's own RLS decides: owner = own contracts incl. drafts; worker = own contracts once
-- sent, sealed versions only; everyone else nothing) unless noted. A foreign or unknown id returns 0 rows (no
-- existence oracle). Granted to authenticated only. Definer, owner only: owner_contract_eligible_workers,
-- preview_worker_contract_draft. my_retained_application_records lives in w9i, next to its table.
-- allowed_actions are hints for the UI; every RPC re-checks.
-- =============================================================

create or replace function public.owner_worker_contracts()
returns table (contract_id uuid, status text, effective_status text, revision integer, origin text, shop_id uuid, shop_name text,
               worker_id uuid, worker_name text, current_version_id uuid, current_version_number integer, pending_version_id uuid,
               pending_version_number integer, pending_version_kind text, draft_version_id uuid, draft_version_number integer,
               draft_revision integer, start_date date, end_date date, sent_at timestamptz, accepted_at timestamptz,
               activated_at timestamptz, ended_at timestamptz, ended_by text, end_reason text, decline_note text, owner_removed boolean,
               shop_removed boolean, worker_removed boolean, allowed_actions text[], created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.id, c.status, x.eff, c.revision, c.origin, c.shop_id, c.shop_name_snapshot, c.worker_id, c.worker_name_snapshot,
         cv.id, cv.version_number, pv.id, pv.version_number, pv.kind, dv.id, dv.version_number, dv.draft_revision, c.start_date, c.end_date,
         c.sent_at, c.accepted_at, c.activated_at, c.ended_at, c.ended_by, c.end_reason, c.decline_note, c.owner_removed_at is not null,
         c.shop_removed_at is not null, c.worker_removed_at is not null,
         case when c.shop_id is null or c.owner_id is null then '{}'::text[] else array_remove(array[
           case when dv.id is not null then 'save_draft' end, case when dv.id is not null then 'send' end,
           case when dv.id is not null then 'discard' end,
           case when pv.id is not null then case when pv.kind = 'initial' then 'withdraw' else 'withdraw_amendment' end end,
           case when x.eff = 'accepted' then 'activate' end,
           case when x.eff in ('accepted', 'active') and dv.id is null and pv.id is null and c.worker_id is not null then 'amend' end,
           case when x.eff in ('accepted', 'active') then 'terminate' end], null) end,
         c.created_at, c.updated_at
  from public.worker_contracts c
  cross join lateral (select public.worker_contract_effective_status(c.status, c.end_date) as eff) x
  left join public.contract_versions cv on cv.id = c.current_version_id
  left join public.contract_versions pv on pv.id = c.pending_version_id
  left join public.contract_versions dv on dv.contract_id = c.id and dv.state = 'draft'
  where c.owner_id = auth.uid() and coalesce(public.current_user_profile_role() = 'owner', false)
  order by c.updated_at desc, c.id;
$$;

create or replace function public.my_worker_contracts()
returns table (contract_id uuid, status text, effective_status text, revision integer, origin text, shop_id uuid, shop_name text,
               owner_name text, current_version_id uuid, current_version_number integer, pending_version_id uuid,
               pending_version_number integer, pending_version_kind text, start_date date, end_date date, sent_at timestamptz,
               accepted_at timestamptz, activated_at timestamptz, ended_at timestamptz, ended_by text, end_reason text,
               decline_note text, owner_removed boolean, shop_removed boolean, allowed_actions text[], created_at timestamptz,
               updated_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.id, c.status, x.eff, c.revision, c.origin, c.shop_id, c.shop_name_snapshot, c.owner_name_snapshot, cv.id, cv.version_number,
         pv.id, pv.version_number, pv.kind, c.start_date, c.end_date, c.sent_at, c.accepted_at, c.activated_at, c.ended_at, c.ended_by,
         c.end_reason, c.decline_note, c.owner_removed_at is not null, c.shop_removed_at is not null,
         array_remove(array[
           case when pv.id is not null and c.shop_id is not null and c.owner_id is not null
                then case when pv.kind = 'initial' then 'accept' else 'accept_amendment' end end,
           case when pv.id is not null then case when pv.kind = 'initial' then 'decline' else 'decline_amendment' end end,
           case when x.eff in ('accepted', 'active') then 'terminate' end], null),
         c.created_at, c.updated_at
  from public.worker_contracts c
  cross join lateral (select public.worker_contract_effective_status(c.status, c.end_date) as eff) x
  left join public.contract_versions cv on cv.id = c.current_version_id
  left join public.contract_versions pv on pv.id = c.pending_version_id
  where c.worker_id = auth.uid() and c.sent_at is not null
  order by c.updated_at desc, c.id;
$$;

-- Workers the owner may draft for (D-31): accepted applications (D-13 window: accepted) and completed training at
-- own shops under the current owner. Names only; never contacts or profile details.
create or replace function public.owner_contract_eligible_workers()
returns table (worker_id uuid, display_name text, shop_id uuid, shop_name text, origin text, has_open_contract boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (x.worker_id, x.shop_id) x.worker_id, coalesce(nullif(btrim(p.full_name), ''), 'Worker'), x.shop_id, s.name, x.origin,
         exists (select 1 from public.worker_contracts c where c.shop_id = x.shop_id and c.worker_id = x.worker_id
                 and c.status in ('draft', 'sent_for_review', 'accepted', 'active'))
  from (select a.worker_id, a.shop_id, 'accepted_application'::text as origin, 1 as preference from public.job_applications a
        where a.status = 'accepted' and a.submitted_at is not null and a.owner_id = auth.uid()
        union all
        select e.worker_id, e.shop_id, 'completed_training', 2 from public.training_enrollments e
        where e.owner_id = auth.uid() and e.status = 'accepted' and public.training_enrollment_is_completed(e.id)) x
  join public.shops s on s.id = x.shop_id and s.owner_id = auth.uid()
  join public.worker_profiles wp on wp.profile_id = x.worker_id
  left join public.profiles p on p.id = x.worker_id
  where coalesce(public.current_user_profile_role() = 'owner', false)
  order by x.worker_id, x.shop_id, x.preference;
$$;

create or replace function public.worker_contract_versions(p_contract_id uuid)
returns table (version_id uuid, version_number integer, kind text, state text, classification_key text, classification_label text,
               start_date date, end_date date, content_hash text, flag_count integer, sealed_at timestamptz, sent_at timestamptz,
               responded_at timestamptz, decline_note text, template_name text, template_version_number integer,
               base_platform_version_number integer, draft_revision integer, is_current boolean, is_pending boolean, created_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  select v.id, v.version_number, v.kind, v.state, v.classification_key, v.classification_label, v.start_date, v.end_date, v.content_hash,
         v.flag_count, v.sealed_at, v.sent_at, v.responded_at, v.decline_note, v.template_name_snapshot, v.template_version_number,
         v.base_platform_version_number, v.draft_revision, v.id = c.current_version_id, v.id = c.pending_version_id, v.created_at
  from public.contract_versions v join public.worker_contracts c on c.id = v.contract_id
  where v.contract_id = p_contract_id
  order by v.version_number desc;
$$;

-- The stored document exactly as sealed (Download / Print use rendered_text verbatim).
create or replace function public.worker_contract_version_document(p_version_id uuid)
returns table (contract_id uuid, version_id uuid, version_number integer, kind text, state text, rendered_text text, content_hash text,
               sealed_at timestamptz, record_label text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select v.contract_id, v.id, v.version_number, v.kind, v.state, v.rendered_text, v.content_hash, v.sealed_at,
         'Acceptance record — not an e-signature'::text
  from public.contract_versions v where v.id = p_version_id and v.rendered_text is not null;
$$;

create or replace function public.worker_contract_version_clauses(p_version_id uuid)
returns table (section_number smallint, section_title text, review_notice text, "position" smallint, clause_key text, kind text,
               heading text, body text, standard_heading text, standard_body text, change text, edited_in text, clause_hash text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.section_number, c.section_title, c.review_notice, c.position, c.clause_key, c.kind, c.heading, c.body, c.standard_heading,
         c.standard_body, c.change, c.edited_in, c.clause_hash
  from public.contract_version_clauses c where c.version_id = p_version_id
  order by c.section_number, c.position;
$$;

create or replace function public.worker_contract_flag_notices()
returns table (disclaimer text, no_match_text text)
language sql immutable security invoker set search_path = public, pg_temp as $$
  select 'Automatic keyword check. It may miss problems or flag acceptable text. It is not legal advice and WashLink does not check whether terms are lawful.'::text,
         'No keyword matches. This does not mean the terms are lawful.'::text;
$$;

create or replace function public.worker_contract_version_flags(p_version_id uuid)
returns table (section_number smallint, "position" smallint, value_key text, rule_key text, category text, label text, guidance text,
               excerpt text, disclaimer text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select f.section_number, f.position, f.value_key, f.rule_key, f.category, r.label, r.guidance, f.excerpt,
         (select n.disclaimer from public.worker_contract_flag_notices() n)
  from public.contract_version_flags f join public.contract_problem_term_rules r on r.rule_key = f.rule_key
  where f.version_id = p_version_id
  order by f.section_number nulls last, f.position, f.value_key, r.sort_order;
$$;

-- What an amendment changes compared with the version it amends (the latest accepted / superseded version before it).
-- Clause rows exist for sealed versions only; for a draft only the classification, dates and details are listed.
create or replace function public.worker_contract_version_changes(p_version_id uuid)
returns table (change_kind text, section_number smallint, item_key text, heading text, previous_text text, new_text text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with v as (select * from public.contract_versions where id = p_version_id and kind = 'amendment'),
  p as (select pv.* from public.contract_versions pv join v on pv.contract_id = v.contract_id
        where pv.version_number < v.version_number and pv.state in ('accepted', 'superseded') order by pv.version_number desc limit 1),
  nc as (select c.* from public.contract_version_clauses c join v on c.version_id = v.id),
  pc as (select c.* from public.contract_version_clauses c join p on c.version_id = p.id)
  select case when pc.id is null then 'clause_added' when nc.id is null then 'clause_removed' else 'clause_changed' end,
         coalesce(nc.section_number, pc.section_number), coalesce(nc.clause_key, pc.clause_key), coalesce(nc.heading, pc.heading),
         pc.body, nc.body
  from nc full join pc on nc.clause_key = pc.clause_key
  where (nc.clause_key is not null or pc.clause_key is not null)
    and (select count(*) from nc) > 0 and (nc.body is distinct from pc.body or nc.heading is distinct from pc.heading)
  union all
  select 'clause_added', nc.section_number, null, nc.heading, null, nc.body from nc
  where nc.kind = 'shop_specific' and not exists (select 1 from pc where pc.kind = 'shop_specific' and pc.section_number = nc.section_number
                                                  and pc.heading = nc.heading and pc.body = nc.body)
  union all
  select 'clause_removed', pc.section_number, null, pc.heading, pc.body, null from pc
  where pc.kind = 'shop_specific' and (select count(*) from nc) > 0
    and not exists (select 1 from nc where nc.kind = 'shop_specific' and nc.section_number = pc.section_number
                    and nc.heading = pc.heading and nc.body = pc.body)
  union all
  select 'classification_changed', null, 'classification', null, p.classification_label, v.classification_label from v, p
  where v.classification_key is distinct from p.classification_key
  union all
  select 'dates_changed', null, 'dates', null, p.start_date::text || ' / ' || coalesce(p.end_date::text, 'no end date'),
         v.start_date::text || ' / ' || coalesce(v.end_date::text, 'no end date') from v, p
  where v.start_date is distinct from p.start_date or v.end_date is distinct from p.end_date
  union all
  select 'contract_detail_changed', null, k.key, null, p.owner_values ->> k.key, v.owner_values ->> k.key
  from v, p, unnest(array['role_title', 'schedule_summary', 'pay_details']) k(key)
  where (v.owner_values ->> k.key) is distinct from (p.owner_values ->> k.key);
$$;

create or replace function public.worker_contract_acceptances(p_contract_id uuid)
returns table (version_id uuid, version_number integer, version_content_hash text, party_role text, party_name text, statement_key text,
               statement_text text, contractor_ack_key text, contractor_ack_text text, accepted_at timestamptz, record_label text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select a.version_id, a.version_number, a.version_content_hash, a.party_role, a.party_name_snapshot, a.statement_key, a.statement_text,
         a.contractor_ack_key, a.contractor_ack_text, a.accepted_at, a.record_label
  from public.contract_acceptances a where a.contract_id = p_contract_id
  order by a.version_number, a.accepted_at;
$$;

-- Owner only (definer): the open draft rendered with live values, the diff vs the standard, the unfilled list, live
-- flags and their count (the count the owner acknowledges at send), and, for an amendment, the change vs the
-- version in force.
create or replace function public.preview_worker_contract_draft(p_contract_id uuid)
returns table (version_id uuid, version_number integer, kind text, draft_revision integer, flag_count integer, unfilled text[],
               clauses jsonb, flags jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  v public.contract_versions;
begin
  if auth.uid() is null or not coalesce(public.current_user_profile_role() = 'owner', false) then
    return;
  end if;
  select * into c from public.worker_contracts x where x.id = p_contract_id and x.owner_id = auth.uid()
    and exists (select 1 from public.shops s where s.id = x.shop_id and s.owner_id = auth.uid());
  select * into v from public.contract_versions x where x.contract_id = c.id and x.state = 'draft';
  if v.id is null then
    return;
  end if;
  return query
  select v.id, v.version_number, v.kind, v.draft_revision,
         (select count(*)::integer from public.worker_contract_live_flags(v.id)), public.worker_contract_unfilled(v.id),
         (select coalesce(jsonb_agg(r || jsonb_build_object('amendment_change',
            case when v.kind <> 'amendment' then null
                 when r ->> 'kind' = 'shop_specific' then
                   case when exists (select 1 from public.contract_version_clauses o where o.version_id = c.current_version_id
                                     and o.kind = 'shop_specific' and o.heading = r ->> 'heading' and o.body = r ->> 'body') then 'unchanged' else 'added' end
                 when (select o.body from public.contract_version_clauses o where o.version_id = c.current_version_id
                       and o.clause_key = r ->> 'clause_key') is distinct from r ->> 'body' then 'changed'
                 else 'unchanged' end) order by ord), '[]'::jsonb)
          from jsonb_array_elements(public.worker_contract_rendered_clauses(v.id, public.worker_contract_render_values(v.id)))
               with ordinality as e(r, ord)),
         (select coalesce(jsonb_agg(jsonb_build_object('section_number', f.section_number, 'position', f.position, 'value_key', f.value_key,
                                                       'rule_key', f.rule_key, 'category', f.category, 'label', r.label, 'guidance', r.guidance,
                                                       'excerpt', f.excerpt) order by f.section_number nulls last, f.position, r.sort_order), '[]'::jsonb)
          from public.worker_contract_live_flags(v.id) f join public.contract_problem_term_rules r on r.rule_key = f.rule_key);
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['owner_worker_contracts()', 'my_worker_contracts()', 'owner_contract_eligible_workers()',
    'worker_contract_versions(uuid)', 'worker_contract_version_document(uuid)', 'worker_contract_version_clauses(uuid)',
    'worker_contract_flag_notices()', 'worker_contract_version_flags(uuid)', 'worker_contract_version_changes(uuid)',
    'worker_contract_acceptances(uuid)', 'preview_worker_contract_draft(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a)
-- -------------------------------------------------------------
-- drop function if exists public.preview_worker_contract_draft(uuid), public.worker_contract_acceptances(uuid),
--   public.worker_contract_version_changes(uuid), public.worker_contract_version_flags(uuid), public.worker_contract_flag_notices(),
--   public.worker_contract_version_clauses(uuid), public.worker_contract_version_document(uuid), public.worker_contract_versions(uuid),
--   public.owner_contract_eligible_workers(), public.my_worker_contracts(), public.owner_worker_contracts();
