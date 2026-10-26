-- =============================================================
-- WashLink W9e - worker contract rules (internal): eligibility (D-31), the draft clause list on the base standard
-- (W8 placement), render values, unfilled check, the single-pass text builder, live problem-term flags (D-33), the
-- sealer and the version validator (called by the sealer and, DEFERRED, at commit for every session), effective
-- status (W9 PLAN 3.5, P46, P48-P51). Requires w8c..w8g, w9b..w9d. Idempotent. Internal (revoked from every client
-- role) except worker_contract_effective_status (pure, granted to authenticated for the invoker reads).
-- Text format (P48): header (agreement title, contract reference, version number and kind, base standard version
-- number, relationship type, the draft notice, the record label), then every section "N. Title", its notice, each
-- clause heading and body, separated by blank lines. content_hash = sha256 hex of convert_to(rendered_text, 'UTF8').
-- =============================================================

-- An accepted application at the shop under its current owner, else a completed enrollment at the shop (D-31).
create or replace function public.worker_contract_eligibility(p_shop_id uuid, p_worker_id uuid)
returns table (origin text, job_application_id uuid, training_enrollment_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  (select 'accepted_application'::text, a.id, null::uuid from public.job_applications a join public.shops s on s.id = a.shop_id
   where a.shop_id = p_shop_id and a.worker_id = p_worker_id and a.status = 'accepted' and a.submitted_at is not null
     and a.owner_id = s.owner_id
   order by a.decided_at desc nulls last, a.id limit 1)
  union all
  (select 'completed_training'::text, null::uuid, e.id from public.training_enrollments e join public.shops s on s.id = e.shop_id
   where e.shop_id = p_shop_id and e.worker_id = p_worker_id and e.owner_id = s.owner_id
     and public.training_enrollment_is_completed(e.id)
   order by e.accepted_at desc nulls last, e.id limit 1)
  limit 1;
$$;

-- Raw clause list of a version: base locked clauses verbatim, editable bodies (contract override, else the template
-- version, else the base), then each section's shop terms (W8 placement). Unrendered.
create or replace function public.worker_contract_draft_clauses(p_version_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.contract_versions;
  owner_template boolean;
  section_row record;
  b record;
  term record;
  clauses jsonb := '[]'::jsonb;
  pos integer;
  template_body text;
  override text;
  body text;
  change text;
begin
  select * into v from public.contract_versions where id = p_version_id;
  if not found then
    return clauses;
  end if;
  select t.scope = 'owner' into owner_template from public.contract_template_versions tv
  join public.contract_templates t on t.id = tv.template_id where tv.id = v.template_version_id;
  for section_row in select s.section_number, s.title, s.review_notice from public.contract_template_sections s order by s.section_number loop
    pos := 0;
    for b in select * from public.contract_template_clauses c where c.version_id = v.base_platform_version_id
             and c.section_number = section_row.section_number order by c.position loop
      pos := b.position;
      template_body := null;
      override := null;
      if b.kind = 'editable' then
        if owner_template then
          select c.body into template_body from public.contract_template_clauses c
          where c.version_id = v.template_version_id and c.clause_key = b.clause_key and c.kind = 'editable';
        end if;
        override := v.editable_bodies ->> b.clause_key;
      end if;
      body := coalesce(override, template_body, b.body);
      change := case when body = b.body then 'unchanged' else 'edited' end;
      clauses := clauses || jsonb_build_object('section_number', b.section_number, 'section_title', section_row.title,
        'review_notice', section_row.review_notice, 'position', b.position, 'clause_key', b.clause_key, 'kind', b.kind,
        'heading', b.heading, 'body', body, 'standard_heading', b.heading, 'standard_body', b.body, 'change', change,
        'edited_in', case when change = 'unchanged' then null
                          when override is not null and override is distinct from coalesce(template_body, b.body) then 'contract'
                          else 'template' end,
        'needs_input', b.kind = 'editable' and ((b.requires_owner_input and body = b.body) or strpos(body, '[Shop:') > 0));
    end loop;
    for term in select t.value from jsonb_array_elements(v.shop_terms) with ordinality as t(value, ord)
                where (t.value ->> 'section_number')::integer = section_row.section_number order by t.ord loop
      pos := pos + 1;
      clauses := clauses || jsonb_build_object('section_number', section_row.section_number, 'section_title', section_row.title,
        'review_notice', section_row.review_notice, 'position', pos, 'clause_key', null, 'kind', 'shop_specific',
        'heading', term.value ->> 'heading', 'body', term.value ->> 'body', 'standard_heading', null, 'standard_body', null,
        'change', 'added_by_shop',
        'edited_in', case when coalesce(owner_template, false) and exists (
                            select 1 from public.contract_template_clauses c where c.version_id = v.template_version_id
                              and c.kind = 'shop_specific' and c.section_number = section_row.section_number
                              and c.heading = term.value ->> 'heading' and c.body = term.value ->> 'body') then 'template'
                          else 'contract' end,
        'needs_input', strpos(term.value ->> 'body', '[Shop:') > 0);
    end loop;
  end loop;
  return clauses;
end;
$$;

create or replace function public.worker_contract_safe_value(p_value text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(nullif(btrim(replace(replace(p_value, '{{', '{ {'), '}}', '} }')), ''), 'Name not provided on WashLink');
$$;

-- Server values from profiles / shops (P50) plus the owner-typed details. Braces in names are neutralised.
create or replace function public.worker_contract_render_values(p_version_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'owner_full_name', public.worker_contract_safe_value(op.full_name),
    'worker_full_name', public.worker_contract_safe_value(wp.full_name),
    'shop_name', public.worker_contract_safe_value(coalesce(s.name, c.shop_name_snapshot)),
    'shop_address', public.worker_contract_safe_value(coalesce(s.address, c.shop_address_snapshot)),
    'worker_classification', v.classification_label,
    'start_date', to_char(v.start_date, 'YYYY-MM-DD'),
    'end_date', coalesce(to_char(v.end_date, 'YYYY-MM-DD'), 'No end date stated by the shop'))) || v.owner_values
  from public.contract_versions v
  join public.worker_contracts c on c.id = v.contract_id
  left join public.shops s on s.id = c.shop_id
  left join public.profiles op on op.id = c.owner_id
  left join public.profiles wp on wp.id = c.worker_id
  where v.id = p_version_id;
$$;

-- Rendered clause list (single pass, W8 render_contract_template_clause) for the given values.
create or replace function public.worker_contract_rendered_clauses(p_version_id uuid, p_values jsonb)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(c || jsonb_build_object(
           'heading', public.render_contract_template_clause(c ->> 'heading', p_values),
           'body', public.render_contract_template_clause(c ->> 'body', p_values),
           'standard_heading', public.render_contract_template_clause(c ->> 'standard_heading', p_values),
           'standard_body', public.render_contract_template_clause(c ->> 'standard_body', p_values)) order by ord), '[]'::jsonb)
  from jsonb_array_elements(public.worker_contract_draft_clauses(p_version_id)) with ordinality as x(c, ord);
$$;

-- Placeholders without a value and clauses still holding the shop instruction, e.g. {pay_details, clause:schedule}.
create or replace function public.worker_contract_unfilled(p_version_id uuid)
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  with clauses as (select x.c from jsonb_array_elements(public.worker_contract_draft_clauses(p_version_id)) x(c)),
       vals as (select public.worker_contract_render_values(p_version_id) as rv)
  select coalesce(array_agg(item order by grp, item), '{}'::text[]) from (
    select distinct 1 as grp, m[1] as item from clauses, vals,
      regexp_matches((clauses.c ->> 'heading') || E'\n' || (clauses.c ->> 'body'), '\{\{([a-z_]{3,40})\}\}', 'g') m
    where not (vals.rv ? m[1])
    union all
    select 2, 'clause:' || (clauses.c ->> 'clause_key') from clauses where (clauses.c ->> 'needs_input')::boolean and clauses.c ->> 'kind' = 'editable'
    union all
    select 3, 'shop_term:' || (clauses.c ->> 'section_number') || '.' || (clauses.c ->> 'position') from clauses
    where (clauses.c ->> 'needs_input')::boolean and clauses.c ->> 'kind' = 'shop_specific') u;
$$;

-- The document text from header fields and rendered clauses ([{section_number, section_title, review_notice,
-- heading, body}] in order).
create or replace function public.worker_contract_build_text(p_title text, p_contract_id uuid, p_version_number integer, p_kind text,
                                                             p_base_version_number integer, p_classification_label text, p_clauses jsonb)
returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  lines text[] := array[p_title, 'Contract reference: ' || p_contract_id::text,
                        'Version ' || p_version_number || ' (' || p_kind || ')',
                        'Based on WashLink standard template version ' || p_base_version_number,
                        'Relationship type: ' || p_classification_label,
                        'Draft — requires review by a qualified Philippine labor-law professional',
                        'Acceptance record — not an e-signature'];
  clause jsonb;
  current_section integer := 0;
begin
  for clause in select x.c from jsonb_array_elements(p_clauses) x(c) loop
    if (clause ->> 'section_number')::integer <> current_section then
      current_section := (clause ->> 'section_number')::integer;
      lines := lines || array['', current_section || '. ' || (clause ->> 'section_title'), clause ->> 'review_notice'];
    end if;
    lines := lines || array['', clause ->> 'heading', clause ->> 'body'];
  end loop;
  return array_to_string(lines, E'\n');
end;
$$;

-- Live keyword flags on owner-written text only (editable and shop clauses, owner values), never locked clauses.
create or replace function public.worker_contract_live_flags(p_version_id uuid)
returns table (section_number smallint, "position" smallint, value_key text, rule_key text, category text, excerpt text)
language sql stable security definer set search_path = public, pg_temp as $$
  select (x.c ->> 'section_number')::smallint, (x.c ->> 'position')::smallint, null::text, m.rule_key, m.category, m.excerpt
  from jsonb_array_elements(public.worker_contract_draft_clauses(p_version_id)) with ordinality x(c, ord)
  cross join lateral public.contract_problem_term_matches((x.c ->> 'heading') || E'\n' || (x.c ->> 'body')) m
  where x.c ->> 'kind' <> 'locked_safeguard'
  union all
  select null, null, e.key, m.rule_key, m.category, m.excerpt
  from public.contract_versions v cross join lateral jsonb_each_text(v.owner_values) e
  cross join lateral public.contract_problem_term_matches(e.value) m
  where v.id = p_version_id;
$$;

-- Seals a draft version in this transaction (P46): render values, rendered clauses, text, hash, flags. The caller
-- (send RPC) holds the write flag and the row locks; it inserts the owner acceptance next, then clears the seal flag.
create or replace function public.worker_contract_seal_version(p_version_id uuid)
returns public.contract_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.contract_versions;
  rv jsonb;
  clauses jsonb;
  doc text;
  sealed public.contract_versions;
begin
  select * into v from public.contract_versions where id = p_version_id and state = 'draft';
  if not found then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  rv := public.worker_contract_render_values(v.id);
  clauses := public.worker_contract_rendered_clauses(v.id, rv);
  doc := public.worker_contract_build_text(v.template_name_snapshot, v.contract_id, v.version_number, v.kind,
                                           v.base_platform_version_number, v.classification_label, clauses);
  perform set_config('washlink.worker_contract_seal', v.id::text, true);
  update public.contract_versions
  set state = 'sent_for_review', render_values = rv, rendered_text = doc, content_hash = encode(sha256(convert_to(doc, 'UTF8')), 'hex'),
      flag_count = (select count(*) from public.worker_contract_live_flags(v.id)), sealed_txid = txid_current(), sealed_at = now(),
      sent_at = now()
  where id = v.id
  returning * into sealed;
  insert into public.contract_version_clauses (version_id, section_number, section_title, review_notice, position, clause_key, kind,
                                               heading, body, standard_heading, standard_body, change, edited_in, clause_hash)
  select v.id, x.section_number, x.section_title, x.review_notice, x.position, x.clause_key, x.kind, x.heading, x.body,
         x.standard_heading, x.standard_body, x.change, x.edited_in, repeat('0', 64)
  from jsonb_to_recordset(clauses) as x(section_number smallint, section_title text, review_notice text, position smallint,
                                        clause_key text, kind text, heading text, body text, standard_heading text, standard_body text,
                                        change text, edited_in text);
  insert into public.contract_version_flags (version_id, section_number, position, value_key, rule_key, category, excerpt)
  select v.id, f.section_number, f.position, f.value_key, f.rule_key, f.category, f.excerpt from public.worker_contract_live_flags(v.id) f;
  return sealed;
end;
$$;

-- Raises 23514 naming the first broken rule; returns quietly for a draft or a version that no longer exists.
create or replace function public.validate_worker_contract_version(p_version_id uuid)
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.contract_versions;
  b record;
  missing text;
begin
  select * into v from public.contract_versions where id = p_version_id;
  if not found or v.state = 'draft' then
    return;
  end if;
  select string_agg(s.section_number::text, ', ' order by s.section_number) into missing from public.contract_template_sections s
  where not exists (select 1 from public.contract_version_clauses c where c.version_id = v.id and c.section_number = s.section_number);
  if missing is not null then
    raise exception 'Every contract section needs at least one clause (missing: %).', missing using errcode = '23514';
  end if;
  for b in select * from public.contract_template_clauses x where x.version_id = v.base_platform_version_id order by x.section_number, x.position loop
    if not exists (select 1 from public.contract_version_clauses c where c.version_id = v.id and c.section_number = b.section_number
                   and c.position = b.position and c.clause_key = b.clause_key and c.kind = b.kind
                   and c.standard_heading = public.render_contract_template_clause(b.heading, v.render_values)
                   and c.standard_body = public.render_contract_template_clause(b.body, v.render_values)
                   and (b.kind <> 'locked_safeguard' or (c.heading = c.standard_heading and c.body = c.standard_body))) then
      if b.kind = 'locked_safeguard' then
        raise exception 'This clause is a WashLink safeguard and cannot be changed.' using errcode = '23514';
      end if;
      raise exception 'Every clause of the standard template must stay in place (%).', b.clause_key using errcode = '23514';
    end if;
  end loop;
  if (select count(*) from public.contract_version_clauses c where c.version_id = v.id and c.kind <> 'shop_specific')
     <> (select count(*) from public.contract_template_clauses x where x.version_id = v.base_platform_version_id) then
    raise exception 'Each clause of the standard template must appear exactly once.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_version_clauses c where c.version_id = v.id
             and c.clause_hash <> public.contract_template_clause_hash(c.section_number, c.position, c.clause_key, c.kind, c.heading, c.body)) then
    raise exception 'A clause hash does not match its text.' using errcode = '23514';
  end if;
  if v.rendered_text is distinct from public.worker_contract_build_text(v.template_name_snapshot, v.contract_id, v.version_number, v.kind,
       v.base_platform_version_number, v.classification_label,
       (select jsonb_agg(jsonb_build_object('section_number', c.section_number, 'section_title', c.section_title, 'review_notice',
                                            c.review_notice, 'heading', c.heading, 'body', c.body) order by c.section_number, c.position)
        from public.contract_version_clauses c where c.version_id = v.id)) then
    raise exception 'The contract text does not match its clauses.' using errcode = '23514';
  end if;
  if v.content_hash is distinct from encode(sha256(convert_to(v.rendered_text, 'UTF8')), 'hex') then
    raise exception 'The contract hash does not match its text.' using errcode = '23514';
  end if;
  if strpos(v.rendered_text, '{{') > 0 or strpos(v.rendered_text, '}}') > 0 then
    raise exception 'The contract text still has unfilled placeholders.' using errcode = '23514';
  end if;
  if v.flag_count is distinct from (select count(*)::integer from public.contract_version_flags f where f.version_id = v.id)
     or exists ((select f.section_number, f.position, f.value_key, f.rule_key, f.excerpt from public.contract_version_flags f where f.version_id = v.id)
                except all
                (select l.section_number, l.position, l.value_key, l.rule_key, l.excerpt from public.worker_contract_live_flags(v.id) l))
     or exists ((select l.section_number, l.position, l.value_key, l.rule_key, l.excerpt from public.worker_contract_live_flags(v.id) l)
                except all
                (select f.section_number, f.position, f.value_key, f.rule_key, f.excerpt from public.contract_version_flags f where f.version_id = v.id)) then
    raise exception 'The keyword flags do not match the contract text.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.contract_acceptances a where a.version_id = v.id and a.party_role = 'owner'
                 and a.version_content_hash = v.content_hash) then
    raise exception 'The owner acceptance record is missing.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.contract_versions_validate_at_commit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.validate_worker_contract_version(new.id);
  return null;
