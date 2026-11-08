-- =============================================================
-- WashLink W8d - contract template rules: hashes, core safeguard keys, placeholder allowlist, the version validator
-- (called by the RPCs and, DEFERRED, at commit for every session) and the internal version writer (the owner copy
-- helpers live in w8e; render_contract_template_clause of plan 3.4 lives in w8g, next to its only reader;
-- W8 PLAN 3.4, P38-P43). Requires w8b, w8c. Idempotent. Internal (revoked from every client role) unless stated.
-- Hash canonical form = the jsonb text form (R7): clause_hash = sha256 hex of {section_number, position,
-- clause_key, kind, heading, body}; content_hash = sha256 hex of {format, review_status, base_content_hash,
-- clause_hashes ordered by section, position}. No pgcrypto (built-in sha256).
-- =============================================================

create or replace function public.contract_template_clause_hash(p_section integer, p_position integer, p_key text, p_kind text,
                                                                p_heading text, p_body text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(jsonb_build_object('section_number', p_section, 'position', p_position, 'clause_key', p_key,
                                                     'kind', p_kind, 'heading', p_heading, 'body', p_body)::text, 'UTF8')), 'hex');
$$;

create or replace function public.contract_template_hash_of(p_review_status text, p_base_content_hash text, p_clause_hashes text[])
returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(jsonb_build_object('format', 'washlink_contract_template_v1', 'review_status', p_review_status,
                                                     'base_content_hash', p_base_content_hash,
                                                     'clause_hashes', to_jsonb(coalesce(p_clause_hashes, '{}'::text[])))::text, 'UTF8')), 'hex');
$$;

