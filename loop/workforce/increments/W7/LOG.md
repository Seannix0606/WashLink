# W7 - Certifications - LOG

## BUILD (database part) - 2026-10-26

Local Docker stack only (staged `.local-supabase-test`, `--local`); no `.env` read, no link / push, no commit.

- Migrations (new, each with `-- ROLLBACK`, each <= 350 lines): `2026_10_26_w7a_certifications_preflight.sql`,
  `w7b_certifications.sql`, `w7c_certification_reviews_and_reassessments.sql`, `w7d_certification_rules.sql`,
  `w7e_certification_issue_and_renew_rpcs.sql`, `w7f_certification_status_and_review_rpcs.sql`,
  `w7g_certification_reads_and_apply_gate.sql`, `w7h_certification_audit_and_notifications.sql`
  (staged `20261026000001..08`). No committed migration changed.
- Seed helpers: new `scripts/supabase-test/baseline/test_helpers_certifications.sql`; stager seeds
  `HELPERS_SOURCE_NAMES` in order (+ stager test `stager_seeds_every_helper_file_in_order`).
- pgTAP: 8 new files; `001_migration_replay` (44 migrations, `replay_schema_migrations_has_baseline_w2_to_w7`,
  `replay_w7_certification_tables_rls_enabled`); `j4_worker_can_browse...` fixture-only (one line issues w1 a
  certificate; no assertion / plan change).
