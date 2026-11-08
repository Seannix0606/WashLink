-- =============================================================
-- WashLink W8h - contract template audit producers (spec I; W3 pattern; W8 PLAN 3.8, P44; D-30). Requires w3b,
-- w8c..w8g. Idempotent.
-- subject_type `contract_template`, subject_id = template id, subject_profile_id = owner_id (null for platform).
-- Actions: contract_template.created, .version_saved (every version, v1 included), .renamed, .status_changed,
-- .deleted. Payloads carry ids, scope / status words and small counts only: never names, headings, bodies, keys
-- or hashes. No notifications (D-30). An audit failure aborts the action (W3 rule); refused actions write nothing.
-- =============================================================

create or replace function public.contract_template_changed_by()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when auth.uid() is null then 'trusted_session'
              when public.current_user_profile_role() = 'super_admin' then 'super_admin'
              else 'owner' end;
$$;

create or replace function public.contract_templates_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_workforce_audit_event('contract_template.created', 'contract_template', new.id, new.owner_id,
      jsonb_build_object('template_id', new.id, 'scope', new.scope, 'version_number', new.current_version_number,
                         'derived_from_version_id', new.derived_from_version_id, 'changed_by', public.contract_template_changed_by()));
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.record_workforce_audit_event('contract_template.deleted', 'contract_template', old.id, old.owner_id,
      jsonb_build_object('template_id', old.id, 'scope', old.scope, 'from_status', old.status,
                         'version_number', old.current_version_number,
                         'deleted_by', case when old.owner_id is not null
                                             and not exists (select 1 from public.profiles p where p.id = old.owner_id)
                                            then 'owner_account_deleted' else 'trusted_session' end));
    return null;
  end if;
  if new.name is distinct from old.name then
    perform public.record_workforce_audit_event('contract_template.renamed', 'contract_template', new.id, new.owner_id,
      jsonb_build_object('template_id', new.id, 'scope', new.scope, 'changed_by', public.contract_template_changed_by()));
  end if;
  if new.status is distinct from old.status then
    perform public.record_workforce_audit_event('contract_template.status_changed', 'contract_template', new.id, new.owner_id,
      jsonb_build_object('template_id', new.id, 'scope', new.scope, 'from_status', old.status, 'to_status', new.status,
                         'changed_by', public.contract_template_changed_by()));
  end if;
  return null;   -- current_version_number changes are audited as version_saved; FK set-null (lineage) is not audited
end;
$$;

create or replace function public.contract_template_versions_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.contract_templates;
begin
  select * into t from public.contract_templates where id = new.template_id;
  perform public.record_workforce_audit_event('contract_template.version_saved', 'contract_template', new.template_id, t.owner_id,
    jsonb_build_object('template_id', new.template_id, 'version_id', new.id, 'scope', t.scope, 'version_number', new.version_number,
                       'base_platform_version_number',
                       (select b.version_number from public.contract_template_versions b where b.id = new.base_platform_version_id),
                       'edited_count', new.edited_count, 'added_count', new.added_count,
                       'changed_by', public.contract_template_changed_by()));
  return null;
end;
$$;

revoke all on function public.contract_template_changed_by() from public, anon, authenticated, service_role;
revoke all on function public.contract_templates_audit() from public, anon, authenticated, service_role;
revoke all on function public.contract_template_versions_audit() from public, anon, authenticated, service_role;

drop trigger if exists contract_templates_audit on public.contract_templates;
create trigger contract_templates_audit
  after insert or update or delete on public.contract_templates
  for each row execute function public.contract_templates_audit();
drop trigger if exists contract_template_versions_audit on public.contract_template_versions;
create trigger contract_template_versions_audit
  after insert on public.contract_template_versions
  for each row execute function public.contract_template_versions_audit();

-- The platform starter (w8e) was seeded before these producers existed: record it once (trusted session).
do $$
declare
  platform public.contract_templates;
  platform_version public.contract_template_versions;
begin
  select * into platform from public.contract_templates where scope = 'platform';
  if platform.id is null or exists (select 1 from public.workforce_audit_events e
                                    where e.subject_type = 'contract_template' and e.subject_id = platform.id) then
    return;
  end if;
  select * into platform_version from public.contract_template_versions where template_id = platform.id and version_number = 1;
  perform public.record_workforce_audit_event('contract_template.created', 'contract_template', platform.id, null,
    jsonb_build_object('template_id', platform.id, 'scope', 'platform', 'version_number', 1, 'derived_from_version_id', null,
                       'changed_by', 'trusted_session'));
  perform public.record_workforce_audit_event('contract_template.version_saved', 'contract_template', platform.id, null,
    jsonb_build_object('template_id', platform.id, 'version_id', platform_version.id, 'scope', 'platform', 'version_number', 1,
                       'base_platform_version_number', null, 'edited_count', 0, 'added_count', 0, 'changed_by', 'trusted_session'));
end $$;

-- Mark every W8 function (w8b..w8h, all named *contract_template*) with a `W8` comment; the w8a preflight refuses
-- any *contract_template* function without one. A missing W8 function aborts here.
do $$
declare
  fn text;
  fn_oid oid;
begin
  foreach fn in array array['contract_template_assert_active_limit', 'contract_template_changed_by',
    'contract_template_checked_shop_terms', 'contract_template_clause_hash', 'contract_template_clauses_content_hash',
    'contract_template_clauses_guard_write', 'contract_template_core_safeguard_keys', 'contract_template_core_safeguards',
    'contract_template_editable_bodies', 'contract_template_hash_of', 'contract_template_insert_version',
    'contract_template_latest_platform_version', 'contract_template_name_or_fail', 'contract_template_normalize_text',
    'contract_template_owner_clause_list', 'contract_template_placeholders_in', 'contract_template_reference_guard_write',
    'contract_template_shop_terms', 'contract_template_version_clauses', 'contract_template_version_diff',
    'contract_template_version_hash', 'contract_template_version_history', 'contract_template_versions_audit',
    'contract_template_versions_guard_write', 'contract_template_versions_validate_at_commit', 'contract_templates_audit',
    'contract_templates_guard_write', 'create_owner_contract_template', 'lock_owner_contract_template',
    'owner_contract_templates', 'platform_contract_template_current', 'preview_contract_template_version',
    'publish_platform_contract_template_version', 'rename_owner_contract_template', 'render_contract_template_clause',
    'save_owner_contract_template_version', 'set_owner_contract_template_status', 'validate_contract_template_version'] loop
    fn_oid := to_regproc('public.' || fn)::oid;
    if fn_oid is null then
      raise exception 'W8h: missing W8 function %', fn;
    end if;
    execute format('comment on function %s is %L', fn_oid::regprocedure, 'W8: contract templates (created by the W8 migrations).');
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a). Audit rows stay (append-only).
-- -------------------------------------------------------------
-- drop trigger if exists contract_template_versions_audit on public.contract_template_versions;
-- drop trigger if exists contract_templates_audit on public.contract_templates;
-- drop function if exists public.contract_template_versions_audit();
-- drop function if exists public.contract_templates_audit();
-- drop function if exists public.contract_template_changed_by();
-- (the W8 function comments go with their functions in the w8g..w8b rollbacks)