create or replace function public.contract_template_version_hash(p_version_id uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select public.contract_template_hash_of(v.review_status, b.content_hash,
           (select array_agg(public.contract_template_clause_hash(c.section_number, c.position, c.clause_key, c.kind, c.heading, c.body)
                             order by c.section_number, c.position)
            from public.contract_template_clauses c where c.version_id = v.id))
  from public.contract_template_versions v
  left join public.contract_template_versions b on b.id = v.base_platform_version_id
  where v.id = p_version_id;
$$;

-- The 15 core locked keys (plan section 4 + W8-L10 parties / safety / customer data + the section-4 reasons, W8-L12),
-- each pinned to its section: every platform version keeps each as locked_safeguard in that section.
create or replace function public.contract_template_core_safeguards()
returns table (clause_key text, section_number smallint)
language sql immutable set search_path = public, pg_temp as $$
  select k, s::smallint from (values ('parties_named', 1), ('classification_not_preselected', 4), ('classification_reasons', 4),
    ('no_training_fee_or_deduction', 7), ('deductions_listed_only', 7), ('required_training_free_and_supervised', 8),
    ('certification_shop_issued', 8), ('safety_terms_need_review', 10), ('customer_data_minimum', 11),
    ('right_to_decline_or_leave', 12), ('no_waiver_of_mandatory_rights', 13), ('acceptance_record_not_e_signature', 14),
    ('changes_need_new_version_and_consent', 14), ('template_is_draft', 14), ('safeguards_prevail', 15)) as x(k, s);
$$;

create or replace function public.contract_template_core_safeguard_keys()
returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array_agg(c.clause_key order by c.section_number, c.clause_key) from public.contract_template_core_safeguards() c;
$$;

create or replace function public.contract_template_placeholders_in(p_text text)
returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  tokens text[];
  token text;
  rest text;
begin
  if p_text is null then
    return '{}'::text[];
  end if;
  select coalesce(array_agg(distinct m[1] order by m[1]), '{}'::text[]) into tokens
  from regexp_matches(p_text, '\{\{([^{}]*)\}\}', 'g') as m;
  foreach token in array tokens loop
    if not exists (select 1 from public.contract_template_placeholders p where p.placeholder_key = token) then
      raise exception 'Unknown placeholder {{%}}.', left(token, 40) using errcode = '23514';
    end if;
  end loop;
  rest := regexp_replace(p_text, '\{\{[^{}]*\}\}', '', 'g');
  if strpos(rest, '{{') > 0 or strpos(rest, '}}') > 0 then
    token := coalesce(substring(rest from '\{\{([^{}]{0,40})'), substring(rest from '([^{}]{0,40})\}\}'), '');
    raise exception 'Unknown placeholder {{%}}.', token using errcode = '23514';
  end if;
  return tokens;
end;
$$;

-- Raises 23514 naming the first broken rule; returns quietly for a version that no longer exists (cascade).
create or replace function public.validate_contract_template_version(p_version_id uuid)
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.contract_template_versions;
  t public.contract_templates;
  clause record;
  base_clause record;
  missing text;
  n integer;
begin
  select * into v from public.contract_template_versions where id = p_version_id;
  if not found then
    return;
  end if;
  select * into t from public.contract_templates where id = v.template_id;
  select string_agg(s.section_number::text, ', ' order by s.section_number) into missing
  from public.contract_template_sections s
  where not exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.section_number = s.section_number);
  if missing is not null then
    raise exception 'Every contract section needs at least one clause (missing: %).', missing using errcode = '23514';
  end if;
  if exists (select 1 from (select c.position, row_number() over (partition by c.section_number order by c.position) as rn
                            from public.contract_template_clauses c where c.version_id = v.id) x where x.position <> x.rn) then
    raise exception 'Clause positions must be contiguous in every section.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_template_clauses c where c.version_id = v.id
             and c.clause_hash <> public.contract_template_clause_hash(c.section_number, c.position, c.clause_key, c.kind, c.heading, c.body)) then
    raise exception 'A clause hash does not match its text.' using errcode = '23514';
  end if;
  if v.content_hash is distinct from public.contract_template_version_hash(v.id) then
    raise exception 'The version hash does not match its clauses.' using errcode = '23514';
  end if;
  for clause in select c.heading, c.body from public.contract_template_clauses c where c.version_id = v.id order by c.section_number, c.position loop
    perform public.contract_template_placeholders_in(clause.heading || E'\n' || clause.body);
  end loop;
  if (select sum(char_length(c.body)) from public.contract_template_clauses c where c.version_id = v.id) > 120000 then
    raise exception 'A contract template can hold up to 120000 characters.' using errcode = '23514';
  end if;
  -- Relationship type and party names are filled only by WashLink safeguard clauses (W8-L12), in every scope.
  if exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.kind <> 'locked_safeguard'
             and (c.heading || ' ' || c.body) ~ '\{\{(worker_classification|owner_full_name|worker_full_name)\}\}') then
    raise exception 'The relationship type and the party names can appear only in WashLink safeguard clauses.' using errcode = '23514';
  end if;

  if t.scope = 'platform' then
    if v.base_platform_version_id is not null or v.edited_count <> 0 or v.added_count <> 0
       or exists (select 1 from public.contract_template_clauses c where c.version_id = v.id
                  and (c.kind = 'shop_specific' or c.source_clause_id is not null)) then
      raise exception 'The standard template has only its own WashLink safeguard and editable clauses.' using errcode = '23514';
    end if;
    select string_agg(k, ', ' order by k) into missing
    from unnest(public.contract_template_core_safeguard_keys()) k
    where not exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.clause_key = k
                      and c.kind = 'locked_safeguard');
    if missing is not null then
      raise exception 'The standard template must keep these WashLink safeguard clauses locked: %.', missing using errcode = '23514';
    end if;
    select string_agg(k.clause_key, ', ' order by k.clause_key) into missing
    from public.contract_template_core_safeguards() k join public.contract_template_clauses c
      on c.version_id = v.id and c.clause_key = k.clause_key and c.section_number <> k.section_number;
    if missing is not null then
      raise exception 'These WashLink safeguard clauses must stay in their own sections: %.', missing using errcode = '23514';
    end if;
    if exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.section_number = 4
               and c.kind <> 'locked_safeguard') then
      raise exception 'Section 4 can hold only WashLink safeguard clauses.' using errcode = '23514';
    end if;
    -- No review / validity / signature claims, except the negated sentences of template_is_draft (D-28, W8-L1).
    if exists (select 1 from public.contract_template_clauses c
               cross join lateral regexp_split_to_table(c.heading || '. ' || c.body, '[.!?;:]') as sentence(words)
               where c.version_id = v.id and sentence.words ~* '\m(complian|approved|valid|reviewed|binding|signed)'
                 and (c.clause_key <> 'template_is_draft' or sentence.words !~* '\mnot\M')) then
      raise exception 'The standard template cannot say it is reviewed, approved, valid, binding, signed or compliant.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.section_number = 4
                   and c.kind = 'locked_safeguard' and strpos(c.body, '{{worker_classification}}') > 0) then
      raise exception 'Section 4 must keep the relationship-type placeholder in a WashLink safeguard clause.' using errcode = '23514';
    end if;
    if exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and (c.heading || c.body) ~ '[0-9]') then
      raise exception 'The standard template cannot contain digits or amounts.' using errcode = '23514';
    end if;
    return;
  end if;

  if v.base_platform_version_id is null then
    raise exception 'An owner template version must be based on a standard template version.' using errcode = '23514';
  end if;
  for base_clause in select * from public.contract_template_clauses b where b.version_id = v.base_platform_version_id
                     order by b.section_number, b.position loop
    select count(*) into n from public.contract_template_clauses c
    where c.version_id = v.id and c.clause_key = base_clause.clause_key and c.kind = base_clause.kind
      and c.section_number = base_clause.section_number and c.position = base_clause.position
      and c.heading = base_clause.heading and c.source_clause_id = base_clause.id;
    if n <> 1 then
      raise exception 'Every clause of the standard template must stay in place (%).', base_clause.clause_key using errcode = '23514';
    end if;
    if base_clause.kind = 'locked_safeguard' and not exists (
         select 1 from public.contract_template_clauses c where c.version_id = v.id and c.source_clause_id = base_clause.id
           and c.body = base_clause.body and c.clause_hash = base_clause.clause_hash) then
      raise exception 'This clause is a WashLink safeguard and cannot be changed.' using errcode = '23514';
    end if;
  end loop;
  if (select count(*) from public.contract_template_clauses c where c.version_id = v.id and c.kind <> 'shop_specific')
       <> (select count(*) from public.contract_template_clauses b where b.version_id = v.base_platform_version_id)
     or exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.source_clause_id is not null
                group by c.source_clause_id having count(*) > 1) then
    raise exception 'Each clause of the standard template must appear exactly once.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.kind <> 'shop_specific'
             and not exists (select 1 from public.contract_template_clauses b where b.id = c.source_clause_id
                             and b.version_id = v.base_platform_version_id)) then
    raise exception 'Only clauses of the standard template can be locked or editable.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_template_clauses c join public.contract_template_sections s on s.section_number = c.section_number
             where c.version_id = v.id and c.kind = 'shop_specific' and not s.owner_terms_allowed) then
    raise exception 'Shop-specific terms are not allowed in this section.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_template_clauses st join public.contract_template_clauses c
               on c.version_id = st.version_id and c.section_number = st.section_number
             where st.version_id = v.id and st.kind = 'shop_specific' and c.kind <> 'shop_specific' and c.position > st.position) then
    raise exception 'Shop-specific terms come after the standard clauses of their section.' using errcode = '23514';
  end if;
  if (select count(*) from public.contract_template_clauses c where c.version_id = v.id and c.kind = 'shop_specific') > 40 then
    raise exception 'A version can have up to 40 shop-specific terms.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.kind = 'shop_specific'
             and char_length(c.body) not between 10 and 4000) then
    raise exception 'Write each shop-specific term in 10 to 4000 characters.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_template_clauses c where c.version_id = v.id and c.kind <> 'locked_safeguard'
             and regexp_replace(lower(c.heading || ' ' || c.body), '[^[:alnum:]]+', '', 'g') ~ '(washlink|platform)safeguard') then
    raise exception 'Shop text cannot be labelled as a WashLink safeguard.' using errcode = '23514';
  end if;
  if v.edited_count <> (select count(*) from public.contract_template_clauses c join public.contract_template_clauses b on b.id = c.source_clause_id
                        where c.version_id = v.id and c.kind = 'editable' and c.body <> b.body)
     or v.added_count <> (select count(*) from public.contract_template_clauses c where c.version_id = v.id and c.kind = 'shop_specific') then
    raise exception 'The edited and added counts do not match the clauses.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.contract_template_versions_validate_at_commit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.validate_contract_template_version(new.id);
  return null;