- Smoke: `scripts/supabase-test/w7-api-smoke.mjs`.
- Docs: `docs/workforce/CERTIFICATIONS.md` (new); `LEGAL_REVIEW_REGISTER.md` (W7-L1..L11 OPEN + notes);
  `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 33-35, W7 guard matrix); `LOCAL_TEST_HARNESS.md`;
  `AUDIT_AND_NOTIFICATIONS.md`; `TRAINING.md`; `MARKETPLACE_AND_APPLICATIONS.md`; `loop/workforce/LOOP.md`.

Deviations from PLAN.md (small, recorded): `shop_certification_validity_months` lives in w7d (plan 3.4) and is
called at run time by the w7b insert guard; `certification_reassessments.recorded_at` is stamped with
`clock_timestamp()` (not `now()`) so "latest re-assessment" is well-ordered inside one transaction;
`certification_status_events` has no separate audit producer (its rows mirror audited certification changes);
extra internal helpers `lock_certification_training`, `insert_certification`, `certification_actor_display_name`,
`certification_reason_or_fail`, `certification_payload`; extra test-only helpers
`test_helpers.record_training_completion` and `test_helpers.backdate_certification` (W7 R7 time shift).

Actual results (final run of this step):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: 44 staged migrations replayed; `Files=46, Tests=1686`,
  `Result: PASS`; `grep -c "todo_start("` = 0 in every file.
- Smokes: w2 48 passed / 0 failed; w3 33 / 0; w4 43 / 0; w5 39 / 0; w6 40 / 0; w7 38 / 0.

## API for the frontend (W7)

All writes are RPCs (`supabase.rpc(name, params)`); tables are read-only selects under RLS. Map every message
below in `supabaseErrorMessages.ts`. Never call internal functions (they are not granted).

Constants: attestation version `w7_issuer_v1` (`certification_issuer_attestation_version()` returns it);
validity 1..36 months (absent policy row = 12); review window 30 days after the latest suspend / revoke;
renewal window `expires_at - 60 days .. expires_at + 90 days`; "Expires soon" = effective `active` and
`expires_at - now() <= 30 days` (UI-side label from server `expires_at` / `effective_status`, never recompute
expiry status itself).

### Writes

| RPC | Params | Returns | Caller |
|---|---|---|---|
| `issue_certification` | `p_enrollment_id uuid, p_expected_assessment_id uuid, p_issuer_attestation_version text` | `certifications` row | current owner of a verified program shop |
| `set_shop_certification_validity` | `p_shop_id uuid, p_validity_months integer` | `shop_certification_policies` row | current shop owner |
| `record_certification_reassessment` | `p_certification_id uuid, p_items_met boolean[], p_result text ('passed'/'failed'), p_assessor_comment text = null, p_failure_reason text = null` | `certification_reassessments` row | owner or designated trainer (never the worker) |
| `renew_certification` | `p_certification_id uuid, p_reassessment_id uuid, p_issuer_attestation_version text` | NEW `certifications` row (old one becomes superseded) | current owner, verified |
| `transition_certification` | `p_certification_id uuid, p_from_status text, p_to_status text, p_reason text` | `certifications` row | current issuing owner (suspend, revoke, reinstate from suspended) |
| `request_certification_review` | `p_certification_id uuid, p_statement text` | `certification_review_requests` row | certificate worker |
| `withdraw_certification_review` | `p_request_id uuid` | review row | certificate worker |
| `decide_certification_review` | `p_request_id uuid, p_decision text ('reinstate'/'uphold'), p_reason text` | review row | current issuing owner |

Error messages (code: text):
- 42501: `Only the shop owner can issue certifications.` / `Training enrollment not found.` / `Certification not
  found.` / `Shop not found.` / `Review request not found.` / `This certification status change is not
  allowed.` / `Only the shop owner or a designated trainer can record training.` (W6) / `Training program not
  found.` (reads)
- 23514: `Only a verified shop can issue certifications.` / `Only a verified shop can reinstate certifications.` /
  `Confirm the certification statement before issuing.` / `This training is not completed. A certification needs
  at least 3 attended training days and a passed assessment.` / `Validity must be 1 to 36 months.` / `This
  certification cannot be renewed.` / `Re-assessment opens 60 days before expiry and closes 90 days after it.` /
  `A pass needs every checklist item met.` / `Give a reason for the fail of 10 to 300 characters.` / `Record a
  passed re-assessment first.` / `The training record no longer shows completion.` / `Give a reason of 20 to 500
  characters.` / `Only a suspended or revoked certification can be reviewed.` / `The review period for this
  decision has ended.` / `A certification can be reviewed at most 3 times.` / `Write a statement of 20 to 1000
  characters.` / `This review request is no longer open.` / `This certification is no longer suspended or
  revoked.` / D-20: `This opening needs a current shop-issued certification recorded on WashLink.`
  (`create_job_application`, `transition_job_application` draft -> submitted)
- 23505: `A certification was already issued for this training.` / `This worker already holds a current
  certification from this program.` / `A review request is already open for this certification.`
- 55000: `The training record changed. Review it again.` (issue: assessment id changed; renew: a newer
  re-assessment exists -> reload) / `This certification changed. Refresh and try again.` (stale from_status)
- 22023: `Mark every checklist item as met or not met.` / `Choose passed or failed.` / `Choose reinstate or uphold.`

### Reads (all definer RPCs, `authenticated` only; no contact columns)

- `my_certifications()` (worker; other roles get 0 rows): `certification_id, certification_title, issuer_kind,
  program_id, enrollment_id, renews_certification_id, status, effective_status ('active' | 'expired' |
  'suspended' | 'revoked' | 'superseded'), status_reason, status_changed_at, issued_at, expires_at,
  validity_months, shop_name, approver_display_name, assessor_role, assessor_display_name,
  attended_training_days, required_training_days, shop_verification_status_at_issue, shop_verified_at_at_issue,
  issuing_shop_present boolean, issuing_shop_currently_verified boolean | null (null when the shop was removed),
  renewal_window_open boolean, training_record_changed_after_issue boolean, open_review_request_id uuid | null,
  review_requests_used integer, review_window_ends_at timestamptz | null (set only while suspended / revoked)`.
  Ordered by issued_at desc. "Worker holds a current certificate" (D-20 copy) = any row with
  `effective_status = 'active'`. Offer "Ask for a review" only when status is suspended / revoked,
  `open_review_request_id` is null, `review_requests_used < 3` and now < `review_window_ends_at`.
- `certification_history(p_certification_id)` (worker or current issuing owner; else 42501 `Certification not
  found.`): `entry_kind ('status_event' | 'review_request'), entry_id text, event, from_status, to_status,
  reason, actor_role, actor_display_name, review_status, worker_statement, decision_reason,
  decider_display_name, occurred_at, decided_at`, ordered by occurred_at.
- `owner_certifications(p_shop_id)` (current shop owner; else 42501 `Shop not found.`): `certification_id,
  worker_id, worker_display_name, certification_title, program_id, enrollment_id, renews_certification_id, status,
  effective_status, status_reason, issued_at, expires_at, validity_months, training_record_changed_after_issue,
  renewal_window_open, latest_reassessment_id, latest_reassessment_result, latest_reassessment_assessed_on,
  latest_reassessment_used boolean, open_review_request_id, open_review_statement, open_review_requested_at`;
  open reviews first, then issued_at desc. Renew is possible when status = 'active', `renewal_window_open`,
  latest re-assessment `passed`, not used, assessed within 30 days: pass `latest_reassessment_id`.
- `certifiable_enrollments(p_program_id)` (current program owner; else 42501 `Training program not found.`):
  `enrollment_id, worker_id, worker_display_name, attended_training_days, required_training_days,
  current_assessment_id, assessed_on, assessor_display_name, validity_months` (validity that would apply).
  Pass `current_assessment_id` as `p_expected_assessment_id`; on 55000 reload the row. Evidence details for the
  issue modal: W6 `training_evidence_for_enrollment(enrollment_id)`.
- `applicant_verified_certifications(p_application_id)` (unchanged W5 signature / authorisation): now real rows
  `certification_id, certification_title, issuing_shop_name, issued_at, expires_at` = the applicant's CURRENT
  certificates from any shop. Empty means "no current shop-issued certification on WashLink".
- Tables (select only): `certifications` (worker own; issuing owner), `certification_status_events`,
  `certification_review_requests`, `certification_reassessments` (same audience as the parent),
  `shop_certification_policies` (current shop owner; no row = 12 months).
- `certification_effective_status(status, expires_at, at)` is granted but the UI should use the server
  `effective_status` column.

### Notifications (category: recipient)

`certification.issued`, `.renewed`, `.suspended`, `.revoked`, `.reinstated`, `.review_decided`, `.expiring`,
`.expired`: worker; `certification.review_requested`, `.training_record_changed`: current issuing owner.
`subject_type = 'certification'`, `subject_id` = certification id. Texts carry no reasons, statements, names or
dates (open the certificate to see them). Expiry notices exist only once W12 schedules the function.

## BUILD (frontend part) - 2026-10-26

No `.env` read, no commit, nothing under `supabase/` or `scripts/` touched. Every file <= 350 lines (largest changed: `OwnerDashboardContent.tsx` 289).

- Domain: `models/Certification.ts` (statuses, `w7_issuer_v1`, limits, 55000 messages, row models); `models/VerifiedCertification.ts`
  (W5 "unavailable" constants dropped; `WorkerVerifiedCertificationState` = loading / unavailable / loaded{hasCurrentCertification});
  `utilities/certificationLifecycle.ts` (owner actions mirroring w7f from server status / effective status / window flags; renew rule;
  D-21 review offer; D-20 "holds current"; "Expires soon" from server `expires_at` only); `repositories/CertificationRepository.ts`.
- Infrastructure: `supabase/supabaseCertificationRows.ts`; `repositories/SupabaseCertificationRepository.ts` (reads: 4 RPCs + policy select);
  `repositories/SupabaseCertificationActionRepository.ts` (8 write RPCs; no-row answer = failure); `supabaseErrorMessages.ts` (+28 W7 messages).
- Application: `validation/certificationSchemas.ts`; `services/CertificationService.ts`, `services/CertificationReviewService.ts`.
- Presentation: `dependencyInjection/createCertificationDependencies.ts` (wired into `createDashboardDependencies` and
  `createWorkerMarketplaceDependencies`); hooks `useMyCertifications` (+ `useWorkerCertificationState`), `useOwnerCertifications`
  (+ `useCertifiableEnrollments`, `useCertificationHistory`), `useCertificationActions`, `useShopCertificationPolicy`,
  `useCertificationSupportData`; utilities `certificationCopy.ts`, `certificationDisplay.ts`; components `certifications/*`
  (status badge, card, history, shop-issued notice, attestation field, text-confirm modal), `owner/certifications/*` (panel, per-shop list,
  list item, issue / status-change + review-decision / re-assessment / renew modals, validity section, certifiable trainees),
  `worker/certifications/*` (My certifications, review request). Lazy routes: owner "Certifications" tab, worker "My certifications" tab.
- Changed: W5 copy functions now take the real state (`describeWorkerCertificationWarning`, `isApplyBlockedByCertification`,
  `describeNoVerifiedCertifications()`); Apply / Send disabled for certification-required openings without a current certificate (D-20);
  applicant section lists current certificates with the disclaimer; `AssessmentSignOffModal` optional `dialogTitle` (reused for re-assessment).

Deviations (small): "Issue certification" lives in a new `CertifiableTraineesSection` under the owner's program Manage view (fed by
`certifiable_enrollments`), not inside the shared `TrainingRosterPanel` (trainers also render that panel and never issue). Renew / reinstate
buttons are hidden for an unverified shop (server still decides). The apply gate does not block when `my_certifications` fails to load
(the database refuses anyway); it blocks while loading and when no current certificate is held.

Vitest: 19 planned names + `j17_certification_rpc_without_a_row_is_a_failure` in 7 new files; the 3 W5 files updated with names kept.

Actual results (final run of this step, in `frontend/`):
- `npm run lint`: exit 0, no problems.
- `npm run build`: `tsc -b` + `vite build` OK (`OwnerCertificationsPanel` and `MyCertificationsPanel` emitted as separate lazy chunks).
- `npm test`: Test Files 81 passed (81); Tests 148 passed (148) (128 existing + 20 new).
- `grep -rn "service_role" frontend/src`: empty.

## Review polish (frontend) - 2026-10-26

- Owner applicant drawer: section heading, region label, loading and error titles renamed to "Shop-issued certifications" (`ApplicantVerifiedCertificationsSection.tsx`). When the read returns `issuing_shop_currently_verified = false`, the row shows "Issuing shop is no longer verified on WashLink." The field is optional on `SupabaseVerifiedCertificationRow` / `VerifiedCertification.isIssuingShopCurrentlyVerified` (mapped to null when absent; no line shown unless explicitly false). "Review polish (DB)" was not present when this was written; if the DB names the flag differently, only `mapVerifiedCertificationRow` in `supabaseJobApplicationRow.ts` needs changing.
- Worker certificate card (`CertificationCard.tsx`): for active and expired certificates, shows D-22 renewal guidance (`workerRenewalGuidanceText`: re-assessment with the issuing shop, 60 days before to 90 days after expiry, the shop decides); expired certificates also show `workerExpiredCertificateNoticeText` (no longer counts for openings that require a current certification, D-20). Addresses W7-L15 worker-UI gap. Both strings added to `certificationCopyConstants` for the disclaimer scan.
- Worker reads: confirmed every worker certification read goes through `SupabaseCertificationRepository.listMyCertifications` -> `rpc('my_certifications')`; no client code selects from the `certifications` table (only `.from` on certification data is the owner `shop_certification_policies` read). A test guards this.
- Tests: `CertificationReviewPolish.w7.test.tsx` (7 tests); region-name assertions updated in `ApplicantProfileDrawer.w5.test.tsx` and `CertificationApplyGate.w7.test.tsx`.
- Results: `npm run lint` clean; `npm run build` built OK; `npm test` 82 files, 155 tests passed.
- Follow-up after DB polish: issuer flag name `issuing_shop_currently_verified` confirmed (no mapping change). Added `A worker profile with certifications cannot be deleted. Delete the account instead.` to the allowlist in `supabaseErrorMessages.ts`, so the delete-profile error toast shows it instead of the generic 23503 text. The worker profile editor footer and delete confirmation now say beforehand that a profile with shop-issued certifications cannot be deleted and the account must be deleted instead (`presentation/utilities/workerProfileDeleteCopy.ts`). Test: `WorkerProfileDelete.w7.test.tsx` (2). Results: lint clean; build OK; `npm test` 83 files, 157 tests passed.

## Review polish (DB) - 2026-10-26

Local Docker stack only (staged `.local-supabase-test`, `--local`); no `.env` read, no link / push, no commit; nothing under
`frontend/` touched; w6 and earlier migrations untouched (`git diff --name-status d26865d -- supabase/migrations` empty).
Edited in place (uncommitted W7 files): w7b, w7c, w7e, w7f, w7g; tests j17, j6_w7_certification_lifecycle (one worker raw
read -> `certification_history`), new `j19_w7_review_polish.test.sql` (27); `w7-api-smoke.mjs` (two worker raw reads ->
`my_certifications`). Docs: `CERTIFICATIONS.md`, `LEGAL_REVIEW_REGISTER.md` (W7-L12..L16 OPEN), `LOCAL_TEST_HARNESS.md`.

1. Certificate history vs worker-profile deletion (w7c): BEFORE DELETE trigger `worker_profiles_guard_certified_delete`
   (definer, not client callable) refuses deleting a `worker_profiles` row while the worker has any certification (every
   session), 23503 `A worker profile with certifications cannot be deleted. Delete the account instead.` Account
   deletion (auth.users -> profiles -> worker_profiles cascade) still succeeds and removes the certificates as before
   (W7-L8). Chosen over RESTRICT / SET NULL because enrollments, assessments and review requests also cascade from
   `worker_profiles`. Frontend: map this new message.
2. w7f: `transition_certification` reinstate (suspended -> active) while a review is open decides it in the same
   transaction (request `reinstated`, decision_reason = the reinstate reason, event `reinstated` with
   `review_request_id`; change source `review_decision`, so the worker gets one `certification.review_decided` and no
   separate `certification.reinstated`). Revoke keeps the request open (still decidable). `decide_certification_review`
   now refuses BOTH decisions unless the certificate is suspended / revoked (23514 `This certification is no longer
   suspended or revoked.`).
3. w7b / w7c: raw worker SELECT policy `cert_select_worker_own` dropped; `certification_status_events`,
   `certification_review_requests`, `certification_reassessments` SELECT policies now owner-role only (issuing current
   owner). Workers read through `my_certifications()` / `certification_history()` (unchanged). Owner reads unchanged.
4. w7g rollback: `applicant_verified_certifications` block is the W5d lines 164-200 word for word (incl. the W5 comment
   lines and `comment on function`, grants), preceded by `drop function` (return type differs). Checked with `diff`: IDENTICAL.
5. w7e: unlocked ownership pre-checks before the FOR SHARE / advisory locks in `issue_certification` (42501 `Training
   enrollment not found.`) and `renew_certification` (42501 `Certification not found.`); the post-lock checks stay.
6. w7e `insert_certification`: verification snapshot without `approved` / reviewer / review time -> 23514 `Only a
   verified shop can issue certifications.` (never 23502).
8. Shape change for the frontend: `applicant_verified_certifications(p_application_id)` now returns `certification_id,
   certification_title, issuing_shop_name, issued_at, expires_at, issuing_shop_currently_verified boolean` (never null;
   true only when the issuing shop still exists, is active and has a recorded verification; no reviewer data). Same
   argument and authorisation.

Not verified: the item 5 pre-check is behavioural only (no test can observe that a refused caller never took the
locks; outcome/message unchanged and covered by j3). The item 2 "decide refused on an active certificate" branch is
defence in depth: no RPC path leaves an open request on an active certificate any more, so it is not reachable in a test.
One run of `run-db-tests.mjs` had a j5 failure (`j5_audit_payload_has_no_cover_note_or_opening_content`, have 13 want 0)
in a W5 test that the change does not touch; the next full run passed. Likely flaky (the test's `like '%650%'` can match a
random uuid in the payload); not changed (committed W5 test).

Actual results (final runs):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: 44 staged migrations replayed (db reset + seeds); `Files=47, Tests=1713`,
  `Result: PASS`; j19 ok; 0 `todo_start(`.
- Re-applying edited w7b, w7c, w7e, w7f, w7g on the reset DB with `ON_ERROR_STOP=1`: exit 0 each (idempotent).
- Smokes: w2 48 passed / 0 failed; w3 33 / 0; w4 43 / 0; w5 39 / 0; w6 40 / 0; w7 38 / 0.
- `npx supabase stop --workdir .local-supabase-test --no-backup`: stopped.

Review polish (DB) follow-up - j5 flake fix (test code only; no migration touched):
- `j5_application_audit_and_notifications.test.sql` test 32 (`j5_audit_payload_has_no_cover_note_or_opening_content`):
  the `like '%650%'` pay check now runs on the payload text with uuids replaced by `<uuid>`
  (`regexp_replace(payload::text, '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}', '<uuid>', 'gi')`), so a random id can no
  longer match. Any 650 / pay value as a payload value or in other text is still caught, and the key whitelist and the
  notification text check (no uuids there) are unchanged; plan unchanged.
- `node scripts/supabase-test/run-db-tests.mjs` three times, each from `supabase db reset`: run 1 exit 0, `Files=47,
  Tests=1713`, `Result: PASS`; run 2 same; run 3 same. Stack stopped (`npx supabase stop --workdir .local-supabase-test
  --no-backup`).

## Orchestrator record (2026-10-26)
- Frontend build interrupted once by a usage limit and resumed.
- REVIEW: security and compliance no BLOCKING; review polish applied (DB + frontend), including flaky W5 test fix. REVIEW.md.
- VERIFY: PASS (VERDICT.md). Fix cycles: 0 (polish only).
