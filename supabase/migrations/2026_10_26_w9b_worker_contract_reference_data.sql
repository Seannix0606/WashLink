-- =============================================================
-- WashLink W9b - worker contract reference data and owner-text rules (spec E; W9 PLAN 3.2, P47, P49-P51; D-6, D-26,
-- D-33). Requires w2a, w8d, w9a. Idempotent.
-- contract_acknowledgement_texts: the statements a party confirms when sending / accepting a version, and the extra
--   independent-contractor acknowledgements. Loop-written placeholder wording (W9-L12), review_status draft.
--   (Column `statement_text`; the plan calls it "text".)
-- contract_problem_term_rules: keyword rules (POSIX ARE, matched case-insensitively with ~*) for the 16 W8-L13
--   categories, incl. common Filipino words. They inform, never block and never validate (D-33): guidance says
--   "may need legal review" and makes no claim about lawfulness. A pattern that is not a valid regular expression
--   fails its CHECK (so a bad seed aborts this migration, R5).
-- Readable by every signed-in user; written only by trusted sessions (migrations). No client write privilege.
-- =============================================================

create table if not exists public.contract_acknowledgement_texts (
  ack_key text primary key,
  statement_text text not null,
  review_status text not null default 'draft_requires_legal_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cat_key_check check (ack_key ~ '^w9_[a-z_]+_v[0-9]+$'),
  constraint cat_text_length check (char_length(statement_text) between 20 and 600),
  constraint cat_review_status_check check (review_status = 'draft_requires_legal_review')
);
comment on table public.contract_acknowledgement_texts is
  'W8/W9 contract module (created by W9): statements confirmed by the owner at send and by the worker at accept (snapshotted into contract_acceptances). Placeholder wording that needs legal review (W9-L12). Changed only by migrations.';

create table if not exists public.contract_problem_term_rules (
  rule_key text primary key,
  category text not null,
  label text not null,
  pattern text not null,
  guidance text not null,
  sort_order smallint not null,
  review_status text not null default 'draft_requires_legal_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cptr_key_check check (rule_key ~ '^[a-z][a-z0-9_]{2,59}$'),
  constraint cptr_category_check check (category in (
    'training_fee', 'training_cost_clawback', 'deposit', 'cash_bond', 'work_item_deduction', 'fine_or_penalty', 'waiver',
    'quitclaim_or_release', 'exclusivity_or_non_compete', 'liquidated_damages_or_forfeit',
    'unpaid_trial_or_customer_work_in_training', 'contractor_label', 'forum_or_arbitration', 'certificate_government_claim',
    'contract_validity_claim')),
  constraint cptr_label_length check (char_length(label) between 3 and 80),
  constraint cptr_pattern_valid check (char_length(pattern) between 3 and 400 and ('' ~* pattern) is not null),
  constraint cptr_guidance_length check (char_length(guidance) between 20 and 300),
  constraint cptr_guidance_no_claims check (guidance !~* '\m(unlawful|illegal|complian|valid|approved|prohibited)'),
  constraint cptr_sort_order_unique unique (sort_order),
  constraint cptr_review_status_check check (review_status = 'draft_requires_legal_review')
);
create index if not exists contract_problem_term_rules_category_idx on public.contract_problem_term_rules (category);
comment on table public.contract_problem_term_rules is
  'W8/W9 contract module (created by W9): keyword rules for owner-written contract text (D-33). An automatic keyword check: it may miss problems or flag acceptable text, is not legal advice and does not check whether terms are lawful (W9-L3, W9-L4). Changed only by migrations.';