end;
$$;

drop trigger if exists contract_template_versions_validate_at_commit on public.contract_template_versions;
create constraint trigger contract_template_versions_validate_at_commit
  after insert on public.contract_template_versions
  deferrable initially deferred
  for each row execute function public.contract_template_versions_validate_at_commit();

-- Content hash of a clause list (jsonb array of {section_number, position, clause_key, kind, heading, body}) on a
-- base version (null for platform). Same normaliser and hash as the clause guard, so it equals the stored hash.
create or replace function public.contract_template_clauses_content_hash(p_base_version_id uuid, p_clauses jsonb)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select public.contract_template_hash_of('draft_requires_legal_review',
           (select b.content_hash from public.contract_template_versions b where b.id = p_base_version_id),
           (select array_agg(public.contract_template_clause_hash(x.section_number, x.position, x.clause_key, x.kind,
                                                                  public.contract_template_normalize_text(x.heading),
                                                                  public.contract_template_normalize_text(x.body))
                             order by x.section_number, x.position)
            from jsonb_to_recordset(p_clauses) as x(section_number integer, position integer, clause_key text, kind text,
                                                    heading text, body text)));
$$;

-- The only version writer (RPCs and the w8e seed). Sets the flag, inserts version n+1 and its clauses in this
-- transaction, validates immediately (the deferred trigger re-validates at commit).
create or replace function public.contract_template_insert_version(p_template_id uuid, p_base_version_id uuid, p_clauses jsonb,
                                                                   p_edited_count integer, p_added_count integer)
