# Platform moderation, oversight reads and admin audit (W14)

Spec A, B, H, I; journeys J2, J3, J17, J18. Local Docker proof only (D-10): nothing here was applied to a linked or
production project. The database part describes what the w14a..w14i migrations actually do (W14 LOG "BUILD (DB)",
including its 14 deviations D1..D14); the frontend part describes the built files (W14 LOG "BUILD (frontend)",
deviations F1..F10). Every legal question is in `LEGAL_REVIEW_REGISTER.md` (W14-L1..L12, all OPEN).

**Moderation is a platform action on a listing, not a legal finding.** Nothing in WashLink states that a posting is
lawful, vetted or compliant, that an opening WashLink did not take down is acceptable, or that a pause or close has any
legal effect. Item 6 of the W14 plan (admin take-over of overdue or stranded shop review requests without the worker) is
**out**: D-44 is unchanged (only a human can change it).

Migrations (staged `20261029000010..18`; 87 staged migrations in total; each <= 350 lines with a commented `-- ROLLBACK`
block; no committed migration changed; no W2b / W3 / W4 / W5 / W8 / W10 / W11 function body replaced):
`2026_10_29_w14a_moderation_preflight.sql` (creates nothing), `w14b_job_opening_moderation_tables.sql`,
`w14c_job_opening_moderation_guard_and_holds.sql`, `w14d_job_opening_moderation_rpcs.sql`,
`w14e_job_opening_moderation_reads.sql`, `w14f_unreviewed_approved_shops.sql`, `w14g_admin_relationship_lookups.sql`,
`w14h_workforce_audit_reads.sql`, `w14i_moderation_audit_and_notifications.sql`. 36 functions carry a `W14:` comment:
20 client RPCs (granted to `authenticated` only; anon and service_role denied) and 16 internal functions (revoked from
every client role); 32 are SECURITY DEFINER with `search_path = public, pg_temp` (the 4 constants are immutable SQL).

## Principles (P72-P79, continue P1-P71)

- **P72** Only effects of moderation: opening status `published | paused -> paused | closed` plus a publish hold. Opening
  content, application snapshots, applications (beyond the unchanged W5 auto-close on close) and shop verification are
  never touched. Reason = a fixed kind plus a WashLink message that only the owner reads.
- **P73** Reporter protection: owners never read report rows, statements, reporter ids, report counts, open cases or
  dismissed cases. The admin case shows reporters as `Reporter 1..n`. Reporters read only their own reports and the
  outcome kind.
- **P74** No W4 body replaced. The w4c trigger `job_openings_guard_write` is split into `job_openings_guard_write`
  (BEFORE INSERT OR DELETE) and `job_openings_guard_write_update` (BEFORE UPDATE, WHEN the transaction-local
  `washlink.job_opening_moderation` is not the row id); both run the unchanged `job_openings_guard_write()`
  (md5 pinned in `w14_w4_guard_body_unchanged_and_trigger_order`). The new `job_openings_guard_moderation` (BEFORE
  UPDATE, WHEN that flag = row id) accepts only: `auth.uid()` + `is_super_admin()` + profile role `super_admin`;
  `washlink.job_opening_moderation_case` = an open / changes_submitted / paused_by_washlink case of this opening; only
  `status`, `status_changed_at`, `updated_at` changed; `published | paused -> paused | closed`. Else 42501 `This job
  opening change is not allowed.`
- **P75** Hold: `job_openings_moderation_hold` (BEFORE UPDATE WHEN status changes to `published`) refuses while a case is
  `paused_by_washlink` / `changes_submitted` (23514). Trusted sessions bypass (audited repair, `trusted_session`).
  `job_openings_moderation_resolve` (AFTER UPDATE WHEN status changes to closed / archived without the moderation flag)
  resolves a held case when the owner closes or archives.
- **P76** `my_workforce_activity` is a redacted per-user read for every role: never `actor_id`, `subject_id` or
  `subject_profile_id`; an actor label and allow-listed payload keys only (below).
- **P77** Every super_admin read of personal data outside a party view is audited in the same transaction before anything
  is returned (VOLATILE; an audit failure aborts the call): case reads, relationship lookups, audit-log searches.
