# W2 Review findings

## Initial review
- Security BLOCKING S-B1 (FK `on delete set null` cascades rejected by guards) → FIXED in fix cycle 1 (`is_orphaned_fk_set_null`).
- Compliance BLOCKING C-B1 ("verified shop" not trustworthy: self-approved legacy shops, client-set reviewer) → FIXED (server-stamped reviewer, gate requires reviewer + reviewed_at + is_active, D-10 audit row).
- Non-blocking fixed: trusted-session fail-closed, booking insert customer_id, shops.owner_id frozen, uploaded_by insert-only,
  link-code pepper/lock/prune/per-code limit, realtime exclusion, availability default removed, neutral roster copy,
  profile visibility copy, raw error.message sweep (all repositories incl. profile).

## Re-review: no BLOCKING (security, compliance)

## Carry-forward (NON-BLOCKING, routed)
- R-1 → W3: security-definer functions: pin `search_path = public, pg_temp` (or qualify with `%I.%I`) in new code; align W2 helpers in a W3 migration.
- R-2 → W4: `approved_shop_names_for_owner` (w2d) must use the same rule as `is_verified_shop_owner`; never label as "verified" until aligned.
- R-3 → D-10 checklist: production BEFORE UPDATE triggers that touch other columns (e.g. `updated_at`) would defeat the cascade bypass; pre-existing FK on `workers.user_id` changes delete behaviour.
- R-4 → W7/W10: snapshot shop verification (status, approver, time) at certification issue / contract acceptance; a later loss of verification must not void them. Append-only review log (W3 audit events). Decide whether affected workers are notified.
- R-5 → W13 docs: operating procedure "deactivate reviewers, don't delete".
- R-6 (N4) open: S6 re-review covers name/address only; phone, map pin, document replacement do not trigger re-review (legal W2-L3).
- Known: duplicate-account message reveals that an email is registered (account enumeration; accepted for UX, note in limitations).

## Legal flags
`LEGAL_FLAGS.md`: W2-L1…L5.
