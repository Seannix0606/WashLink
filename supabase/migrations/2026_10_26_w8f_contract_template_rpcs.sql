-- =============================================================
-- WashLink W8f - contract template RPCs (W8 PLAN 3.6, section 5; P37-P39; D-27..D-29). Requires w8c..w8e. Idempotent.
-- Client RPCs (definer, authenticated): create_owner_contract_template, save_owner_contract_template_version,
-- rename_owner_contract_template, set_owner_contract_template_status, publish_platform_contract_template_version.
-- Locked clauses never come from the client (P39): the server copies every locked_safeguard clause verbatim from
-- the base platform version. Lock order: contract_templates row FOR UPDATE -> platform version row FOR SHARE;
-- create / restore also take a per-owner advisory lock (25-active limit); publish takes `contract_template_platform`.
-- No shop verification needed (D-29). The write flag is cleared before each RPC returns.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Internal helpers
-- -------------------------------------------------------------
create or replace function public.contract_template_name_or_fail(p_name text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if char_length(coalesce(btrim(p_name), '')) not between 3 and 120 or btrim(p_name) ~ '[\x01-\x1f\x7f]' then
    raise exception 'Template names must be 3 to 120 characters.' using errcode = '23514';
  end if;
  return btrim(p_name);
end;
$$;

create or replace function public.contract_template_assert_active_limit(p_owner_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('contract_template_owner:' || p_owner_id::text, 0));
  if (select count(*) from public.contract_templates t where t.scope = 'owner' and t.owner_id = p_owner_id
      and t.status = 'active') >= 25 then
    raise exception 'You can keep up to 25 active templates. Archive one first.' using errcode = '23514';
  end if;
end;
$$;

-- The caller's own owner-scope template, locked FOR UPDATE; anything else -> 42501 (no existence oracle).
create or replace function public.lock_owner_contract_template(p_template_id uuid) returns public.contract_templates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.contract_templates;
begin
  if auth.uid() is not null and coalesce(public.current_user_profile_role() = 'owner', false) then
    select * into t from public.contract_templates
    where id = p_template_id and scope = 'owner' and owner_id = auth.uid() for update;
  end if;
  if t.id is null then
    raise exception 'Contract template not found.' using errcode = '42501';
  end if;
  return t;
end;
$$;

-- Validated, normalised shop terms: [{section_number, heading, body}] in the given order.
create or replace function public.contract_template_checked_shop_terms(p_terms jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  term jsonb;
  checked jsonb := '[]'::jsonb;
  heading text;
  body text;
begin
  if p_terms is null or p_terms = 'null'::jsonb then
    return checked;
  end if;
  if jsonb_typeof(p_terms) <> 'array' then
    raise exception 'Shop-specific terms must be a list of section, heading and text.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_terms) > 40 then
    raise exception 'A version can have up to 40 shop-specific terms.' using errcode = '23514';
  end if;
  for term in select value from jsonb_array_elements(p_terms) loop
    if jsonb_typeof(term) <> 'object' or jsonb_typeof(term -> 'section_number') is distinct from 'number'
       or jsonb_typeof(term -> 'heading') is distinct from 'string' or jsonb_typeof(term -> 'body') is distinct from 'string'
       or (term ->> 'section_number') !~ '^[0-9]{1,2}$' then
      raise exception 'Shop-specific terms must be a list of section, heading and text.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.contract_template_sections s
                   where s.section_number = (term ->> 'section_number')::smallint and s.owner_terms_allowed) then
      raise exception 'Shop-specific terms are not allowed in this section.' using errcode = '23514';
    end if;
    heading := public.contract_template_normalize_text(term ->> 'heading');
    body := public.contract_template_normalize_text(term ->> 'body');
    if char_length(heading) not between 3 and 160 then
      raise exception 'Give each shop-specific term a heading of 3 to 160 characters.' using errcode = '23514';
    end if;
    if char_length(body) not between 10 and 4000 then
      raise exception 'Write each shop-specific term in 10 to 4000 characters.' using errcode = '23514';
    end if;
    checked := checked || jsonb_build_object('section_number', (term ->> 'section_number')::integer, 'heading', heading, 'body', body);
  end loop;
  return checked;
end;
$$;

-- -------------------------------------------------------------
-- 2) Owner RPCs
-- -------------------------------------------------------------
create or replace function public.create_owner_contract_template(p_name text, p_from_version_id uuid default null)
returns public.contract_templates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  template_name text;
  latest public.contract_template_versions;
  source public.contract_template_versions;
  base_id uuid;
  bodies jsonb := '{}'::jsonb;
  terms jsonb := '[]'::jsonb;
  built jsonb;
  new_id uuid := gen_random_uuid();
  created public.contract_templates;
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role() <> 'owner', true) then
    raise exception 'Only shop owners can create contract templates.' using errcode = '42501';
  end if;
  template_name := public.contract_template_name_or_fail(p_name);
  perform public.contract_template_assert_active_limit(auth.uid());
  select v.* into latest from public.contract_template_versions v
  where v.id = (public.contract_template_latest_platform_version()).id for share;
  if p_from_version_id is null or p_from_version_id = latest.id then
    base_id := latest.id;
  else
    select v.* into source from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id
    where v.id = p_from_version_id and t.scope = 'owner' and t.owner_id = auth.uid();
    if source.id is null then
      if exists (select 1 from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id
                 where v.id = p_from_version_id and t.scope = 'platform') then
        raise exception 'Use the current standard template version.' using errcode = '23514';
      end if;
      raise exception 'Contract template not found.' using errcode = '42501';
    end if;
    base_id := source.base_platform_version_id;
    perform 1 from public.contract_template_versions v where v.id = base_id for share;
    bodies := public.contract_template_editable_bodies(source.id);
    terms := public.contract_template_shop_terms(source.id);
  end if;
  built := public.contract_template_owner_clause_list(base_id, bodies, terms);
  perform set_config('washlink.contract_template_write', new_id::text, true);
  insert into public.contract_templates (id, scope, owner_id, name, status, current_version_number, derived_from_version_id)
  values (new_id, 'owner', auth.uid(), template_name, 'active', 1, coalesce(source.id, latest.id));
  perform public.contract_template_insert_version(new_id, base_id, built -> 'clauses', (built ->> 'edited_count')::integer,
                                                  (built ->> 'added_count')::integer);
  perform set_config('washlink.contract_template_write', '', true);
  select * into created from public.contract_templates where id = new_id;
  return created;