- **P78** The four new tables (`job_opening_moderation_cases`, `job_opening_reports`, `job_opening_moderation_actions`,
  `admin_access_records`): RLS on; deny-all select, insert, update and delete policies for `authenticated` (super_admin
  included, W11 N3); `grant select` only (the policy still denies); no write grant for any client role incl.
  service_role; writes only inside definer functions under transaction-local flags (= row id):
  `washlink.job_opening_moderation_write` (cases; actions use their case id), `washlink.job_opening_report_write`,
  `washlink.admin_access_write`. A trusted session without the flag is refused too. FK set-null passes via
  `is_orphaned_fk_set_null`. Not in Realtime (each migration aborts on a FOR ALL TABLES publication). Free text lives
  only in its row, never in audit payloads or notifications.
- **P79** Re-review stamp without a status flip: the W2b guard keeps the old reviewer when the status is unchanged, so
  `shops_zz_rereview_stamp` (BEFORE UPDATE, sorts after `shops_prevent_owner_verification_mutation`) sets
  `verification_reviewed_by = auth.uid()` and `verification_reviewed_at = now()` only under `washlink.shop_rereview` =
  shop id, for a super_admin, while the status stays `approved`. W10 `shops_sync_owner_relationships` then refreshes pairs.

## Decisions (W14 PLAN section 5; RECORD adds them to DECISIONS.md as ADOPTED-DEFAULT (loop, 2026-10-29))

- D-50 reports: worker accounts with a worker profile only, on openings they can read; six categories; statement
  20..1000; one open report per worker and opening; at most 3 reports per worker and opening (lifetime, withdrawn ones
  count) and 10 open reports per worker; reports open cases; no admin-initiated case and no keyword moderation.
- D-51 takedown: super_admin pause (with a hold) or close, with a reason kind and a 20..500 owner message; never edit,
  archive, delete or re-publish; snapshots never edited; a close uses the W5 auto-close.
- D-52 hold: the owner edits, then asks WashLink to check (one submission at a time); WashLink lifts, keeps the pause or
  closes; the owner may close or archive at any time (resolves the case).
- D-53 reporter protection (P73); applicants get only the existing W5 pause / close notices, without a reason.
- D-54 audit reads: redacted per-user read for every role; admin log through an audited RPC; the W3 raw
  `wae_select_super_admin` policy is kept (W13 decides); N6 flag = open >= 30 days and >= 5 case reads.
- D-55 relationship lookups: super_admin only, per worker or owner id, a fixed purpose plus a 20..300 note; every lookup
  recorded and audited; parties are not notified but see it in "Your activity".
- D-56 unreviewed approved shops (D-10 row 14 predicate): super_admin confirms (stamps the reviewer, no status change,
  owner notified) or requests changes / rejects through the existing decision path; runbook below.
- D-57 console tabs (extends D-42): Overview, Shop verification (with an "Approved without a recorded review" view),
  Posting reports, Certification reviews, Contract disputes, Standard contract, Relationships, Audit log, Policies.
- D-58 the fixed in-app notification texts below; W12 de-duplicates and schedules.

## Tables (w14b, w14g; all four also have `updated_at`, stamped = `created_at` on immutable rows, D2)

| Table | Key rules |
|---|---|
| `job_opening_moderation_cases` | `job_opening_id`, `shop_id`, `owner_id`, `decided_by` FK ON DELETE SET NULL; `opening_title_snapshot` (NOT NULL), `shop_name_snapshot` (<= 200); `status` in open, dismissed, paused_by_washlink, changes_submitted, lifted, closed_by_washlink, resolved_owner_closed; `reason_kind` (the six categories); `owner_message` 20..500; `admin_note` 20..1000 (admin only); `owner_change_note` 1..500; `revision` >= 1; CHECK `jomc_status_consistency` (paused / changes_submitted / lifted / closed need reason + message; dismissed needs admin_note); partial UNIQUE one active case (open, paused_by_washlink, changes_submitted) per opening. Guard: INSERT forced to open / revision 1; UPDATE only along the state machine, only status / reason / message / notes / `decided_by` / stamps; `decided_by = auth.uid()` for a super_admin decision; `revision + 1`; never deleted from the app (42501 `Moderation records cannot be edited.`). |
| `job_opening_reports` | `case_id` NOT NULL FK CASCADE; `job_opening_id` FK SET NULL; `reporter_id` NOT NULL FK `worker_profiles(profile_id)` CASCADE; `category` (six); `statement` 20..1000; `reported_snapshot` jsonb NOT NULL (`job_opening_application_snapshot` at report time, write-once); `opening_status_at_report`; `status` open / closed / withdrawn; `outcome` no_action / opening_paused / opening_closed / pause_lifted_after_changes (required iff closed); partial UNIQUE (reporter_id, job_opening_id) where open. Guard: UPDATE only open -> closed / withdrawn; DELETE only by cascade. |
| `job_opening_moderation_actions` | append-only history: `action` in paused, closed, dismissed, changes_submitted, pause_kept, lifted, owner_closed; `actor_role` (server-set; `trusted_session` / `system` without a role); `reason_kind`; `owner_message`; `opening_snapshot` (write-once content at that moment); `created_at = clock_timestamp()` so the order is insert order inside one transaction (D9). Never updated; DELETE only by cascade. |
| `admin_access_records` | `admin_id` FK SET NULL (server-set `auth.uid()`); `access_kind` worker_relationships / owner_relationships; `subject_profile_id` NOT NULL with NO FK (P11: outlives the subject); `purpose` (five values); `note` 20..300; `row_count`. Insert-only under the flag; no update except the FK set null (42501 `Access records are append-only.`); delete only on the trusted W3 retention path (`washlink.audit_retention_purge = on`). |