-- -------------------------------------------------------------
-- 1) Guard: only trusted sessions (migrations / psql) write reference data (definer; every session).
-- -------------------------------------------------------------
create or replace function public.worker_contract_reference_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_trusted_db_session() or auth.uid() is not null then
    raise exception 'Contract reference data changes only through migrations.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.worker_contract_reference_guard_write() from public, anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['contract_acknowledgement_texts', 'contract_problem_term_rules'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_guard_write', table_name);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.worker_contract_reference_guard_write()',
                   table_name || '_guard_write', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_signed_in', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() is not null)', table_name || '_select_signed_in', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', table_name || '_no_client_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (false)', table_name || '_no_client_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', table_name || '_no_client_delete', table_name);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 2) Seed (placeholder wording, draft; W9-L3 / W9-L12).
-- -------------------------------------------------------------
insert into public.contract_acknowledgement_texts (ack_key, statement_text) values
  ('w9_owner_send_v1', 'I offer these terms to the worker as shown. This is an acceptance record on WashLink, not an electronic signature.'),
  ('w9_worker_accept_v1', 'I have read this version of the contract and I accept it. This is an acceptance record on WashLink, not an electronic signature. I can still end the contract as the law allows.'),
  ('w9_contractor_owner_v1', 'The relationship type chosen is independent contractor. This choice has legal consequences and should be confirmed with a qualified professional. WashLink does not decide or check it.'),
  ('w9_contractor_worker_v1', 'The relationship type chosen is independent contractor. This choice has legal consequences and should be confirmed with a qualified professional. WashLink does not decide or check it.')
on conflict (ack_key) do nothing;

