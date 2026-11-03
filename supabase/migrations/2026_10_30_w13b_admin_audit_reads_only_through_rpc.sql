-- =============================================================
-- WashLink W13b - super_admin audit reads only through the audited RPC (W13 PLAN 3.2; D-70; closes W14 N1, D-54's
-- "W13 decides"). Requires w3b, w3d, w14h, w13a. Idempotent.
-- The W3 policy wae_select_super_admin let a super_admin select workforce_audit_events (and, through the
-- security_invoker view, shop_verification_review_log) without a workforce_audit.log_searched event. It is dropped and
-- replaced by an explicit deny-all select policy, so every client role reads 0 rows from the raw table. The policy is
-- RESTRICTIVE (fix cycle 1, W13 S1): it is ANDed with every permissive policy, so an unknown production select policy
-- (w13a only NOTICEs it, D-10) cannot re-open raw reads; definer RPCs run as the table owner and are unaffected (the W3 table
-- grant stays: non-admins already read 0 rows; anon has no grant). The review-log view loses its authenticated grant
-- (42501 for every client role); it stays for trusted SQL and the D-10 runbook. Super_admin reads go only through
-- admin_workforce_audit_log (definer, writes workforce_audit.log_searched first). Database operators keep trusted SQL
-- access, which is not logged (W13-L4). my_workforce_activity, admin_workforce_audit_log and
-- admin_oversight_access_flags are security definer and unchanged.
-- D-78 (leftover W2 / W4 grants, found by the W13 J17 roll-up): w4c revoked job_openings only from public / anon, so
-- authenticated kept the Supabase default TRUNCATE / REFERENCES / TRIGGER (TRUNCATE skips RLS and row triggers); W2 / W4
-- left service_role the default ALL on job_openings, worker_profiles, worker_private_contacts, worker_roster_link_codes and
-- worker_roster_link_attempts, and W7 left anon / authenticated / service_role usage on certification_status_events_id_seq.
-- Every other workforce table and sequence revokes these. Nothing uses them (no frontend, backend, smoke or
-- test path writes these tables with the service key; definer functions, FK cascades and trusted SQL run as the table
-- owner). authenticated keeps select / insert / update / delete on job_openings (W4 owner drafts) and on worker_profiles /
-- worker_private_contacts (W2 own rows): the frontend repositories write them directly under RLS and guard triggers.
-- W13 S6 (fix cycle 1): the six pre-workforce tables (profiles, shops, bookings, workers, shop_pricing,
-- shop_verification_documents) still carry the Supabase default ALL for anon / authenticated in the local baseline,
-- which reconstructs production (D-1, D-10). TRUNCATE (skips RLS and row triggers), REFERENCES and TRIGGER are revoked
-- from public / anon / authenticated: PostgREST cannot issue them and no frontend / backend path uses them (grep of
-- frontend/ and backend/: only CSS `truncate` classes; the backend uses its own database). SELECT / INSERT / UPDATE /
-- DELETE stay untouched (the existing app uses them under RLS); service_role is untouched on these six tables.
-- =============================================================

drop policy if exists "wae_select_super_admin" on public.workforce_audit_events;
drop policy if exists "wae_no_client_select" on public.workforce_audit_events;
create policy "wae_no_client_select" on public.workforce_audit_events
  as restrictive for select to authenticated
  using (false);

revoke select on table public.shop_verification_review_log from authenticated;
revoke all on table public.shop_verification_review_log from public, anon, authenticated, service_role;

-- D-78: leftover W2 / W4 default privileges.
revoke truncate, references, trigger on table public.job_openings from authenticated;
revoke all on table public.job_openings, public.worker_profiles, public.worker_private_contacts,
  public.worker_roster_link_codes, public.worker_roster_link_attempts from service_role;
-- W13 S6: pre-workforce default TRUNCATE / REFERENCES / TRIGGER.
revoke truncate, references, trigger on table public.profiles, public.shops, public.bookings, public.workers,
  public.shop_pricing, public.shop_verification_documents from public, anon, authenticated;
-- W13 N3: the roster link code pepper schema (w2e revoked it from public / anon / authenticated only). No function lives
-- there and no client or service-key path reads it; the definer hash function runs as the owner.
revoke all on schema washlink_private from service_role;
revoke all on table washlink_private.roster_link_code_pepper from service_role;
-- W7 left the default sequence privileges on certification_status_events (only definer functions insert there; anon
-- could call nextval). w3b already does this for the audit sequence.
do $$
declare
  id_sequence text := pg_get_serial_sequence('public.certification_status_events', 'id');
begin
  if id_sequence is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated, service_role', id_sequence);
  end if;
end $$;

comment on table public.workforce_audit_events is
  'Append-only internal operational audit trail. No foreign keys by design (R-4: history survives account, shop and roster deletion). Not a tamper-proof or certified legal record (W3-L3). W13 (D-70): no client role selects the raw table; super_admin reads go only through the audited admin_workforce_audit_log RPC.';
comment on view public.shop_verification_review_log is
  'Append-only shop verification history (R-4). W7/W10 still snapshot verification at issue time. W13 (D-70): trusted SQL only (no client grant); super_admin reads go only through the audited admin_workforce_audit_log RPC.';
comment on policy "wae_no_client_select" on public.workforce_audit_events is
  'W13 (D-70): RESTRICTIVE deny-all client select (W13 S1: no permissive policy can re-open raw reads); super_admin reads go only through admin_workforce_audit_log.';

do $$
declare
  fn oid := to_regprocedure('public.admin_workforce_audit_log(text, text, uuid, uuid, uuid, timestamptz, timestamptz, bigint, integer)');
begin
  execute format('comment on function %s is %L', fn::regprocedure,
    coalesce(obj_description(fn, 'pg_proc'), 'W14: admin oversight.')
      || case when coalesce(obj_description(fn, 'pg_proc'), '') like '%W13%' then ''
              else ' W13 (D-70): the only client path to audit rows for super_admin; every call writes workforce_audit.log_searched.' end);
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W13 rollbacks in reverse order d..a). log_searched rows written meanwhile stay.
-- -------------------------------------------------------------
-- drop policy if exists "wae_no_client_select" on public.workforce_audit_events;
-- drop policy if exists "wae_select_super_admin" on public.workforce_audit_events;
-- create policy "wae_select_super_admin" on public.workforce_audit_events
--   for select to authenticated
--   using (public.is_super_admin());
-- grant select on table public.shop_verification_review_log to authenticated;
-- D-78 / W13 S6 / N3 revokes (job_openings, the five service_role tables, certification_status_events_id_seq, the pepper and the six
-- pre-workforce tables): do not re-grant unless the D-10 diff proves production depended on them.
-- comment on view public.shop_verification_review_log is
--   'Append-only shop verification history (R-4), super_admin only via workforce_audit_events RLS. W7/W10 still snapshot verification at issue time.';
-- comment on table public.workforce_audit_events is
--   'Append-only internal operational audit trail. No foreign keys by design (R-4: history survives account, shop and roster deletion). Not a tamper-proof or certified legal record (W3-L3).';
-- comment on function public.admin_workforce_audit_log(text, text, uuid, uuid, uuid, timestamptz, timestamptz, bigint, integer) is
--   'W14: job opening moderation, unreviewed approved shops, relationship lookups and audit reads (created by the W14 migrations).';
