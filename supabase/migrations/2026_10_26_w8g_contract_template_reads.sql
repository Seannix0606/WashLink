-- =============================================================
-- WashLink W8g - contract template reads (W8 PLAN 3.7; D-30). Requires w8c..w8f. Idempotent.
-- SECURITY INVOKER: the caller's own RLS decides (owners: own templates + the platform standard; super_admin: the
-- platform standard only; workers, customers: nothing). A foreign or unknown id returns 0 rows (no existence
-- oracle). Granted to authenticated only.
-- =============================================================

-- Renders {{key}} with p_values ->> key or, when absent, the preview label (W9 passes real values and refuses
-- unfilled keys). Granted to authenticated (used by the invoker preview read). STABLE: reads the allowlist.
-- Single pass: the body is split on the placeholder pattern and rebuilt, so a value is never expanded again;
-- a supplied value containing `{{` or `}}` is refused (22023).
create or replace function public.render_contract_template_clause(p_body text, p_values jsonb default null)
returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare
  parts text[];
  tokens text[];
  rendered text;
  i integer;
begin
  if p_body is null then
    return null;
  end if;
  if jsonb_typeof(p_values) = 'object'
     and exists (select 1 from jsonb_each_text(p_values) e where strpos(e.value, '{{') > 0 or strpos(e.value, '}}') > 0) then
    raise exception 'Placeholder values cannot contain {{ or }}.' using errcode = '22023';
  end if;
  parts := regexp_split_to_array(p_body, '\{\{[a-z_]{3,40}\}\}');
  select coalesce(array_agg(r.m[1] order by r.ord), '{}'::text[]) into tokens
  from regexp_matches(p_body, '\{\{([a-z_]{3,40})\}\}', 'g') with ordinality as r(m, ord);
  rendered := parts[1];
  for i in 1 .. coalesce(array_length(tokens, 1), 0) loop
    rendered := rendered
      || coalesce(p_values ->> tokens[i],
                  (select p.preview_label from public.contract_template_placeholders p where p.placeholder_key = tokens[i]),
                  '{{' || tokens[i] || '}}')
      || parts[i + 1];
  end loop;
  return rendered;
end;
$$;