insert into public.contract_problem_term_rules (rule_key, category, label, pattern, guidance, sort_order) values
  ('training_fee', 'training_fee', 'Fee for training',
   '\m(training|seminar|orientation|pagsasanay)\s+(fees?|charges?|costs?|payments?)\M|\mbayad\s+(sa\s+)?(training|pagsasanay)\M',
   'Text that asks the worker to pay for training may need legal review. Required initial training on WashLink is free to the worker.', 10),
  ('training_cost_clawback', 'training_cost_clawback', 'Paying back training costs',
   '\m(reimburse|repay|refund|pay\s+back|return)\w*\s+(the\s+|all\s+)?(training\s+)?(costs?|expenses?)\M|\mclaw\s*-?back\M|\mtraining\s+bonds?\M',
   'Text that makes the worker pay back training or other costs may need legal review.', 20),
  ('deposit', 'deposit', 'Deposit', '\m(deposits?|deposito)\M',
   'Text that asks the worker for a deposit may need legal review.', 30),
  ('cash_bond', 'cash_bond', 'Cash bond', '\m(cash\s+bonds?|bonds?\s+money|piyansa|garantiya)\M',
   'Text that asks the worker for a cash bond or guarantee money may need legal review.', 40),
  ('work_item_deduction', 'work_item_deduction', 'Deduction for uniform, equipment, damage or shortage',
   '\m(deduct\w*|charged?|kaltas\w*|bawas\w*)\M.{0,80}\m(uniforms?|equipment|tools?|damages?|shortages?|breakage|losses|kulang)\M|\m(uniforms?|equipment|tools?|damages?|shortages?|breakage|losses|kulang)\M.{0,80}\m(deduct\w*|charged?|kaltas\w*|bawas\w*)\M',
   'Text that deducts the cost of uniforms, equipment, damage or shortages from pay may need legal review.', 50),
  ('pay_deduction_filipino', 'work_item_deduction', 'Deduction (kaltas / bawas)', '\m(kaltas|ikakaltas|kakaltasin|bawas|ibabawas|babawasan)\M',
   'Text about deductions from pay may need legal review. Only deductions listed in section seven are part of the draft.', 51),
  ('fine_or_penalty', 'fine_or_penalty', 'Fine or penalty', '\m(fines|fined|penalty|penalties|penalized|multa|parusa)\M|\ma\s+fine\M',
   'Text that fines or penalizes the worker may need legal review.', 60),
  ('waiver', 'waiver', 'Waiver of rights', '\m(waive|waives|waived|waiver|waivers|relinquish\w*|isinusuko)\M',
   'Text that asks the worker to give up a right or claim may need legal review.', 70),
  ('quitclaim_or_release', 'quitclaim_or_release', 'Quitclaim or release',
   '\mquit\s*-?claims?\M|\mreleases?\s+(the\s+)?(shop|owner|employer|company|business)\s+from\M',
   'Text that releases the shop from claims or asks for a quitclaim may need legal review.', 80),
  ('exclusivity_or_non_compete', 'exclusivity_or_non_compete', 'Exclusivity or non-compete',
   '\m(exclusive|exclusively|exclusivity|non-?compete|competitors?)\M|\mnot\s+(to\s+)?work\s+(for|with|at)\s+(any\s+)?(other|another)\M|\mbawal\s+(magtrabaho|mag-?trabaho)\M',
   'Text that stops the worker from working for other shops may need legal review. WashLink aims to let workers work with several shops.', 90),
  ('liquidated_damages_or_forfeit', 'liquidated_damages_or_forfeit', 'Damages or forfeited pay on leaving',
   '\mliquidated\s+damages\M|\mforfeit\w*\M|\mwithh(e|o)ld\w*\s+(the\s+|all\s+)?(final\s+|last\s+)?(pay|salary|wages?|sahod)\M',
   'Text that charges damages or keeps pay when the worker leaves may need legal review.', 100),
  ('unpaid_trial_or_customer_work_in_training', 'unpaid_trial_or_customer_work_in_training', 'Unpaid trial or customer work in training',
   '\munpaid\s+(trial|trials|shift|shifts|work|training|days?)\M|\mtrial\s+(shifts?|period|days?|work)\M|\mwalang\s+bayad\M|\mcustomers?\M.{0,60}\mduring\s+(the\s+)?training\M',
   'Text about unpaid trial work or serving customers during training may need legal review. Required training is not productive work.', 110),
  ('contractor_label', 'contractor_label', 'Contractor label in shop text',
   '\m(independent\s+contractors?|contractors?|sub-?contractors?|freelancers?|freelance|commission\s+basis|pakyawan|pakyaw)\M',
   'The relationship type is set only by the choice made for each contract. A contractor label in shop text may need legal review.', 120),
  ('forum_or_arbitration', 'forum_or_arbitration', 'Forum or arbitration clause',
   '\m(arbitration|arbitrator|arbitrate|venue|jurisdiction|forum)\M',
   'Text that fixes where or how disputes are decided may need legal review.', 130),
  ('certificate_government_claim', 'certificate_government_claim', 'Certificate described as government-recognized',
   '\m(tesda|government[- ](recognized|recognised|accredited)|accredited|nationally\s+recognized|national\s+certificate)\M',
   'Certificates on WashLink are issued by the shop. Text that describes them as government-recognized may need legal review.', 140),
  ('contract_validity_claim', 'contract_validity_claim', 'Claim about signing or legal effect',
   '\m(signed|signature|binding|valid|validity|compliant|compliance|notarized|notarised|legally\s+enforceable)\M',
   'Acceptance on WashLink is a record, not an electronic signature. Text about signing or legal effect may need legal review.', 150)
on conflict (rule_key) do nothing;

