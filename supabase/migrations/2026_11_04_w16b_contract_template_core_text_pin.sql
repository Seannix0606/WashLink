-- =============================================================
-- WashLink W16b - locked safeguard clauses of the standard template are pinned (W16 PLAN section 3; D-87; FINAL_REVIEW F-C1;
-- W16 REVIEW N1, C-S8).
-- Requires w8c, w8d. Idempotent.
--
-- The w8d validator keeps the 15 core clauses present, locked and in their sections, but a super_admin could publish a
-- new platform version with their words changed, or add a locked clause that reaches owners as a WashLink safeguard. For
-- every non-trusted session the set of locked_safeguard clauses of a new platform version must now equal the previous
-- platform version: no clause added or removed, and the same section, heading, body and owner-input flag for each key. This
-- covers the 15 core keys and every other locked clause (training_pay_or_reimbursement). Text changes go through a human-run
-- migration (D-87; see docs/workforce/CONTRACT_TEMPLATES.md), and later versions compare against that text.
-- Limits (W16-L3): nothing requires a second person on that migration; added or changed editable clauses stay allowed, so an
-- editable clause can still contradict a safeguard; clause order is not compared, because an added editable clause moves
-- positions; versions published before this pin are not re-checked.
-- The names keep "core_text_pin" from the plan (D-87); the rule is wider than the 15 core keys (N1).
-- The trigger name sorts after contract_template_versions_validate_at_commit, so existing refusals keep their order.
-- Versions stay write-once. Owner templates and their versions are not affected. No table or RLS change; no data written.
-- =============================================================

-- 1) Preflight (raises, creates nothing).
do $$
declare
  missing text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from (
    select 'table public.contract_template_clauses' as item
    where to_regclass('public.contract_template_clauses') is null
    union all
    select 'trigger contract_template_versions_validate_at_commit'
    where not exists (select 1 from pg_trigger g where g.tgname = 'contract_template_versions_validate_at_commit'
                      and g.tgrelid = to_regclass('public.contract_template_versions') and not g.tgisinternal)
  ) r;
  if coalesce(missing, '') <> '' then
    raise exception 'W16b preflight: missing objects required by the safeguard pin: % (D-10)', missing;
  end if;
end;
$$;

-- 2) The pin. Compares the locked clauses with the highest lower platform version. A key on one side only was added or
--    removed; a kind change shows up that way too. The validator refuses a missing core key first, so that message is unchanged.
create or replace function public.contract_template_core_text_pin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_version_id uuid;
  changed_keys text;
begin
  if public.is_trusted_db_session()
     or not exists (select 1 from public.contract_templates t where t.id = new.template_id and t.scope = 'platform') then
    return null;
  end if;
  select v.id into previous_version_id
  from public.contract_template_versions v
  where v.template_id = new.template_id and v.version_number < new.version_number
  order by v.version_number desc
  limit 1;
  if previous_version_id is null then
    return null;
  end if;
  select string_agg(coalesce(cur.clause_key, prev.clause_key), ', '
                    order by coalesce(cur.section_number, prev.section_number), coalesce(cur.clause_key, prev.clause_key)) into changed_keys
  from (select c.* from public.contract_template_clauses c where c.version_id = new.id and c.kind = 'locked_safeguard') cur
  full join (select c.* from public.contract_template_clauses c where c.version_id = previous_version_id and c.kind = 'locked_safeguard') prev
    on prev.clause_key = cur.clause_key
  where cur.clause_key is null or prev.clause_key is null
     or cur.section_number is distinct from prev.section_number
     or cur.heading is distinct from prev.heading
     or cur.body is distinct from prev.body
     or cur.requires_owner_input is distinct from prev.requires_owner_input;
  if changed_keys is not null then
    raise exception 'WashLink safeguard text in the standard template can change only through a human-run migration: %.', changed_keys
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function public.contract_template_core_text_pin() from public, anon, authenticated, service_role;
-- The comment starts with W8 because the w8a preflight and w8p_every_w8_function_has_w8_comment require it of every contract_template function.
comment on function public.contract_template_core_text_pin() is
  'W8 contract templates, added by W16 (D-87): constraint trigger on contract_template_versions; locked safeguard clauses are added, removed or changed only through a trusted migration.';

-- 3) The constraint trigger: fires after the clauses of the version exist.
drop trigger if exists contract_template_versions_zz_core_text_pin on public.contract_template_versions;
create constraint trigger contract_template_versions_zz_core_text_pin
  after insert on public.contract_template_versions
  deferrable initially deferred
  for each row execute function public.contract_template_core_text_pin();

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply this block before the w16a block). No data involved; versions stay write-once.
-- -------------------------------------------------------------
-- drop trigger if exists contract_template_versions_zz_core_text_pin on public.contract_template_versions;
-- drop function if exists public.contract_template_core_text_pin();
