# W15 - Close the required-training booking-gate bypass (unlink path) and fix the trainee notice - PLAN

**No split.** 1 migration, 3 new pgTAP files + 2 edited, 1 new smoke + runner edit, 1 copy line + 1 Vitest, docs. Spec: D (free required
training; "Clearly distinguish supervised training ... from productive work"; "Display this requirement clearly before a worker enrolls";
no unpaid labor disguised as training), J7, J16, J18. Source: `FINAL_VERDICT.md` "Reproduced defect (F-C2 / F-C3)", `FINAL_REVIEW.md` F-C2,
F-C3. Depends on W13 (and so W0-W14): every row `passed` in STATE.md (HEAD 3967f32). Decisions used: D-10 (standing), D-11, D-15, D-16,
D-17, D-74, D-75, D-77, D-78. **No dependency on an OPEN decision.** New decisions D-79..D-82 (section 5). Not BLOCKED.

## 0. Findings from reading the code
- w6h `roster_worker_in_required_training` (w6h:20-37) joins the enrollment on `e.worker_id = w.user_id` with `w.user_id is not null`, so it
  judges only the CURRENT link. w2d `guard_worker_roster_write` (w2d:134) lets the roster owner set `user_id -> null` at any time; the
  worker's `unlink_my_roster_entry` (w2d:183) does the same through the `washlink.roster_link` flag. Probe: `probe_owner_unlinks_trainee=
  succeeded`, `probe_assign_after_unlink=succeeded`, enrollment still `accepted`.
- Paths to the same result, checked one by one:
  P1 owner unlinks the trainee's row, then assigns it (the probe). P2 worker unlinks own row (by choice or under pressure), owner assigns it.
  P3 row linked to the worker BEFORE the invitation, unlinked, worker then enrolls; owner assigns the (now name-only) row. P4 worker
  unlinks, owner issues a new link code, a second account accepts it; owner assigns the row. P5 booking assigned to the row before
  training; after unlink only super_admin / trusted SQL can move it to `in_progress` (w2c `is_assigned_worker` needs a link), and the
  w6h start check calls the same function, so it must see history too. P6 owner deletes the row and re-creates it name-only, or simply
  creates a name-only row for the trainee (invitations come from applications, D-15, not from the roster): NOT DETECTABLE.
  P7 booking insert with a worker (w2c `guard_booking_insert` forces null), owner changing `workers.owner_id` or `bookings.shop_id`
  (not in the w2c / w2d allowed keys): already closed. P8 super_admin assigns the trainee to ANOTHER owner's booking: outside the gate (W13-L11).
- Every client link goes through `accept_roster_link_code` (w2e:314) or a trusted insert; w3d `audit_roster_link_change` already writes
  `roster.linked` audit rows (`subject_id` = row, `subject_profile_id` = account). Usable for a one-time backfill only (retention purge, W13-L5).
- `trainingNoticeCopy.ts:36` (`trainingVersusPaidWorkText`, unversioned, shown by `TrainingNotices.tsx:34`) says "Trainees cannot be assigned
  to customer bookings while their required training is unfinished." This is absolute and false (P6, P8). The versioned `w6_v1` notice says
  "the shop may not assign you" (a rule, not an enforcement claim) and stays unchanged, as does the owner's own attestation.
- Pins that change with a 97th migration: the exact `001_migration_replay` `results_eq` version list, and the J18 roll-up `count(*) = 96`.
- W6-L12 (Part 1:100) quotes "Training is not paid work.", which the W6 review polish removed (F-C3).

## 1. Scope / out of scope
IN: gate keyed on the roster row's link history (P1-P5); history table, trigger, backfill; trainee copy; pgTAP for every path incl. the
probe replay; J16 and J18 tests; W15 smoke; register W15-L1 + W6-L12 source note; TRAINING / ARCHITECTURE / ROLLBACK_GUIDE /
ACCEPTANCE_TESTS and the free-training paragraph of LIMITATIONS.
OUT: P6 (documented limitation, W15-L1); P8 / super_admin (W13-L11, unchanged); refusing any unlink (D-79); W16 items (F-C1, F-C7,
F-S2, DEPLOYMENT_READINESS trigger order, ACCEPTANCE_TESTS K9 nit, STATE final output); any edit to w2d / w6h or to `w6_v1`.

## 2. Options considered (recommendation: (b))
- (a) Refuse `user_id -> null` during a live required enrollment. An owner-only refusal closes P1 but leaves P2 (the owner can ask the
  worker to unlink), P3 and P4, and adds a new refusal to a roster action. Refusing the worker's own unlink goes against J16 (a worker
  can always leave), so that variant is rejected outright.
- **(b) Key the gate on link history (chosen, D-79).** Every account ever linked to a roster row is recorded. The gate refuses the row
  if the current account OR ANY earlier linked account holds a live required enrollment with the row's owner. Closes P1-P5, refuses no
  unlink for anyone, and needs no frontend error change (the existing 23514 text applies). Cost: a re-used row stays gated (D-80).

## 3. Migration `2026_11_03_w15a_training_gate_roster_link_history.sql` (staged 20261103000001; 97 after W15; <= 200 lines; ends `-- ROLLBACK`)
1. Preflight (raises, creates nothing): `public.workers`, `public.workforce_audit_events`, `public.roster_worker_in_required_training(uuid, uuid)`
   and trigger `bookings_guard_update_training_gate` exist.
2. Table `public.roster_link_history` (internal; never shown to anyone):
   `worker_row_id uuid not null references public.workers(id) on delete cascade`, `user_id uuid not null references public.profiles(id)
   on delete cascade`, `first_linked_at timestamptz not null default now()`, `source text not null check (source in ('link',
   'backfill_current', 'backfill_audit'))`, `primary key (worker_row_id, user_id)`; index `roster_link_history_user_id_idx (user_id)`.
   RLS enabled, NO policies; `revoke all ... from public, anon, authenticated, service_role` (D-78 style). Comment: not a contract or
   relationship; deleted with the roster row or the account (W13-L5 retention cross-ref).
3. Function `public.record_roster_link_history()` (trigger, `security definer`, `set search_path = public, pg_temp`, execute revoked from
   public, anon, authenticated, service_role): `insert ... values (new.id, new.user_id, now(), 'link') on conflict do nothing; return null`.
   Trigger `workers_record_link_history` AFTER INSERT OR UPDATE OF user_id ON public.workers FOR EACH ROW WHEN (new.user_id is not null).
   It writes nothing on `workers`, so the w2d column guard and the w6f / w3d triggers are unaffected, and AFTER-trigger order does not matter.
4. Backfill (idempotent, `on conflict do nothing`): (i) every `workers` row with `user_id is not null` -> `backfill_current`; (ii) every
   `workforce_audit_events` row with `action = 'roster.linked'` and `subject_type = 'roster_entry'` whose roster row and profile still
   exist -> `backfill_audit` (first_linked_at = event `created_at`). RAISE NOTICE with both counts (for the D-10 diff record).
5. `create or replace function public.roster_worker_in_required_training(p_worker_row_id uuid, p_shop_id uuid)`: same signature,
   attributes and revokes as w6h. Body: same joins and enrollment filters, but the enrollment matches when `e.worker_id = w.user_id`
   OR `exists (select 1 from public.roster_link_history h where h.worker_row_id = w.id and h.user_id = e.worker_id)`; the
   `w.user_id is not null` filter is removed. `bookings_guard_training_assignment` and its trigger are NOT replaced (they call this
   function for both the assign check and the start check, so P5 is covered). Re-apply revokes; `notify pgrst, 'reload schema'`.
6. ROLLBACK block (local only): re-create the w6h body of `roster_worker_in_required_training` verbatim (quoted in the block); drop trigger
   `workers_record_link_history`; drop function `record_roster_link_history()`; drop table `roster_link_history`. Order matters: function
   first (it references the table). Reversible; history is derived data (the links stay in the w3d audit).

## 4. State machines
No new state. Roster link transitions are unchanged (w2d): unlinked -> linked (worker accepts a code) -> unlinked (worker RPC or owner);
each `-> linked` now also inserts a history row (trigger only; nobody else writes). Gate rule (applies to everyone except trusted
sessions, as in w6h): assigning row R to a booking of owner O, or moving a booking assigned to R to `in_progress`, is refused with 23514
while any account in {R.user_id} plus history(R) holds an `accepted`, `required_initial` enrollment with owner O, the shop present, and
progress scheduled / in_progress / awaiting_assessment. Unassign (-> null), completing an in-progress booking, unlink, re-link, withdraw
and decline are never refused by W15.

## 5. Decisions (RECORD adds them as ADOPTED-DEFAULT (loop, date))
- D-79 Gate scope: key the w6h gate on the roster row's link history (current link plus every earlier linked account, backfilled from
  current links and `roster.linked` audit rows). No unlink is refused, for the owner or the worker (J16).
- D-80 Re-used rows: a row once linked to a trainee stays gated for any later account while that trainee's required training with the
  owner is live. The owner can add a new roster row for the new worker.
- D-81 Trainee copy: `trainingVersusPaidWorkText` becomes exactly: "Training is not productive work for customers. While your required
  training is unfinished, WashLink refuses the training shop's requests to assign you to its customer bookings through a roster entry
  that is or was linked to your account. WashLink cannot detect a roster entry that was never linked to your account, or work arranged
  outside WashLink. Terms for any later customer work are agreed separately and are not part of this training." The `w6_v1` notice and
  the owner attestation are unchanged (a rule and the owner's own statement, both versioned acknowledgements).
- D-82 Smoke order: `run-api-smokes.mjs` runs w2..w11, w14, w12, w15, w13 (w13 stays last; amends D-77).

## 6. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines; existing `test_helpers` only)
New `supabase/tests/database/j7_w15_training_gate_survives_roster_unlink.test.sql` (fixture as the probe: verified s1 of o1, trainee wt
with `create_accepted_enrollment`, linked row rt, booking b2):
- `w15_probe_owner_unlinks_trainee_then_assign_refused`: replays probe_fc2.sql. Assign rt 23514; owner unlink `succeeded`; assign rt
  again 23514; enrollment `accepted`; b2 `assigned_worker_id` null.
- `w15_worker_self_unlink_then_owner_assign_refused` (P2): `unlink_my_roster_entry` succeeds, owner assign 23514.
- `w15_link_before_training_then_unlink_still_gated` (P3): link, unlink, then invite + accept enrollment, assign 23514.
- `w15_relinked_row_to_other_account_still_gated` (P4, D-80): a second worker accepts a new code for rt; assign 23514; a fresh row for that
  worker assigns `succeeded`.
- `w15_preassigned_booking_cannot_start_after_unlink` (P5): b3 accepted + assigned to rt before the enrollment; enrollment accepted; owner
  unlinks; super_admin `in_progress` gives 23514; the former worker gives 42501 (w2c, no longer assigned).
- `w15_unassigning_trainee_row_still_allowed`: `assigned_worker_id = null` succeeds.
- `w15_gate_lifts_after_withdraw_or_completion`: `withdraw_from_training`, then assign succeeds; a second trainee `complete_training`,
  then assign succeeds.
- `w15_other_owner_rows_unaffected`: o2's row linked to wt assigns on o2's booking `succeeded` (D-17 scope, unchanged).
- `w15_limitation_never_linked_name_only_row_not_detected` (P6): a name-only row, and a row deleted + re-created, assign `succeeded`
  (pins the documented limit W15-L1; must change if a later increment closes it).
- `w15_link_history_recorded_for_code_link_and_trusted_insert`: one `link` row per link, none on unlink; a re-link adds no duplicate.
- `w15_link_history_has_rls_and_no_client_access`: `relrowsecurity`, 0 policies; select / insert / update / delete as anon, customer,
  owner, worker, super_admin, service_role give 42501.
- `w15_link_history_cascades_with_roster_row_and_account`: deleting the row, and deleting the profile, removes the history rows.
- `w15_gate_functions_not_client_executable`: `has_function_privilege` false for anon / authenticated / service_role on both functions.
- `w15_trusted_session_still_bypasses`: a service session assigns rt `succeeded` (w6h behaviour pinned).
New `j16_w15_worker_unlink_and_decline_still_succeed.test.sql`: `j16_w15_worker_unlinks_own_row_during_required_training`,
`j16_w15_owner_unlink_during_required_training_not_refused`, `j16_w15_worker_withdraws_after_unlink`,
`j16_w15_worker_declines_invitation_with_history_row` (`respond_to_training_invitation` with accept = false),
`j16_w15_worker_relinks_after_unlink` (new code accepted).
New `j18_w15_flows.test.sql`: `j18_w15_owner_adds_edits_and_unlinks_non_trainee_row`,
`j18_w15_owner_assigns_reassigns_and_unassigns_non_trainee`, `j18_w15_assigned_worker_starts_and_completes`,
`j18_w15_owner_deletes_roster_row_booking_unassigned`, `j18_w15_customer_booking_insert_unchanged`.
Edited: `001_migration_replay`: add `('20261103000001')` to `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13` and a new
`replay_w15_link_history_table_trigger_and_backfill_present` (plan 27 to 28). J18 roll-up: `= 96` to `= 97`, plus
`j18_trainee_not_assignable_after_owner_unlink` (probe replay; plan 25 to 26).
Vitest: new `frontend/src/presentation/utilities/trainingNoticeCopy.w15.test.ts`, `w15_trainee_notice_states_only_what_the_platform_enforces`:
equals the D-81 text; contains "Training is not productive work for customers.", "training shop" and "never linked"; does not match
/Trainees cannot be assigned/, /\b(guarantee|always|never be assigned)\b/i or /not paid work|unpaid/. `trainingNoticeCopy.w6.test.ts` is
unchanged (still passes). Docs Vitest `frontend/src/test/workforceDocs.w13.test.ts`: 164 to 165, `toContain('W15-L1')`, part rows also
not `W15-`; comment updated.
Smoke: new `scripts/supabase-test/w15-api-smoke.mjs` (<= 220 lines; loopback only, keys from local `supabase status` in memory, same
refusals as `run-api-smokes.mjs`; GoTrue users; fixtures through the seeded `test_helpers` via the TEST-ONLY `docker exec` psql path the
w6 smoke uses; synthetic users deleted). Checks: `w15_owner_unlink_of_trainee_row_succeeds`, `w15_owner_assign_after_unlink_refused_23514`,
`w15_booking_still_unassigned`, `w15_worker_self_unlink_succeeds`, `w15_assign_after_worker_unlink_refused_23514`,
`w15_withdraw_then_assign_succeeds`, `w15_non_trainee_row_assign_succeeds`, `w15_link_history_not_readable_or_writable_by_clients`
(anon, owner, worker, service_role), `w15_gate_functions_not_callable`, `w15_delete_user_removes_link_history`. Ends
`w15-api-smoke: n passed, 0 failed`. `run-api-smokes.mjs` `SMOKE_ORDER` gets `'w15'` before `'w13'` (header comment too).

## 7. Files
DB: `supabase/migrations/2026_11_03_w15a_training_gate_roster_link_history.sql` (new). Tests: the 3 new and 2 edited pgTAP files above.
Frontend: `frontend/src/presentation/utilities/trainingNoticeCopy.ts` (line 36 only), `.../trainingNoticeCopy.w15.test.ts` (new),
`frontend/src/test/workforceDocs.w13.test.ts`. Scripts: `scripts/supabase-test/w15-api-smoke.mjs` (new), `run-api-smokes.mjs`.
Docs: `docs/workforce/TRAINING.md` "C7 booking gate" (history rule, D-79 / D-80, P6 limit); `ARCHITECTURE.md:107-111` ("a roster row that
is or was linked to the trainee"; a W15 row in the increment table); `LIMITATIONS.md:46-50` (free-training paragraph only: gate wording
plus the gap bullet "a roster row never linked to the trainee (name-only, or deleted and re-created) is not detected; links ended before
the W3 audit trail are not in the history (W15-L1)"); `ROLLBACK_GUIDE.md:37` becomes `Order: W15 -> W13 -> W12 -> ...` plus a W15 row;
`ACCEPTANCE_TESTS.md` J7 / J16 / J18 rows + the W15 file list; `LEGAL_REVIEW_REGISTER.md` (status summary W15 row 1 / 1 / index, Total
165, "index: 12"; topic "Free training" adds W15-L1; the ID list adds W15-L1 and renames the W6-L12 summary to "Training vs productive
work copy (source updated W15)"; new "## W15 items" section with the W15-L1 row); `docs/workforce/legal/REGISTER_PART_1_W0_W8.md` W6-L12:
text kept verbatim, with an appended note "W15 source update: the copy now reads" followed by the D-81 text, and "'Training is not paid
work.' was removed in the W6 review polish (F-C3)."; source cell adds `trainingVersusPaidWorkText`. Status stays OPEN.
Orchestrator at RECORD (not builders): DECISIONS D-79..D-82, LOOP.md check-suite W15 smoke row and migration count 97, STATE.md.
W15-L1 (OPEN): "The training booking gate (w6h, W15 D-79) refuses the training shop's assignment of a roster row that is or was linked
to a trainee in live required training. It cannot detect a row never linked to the trainee (name-only, or deleted and re-created), links
ended before the W3 audit trail, work for other shops, super_admin assignment to another owner's booking (W13-L11) or trusted SQL
sessions. Review whether this is enough for the free-training rule and whether the D-81 worker copy describes it fairly (F-C2, F-C3)."
Source: w15a, w6h, `trainingNoticeCopy.ts`, `LIMITATIONS.md`. W16 must cross-reference W15-L1 for F-C2 / F-C3 instead of adding duplicates.

## 8. Acceptance criteria (repo root, local only; never `--linked`, `--db-url`, `db push`, `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | One new migration with a ROLLBACK block; w2d / w6h and every committed migration unchanged | `ls supabase/migrations/2026_11_03_w15*` = 1 file; `grep -c "ROLLBACK" supabase/migrations/2026_11_03_w15a*.sql` >= 1; `git diff --name-status 3967f32 -- supabase/migrations` only `A` |
| AC2 | Clean reset replays 97 migrations; all files PASS; 0 TODO | `node scripts/supabase-test/run-db-tests.mjs` ends `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13`, `replay_w15_link_history_table_trigger_and_backfill_present` ok; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | Probe defect closed | `w15_probe_owner_unlinks_trainee_then_assign_refused`, `j18_trainee_not_assignable_after_owner_unlink` ok; re-running probe_fc2.sql (count pin read as 97) on the local DB prints `probe_assign_after_unlink=23514` |
| AC4 | Every other detectable path closed | `w15_worker_self_unlink_then_owner_assign_refused`, `w15_link_before_training_then_unlink_still_gated`, `w15_relinked_row_to_other_account_still_gated`, `w15_preassigned_booking_cannot_start_after_unlink` ok |
| AC5 | Gate lifts; scope unchanged | `w15_gate_lifts_after_withdraw_or_completion`, `w15_unassigning_trainee_row_still_allowed`, `w15_other_owner_rows_unaffected`, `w15_trusted_session_still_bypasses` ok |
| AC6 | Undetectable path pinned as a limit | `w15_limitation_never_linked_name_only_row_not_detected` ok; `grep -n "W15-L1" docs/workforce/LIMITATIONS.md docs/workforce/LEGAL_REVIEW_REGISTER.md` hits in both |
| AC7 | History table private and cascading | `w15_link_history_has_rls_and_no_client_access`, `w15_link_history_cascades_with_roster_row_and_account`, `w15_gate_functions_not_client_executable` ok |
| AC8 | J16: worker freedom intact | every `j16_w15_*` in `j16_w15_worker_unlink_and_decline_still_succeed` ok; `j16_three_owner_rule_never_blocks_decline_or_termination` ok |
| AC9 | J18: ordinary flows intact | every `j18_w15_*` ok; J18 roll-up plan(26) ok; `j18_existing_flows` ok |
| AC10 | Notice copy accurate | `cd frontend && npm test` passes `w15_trainee_notice_states_only_what_the_platform_enforces` and `w6_polish_training_copy_does_not_contradict_optional_training_pay`; `grep -rn "Trainees cannot be assigned" frontend/src docs` empty |
| AC11 | Register consistent | `w13_legal_register_index_matches_parts_and_all_open` passes with 165 rows, all OPEN; `grep -n "trainingVersusPaidWorkText" docs/workforce/legal/REGISTER_PART_1_W0_W8.md` hits the W6-L12 row |
| AC12 | Smokes | `node scripts/supabase-test/run-api-smokes.mjs` prints `w15-api-smoke: n passed, 0 failed` before the w13 line, then `run-api-smokes: PASS (14 smokes)` |
| AC13 | Regression | `npm run lint` 0, `npm run build` 0, `npm test` all pass; `backend/.venv/Scripts/python.exe -m pytest -q` 4 passed; `node --test scripts/supabase-test/stage-local-workdir.test.mjs` 19 pass |
| AC14 | No refusal added to any unlink | `grep -niE "before (insert or )?update|guard_worker_roster_write|unlink_my_roster_entry" supabase/migrations/2026_11_03_w15a*.sql` empty |

## 9. Rollback, risks and legal-review flags
Rollback: run the w15a ROLLBACK block (local only), then the W13 order (ROLLBACK_GUIDE). It restores the w6h gate exactly (and so the
bypass). Frontend: revert the one copy line. Production apply remains a human gate (D-10, D-11).
- R1 False positive on re-used rows (D-80); documented in TRAINING.md; workaround: a new roster row.
- R2 Production backfill: orphaned `workers.user_id` values (w2d NOT VALID FK) are skipped by the profile join; counts in a NOTICE for D-10.
- R3 Concurrency: a link and an assignment in parallel behave as under w6h (history is written in the link transaction); untested.
- R4 Unknown production triggers on `workers` (D-10): the new AFTER trigger writes only its own table; record it in the D-10 diff.
- R5 The copy over-claims if any path reopens; the Vitest pins the D-81 text and AC3 / AC4 pin the behaviour it describes.
- Legal: W15-L1 (new, OPEN); W6-L12 source note (stays OPEN); W13-L11 unchanged. No compliance claim in code, copy or docs.