end;
$$;

create or replace function public.save_owner_contract_template_version(p_template_id uuid, p_expected_version_number integer,
                                                                       p_base_platform_version_id uuid, p_editable_bodies jsonb,
                                                                       p_shop_terms jsonb)
returns public.contract_template_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.contract_templates;
  current_version public.contract_template_versions;
  latest public.contract_template_versions;
  bad_key text;
  bodies jsonb := '{}'::jsonb;
  terms jsonb;
  built jsonb;
  saved public.contract_template_versions;
begin
  t := public.lock_owner_contract_template(p_template_id);
  if t.status <> 'active' then
    raise exception 'Archived templates cannot be changed. Restore it first.' using errcode = '23514';
  end if;
  if p_expected_version_number is distinct from t.current_version_number then
    raise exception 'This template changed. Reload it and try again.' using errcode = '55000';
  end if;
  select * into current_version from public.contract_template_versions v
  where v.template_id = t.id and v.version_number = t.current_version_number;
  select v.* into latest from public.contract_template_versions v
  where v.id = (public.contract_template_latest_platform_version()).id for share;
  if p_base_platform_version_id is null
     or p_base_platform_version_id not in (current_version.base_platform_version_id, latest.id) then
    raise exception 'Use the current standard template version.' using errcode = '23514';
  end if;
  perform 1 from public.contract_template_versions v where v.id = p_base_platform_version_id for share;
  if p_editable_bodies is not null and p_editable_bodies <> 'null'::jsonb and jsonb_typeof(p_editable_bodies) <> 'object' then
    raise exception 'Editable clause bodies must be text.' using errcode = '22023';
  end if;
  for bad_key in select k from jsonb_object_keys(coalesce(nullif(p_editable_bodies, 'null'::jsonb), '{}'::jsonb)) k loop
    if exists (select 1 from public.contract_template_clauses b where b.version_id = p_base_platform_version_id
               and b.clause_key = bad_key and b.kind = 'locked_safeguard') then
      raise exception 'This clause is a WashLink safeguard and cannot be changed.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.contract_template_clauses b where b.version_id = p_base_platform_version_id
                   and b.clause_key = bad_key and b.kind = 'editable') then
      raise exception 'Unknown clause.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_editable_bodies -> bad_key) <> 'string' then
      raise exception 'Editable clause bodies must be text.' using errcode = '22023';
    end if;
    if char_length(public.contract_template_normalize_text(p_editable_bodies ->> bad_key)) = 0 then
      raise exception 'Editable clauses cannot be empty.' using errcode = '23514';
    end if;
    if char_length(public.contract_template_normalize_text(p_editable_bodies ->> bad_key)) > 4000 then
      raise exception 'A clause can hold up to 4000 characters.' using errcode = '23514';
    end if;
  end loop;
  -- Missing keys keep the CURRENT version's body when that key exists there and the owner had edited it (body
  -- differs from its own standard clause), else the base body: a rebase keeps edits by key and takes the new
  -- standard text for clauses the owner never changed.
  select coalesce(jsonb_object_agg(b.clause_key, coalesce(nullif(p_editable_bodies, 'null'::jsonb) -> b.clause_key,
                                                          case when c.body is distinct from cb.body then to_jsonb(c.body) end,
                                                          to_jsonb(b.body))), '{}'::jsonb)
  into bodies
  from public.contract_template_clauses b
  left join public.contract_template_clauses c on c.version_id = current_version.id and c.clause_key = b.clause_key and c.kind = 'editable'
  left join public.contract_template_clauses cb on cb.id = c.source_clause_id
  where b.version_id = p_base_platform_version_id and b.kind = 'editable';
  terms := public.contract_template_checked_shop_terms(p_shop_terms);
  if (select count(*) from public.contract_template_versions v where v.template_id = t.id) >= 200 then
    raise exception 'A template can keep up to 200 versions. Start a new template from this version.' using errcode = '23514';
  end if;
  built := public.contract_template_owner_clause_list(p_base_platform_version_id, bodies, terms);
  if public.contract_template_clauses_content_hash(p_base_platform_version_id, built -> 'clauses') = current_version.content_hash then
    raise exception 'Nothing changed since the last version.' using errcode = '23514';
  end if;
  saved := public.contract_template_insert_version(t.id, p_base_platform_version_id, built -> 'clauses',
                                                   (built ->> 'edited_count')::integer, (built ->> 'added_count')::integer);
  update public.contract_templates set current_version_number = saved.version_number where id = t.id;
  perform set_config('washlink.contract_template_write', '', true);
  return saved;