-- -------------------------------------------------------------
-- 3) Matcher (internal): one row per matching rule, an excerpt of up to 160 characters around the first match.
--    Input capped at 4000 characters.
-- -------------------------------------------------------------
create or replace function public.contract_problem_term_matches(p_text text)
returns table (rule_key text, category text, excerpt text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  input text := left(coalesce(p_text, ''), 4000);
  rule record;
  hit integer;
begin
  if btrim(input) = '' then
    return;
  end if;
  for rule in select r.rule_key, r.category, r.pattern from public.contract_problem_term_rules r order by r.sort_order loop
    hit := regexp_instr(input, rule.pattern, 1, 1, 0, 'i');
    if hit > 0 then
      rule_key := rule.rule_key;
      category := rule.category;
      excerpt := left(btrim(regexp_replace(substr(input, greatest(1, hit - 60), 160), '\s+', ' ', 'g')), 160);
      return next;
    end if;
  end loop;
end;
$$;

-- -------------------------------------------------------------
-- 4) Owner-text helpers used by the w9f / w9g RPCs (internal).
-- -------------------------------------------------------------
-- Owner-written text rules (W8 parity): invisible characters, unknown / locked-only placeholders, impersonation.
create or replace function public.worker_contract_check_owner_text(p_text text)
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_text ~ '[\x01-\x08\x0b-\x1f\x7f\x200b-\x200f\x2060\xfeff]' then
    raise exception 'Remove invisible characters (such as zero-width spaces) from the text.' using errcode = '23514';
  end if;
  perform public.contract_template_placeholders_in(p_text);
  if p_text ~ '\{\{(worker_classification|owner_full_name|worker_full_name)\}\}' then
    raise exception 'The relationship type and the party names can appear only in WashLink safeguard clauses.' using errcode = '23514';
  end if;
  if regexp_replace(lower(p_text), '[^[:alnum:]]+', '', 'g') ~ '(washlink|platform)safeguard' then
    raise exception 'Shop text cannot be labelled as a WashLink safeguard.' using errcode = '23514';
  end if;
end;
$$;

-- Owner-typed contract details {role_title 3..120, schedule_summary 3..500, pay_details 3..1000}, kept verbatim.
create or replace function public.worker_contract_checked_owner_values(p_values jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  entry record;
  checked jsonb := '{}'::jsonb;
  value text;
  max_length integer;
begin
  if p_values is null or p_values = 'null'::jsonb then
    return checked;
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'Contract details must be text.' using errcode = '22023';
  end if;
  for entry in select e.key, e.value from jsonb_each(p_values) e loop
    if entry.key not in ('role_title', 'schedule_summary', 'pay_details') then
      raise exception 'Unknown contract detail.' using errcode = '22023';
    end if;
    continue when jsonb_typeof(entry.value) = 'null';
    if jsonb_typeof(entry.value) <> 'string' then
      raise exception 'Contract details must be text.' using errcode = '22023';
    end if;
    value := public.contract_template_normalize_text(entry.value #>> '{}');
    if strpos(value, '{{') > 0 or strpos(value, '}}') > 0 then
      raise exception 'Placeholder values cannot contain {{ or }}.' using errcode = '22023';
    end if;
    max_length := (jsonb_build_object('role_title', 120, 'schedule_summary', 500, 'pay_details', 1000) ->> entry.key)::integer;
    if char_length(value) < 3 or char_length(value) > max_length then
      raise exception '%', jsonb_build_object('role_title', 'Write the role title in 3 to 120 characters.',
                                              'schedule_summary', 'Write the schedule in 3 to 500 characters.',
                                              'pay_details', 'Write the pay details in 3 to 1000 characters.') ->> entry.key
        using errcode = '23514';
    end if;
    perform public.worker_contract_check_owner_text(value);
    checked := checked || jsonb_build_object(entry.key, value);
  end loop;
  return checked;
end;
$$;

revoke all on function public.contract_problem_term_matches(text) from public, anon, authenticated, service_role;
revoke all on function public.worker_contract_check_owner_text(text) from public, anon, authenticated, service_role;
revoke all on function public.worker_contract_checked_owner_values(jsonb) from public, anon, authenticated, service_role;

-- Realtime exclusion of every W9 table: w9c.
notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a; roll back w9d first)
-- -------------------------------------------------------------
-- drop function if exists public.worker_contract_checked_owner_values(jsonb), public.worker_contract_check_owner_text(text);
-- drop function if exists public.contract_problem_term_matches(text);
-- drop table if exists public.contract_problem_term_rules;   -- drops its trigger and policies
-- drop table if exists public.contract_acknowledgement_texts;
-- drop function if exists public.worker_contract_reference_guard_write();
