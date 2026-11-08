# W0 Review findings (carry-forward)

Security: no BLOCKING. Compliance: no BLOCKING. Legal flags: `LEGAL_FLAGS.md` (W0-L1…L7).

## Security, NON-BLOCKING (routed)
- S1 → W2: booking INSERT accepts client `booking_status`, `customer_id`, `assigned_worker_id`, rating fields
  (SupabaseBookingRepository.ts:75-96, 238-250). BEFORE INSERT guard; test `j17_customer_cannot_forge_booking_insert_fields`.
- S2 → W2: owner can assign another owner's worker (SupabaseWorkerRepository.ts:117-126). Test `j17_owner_cannot_assign_foreign_worker`.
- S3 → audit: RLS-dependent calls also include `deleteWorker`, `updateWorkerAvailability`, `fetchWorkerByIdentifier`.
- S4 → W2: `profiles` SELECT scope unknown (phone_number, full_name). Test `j17_user_cannot_read_other_profiles_contact`.
- S5 → W2/D-8: role must never be derived from `user_metadata` after insert (`auth.updateUser` can rewrite it).
- S6 → W2: approved shop can edit identity fields without re-review (2026_04_17:40-45).
- S7 → W2: `svd_*` policies don't bind `storage_path` to own `shop_id` folder (low).
- S8 note: `is_super_admin()` not revoked from public (harmless).
- S9 → W2 (added in W1 fix cycle 1): worker self-update of own roster row (`workers_update_own_link`, used by `updateWorkerAvailability`) has no column restriction in the reconstructed baseline; the linked worker can rewrite `owner_id`, `name`, `phone_number`. Restrict to `is_available`. Test `j17_worker_cannot_rewrite_roster_row`.

## Compliance, NON-BLOCKING (routed)
- C1 → W7: certification requires NOT NULL enrollment link + approved_by/approved_at/assessor.
- C2 → W6: attendance keyed (enrollment, session) with session date; unique (enrollment, date); count ≥3 distinct attended days.
- C3 → W2 (hard dep for W4/W7/W10): fix E3 pre-approved shop insert.
- C4 → W10: owner derived from worker_contracts→shops.owner_id, only approved shops count.
- C5 → W8: clause-level template model; locked safeguard clauses; classification with no default.
- C6 → W6: record free-training notice acknowledgement, terms, optional compensation on enrollment; assert no charge path for trainees.
- C7 → W6/W9: gate roster/booking assignment on training status (training vs productive work).
- C8 → W2: linking `workers.user_id` needs worker consent; roster rows never count as relationships.
- C9 → audit: "Legal: none for W0" was inaccurate; superseded by LEGAL_FLAGS.md.

## Carried from W1 security re-review (NON-BLOCKING)
- S10 → W2: repo `supabase/config.toml` keeps `[db.seed] enabled = true` with `./seed.sql`; stray-SQL guard scans only `supabase/tests/`. Extend guard to all of `supabase/` except `migrations/` and `tests/database/`, or disable seed in repo config and have the stager re-enable it in the staged copy.
- S11 → W2: test_helpers grants to anon/authenticated + `act_as_service`; add header warning and a stager assertion that staged `project_id` ends in `-local-test`.
- W2 must `drop policy if exists` the `*_local_test` owner booking policies by name and still account for unknown production policies (D-10).