end;
$$;

create or replace function public.rename_owner_contract_template(p_template_id uuid, p_name text) returns public.contract_templates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.contract_templates;
  template_name text;
begin
  t := public.lock_owner_contract_template(p_template_id);
  if t.status <> 'active' then
    raise exception 'Archived templates cannot be changed. Restore it first.' using errcode = '23514';
  end if;
  template_name := public.contract_template_name_or_fail(p_name);
  if template_name = t.name then
    return t;
  end if;
  perform set_config('washlink.contract_template_write', t.id::text, true);
  update public.contract_templates set name = template_name where id = t.id returning * into t;
  perform set_config('washlink.contract_template_write', '', true);
  return t;
end;
$$;

create or replace function public.set_owner_contract_template_status(p_template_id uuid, p_from_status text, p_to_status text)
returns public.contract_templates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.contract_templates;
begin
  t := public.lock_owner_contract_template(p_template_id);
  if p_from_status is null or p_to_status is null or p_from_status not in ('active', 'archived')
     or p_to_status not in ('active', 'archived') then
    raise exception 'Unknown template status.' using errcode = '22023';
  end if;
  if p_from_status = p_to_status then
    raise exception 'The template already has this status.' using errcode = '23514';
  end if;
  if t.status <> p_from_status then
    raise exception 'This template changed. Reload it and try again.' using errcode = '55000';
  end if;
  if p_to_status = 'active' then
    perform public.contract_template_assert_active_limit(auth.uid());
  end if;
  perform set_config('washlink.contract_template_write', t.id::text, true);
  update public.contract_templates set status = p_to_status where id = t.id returning * into t;
  perform set_config('washlink.contract_template_write', '', true);
  return t;