end;
$$;

drop trigger if exists contract_versions_validate_at_commit on public.contract_versions;
create constraint trigger contract_versions_validate_at_commit
  after update on public.contract_versions
  deferrable initially deferred
  for each row when (old.state = 'draft' and new.state <> 'draft')
  execute function public.contract_versions_validate_at_commit();

-- accepted / active with an end date before today (Manila) reads as expired until expire_worker_contracts runs (W12).
create or replace function public.worker_contract_effective_status(p_status text, p_end_date date)
returns text
language sql stable set search_path = public, pg_temp as $$
  select case when p_status in ('accepted', 'active') and p_end_date < (now() at time zone 'Asia/Manila')::date then 'expired'
              else p_status end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['worker_contract_eligibility(uuid, uuid)', 'worker_contract_draft_clauses(uuid)',
    'worker_contract_safe_value(text)', 'worker_contract_render_values(uuid)', 'worker_contract_rendered_clauses(uuid, jsonb)',
    'worker_contract_unfilled(uuid)', 'worker_contract_build_text(text, uuid, integer, text, integer, text, jsonb)',
    'worker_contract_live_flags(uuid)', 'worker_contract_seal_version(uuid)', 'validate_worker_contract_version(uuid)',
    'contract_versions_validate_at_commit()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
  revoke all on function public.worker_contract_effective_status(text, date) from public, anon, service_role;
  grant execute on function public.worker_contract_effective_status(text, date) to authenticated;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a; roll back w9f first)
-- -------------------------------------------------------------
-- drop trigger if exists contract_versions_validate_at_commit on public.contract_versions;
-- drop function if exists public.worker_contract_effective_status(text, date), public.contract_versions_validate_at_commit(),
--   public.validate_worker_contract_version(uuid), public.worker_contract_seal_version(uuid), public.worker_contract_live_flags(uuid),
--   public.worker_contract_build_text(text, uuid, integer, text, integer, text, jsonb), public.worker_contract_unfilled(uuid),
--   public.worker_contract_rendered_clauses(uuid, jsonb), public.worker_contract_render_values(uuid),
--   public.worker_contract_safe_value(text), public.worker_contract_draft_clauses(uuid),
--   public.worker_contract_eligibility(uuid, uuid);