## State machines

| From | To | Who / how | Effect |
|---|---|---|---|
| (none) | open | worker `report_job_opening` | when the opening has no active case; snapshots of title and shop name |
| open | dismissed | super_admin `dismiss` | admin_note required; open reports -> closed `no_action` |
| open | paused_by_washlink | super_admin `pause` | a published opening -> paused (an already paused one is not updated); hold on; reports -> `opening_paused` |
| open, paused_by_washlink, changes_submitted | closed_by_washlink | super_admin `close` | opening (published / paused) -> closed, W5 auto-close fires; final; reports -> `opening_closed` |
| paused_by_washlink | changes_submitted | current owner `submit_job_opening_changes` | only if the opening was edited after the pause: `updated_at > status_changed_at` AND its content differs from the `opening_snapshot` of the last `paused` / `pause_kept` action (N5; `job_opening_updated_at`, `shop_name`, `shop_address` ignored, so a no-op save does not count; same refusal text; `can_submit_changes` uses the same test) |
| changes_submitted | paused_by_washlink | super_admin `keep_paused` | new reason + message; action `pause_kept`; reports -> `opening_paused` |
| paused_by_washlink, changes_submitted | lifted | super_admin `lift` | hold off; opening stays paused; owner may resume through W4 (verification re-checked); optional new message (20..500); reports -> `pause_lifted_after_changes` |
| paused_by_washlink, changes_submitted | resolved_owner_closed | owner closes / archives (AFTER trigger) | action `owner_closed`; open reports -> closed `opening_closed` (D5) |
| paused_by_washlink, changes_submitted | dismissed | super_admin, only once the opening is gone (FK set null) | D4 |

An `open` case is not resolved by an owner close; WashLink dismisses it (close and pause need a published or paused
opening, D6). Report: (none) -> open (worker); open -> withdrawn (reporter; the case is unchanged); open -> closed (with
the case decision or the owner close); deleted only by cascade (reporter account or case gone). Shop re-review: approved
(unreviewed) -> approved (reviewer stamped) | changes_requested | rejected; super_admin only. Refused for everyone:
direct writes on the four tables (also service_role and a trusted INSERT without the flag); raw selects (also
super_admin); any super_admin content edit, publish, archive or delete of an opening; moderation of a draft; any W14
write to `job_applications` (checked by a `prosrc` scan).

## Triggers and order (R1: production must match, D-10 rows 46-48)

BEFORE triggers on `job_openings` (name order): `job_openings_guard_moderation` (UPDATE), `job_openings_guard_write`
(INSERT / DELETE), `job_openings_guard_write_update` (UPDATE), `job_openings_moderation_hold` (UPDATE),
`job_openings_normalize`; AFTER UPDATE `job_openings_moderation_resolve`. BEFORE UPDATE on `shops`:
`shops_prevent_owner_verification_mutation`, `shops_zz_rereview_stamp`; AFTER UPDATE `shops_audit_rereview`. w14c and
w14f abort if the BEFORE UPDATE name order differs; w14a aborts on W14-named objects or triggers that W14 did not
create (re-runs are accepted once `job_openings_guard_moderation()` carries the W14 comment, D14).

## RPCs and reads (lock order: job_openings row -> case row -> report rows; a shops row locks nothing else)

