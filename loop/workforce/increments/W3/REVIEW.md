# W3 Review findings

Security: no BLOCKING. Compliance: no BLOCKING. Legal flags: `LEGAL_FLAGS.md` (W3-L1…L5).

## Non-blocking fixed in review polish (orchestrator-requested, uncommitted migrations edited)
- Producer column drift could break production deletes/updates → preflight migration `w3d0` aborts naming missing columns (D-10 row 20).
- `enqueue_notification_safely` swallowed all errors → only check/unique/FK/not-null skipped; others re-raised (tested).
- w3a missing signatures only NOTICE → now raise; final assertion that every SECURITY DEFINER fn in public/washlink_private pins pg_temp (except baseline `handle_new_user`).
- Owner-account deletion wording → distinct neutral text + `unlinked_by=owner_account_deleted` (tested).
- S6 reset label: already distinct (`shop.verification_reset_by_identity_change`); tests added.
- W3-L5 premise outdated: payload `reviewed_by` is the W2 server-stamped value (= actor_id for super-admin decisions; tested).
- Trusted-session `request.jwt.claims` → recorded as actor_kind='user': documented limitation.
- w3d split to stay ≤350 lines.

## Carry-forward
- C-W3-1 → W6–W10: audit payload forbids keys matching `code|text|signature|note|address`, strings ≤120 chars; attendance, assessment, contract-acceptance snapshots need their own immutable tables. R-4 snapshot at issue/acceptance still due in W7/W10.
- C-W3-2 → W12: realtime not used (polling); revisit once production realtime/RLS known.
- Rejected (guard-failed) actions are not audited (needs autonomous tx).
- Cross-transaction duplicate race proven only structurally (unique constraint).
