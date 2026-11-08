-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- WashLink pgTAP helpers for W8 contract templates. Seeded AFTER test_helpers_certifications.sql (third sql_paths
-- entry of the staged .local-supabase-test workdir only). Same rules as test_helpers.sql: SECURITY INVOKER,
-- transaction-local identity switching, fixtures must start in a trusted session (test_helpers.act_as_service())
-- and END in one. Templates and versions are created through the REAL W8 RPCs acting as the owner.

-- The latest platform (standard) version id.
create or replace function test_helpers.latest_platform_contract_version()
returns uuid language sql stable security invoker as $$
  select v.id from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id
  where t.scope = 'platform' and v.version_number = t.current_version_number
$$;

-- As the owner (email), creates a template from the latest standard version. Returns the template id.
create or replace function test_helpers.create_test_contract_template(p_owner_email text, p_name text default 'Local test template')
returns uuid language plpgsql security invoker as $$
declare
  template_id uuid;
begin
  perform test_helpers.assert_service_session();
  perform test_helpers.act_as_owner(p_owner_email);
  template_id := (public.create_owner_contract_template(p_name, null)).id;
  perform test_helpers.act_as_service();
  return template_id;
end $$;

-- As the owner (email), saves the next version of p_template on its current base with the given editable bodies
-- ({clause_key: body}) and shop terms ([{section_number, heading, body}]). Returns the new version id.
create or replace function test_helpers.save_test_template_version(p_template uuid, p_owner_email text, p_editable jsonb default '{}'::jsonb,
                                                                   p_terms jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker as $$
declare
  current_number integer;
  base_id uuid;
  version_id uuid;
begin
  perform test_helpers.assert_service_session();
  select t.current_version_number, v.base_platform_version_id into current_number, base_id
  from public.contract_templates t join public.contract_template_versions v on v.template_id = t.id and v.version_number = t.current_version_number
  where t.id = p_template;
  perform test_helpers.act_as_owner(p_owner_email);
  version_id := (public.save_owner_contract_template_version(p_template, current_number, base_id, p_editable, p_terms)).id;
  perform test_helpers.act_as_service();
  return version_id;
end $$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.save_test_template_version(uuid, text, jsonb, jsonb);
-- drop function if exists test_helpers.create_test_contract_template(text, text);
-- drop function if exists test_helpers.latest_platform_contract_version();