Worker:
- `report_job_opening(p_job_opening_id, p_category, p_statement) -> (report_id, status, created_at)`; readable = published
  at a shop passing `shop_has_recorded_verification`, or non-draft and applied; a non-worker or an account without a
  worker profile gets `Job opening not found.` (D13).
- `withdraw_job_opening_report(p_report_id) -> (report_id, status, withdrawn_at)`. Report limits are counted under a
  per-worker advisory lock (N2), so parallel calls cannot pass them together.
- `my_job_opening_reports()` -> report_id, job_opening_id, opening / shop name snapshots, category, statement, status,
  outcome, created_at, closed_at, can_withdraw. Constants: max open per worker 10, max per opening 3.
Owner:
- `owner_job_opening_moderation()` -> case_id, job_opening_id, status, reason_kind, owner_message, owner_change_note,
  status_changed_at, can_submit_changes, history [{action, reason_kind, owner_message, created_at}]. Only decided cases
  of openings the caller currently owns (never open / dismissed); never reports, counts, statements, admin_note or the
  administrator.
- `submit_job_opening_changes(p_case_id, p_note default null) -> (case_id, status, revision, status_changed_at)`.
super_admin (re-review, lookups, audit reads: sections below; others get 0 rows from the queue / lists / summary and
42501 from actions and audited reads):
- `admin_job_opening_moderation_queue(p_status default 'active')`: case_id, status, revision, report_count,
  open_report_count, categories[], opening_status, opening_present, opening_title_snapshot (D7), shop_name_snapshot,
  opened_at, status_changed_at; `active` = open + paused + changes_submitted; oldest first; limit 200; no statements.
- `admin_job_opening_moderation_case(p_case_id) -> jsonb` (audited `job_opening_moderation.case_viewed`): `case` (incl.
  admin_note), `opening` (snapshot keys + status, first_published_at, status_changed_at, updated_at; null once removed),
  `shop` {name, verification_status, is_active, has_recorded_verification}, `reports` [{reporter_label, category,
  statement, status, outcome, created_at, reported_snapshot}], `actions` (with snapshots), `application_counts`.
- `moderate_job_opening(p_case_id, p_expected_revision, p_action, p_reason_kind, p_owner_message, p_admin_note)`;
  actions `dismiss | pause | close | keep_paused | lift`.

Messages. 42501: `Job opening not found.`, `Report not found.`, `Moderation case not found.`, `Shop not found.`, `Only a
platform administrator can moderate job openings.` / `... can read moderation cases.` / `... can review shops.` / `... can
look up relationships.` / `... can read the audit log.`. 22023: `Choose a report reason.`, `Choose a moderation action.`,
`Choose a reason for this action.`, `Choose a case status.`, `Choose confirm approval, request changes or reject.`,
`Choose a purpose for this lookup.`, `Choose a person to look up.`, `Choose a page size between 1 and 100.` / `... 200.`,
the two filter-format messages, `The start of the range must be before the end.`. 23505: `You already reported this job
opening.`. 23514: `Write 20 to 1000 characters.`, `You have reached the report limit. Wait for WashLink to review your
reports.`, `This report is no longer open.`, `This action is not available for this case.`, `This job opening no longer
exists.`, `Write a message to the owner of 20 to 500 characters.`, `Write an internal note of 20 to 1000 characters.`,
`Only a published or paused job opening can be paused or closed.`, `This job opening is not waiting for your changes.`,
`Edit the job opening before asking WashLink to check it.`, `Write at most 500 characters.`, `WashLink paused this job
opening. Edit it and ask WashLink to check it before publishing again.` (from `transition_job_opening`), `This shop
already has a recorded review.`, `Write notes of 20 to 1000 characters.`, `Write a note of 20 to 300 characters.`.
55000: `This case changed. Refresh and try again.`. An unknown action is 22023 (D6).

## Redacted activity, admin audit log, N6 flag and summary (w14h)

