# Job openings (W4)

Scope: what `supabase/migrations/2026_10_24_w4a..w4d_*.sql` enforce for owner job openings
(spec B, A, G, I). Proven on the local Docker stack only (pgTAP J2, J3, J17, J18 and
`scripts/supabase-test/w4-api-smoke.mjs`; `LOCAL_TEST_HARNESS.md`). It says nothing about the
production project until D-10 rows 21-23 (`ROLE_AND_PROFILE_SECURITY.md`) are answered.

## Principles (continue P1-P14)

| | Principle |
|---|---|
| P15 | One verified-shop rule: `shop_has_recorded_verification(shop)` = `verification_status = 'approved'` AND `verification_reviewed_by` set AND `verification_reviewed_at` set AND `is_active`. `is_verified_shop_owner(shop)` = caller has the owner role AND owns the shop AND that predicate. `approved_shop_names_for_owner` (roster preview, `list_my_roster_links`) and the worker read policy use the same predicate (R-2 resolved). |
| P16 | No invented content: no column describing pay, benefits, schedule or terms has a DEFAULT. Empty means "not specified by the shop". Nothing is derived, estimated or rounded; amounts are stored exactly as entered (`numeric(10,2)`). |
| P17 | Status changes only through `transition_job_opening` (transaction-local flag `washlink.job_opening_transition` = row id, P6 pattern). `owner_id`, `first_published_at`, `status_changed_at`, `created_at`, `updated_at` are server stamps. |
| P18 | Drafts are visible only to their owner (not to super_admin either). |

## Fields

Required to create: `shop_id`, `title` (3..120). Required to publish (and to stay published or
paused): `title`, `description`, `work_location`, `openings_count`, `job_type`,
`applicant_requirement` (`job_opening_missing_publish_fields(row)` returns the missing names in
that order). Optional, never defaulted: duties, required skills, minimum years, experience /
availability requirements, schedule details, compensation (min, max, `PHP`, period, details),
benefits, other terms, minimum / preferred qualifications, required training, certification
expectations, application deadline (Asia/Manila calendar date, applications accepted through
that day), application instructions. Compensation is all-or-nothing: an amount needs currency
and period, and neither exists without an amount; max >= min when both are set.
`job_type` is a schedule category, not a legal classification (W4-L2). `certification_required`
means shop-issued certification only, never government-recognized (W4-L5).

## Lifecycle

| From | To | Who | Condition |
|---|---|---|---|
| draft | published | owning owner | verified shop (P15), no missing fields, deadline null or >= today (Manila) |
| published | paused | owning owner | none |
| paused | published | owning owner | same as publish |
| published | closed | owning owner | none |
| paused | closed | owning owner | none |
| closed | archived | owning owner | none |
| draft | (row deleted) | owning owner | DELETE, draft only |

Everything else (same status, backwards, reopening closed, un-archiving, draft -> closed /
archived) is rejected for every end user, super_admin included. Closed and archived are
read-only. Trusted SQL sessions bypass the guard for support / repair and are audited as
`trusted_session`. At most 50 non-archived openings per shop.

## Visibility (RLS)

| Role | Sees |
|---|---|
| Owning owner | every own opening, every status |
| Worker | `published` openings of shops that currently pass P15 |
| super_admin | every non-draft opening (read only) |
| Customer, other owners | nothing |
| anon | no table privilege (permission denied) |

A published opening of a shop that loses verification (decision, S6 name/address edit,
deactivation, deletion of the reviewing admin) stays `published` but is invisible to workers until
the shop is reviewed again; resuming a paused opening needs verification again.

## Audit and notifications

Four actions (`AUDIT_AND_NOTIFICATIONS.md`): `job_opening.created`, `.status_changed`,
`.updated` (non-draft content edits; column names only), `.deleted`. Payloads never contain
titles, descriptions, amounts or terms. W4 sends no notifications.

## Display rule (frontend)

Pay and terms are shown only as entered, e.g. "PHP 600.00 per day", "PHP 500.00 - 700.00 per
day", "From PHP 500.00 per day", "Up to PHP 700.00 per day", details verbatim, otherwise "Not
specified by the shop", with the notice "Details as entered by the shop. WashLink does not verify
pay or employment terms." The form never pre-fills pay, benefits or schedule.

## Limitations

- No auto-close on the deadline (no scheduler); it is checked at publish, resume and edit. W5 apply must refuse after it (R4).
- Editing a published opening changes what earlier applicants saw; W5 snapshots the opening on each application (C-W4-1).
- Deleting a non-draft opening through PostgREST affects 0 rows (RLS filters it before the guard), so no error is returned; the guard message `Only draft job openings can be deleted.` is defence in depth.
- The RPC flag relies on PostgREST not exposing `set_config` (smoke `rpc_set_config_not_exposed`; R6).
- Owner free text is length-checked only; no moderation until W11 (W4-L4).
- An audit failure aborts the action, including shop / account deletion cascades; the w4a preflight reduces drift risk (R5).

## Rollback

Reverse order d, c, b, a (local stack only): d drops the audit trigger / function and the RPC
(audit rows stay); c drops the policies, triggers, functions and table (data loss, export first);
b restores the w2b / w2d bodies (pinned) and drops `shop_has_recorded_verification` (re-opens
R-2); a has nothing to roll back.