-- Own templates with the "A newer standard template is available" flag from live state (D-30).
create or replace function public.owner_contract_templates()
returns table (template_id uuid, name text, status text, current_version_number integer, current_version_id uuid,
               last_saved_at timestamptz, base_platform_version_id uuid, base_platform_version_number integer,
               latest_platform_version_id uuid, latest_platform_version_number integer, newer_standard_available boolean,
               derived_from_version_id uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with latest as (
    select v.id, v.version_number from public.contract_template_versions v
    join public.contract_templates p on p.id = v.template_id
    where p.scope = 'platform' and v.version_number = p.current_version_number)
  select t.id, t.name, t.status, t.current_version_number, cv.id, cv.created_at, cv.base_platform_version_id, bv.version_number,
         l.id, l.version_number, (l.id is not null and cv.base_platform_version_id is distinct from l.id),
         t.derived_from_version_id, t.created_at
  from public.contract_templates t
  join public.contract_template_versions cv on cv.template_id = t.id and cv.version_number = t.current_version_number
  left join public.contract_template_versions bv on bv.id = cv.base_platform_version_id
  left join latest l on true
  where t.scope = 'owner' and t.owner_id = auth.uid()
  order by (t.status = 'active') desc, cv.created_at desc, t.id;
$$;

create or replace function public.platform_contract_template_current()
returns table (template_id uuid, name text, version_id uuid, version_number integer, content_hash text, created_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select t.id, t.name, v.id, v.version_number, v.content_hash, v.created_at
  from public.contract_templates t
  join public.contract_template_versions v on v.template_id = t.id and v.version_number = t.current_version_number
  where t.scope = 'platform';
$$;

create or replace function public.contract_template_version_history(p_template_id uuid)
returns table (version_id uuid, version_number integer, created_at timestamptz, content_hash text, base_platform_version_id uuid,
               base_platform_version_number integer, edited_count smallint, added_count smallint, saved_by_role text,
               is_current boolean)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select v.id, v.version_number, v.created_at, v.content_hash, v.base_platform_version_id, b.version_number, v.edited_count,
         v.added_count, v.saved_by_role, v.version_number = t.current_version_number
  from public.contract_templates t
  join public.contract_template_versions v on v.template_id = t.id
  left join public.contract_template_versions b on b.id = v.base_platform_version_id
  where t.id = p_template_id
  order by v.version_number desc;
$$;

create or replace function public.contract_template_version_clauses(p_version_id uuid)
returns table (clause_id uuid, section_number smallint, section_title text, review_notice text, owner_terms_allowed boolean,
               "position" smallint, clause_key text, kind text, heading text, body text, requires_owner_input boolean,
               source_clause_id uuid, clause_hash text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.id, c.section_number, s.title, s.review_notice, s.owner_terms_allowed, c.position, c.clause_key, c.kind, c.heading,
         c.body, c.requires_owner_input, c.source_clause_id, c.clause_hash
  from public.contract_template_clauses c
  join public.contract_template_sections s on s.section_number = c.section_number
  where c.version_id = p_version_id
  order by c.section_number, c.position;
$$;

-- Same rows plus placeholders rendered as their preview labels; the UI shows review_notice under every section
-- heading and as a top banner.
create or replace function public.preview_contract_template_version(p_version_id uuid)
returns table (clause_id uuid, section_number smallint, section_title text, review_notice text, "position" smallint,
               clause_key text, kind text, heading text, rendered_heading text, body text, rendered_body text,
               requires_owner_input boolean)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.clause_id, c.section_number, c.section_title, c.review_notice, c.position, c.clause_key, c.kind, c.heading,
         public.render_contract_template_clause(c.heading, null), c.body, public.render_contract_template_clause(c.body, null),
         c.requires_owner_input
  from public.contract_template_version_clauses(p_version_id) c
  order by c.section_number, c.position;
$$;

-- One row per base clause and shop term; all `unchanged` for a platform version (compared with itself).
create or replace function public.contract_template_version_diff(p_version_id uuid)
returns table (section_number smallint, section_title text, "position" smallint, clause_key text, kind text, change text,
               standard_heading text, standard_body text, version_heading text, version_body text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.section_number, s.title, c.position, c.clause_key, c.kind,
         case when c.kind = 'shop_specific' then 'added_by_shop'
              when b.id is null or c.body = b.body then 'unchanged'
              else 'edited' end,
         case when c.kind = 'shop_specific' then null else coalesce(b.heading, c.heading) end,
         case when c.kind = 'shop_specific' then null else coalesce(b.body, c.body) end,
         c.heading, c.body
  from public.contract_template_clauses c
  join public.contract_template_sections s on s.section_number = c.section_number
  left join public.contract_template_clauses b on b.id = c.source_clause_id
  where c.version_id = p_version_id
  order by c.section_number, c.position;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['owner_contract_templates()', 'platform_contract_template_current()',
    'contract_template_version_history(uuid)', 'contract_template_version_clauses(uuid)', 'preview_contract_template_version(uuid)',
    'contract_template_version_diff(uuid)', 'render_contract_template_clause(text, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a)
-- -------------------------------------------------------------
-- drop function if exists public.contract_template_version_diff(uuid);
-- drop function if exists public.preview_contract_template_version(uuid);
-- drop function if exists public.contract_template_version_clauses(uuid);
-- drop function if exists public.contract_template_version_history(uuid);
-- drop function if exists public.platform_contract_template_current();
-- drop function if exists public.owner_contract_templates();
-- drop function if exists public.render_contract_template_clause(text, jsonb);