- `my_workforce_activity(p_before_id, p_limit 1..100 default 50)` (every signed-in role; newest first): events where the
  caller is the actor, the subject profile, or a party of the subject `worker_contract` (the worker only once it was
  sent). Columns event_id, created_at, action, subject_type, actor_label (`you`, `washlink` = a super_admin,
  `washlink_system` = no actor, `shop_owner`, `worker`, `someone`), details (keys from_status, to_status, status, decision,
  result, category, reason_kind, basis, resolution_kind, changed_by, deleted_by, ended_by, party_role, version_number,
  version_kind, scope, purpose, access_kind, outcome; scalar values only; uuid-shaped strings dropped). Report privacy
  (D-53, B1): `job_opening_report.*` events go ONLY to the reporter (subject profile), never via `actor_id` (an owner
  close / archive of a held opening closes its reports in the owner's session, actor = owner); `job_opening_moderation.
  opened` / `.dismissed` / `.case_viewed` / `.deleted` only to an actor who is not the case owner (D10). N7: on
  `admin_access.*` events the person looked up sees `purpose = washlink_review`; only the actor sees the real purpose.
- `admin_workforce_audit_log(p_action_prefix, p_subject_type, p_subject_id, p_profile_id, p_actor_id, p_from, p_to,
  p_before_id, p_limit 1..200 default 50)`: full rows newest first plus `access_purpose` / `access_note` joined for
  `admin_access.*` events; `p_profile_id` matches actor or subject profile; prefix `^[a-z_.]{1,64}$`, subject type
  `^[a-z_]{1,40}$`. Every search writes `workforce_audit.log_searched` (subject_type `workforce_audit`, no subject
  profile; payload: filter names, profile_id, actor_id, subject_id, result_count, and (N4) subject_type / action_prefix
  only if they occur in the audit table, else `unrecognised`; never free text) before rows are returned.
- `admin_oversight_access_flags()` (W11 REVIEW N6): one row per OPEN contract dispute open >=
  `oversight_flag_open_days()` (30) days with >= `oversight_flag_read_count()` (5) `worker_contract_dispute.case_viewed`
  events for that dispute (case and document reads both count): dispute_id, contract_id, opened_days, case_view_count,
  distinct_viewer_count, last_viewed_at. A flag is information for the administrators, not an enforcement.
- `admin_moderation_summary()`: one row (super_admin): open_report_case_count, changes_submitted_count, paused_by_washlink_count,
  oldest_open_case_at, unreviewed_approved_shop_count, oversight_flag_count, relationship_lookups_last_30_days.

## Relationship lookups (w14g; D-38 outside disputes, D-55)

`admin_worker_relationships(p_worker_id, p_purpose, p_note)` / `admin_owner_relationships(p_owner_id, p_purpose, p_note)`
(VOLATILE). Purposes: `party_support_request`, `reported_problem_follow_up`, `moderation_follow_up`, `policy_monitoring`,
`legal_or_regulatory_request`; note 20..300. Each call reads the rows, then (same transaction, before returning) inserts
an `admin_access_records` row and audits
`admin_access.relationships_viewed` (subject_type `profile`, subject_id = subject_profile_id = the looked-up id; payload
access_record_id, access_kind, purpose, row_count). An unknown or wrong-role id returns `{found:false}` and is still
recorded (no unaudited existence oracle). Worker result: worker_display_name, distinct_qualifying_owner_count,
relationships [{relationship_id, owner_name_snapshot, owner_present, status, status_reason, counts_toward_goal,
qualifying_contract_count, first_accepted_at, last_active_at, ended_at}] (live status via
`worker_owner_relationship_derive`). **No current minimum** (D1: only W10 functions may read `workforce_policies`, pinned
by `j16_only_w10_reads_and_setter_reference_workforce_policies`; the console reads the minimum through the W10
`wp_select_super_admin` policy). Owner result: owner_display_name and rows with worker_name_snapshot, never a worker
count, minimum or other owners. No contract text. Parties are not notified; the subject sees the event in "Your
activity" (label `washlink`, details access_kind and the generic purpose `washlink_review` (N7); never the note).

## Approved shops without a recorded review (w14f; D-10 rows 14 / 22, D-56)

Predicate (internal `shop_lacks_recorded_super_admin_review`, D-10 row 14): `verification_status = 'approved'` AND
(`verification_reviewed_by` null -> `reviewer_missing`, else `verification_reviewed_at` null -> `review_time_missing`, else
the reviewer's role is not super_admin -> `reviewer_not_super_admin`). A shop with a null reviewer column fails
`shop_has_recorded_verification` (cannot publish; its openings are hidden from workers); a `reviewer_not_super_admin` shop
still passes P15 and is only listed.
- `admin_unreviewed_approved_shops()` (not audited; shop data only): shop_id, shop_name, owner_display_name (trimmed
  full_name or `Owner`), is_active, reviewer_state, verification_reviewed_at, last_decision_at (latest
  `shop.verification_decided`), published_opening_count, current_certification_count, active_contract_count,
  suspended_relationship_count; oldest first; limit 200.
- `rereview_approved_shop(p_shop_id, p_decision, p_notes default null) -> (shop_id, verification_status,
  verification_reviewed_at)`: `confirm_approval` (notes ignored, D12) updates `verification_reviewed_at` under the flag
  and P79 stamps both columns; `request_changes` / `reject` need notes 20..1000 and go through the W2b super_admin
  branch (W3 audits `shop.verification_decided` and notifies). `shops_audit_rereview` writes
  `shop.verification_rereviewed` (from_reviewer_state, to_status, changed_by `super_admin`) for all three decisions
  (D12); only a confirmation notifies the owner. `is_active` is not checked: confirming an inactive shop stamps it, but
  P15 still fails until it is active.

## Runbook: approved shops without a recorded review

1. Before any production apply (D-10 rows 14 / 22) a human runs the read-only row 14 query from
   `ROLE_AND_PROFILE_SECURITY.md` on a schema-and-data copy and records the count and shop ids in the D-10 record.
2. After W14, a super_admin works the queue in the console (Shop verification, view "Approved without a recorded
   review", `UnreviewedApprovedShopsPanel` / `RereviewShopDrawer`) oldest first. For each shop: read the documents and
   history (W2 review screen), then confirm, request changes or reject (notes 20..1000). Check `published_opening_count`,
   `active_contract_count`, `current_certification_count` and `suspended_relationship_count` first: a request for
   changes or a rejection hides published openings and suspends relationships (W10), but never removes certificates,
   contracts or applications made while the shop was unreviewed (D-23, W14-L10). Effects on workers (S3): a W10
   suspension can lower a worker's informational distinct-owner count; workers are NOT notified by the re-review; and
   nothing in it limits a worker's decline, leave or termination (J16 unchanged).
3. A shop knowingly accepted without a decision (for example, a shop that is no longer operating) stays in the queue;
   record the exception (shop id, reason, who decided, date) in the D-10 record outside the database. Do not hide it.
4. Never stamp `verification_reviewed_by` / `verification_reviewed_at` from SQL, a trusted session or the service_role
   key: the W2b guard lets a trusted repair through, but it records a reviewer without a decision, writes no
   `shop.verification_rereviewed` event and notifies nobody. The stamp trigger acts only for a super_admin JWT under
   the RPC's flag.
5. Re-run the row 14 query (or read `unreviewed_approved_shop_count` in the summary) until it returns only the recorded
   exceptions.

## Audit and notifications (w14i, w14f; W3 rules: an audit failure aborts, a notification problem never does)

Audit (AFTER triggers; payloads never carry statements, messages, notes, names or dates; FK set-null updates are silent):
- `job_opening_report.submitted` / `.withdrawn` / `.closed` / `.deleted` (subject `job_opening`, subject profile = the
  reporter; payload report_id, case_id, job_opening_id, category, outcome, changed_by).
- `job_opening_moderation.opened` / `.paused` / `.closed` / `.dismissed` / `.changes_submitted` / `.pause_kept` /
  `.lifted` / `.resolved_owner_closed` / `.deleted` (subject profile = the owner; payload case_id, job_opening_id,
  shop_id, from_status, to_status, reason_kind, report_count, changed_by); `.case_viewed` (w14e).
- `shop.verification_rereviewed`, `admin_access.relationships_viewed`, `workforce_audit.log_searched` (above).

| Event | Recipient | Text (key) |
|---|---|---|
| paused | current owner | `WashLink paused <opening>. Open it to read why and what to change.` (`job_opening_moderation:<case>:paused`) |
| closed | current owner | `WashLink closed <opening>. Open it to read why.` |
| pause kept | current owner | `WashLink kept the pause on <opening>. Open it to read why.` (key adds `:<revision>`, D11) |
| lifted | current owner | `WashLink lifted the pause on <opening>. You can publish it again.` |
| report closed | each reporter | `WashLink reviewed a job opening you reported.` (`job_opening_report:<report>:closed`; also after an owner close, D5) |
| re-review confirmed | owner | `WashLink confirmed the verification of <shop>.` (category `shop_verification.rereviewed`, key `shop_rereview:<shop>:<event id>`) |

`<opening>` uses `notification_safe_label` (fallback "A job opening"). Nothing for report submitted / withdrawn,
changes submitted, dismissals, owner closes (to the owner), case views, lookups or log searches; trusted SQL (no
`auth.uid()`) and cascades notify nobody. The W5 applicant pause / close notices fire unchanged (no reason, D-53).

## Frontend (as built, W14 LOG "BUILD (frontend)", deviations F1..F10; paths under `frontend/src/`)

UI -> hooks -> services -> repositories -> RPCs only (via the W11 `supabaseRpcCalls`; no raw read of a W14 table, no
`service_role`); 70 files added, 15 changed, each <= 350 lines; new admin panels are lazy chunks; `Skeleton` /
`EmptyState` / `LoadErrorNotice` / `applicationToast` states. Layers: `domain/models/{JobOpeningModeration,
WorkforceActivity, AdminOversight, PlatformContractTemplateDraft}.ts`, `domain/utilities/platformContractTemplateDraft.ts`,
`infrastructure/repositories/Supabase{JobOpeningModeration, WorkforceActivity, AdminOversight,
PlatformContractTemplate}Repository.ts`, `infrastructure/supabase/supabaseModerationErrorMessages.ts` (merged into
`supabaseErrorMessages.ts`), `application/validation/moderationSchemas.ts`, four services, copy in
`presentation/utilities/{jobOpeningModerationCopy, workforceActivityCopy, adminOversightCopy, standardContractCopy}.ts`.
- Wiring (F1, F2): `presentation/dependencyInjection/createModerationDependencies.ts` builds an optional
  `moderationDependencies` field of the W11 `OversightDependencies` (`createOversightDependencies.ts`);
  `createSuperAdminDependencies` is unchanged. Production wires it, so the console shows the nine D-57 tabs (Overview
  default) and the W14 controls appear. Without it (W11 test doubles, older callers) the console keeps the W11 five tabs,
  the overview has no second summary and the marketplace / owner panels show no W14 controls.
- Worker (`presentation/components/worker/marketplace/`): "Report this opening" on readable openings
  (`ReportOpeningModal` through the extra hook `useReportJobOpening`, F3) and `MyOpeningReportsList`. The reporter sees only
  their own text and the outcome kind; withdraw while open (F9).
- Owner (`presentation/components/owner/jobOpenings/`): `OpeningModerationNotice` on `JobOpeningListItem` (reason, WashLink
  message as stored, history, "This is not a legal finding."; never reports, never "Suspended", F9) and
  `SubmitOpeningChangesModal`. `OwnerJobOpeningsPanel.tsx` hosts `useOwnerJobOpeningModeration` and re-reads the notices after
  an edit is saved, so "Ask WashLink to check it" appears without waiting for the 60 s poll (F7). While a hold is on,
  Resume is disabled with the database's hold text as its reason; the database still refuses (23514) and that refusal is
  shown as written (F8).
- Account menu (`presentation/components/UserAccountMenu.tsx`): "Your activity" opens the lazy
  `account/WorkforceActivityDrawer` / `WorkforceActivityList` (labels only, never ids; e.g. "WashLink looked up your
  workforce relationships").
- super_admin console (`features/superAdmin/SuperAdminDashboardPage.tsx`, `presentation/components/superAdmin/`):
  `AdminOverviewPanel` second summary (`useAdminModerationSummary`, F3); `moderation/{PostingReportQueuePanel,
  PostingReportCaseDrawer, ModerateOpeningForm, DecideOpeningChangesForm}`; `ShopVerificationSection` view toggle "Approved
  without a recorded review" with `shops/{UnreviewedApprovedShopsPanel, RereviewShopDrawer}` (reuses
  `ShopReviewDocumentList`); `standardContract/{StandardContractPanel, StandardContractEditor,
  PublishStandardContractModal}`; `relationships/RelationshipLookupPanel`; `audit/{AdminAuditLogPanel, AdminAuditFilters,
  AdminAccessFlagsList}`. Admin next actions `posting_reports` and `audit_log` in `domain/utilities/workforceNextActions.ts`.
- Standard contract (F4, F5): `StandardContractPanel` lists versions itself (number, date, saved by, fingerprint) from the
  W8 read, because `ContractTemplateVersionHistory` has owner-only actions and stays unchanged; `ContractTemplatePreview`
  is reused. The editor changes only the heading and text of editable clauses (never adds, removes or re-orders clauses;
  unchanged clauses are sent as read, edited text is trimmed) and blocks a publish with no change ("Change at least one
  editable clause before publishing."). The publish modal says "Publishing does not make the standard template legally
  reviewed. It stays a draft that needs review by a qualified Philippine labor-law professional." The W8 server checks
  every rule.
- Relationships (F6): after a worker lookup is shown, the current minimum is read through the W10
  `WorkforcePolicyService.loadPolicies()` (super_admin select), not from the lookup (DB D1).
- Audited reads (F10): the moderation case, lookups and audit-log searches run only on open / submit and once after an
  action, never polled; React StrictMode in development still doubles mount reads (W11 N7, R4).
- Unchanged (`git diff a880331`): `ApplicationSnapshotView.tsx`, `JobOpeningTransitionConfirmModal.tsx`,
  `owner/contractTemplates/*`, every W9 contract component and the five J16 files.

## Tests (local stack, W14 LOG "BUILD (DB)" and "BUILD (frontend)")

pgTAP (plan = actual, 0 `todo_start(`): `j2_w14_job_opening_reports` (30), `j2_w14_job_opening_takedown` (51),
`j3_w14_unreviewed_approved_shops` (33), `j17_w14_audit_reads` (31), `j17_w14_relationship_lookups` (24),
`j17_w14_moderation_authorization` (30), `j17_w14_moderation_audit_and_notifications` (13), `j18_w14_flows` (15),
`j17_w14_fix1_report_privacy` (26, fix cycle 1: B1 close / archive / changes_submitted, N2, N4, N5) = 253;
`001_migration_replay` plan 25. Full run (fix cycle 1): 87 migrations, `Files=91, Tests=2876`, `Result: PASS`. Helpers
`scripts/supabase-test/baseline/test_helpers_moderation.sql` (7th file). Fix cycle 1: W2..W11 smokes and
`w14-api-smoke.mjs` (33 checks, incl. `b1_owner_close_never_shows_reports_to_owner`) `0 failed` on the same stack.
Vitest (mocked, 11 files / 21 tests): `Tests 254 passed (254)` at the BUILD step; lint and build exit 0.
Deviations: W14 LOG D1..D14 / F1..F10, cited above; D3 = internal helpers `job_opening_moderation_close_reports`,
`shop_reviewer_state`, `admin_access_record_lookup`, plus `job_opening_moderation_changed_since_pause` (fix cycle 1, N5).

## Limitations and risks

- R1 production drift (D-10 rows 46-48): the W4 trigger split and the new BEFORE triggers on `job_openings` / `shops`
  must exist in production in the same name order; a production trigger sorting between them could bypass or undo them.
- R2 the WHEN skip of the W4 guard relies on the moderation flag never being client-settable (as every earlier flag,
  D-10 row 10); the moderation guard re-checks role, case, columns and transition.
- R3 a WashLink close ends live applications through W5 and notifies applicants without a reason (D-53, W14-L5).
- R4 VOLATILE admin reads write one audit row per call; never polled, but StrictMode doubles mount reads in dev (F10).
  R5 `my_workforce_activity` scans actor / subject-profile events plus a contract join; paged at 100.
- R6 brigading is limited only per worker (3 per opening, 10 open; under a per-worker advisory lock, N2). R7 one super_admin decides alone;
  a database superuser can disable triggers (W3-L3). The W3 raw `wae_select_super_admin` read is not audited (W14-L9).
- The PostgREST / GoTrue surface of the new RPCs is verified only by `w14-api-smoke.mjs` (test step); every Vitest test
  uses mocked repositories. The UI hides actions a role cannot take, but the database is the authorization.

## Rollback (local test stack only; reverse order i..a)

i: drop the two producers (audit rows and notifications stay). h: the six reads. g: the lookups, recorder, access table
and guard (IRREVERSIBLE: trusted `copy` first; audit rows stay). f (one `begin ... commit`): re-review triggers, then
functions (stamped reviewers stay). e, d: reads and RPCs. c (ONE `begin ... commit`, N6, so a failure part-way never
leaves owner UPDATEs unguarded): drop the W14 triggers and functions, re-create the single w4c `job_openings_guard_write`
(BEFORE INSERT OR UPDATE OR DELETE); a held opening becomes resumable. b: the three tables (IRREVERSIBLE: `copy` first).
a: nothing. Stager: drop the 7th helper entry. Frontend: revert the 70 added and 15 changed files. W4 / W5 rollbacks are
invalid while the w14c triggers exist.
