-- =============================================================
-- WashLink W8e - the platform starter contract template, version 1 (spec E; W8 PLAN 3.5 and section 4; P40-P42).
-- Requires w8b..w8d. Idempotent (skips when the platform template exists).
-- STRUCTURAL PLACEHOLDER CONTENT, NOT LEGAL ADVICE: every section shows "Draft — requires review by a qualified
-- Philippine labor-law professional" (W8-L1). No digits, amounts, currency, statute numbers, dates or claims of
-- review / compliance (the only such words are the negated template_is_draft sentence). Editable bodies are
-- bracketed instructions for the shop (requires_owner_input). Pay is only the {{pay_details}} placeholder.
-- Inserted in one transaction under the write flag; validated immediately and again at commit.
-- Also holds the owner copy helpers used by the w8f RPCs (internal, revoked from every client role).
-- =============================================================

-- Copy helpers for owner versions (used by the w8f RPCs).
create or replace function public.contract_template_latest_platform_version()
returns public.contract_template_versions
language sql stable security definer set search_path = public, pg_temp as $$
  select v.* from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id
  where t.scope = 'platform' and v.version_number = t.current_version_number;
$$;

-- Full owner clause list on p_base: base clauses in place (locked verbatim, editable from p_bodies or the base),
-- then each section's shop terms. Returns {clauses, edited_count, added_count}.
create or replace function public.contract_template_owner_clause_list(p_base_version_id uuid, p_bodies jsonb, p_terms jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  section_row record;
  base_clause record;
  term record;
  clauses jsonb := '[]'::jsonb;
  edited integer := 0;
  added integer := 0;
  position_in_section integer;
  body text;
begin
  for section_row in select s.section_number from public.contract_template_sections s order by s.section_number loop
    position_in_section := 0;
    for base_clause in select * from public.contract_template_clauses b
                       where b.version_id = p_base_version_id and b.section_number = section_row.section_number order by b.position loop
      position_in_section := base_clause.position;
      body := case when base_clause.kind = 'editable' and coalesce(p_bodies, '{}'::jsonb) ? base_clause.clause_key
                   then public.contract_template_normalize_text(p_bodies ->> base_clause.clause_key) else base_clause.body end;
      if base_clause.kind = 'editable' and body is distinct from base_clause.body then
        edited := edited + 1;
      end if;
      clauses := clauses || jsonb_build_object('section_number', base_clause.section_number, 'position', base_clause.position,
        'clause_key', base_clause.clause_key, 'kind', base_clause.kind, 'heading', base_clause.heading, 'body', body,
        'source_clause_id', base_clause.id, 'requires_owner_input', base_clause.requires_owner_input and body = base_clause.body);
    end loop;
    for term in select t.value from jsonb_array_elements(coalesce(p_terms, '[]'::jsonb)) with ordinality as t(value, ord)
                where (t.value ->> 'section_number')::integer = section_row.section_number order by t.ord loop
      position_in_section := position_in_section + 1;
      added := added + 1;
      clauses := clauses || jsonb_build_object('section_number', section_row.section_number, 'position', position_in_section,
        'clause_key', null, 'kind', 'shop_specific', 'heading', term.value ->> 'heading', 'body', term.value ->> 'body',
        'source_clause_id', null, 'requires_owner_input', false);
    end loop;
  end loop;
  return jsonb_build_object('clauses', clauses, 'edited_count', edited, 'added_count', added);
end;
$$;

create or replace function public.contract_template_editable_bodies(p_version_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(c.clause_key, c.body), '{}'::jsonb) from public.contract_template_clauses c
  where c.version_id = p_version_id and c.kind = 'editable';
$$;

create or replace function public.contract_template_shop_terms(p_version_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('section_number', c.section_number, 'heading', c.heading, 'body', c.body)
                            order by c.section_number, c.position), '[]'::jsonb)
  from public.contract_template_clauses c where c.version_id = p_version_id and c.kind = 'shop_specific';
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['contract_template_latest_platform_version()', 'contract_template_owner_clause_list(uuid, jsonb, jsonb)',
    'contract_template_editable_bodies(uuid)', 'contract_template_shop_terms(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
end $$;

do $$
declare
  template_id uuid := gen_random_uuid();
  clauses jsonb;
begin
  if exists (select 1 from public.contract_templates t where t.scope = 'platform') then
    return;
  end if;
  select jsonb_agg(jsonb_build_object('section_number', x.section_number,
                                      'position', x.position,
                                      'clause_key', x.clause_key, 'kind', x.kind, 'heading', x.heading, 'body', x.body,
                                      'source_clause_id', null, 'requires_owner_input', x.kind = 'editable')
                   order by x.section_number, x.ord)
  into clauses
  from (select n.*, row_number() over (partition by n.section_number order by n.ord) as position
        from (select v.*, row_number() over () as ord from (values
    (1, 'parties_named', 'locked_safeguard', 'Parties',
     'This agreement is between {{owner_full_name}}, for the car wash business {{shop_name}}, and {{worker_full_name}}. The names come from the parties'' WashLink accounts. WashLink records the verification status of the shop, does not verify the worker''s identity, and this document does not re-check the identity of either party.'),
    (1, 'parties_additional_details', 'editable', 'Other party details',
     '[Shop: add any other party details both parties agree to include, or write "None".]'),
    (2, 'business_and_location', 'editable', 'Business and work location',
     '[Shop: describe the car wash business and where the work happens: {{shop_name}}, {{shop_address}}.]'),
    (3, 'role_and_duties', 'editable', 'Role and duties',
     '[Shop: describe the role {{role_title}}, its duties and the scope of work.]'),
    (4, 'classification_not_preselected', 'locked_safeguard', 'Relationship type',
     'The relationship type under this agreement is: {{worker_classification}}. It is chosen for each contract and is not preselected by WashLink or by this template. The parties should confirm the relationship type with a qualified professional.'),
    (4, 'classification_reasons', 'locked_safeguard', 'Relationship type is set per contract',
     'The relationship type is set only by the choice made for each contract. Text that the shop writes or edits elsewhere in this agreement does not change it.'),
    (5, 'start_duration_renewal', 'editable', 'Start, duration and renewal',
     '[Shop: state the start {{start_date}}, the end or duration {{end_date}}, and any renewal terms.]'),
    (6, 'schedule', 'editable', 'Schedule and availability',
     '[Shop: describe the working days and hours {{schedule_summary}} and how availability is agreed.]'),
    (7, 'no_training_fee_or_deduction', 'locked_safeguard', 'No training fee or deduction',
     'The worker is not charged for the required initial training, and nothing is deducted from the worker''s pay for it.'),
    (7, 'deductions_listed_only', 'locked_safeguard', 'Only listed deductions',
     'Only deductions listed in this section are part of this draft. Whether a listed deduction is allowed needs review by a qualified professional.'),
    (7, 'pay_terms', 'editable', 'Pay and payment frequency',
     '[Shop: state the pay as agreed {{pay_details}} and how often it is paid. WashLink does not fill in, suggest or check pay.]'),
    (7, 'listed_deductions', 'editable', 'Listed deductions',
     '[Shop: list each deduction, or write "None".]'),
    (8, 'required_training_free_and_supervised', 'locked_safeguard', 'Required initial training',
     'The required initial training is at least three days of supervised learning, is free to the worker, and is not productive work for customers.'),
    (8, 'training_pay_or_reimbursement', 'locked_safeguard', 'Pay or reimbursement for training',
     'The shop may offer pay for training time or reimbursement of training costs, as written in this contract. Free to the worker means that the worker does not pay for the training.'),
    (8, 'certification_shop_issued', 'locked_safeguard', 'Shop-issued certification',
     'A certification given after training is issued by the shop. It is not a government-recognized credential.'),
    (8, 'training_details', 'editable', 'Training plan and certification conditions',
     '[Shop: describe the training plan, the training schedule and the certification conditions.]'),
    (9, 'worker_obligations', 'editable', 'Worker obligations',
     '[Shop: list the obligations of the worker.]'),
    (9, 'owner_obligations', 'editable', 'Owner obligations',
     '[Shop: list the obligations of the owner.]'),
    (10, 'safety_terms_need_review', 'locked_safeguard', 'Safety terms need review',
     'Safety rules, protective equipment, and instruction on the chemicals and equipment used must be described in this section, and they need review by a qualified professional.'),
    (10, 'safety_and_workplace_rules', 'editable', 'Safety and workplace rules',
     '[Shop: describe the safety rules, the protective equipment provided and the workplace rules.]'),
    (11, 'customer_data_minimum', 'locked_safeguard', 'Customer information',
     'Customer information seen during work is used only to perform the service. It is not copied, kept or shared for anything else.'),
    (11, 'confidentiality_terms', 'editable', 'Other confidentiality terms',
     '[Shop: add other confidentiality terms, or write "None".]'),
    (12, 'right_to_decline_or_leave', 'locked_safeguard', 'Right to decline or leave',
     'Nothing in this agreement stops the worker from declining this offer or ending the relationship as the law allows. A WashLink goal of working with several shops is not a condition of this agreement.'),
    (12, 'leave_and_absences', 'editable', 'Leave and absences',
     '[Shop: describe leave and how absences are handled.]'),
    (12, 'termination_and_notice', 'editable', 'Termination and notice',
     '[Shop: describe how the relationship can end and the notice each party gives.]'),
    (12, 'dispute_resolution', 'editable', 'Dispute resolution',
     '[Shop: describe how disagreements are raised and resolved.]'),
    (13, 'no_waiver_of_mandatory_rights', 'locked_safeguard', 'No waiver of mandatory rights',
     'This document does not waive or reduce any right, benefit or contribution that the law gives the worker. Those rights apply even if they are not listed here.'),
    (13, 'benefits_listed', 'editable', 'Benefits and contributions',
     '[Shop: list the benefits and contributions provided. A qualified professional should confirm what is required.]'),
    (14, 'acceptance_record_not_e_signature', 'locked_safeguard', 'Acceptance record',
     'Acceptance on WashLink records who accepted which version of this agreement and when. It is a draft-and-acceptance record, not an electronic signature, and WashLink does not state that it meets any signature requirement.'),
    (14, 'changes_need_new_version_and_consent', 'locked_safeguard', 'Changes after acceptance',
     'After acceptance, any change creates a new version that the parties must accept before it applies. Each party can view the accepted version and the date it was accepted on WashLink.'),
    (14, 'template_is_draft', 'locked_safeguard', 'Draft template',
     'This template is a draft. It has not been reviewed by a qualified Philippine labor-law professional, and WashLink does not state that it is legally compliant.'),
    (15, 'safeguards_prevail', 'locked_safeguard', 'WashLink safeguards prevail',
     'Shop-specific terms, attachments, and any clause text that the shop writes or edits cannot change or override WashLink safeguard clauses. If they conflict, the WashLink safeguard clause applies.'),
    (15, 'attachments_list', 'editable', 'Attachments',
     '[Shop: list the attachments, or write "None".]')
  ) as v(section_number, clause_key, kind, heading, body)) n) x;

  perform set_config('washlink.contract_template_write', template_id::text, true);
  insert into public.contract_templates (id, scope, owner_id, name, status, current_version_number)
  values (template_id, 'platform', null, 'WashLink standard worker agreement - draft', 'active', 1);
  perform public.contract_template_insert_version(template_id, null, clauses, 0, 0);
  perform set_config('washlink.contract_template_write', '', true);
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a)
-- The guards refuse deleting the platform template for every session, and source / base FKs are ON DELETE
-- RESTRICT while owner templates reference platform v1. Roll back w8c instead (drops every W8 table), or, with no
-- owner templates left, as a trusted session:
-- -------------------------------------------------------------
-- alter table public.contract_templates disable trigger contract_templates_guard_write;
-- alter table public.contract_template_versions disable trigger contract_template_versions_guard_write;
-- alter table public.contract_template_clauses disable trigger contract_template_clauses_guard_write;
-- delete from public.contract_templates where scope = 'platform';   -- cascades to its versions and clauses
-- alter table public.contract_template_clauses enable trigger contract_template_clauses_guard_write;
-- alter table public.contract_template_versions enable trigger contract_template_versions_guard_write;
-- alter table public.contract_templates enable trigger contract_templates_guard_write;
-- drop function if exists public.contract_template_shop_terms(uuid), public.contract_template_editable_bodies(uuid),
--   public.contract_template_owner_clause_list(uuid, jsonb, jsonb), public.contract_template_latest_platform_version();