end;
$$;

-- -------------------------------------------------------------
-- 3) super_admin: publish a new platform version (D-28). Existing owner versions keep their old base (P38).
-- -------------------------------------------------------------
create or replace function public.publish_platform_contract_template_version(p_expected_version_number integer, p_clauses jsonb)
returns public.contract_template_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.contract_templates;
  item jsonb;
  clauses jsonb;
  saved public.contract_template_versions;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Only WashLink administrators can change the standard template.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contract_template_platform', 0));
  select * into t from public.contract_templates where scope = 'platform' for update;
  if p_expected_version_number is distinct from t.current_version_number then
    raise exception 'This template changed. Reload it and try again.' using errcode = '55000';
  end if;
  if p_clauses is null or jsonb_typeof(p_clauses) <> 'array' or jsonb_array_length(p_clauses) not between 1 and 120 then
    raise exception 'Give the standard template as a list of 1 to 120 clauses.' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_clauses) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item -> 'section_number') is distinct from 'number'
       or (item ->> 'section_number') !~ '^[0-9]{1,2}$' or jsonb_typeof(item -> 'clause_key') is distinct from 'string'
       or jsonb_typeof(item -> 'heading') is distinct from 'string' or jsonb_typeof(item -> 'body') is distinct from 'string'
       or coalesce(jsonb_typeof(item -> 'requires_owner_input'), 'boolean') not in ('boolean', 'null') then
      raise exception 'Each clause needs a section, key, kind, heading and text.' using errcode = '22023';
    end if;
    if item ->> 'kind' is null or item ->> 'kind' not in ('locked_safeguard', 'editable') then
      raise exception 'The standard template has only WashLink safeguard and editable clauses.' using errcode = '23514';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('section_number', x.section_number,
                                      'position', x.position, 'clause_key', x.item ->> 'clause_key', 'kind', x.item ->> 'kind',
                                      'heading', x.item ->> 'heading', 'body', x.item ->> 'body', 'source_clause_id', null,
                                      'requires_owner_input', coalesce((x.item ->> 'requires_owner_input')::boolean, false))
                   order by x.section_number, x.position)
  into clauses
  from (select e.value as item, (e.value ->> 'section_number')::integer as section_number,
               row_number() over (partition by (e.value ->> 'section_number')::integer order by e.ord) as position
        from jsonb_array_elements(p_clauses) with ordinality as e(value, ord)) x;
  saved := public.contract_template_insert_version(t.id, null, clauses, 0, 0);
  update public.contract_templates set current_version_number = saved.version_number where id = t.id;
  perform set_config('washlink.contract_template_write', '', true);
  return saved;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['contract_template_name_or_fail(text)',
    'contract_template_assert_active_limit(uuid)', 'lock_owner_contract_template(uuid)', 'contract_template_checked_shop_terms(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
  foreach sig in array array['create_owner_contract_template(text, uuid)',
    'save_owner_contract_template_version(uuid, integer, uuid, jsonb, jsonb)', 'rename_owner_contract_template(uuid, text)',
    'set_owner_contract_template_status(uuid, text, text)', 'publish_platform_contract_template_version(integer, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a)
-- -------------------------------------------------------------
-- drop function if exists public.publish_platform_contract_template_version(integer, jsonb),
--   public.set_owner_contract_template_status(uuid, text, text), public.rename_owner_contract_template(uuid, text),
--   public.save_owner_contract_template_version(uuid, integer, uuid, jsonb, jsonb), public.create_owner_contract_template(text, uuid),
--   public.contract_template_checked_shop_terms(jsonb), public.lock_owner_contract_template(uuid),
--   public.contract_template_assert_active_limit(uuid), public.contract_template_name_or_fail(text);
