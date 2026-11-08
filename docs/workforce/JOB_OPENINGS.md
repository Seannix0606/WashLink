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
archived) is rejected for every end user, super_admin included (the one W14 exception is the moderation path
below; a super_admin still cannot edit, publish, archive or delete an opening). Closed and archived are
read-only. Trusted SQL sessions bypass the guard for support / repair and are audited as
`trusted_session`. At most 50 non-archived openings per shop.

## WashLink moderation (W14, `PLATFORM_MODERATION_AND_AUDIT.md`)

Workers report openings they can read; a super_admin decides the resulting case with `moderate_job_opening` only:
`published -> paused` (with a hold) or `published | paused -> closed` (W5 auto-close fires), with a reason kind and a
message the owner reads in `owner_job_opening_moderation()`. The w4c guard trigger was split (w14c) and its function
body is unchanged; a separate guard checks the moderation update. While held (`paused_by_washlink` /
`changes_submitted`) the owner's `paused -> published` is refused with 23514 `WashLink paused this job opening. Edit it
and ask WashLink to check it before publishing again.`; edit, close and archive stay allowed (close / archive resolves
the case). The owner edits, then calls `submit_job_opening_changes` (refused unless the content differs from the
snapshot of the last pause / kept pause, N5); after WashLink lifts the pause the owner resumes through
`transition_job_opening` (verification re-checked). Content and snapshots are never changed. Owners never see reports,
reporters, report counts or report categories, including after their own close / archive of a held opening: that close
closes the open reports in the owner's session, but `my_workforce_activity` shows `job_opening_report.*` events only to
the reporter (subject profile), never to the actor (W14 fix cycle 1, B1).

## Visibility (RLS)

| Role | Sees |
|---|---|
| Owning owner | every own opening, every status |
| Worker | `published` openings of shops that currently pass P15; since W5 also any non-draft opening they hold a non-draft application to (same policy name, `2026_10_25_w5b`) |
| super_admin | every non-draft opening (read only) |
| Customer, other owners | nothing |
| anon | no table privilege (permission denied) |

A published opening of a shop that loses verification (decision, S6 name/address edit,
deactivation, deletion of the reviewing admin) stays `published` but is invisible to workers until
the shop is reviewed again; resuming a paused opening needs verification again.

## Audit and notifications

Four actions (`AUDIT_AND_NOTIFICATIONS.md`): `job_opening.created`, `.status_changed`,
`.updated` (non-draft content edits; column names only), `.deleted`. Payloads never contain
titles, descriptions, amounts or terms. W4 sends no notifications; W5 notifies applicants on pause and closes their open applications on close / archive (`MARKETPLACE_AND_APPLICATIONS.md`).

## Display rule (frontend)

Pay and terms are shown only as entered, e.g. "PHP 600.00 per day", "PHP 500.00 - 700.00 per
day", "From PHP 500.00 per day", "Up to PHP 700.00 per day", details verbatim, otherwise "Not
specified by the shop", with the notice "Details as entered by the shop. WashLink does not verify
pay or employment terms." The form never pre-fills pay, benefits or schedule.

## Limitations

- No auto-close on the deadline (no scheduler); it is checked at publish, resume and edit. W5 apply refuses after it (R4 closed in W5).
- Editing a published opening changes what earlier applicants saw; W5 keeps a write-once snapshot on each application (C-W4-1 closed in W5).
- Deleting a non-draft opening through PostgREST affects 0 rows (RLS filters it before the guard), so no error is returned; the guard message `Only draft job openings can be deleted.` is defence in depth.
- The RPC flag relies on PostgREST not exposing `set_config` (smoke `rpc_set_config_not_exposed`; R6).
- Owner free text is length-checked only; there is no automatic or keyword filter. W14 added report-driven moderation (worker reports, a super_admin queue, audited pause / close; above); an opening WashLink did not act on is not vetted (W4-L4, W14-L1).
- An audit failure aborts the action, including shop / account deletion cascades; the w4a preflight reduces drift risk (R5).

## Rollback

Reverse order d, c, b, a (local stack only): d drops the audit trigger / function and the RPC
(audit rows stay); c drops the policies, triggers, functions and table (data loss, export first);
b restores the w2b / w2d bodies (pinned) and drops `shop_has_recorded_verification` (re-opens
R-2); a has nothing to roll back. The W4 rollbacks are invalid while the w14c triggers exist (roll back W14 first).