returns public.contract_template_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  saved public.contract_template_versions;
begin
  perform set_config('washlink.contract_template_write', p_template_id::text, true);
  insert into public.contract_template_versions (template_id, version_number, base_platform_version_id, content_hash,
                                                 edited_count, added_count, saved_by_role)
  values (p_template_id,
          (select coalesce(max(v.version_number), 0) + 1 from public.contract_template_versions v where v.template_id = p_template_id),
          p_base_version_id, public.contract_template_clauses_content_hash(p_base_version_id, p_clauses),
          p_edited_count, p_added_count, 'trusted_session')
  returning * into saved;
  insert into public.contract_template_clauses (version_id, section_number, position, clause_key, kind, heading, body,
                                                source_clause_id, requires_owner_input, clause_hash)
  select saved.id, x.section_number, x.position, x.clause_key, x.kind, x.heading, x.body, x.source_clause_id,
         coalesce(x.requires_owner_input, false), repeat('0', 64)
  from jsonb_to_recordset(p_clauses) as x(section_number smallint, position smallint, clause_key text, kind text, heading text,
                                          body text, source_clause_id uuid, requires_owner_input boolean);
  perform public.validate_contract_template_version(saved.id);
  return saved;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array[
    'contract_template_clause_hash(integer, integer, text, text, text, text)', 'contract_template_hash_of(text, text, text[])',
    'contract_template_version_hash(uuid)', 'contract_template_core_safeguards()', 'contract_template_core_safeguard_keys()',
    'contract_template_placeholders_in(text)', 'validate_contract_template_version(uuid)',
    'contract_template_versions_validate_at_commit()', 'contract_template_clauses_content_hash(uuid, jsonb)',
    'contract_template_insert_version(uuid, uuid, jsonb, integer, integer)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a; roll back w8e first)
-- -------------------------------------------------------------
-- drop trigger if exists contract_template_versions_validate_at_commit on public.contract_template_versions;
-- drop function if exists public.contract_template_insert_version(uuid, uuid, jsonb, integer, integer),
--   public.contract_template_clauses_content_hash(uuid, jsonb), public.contract_template_versions_validate_at_commit(),
--   public.validate_contract_template_version(uuid), public.contract_template_placeholders_in(text),
--   public.contract_template_core_safeguard_keys(), public.contract_template_core_safeguards(),
--   public.contract_template_version_hash(uuid),
--   public.contract_template_hash_of(text, text, text[]), public.contract_template_clause_hash(integer, integer, text, text, text, text);
