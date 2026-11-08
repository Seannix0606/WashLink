# B2C-6: launch-safety hardening

Branch `feature/b2c`, base `dc91724`. Commit tag `[B2C-6]`. Local Supabase only. Dependencies: B2C-1 to B2C-5 committed (root `STATE.md`). The only OPEN row in DECISIONS.md is the standing D-10 gate, which does not block this.

All file:line references were checked against the code. `bN` means `supabase/migrations/2026_11_06_b2cN_*.sql`, and `w3b` means `2026_10_24_w3b_workforce_audit_events.sql`.

## 1. Corrections to the review

| Item | Review said | What the code shows | Plan |
|---|---|---|---|
| H2 | No admin cancel | Wrong. `cancel_service_booking` (bc:312-340) already lets a super_admin cancel `arrived` and `in_progress`, needs a 10-character reason, records the reason as a status event, and audits `service_booking.status_changed`. Only the UI is missing | No new RPC. Add the button (D-93) |
| H2 | `my_assigned_service_bookings (bd:273)`, `advance (bd:356-358)` | Labels swapped. `advance` is bd:273, the reveal mask is bd:356-358 | Both still need the fix |
| H2 | Suspend or reject | `pending` is also accepted (be:179) and also clears the washer's access, so it would strand jobs | Apply to every non-verified status (D-92) |
| H2 | Return to search | `dispatch_requests_one_accepted` (bb:147) would raise 23505 on the next acceptance if the old `accepted` row stays. A concurrent accept can also slip past the suspension | Decline the old row; accept takes `FOR SHARE` on the washer row |
| M1 | Exclude `expired` | Correct, but on its own it breaks two things. "Search again" could never reach a washer who merely missed the offer, because the old rows persist. A scheduled booking would give each washer one 180-second chance, with push unverified | Search rounds (D-94), longer scheduled offer TTL (D-95) |
| M2 | Coarsen the returned value | Not enough. A washer can `SELECT dispatch_requests.distance_km` directly (bb:190-196) and it is published over Realtime (bb:206) | Store only the band and backfill. No RPC-only masking |
| M6 | `NOT VALID` | PostgreSQL checks a `NOT VALID` CHECK on every later UPDATE of a row, even if that column did not change. A bad legacy row would then block booking transitions or a suspension | Normalise first, then add `NOT VALID`, then `VALIDATE` (D-101) |
| Price bug | b2ce:50,101 | Also b2ce:71: a vehicle adjustment of 1,000,000 cents or more fails the same way | Fix all three |
| Pins | Stager tests pin names and counts | They use a fixture (`stage-local-workdir.test.mjs:124`). The real pin is `001_migration_replay.test.sql:65-89` | See section 7 |
| Commission | Overflow at b2cc:128 | Correct, and reachable without the price fix: at 3000 bps it overflows from ₱7,158.28 | Fix as asked |
| H1 | Client-only | Correct. The client flow is sound, see H1 below | Server check only, no client flow change |

M4 is correct, but it breaks the first flow in `b2c-api-smoke.mjs`, which advances a next-day booking at lines 225-229. See section 8.

## 2. Scope

In: H1, H2, H3, M1, M2, M4, M6, the listed LOW items, both BUGs.

Out, recorded as follow-ups:
- M3 release-loop caps.
- M5 slot probing.
- Washer verification documents (B2C-7).
- Remaining LOW items.
- Immediate `no_worker_available` bookings that never expire (bd:84). They stay open until the customer cancels.
- Admin list showing the washer's verification status (needs a dropped and recreated `admin_service_bookings`).
- Radius-based location probing with a very small radius.
- Push token reassignment on conflict (bd:435).
- `customer_total_cents` integer overflow (needs 200 or more active add-ons).
- Audit-row actor on system transitions (D-106).

Unchanged: `public.bookings` and its guards, `record_workforce_audit_event`, `workforce_audit_payload_is_safe`, `service_booking_transition_allowed`, every workforce table.

## 3. Findings

### H1 Password check is client-only
- **Root cause:** `delete_my_account()` takes no credential and checks none (bf:40-53). Any live token can delete the account.
- **Local proof, GoTrue v2.197.0** (probed with throwaway users, then deleted):
  - Shape: `amr: [{"method":"password","timestamp":<epoch seconds>}]`.
  - A new password sign-in creates a new session and a new timestamp.
  - A refresh keeps the old timestamp, even after `auth.mfa_amr_claims.updated_at` is backdated, so age comes from sign-in and not from `iat`.
  - A recovery session has `method: "otp"` and is refused.
- **Client flow:** web `getB2cApi()` and mobile `api` wrap the same client that calls `signInWithPassword`, so the RPC should carry the new token. The smoke proves this end to end on one client instance. No client flow change.
- **Fix:** internal `auth_recent_password_sign_in(p_max_age_seconds integer default 300)`:
  ```sql
  select exists (select 1 from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end) e
    where e->>'method' = 'password' and jsonb_typeof(e->'timestamp') = 'number'
      and (e->>'timestamp')::numeric between extract(epoch from now()) - p_max_age_seconds and extract(epoch from now()) + 60)
  ```
  `delete_my_account` checks this straight after the null-caller check and raises `42501`, `Enter your password again to delete this account.` Use 42501 and not a 28xxx code, because `databaseRefusalCodes` (`b2cApi.ts:172`) would replace any other code with the generic message. Tests pin the exact message, so the shared code does not make the older refusal tests vacuous.
- **Audit:** `record_workforce_audit_event('account.self_deleted', 'account', caller, caller, {role})` runs after all refusals and before the redaction and delete, in the same transaction.
- **Migration:** b2ck. **Clients:** comments only, plus H3 copy.

### H2 Suspended washers keep data and job control
- **Root cause:** `admin_review_independent_worker` only sets `is_online=false` (be:182-185). The mask (bd:360) and `advance` (bd:273) ignore `verification_status`.
- **Fix:**
  - `my_assigned_service_bookings`: `is_active` also requires the caller's row to be `verified`.
  - `advance_service_booking`: after the not-found check, a non-verified caller gets `23514`, `WashLink has paused your account. Contact WashLink about this booking.`
  - `accept_dispatch_request`: `perform 1 from independent_workers where profile_id = me for share` after the advisory lock. The admin update and the accept then serialise, and both lock worker then booking, so they cannot deadlock.
  - `admin_review_independent_worker`, when `p_status <> 'verified'`, after the update:
    1. Set this washer's `offered` rows to `declined`, then sweep those bookings.
    2. Call `service_booking_requeue(id, 'super_admin', 'Washer no longer available.')` for each `accepted` and `worker_on_the_way` booking.
    3. Add counts to the audit payload: `offers_closed`, `bookings_returned_to_search`, `started_jobs_left`.
  - `arrived` and `in_progress` stay as they are for the admin to cancel.
  - Internal `service_booking_requeue(p_booking, p_actor_kind, p_reason)` does this: remember the old washer, call `service_booking_reset_search`, record the transition, set the washer's rows for that booking to `declined` (clearing the `accepted` row), sweep. `release_service_booking` uses it too.
- **Frontend:** new `admin/AdminCancelBookingControl.tsx` (reason input, minimum 10 characters, calls `api.cancelBooking(id, reason)`), shown on `arrived` and `in_progress` cards in the panel. A note explains that started jobs need a decision. `IndependentWorkerPage.tsx` and `mobile/app/worker/index.tsx` show a paused notice.
- **Migration:** b2ci.

### H3 Deletion ignores B2B bookings
- **Root cause:** bf:58-83 never reads `public.bookings`. `customer_id` is `ON DELETE SET NULL` (baseline:150), so `customer_name`, `address`, location and notes outlive the person.
- **Fix:** add `or exists (select 1 from public.bookings where customer_id = caller)` to the existing refusal, with the same 42501 message, for any booking status. The existing `FOR UPDATE` on the profile conflicts with the FK's `KEY SHARE` lock on insert, so no new booking can slip past. No B2B change.
- **Copy:** `DeleteAccountSection.tsx`, `AccountScreen.tsx`, OPERATIONS.md. OPERATIONS must also warn that closing such an account by hand leaves those columns behind unless someone deals with them, and that needs a legal decision.
- **Migration:** b2ck.

### M1 + M2 Re-offers and precise distance
- **Root cause:** bd:53 excludes only `declined` and `offered`, and bd:57 stores 0.1 km. A washer can sample distance every TTL and also move their base between samples (bd:133-137).
- **Fix:**
  - Dispatch excludes `expired` as well.
  - Internal `service_booking_reset_search(p_booking)` starts a new round: it sets the deadline (D-104), sets `scheduled_at = now()` for immediate bookings, and turns `expired` rows into `superseded`. `retry_service_booking_search` and `service_booking_requeue` call it. Retry needs `no_worker_available`, so at most one retry per search window. Declined washers stay excluded.
  - Offer expiry for scheduled bookings uses `greatest(request_ttl_seconds, scheduled_request_ttl_minutes)` (D-95).
  - `service_dispatch_distance_band(km)` returns the band's upper bound. The insert stores only that, and the migration backfills existing rows. `distance_km` keeps its name and type, so `my_dispatch_requests` and the shared type need no signature change. The admin view also sees only bands.
  - `save_independent_worker_profile` raises `55000`, `Finish or decline your open requests before changing your base location.`, when the base changes while an unexpired `offered` row exists. Other fields can still be saved.
- **Frontend:** `RequestCard.tsx` shows `Within N km`, `b2cScreens.test.tsx` updated, `b2cApi.ts` doc comment on `distanceKm`. Mobile does not display distance.
- **Migrations:** b2ch for dispatch, b2ci for the profile save.

### M4 Washer can trap a customer
- **Root cause:** `advance` has no time rule (bd:280-285), and customers cannot cancel once `arrived` (bc:327-329).
- **Fix:**
  - `advance` refuses every step on a non-immediate booking while `now() < scheduled_at - worker_start_window_minutes`, with `23514`, `This booking can't start yet. You can begin up to 2 hours before its scheduled time.`
  - `cancel_service_booking` lets a customer cancel `arrived` or `in_progress` once `now() >= scheduled_at + duration_minutes + overdue_cancel_grace_minutes`. Before that the existing message applies, so `b2c_customer_cannot_cancel_after_arrival` still passes.
  - Immediate bookings carry `scheduled_at` of about now, so they advance at once.
- **Shared:** `WORKER_START_WINDOW_MINUTES`, `OVERDUE_CANCEL_GRACE_MINUTES`, `canWorkerAdvanceNow(scheduledAt, now)`, `canCustomerCancelOverdue(status, scheduledAt, durationMinutes, now)`. `canCustomerCancel(status)` is unchanged and its tests stay. The server stays the authority.
- **Frontend:** `AssignedJobCard.tsx`, `customer/BookingCard.tsx`, `mobile/app/worker/index.tsx`, `mobile/src/features/customer/BookingCard.tsx`.
- **Migration:** b2ci.

### M6 Unbounded client writes (b2cj)
| Target | Fix | Existing rows |
|---|---|---|
| `report_service_booking_problem` | Lock the booking row. Cap 5 per actor per booking, counted from events where `from_status = to_status` and `actor_id` is the caller. `23514` | Older reports count |
| `customer_addresses`, `customer_vehicles` | BEFORE INSERT trigger, cap 20 per customer, per-customer advisory lock, definer so the count ignores RLS. `23514` with a written message | Over-cap users keep their rows and can delete them |
| `independent_workers.skills` | `independent_worker_skills_are_valid(text[])`: each element 1 to 40 characters. Friendly refusal in the profile RPC | Trim to 40, drop blanks, then validate |
| `service_bookings.vehicle_year` | `check (vehicle_year is null or vehicle_year between 1950 and 2100)` | Out-of-range becomes null, then validate |
| `device_push_tokens.token` | `^(ExponentPushToken\|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$`, also `22023` in the RPC | Delete non-matching rows, then validate |
| Tokens per user | Cap 10, evict the oldest by `last_seen_at`, not a refusal, so a reinstall still gets push | Evicted on next register |

`create_service_booking` is not rewritten for the year check. Saved vehicles are already range-checked, so only a crafted client hits the generic message.

### LOW items
| Item | Fix | Migration |
|---|---|---|
| Close-bookings | `service_booking_dispatch` returns 0 while closed, which covers sweep, online, retry and requeue. Retry refuses with `23514`. Accept refuses with `23514`. `my_dispatch_requests` hides offers while closed. Advance, release, cancel and report keep working. Expiry still runs | b2ch, b2ci |
| Past-scheduled release | D-104 deadline: `least(scheduled_at, ...)` makes the sweep move it to `expired`. Immediate bookings get a new `scheduled_at` | b2ci |
| Sweep starvation | Immediate `no_worker_available` rows never leave and fill `limit 200`. `sweep_all` selects only due `no_worker_available` rows, or `searching_for_worker` rows past the deadline or with no live offer, `order by search_expires_at, id`. `set_independent_worker_online` uses the same searching filter, limit 50 | b2ch |
| Null actor | `case when p_actor_kind = 'system' then null else auth.uid() end` in the status event insert. Today the sweep records whichever user triggered it | b2ch |
| Retained distance | `delete_my_account` nulls `distance_km` for the customer's bookings and also `vehicle_year`, which bf:70-73 missed. Backfill for bookings already marked `Removed at customer request` | b2ck |
| Webhook secret | New `supabase/functions/send-service-push/secretsMatch.ts`: SHA-256 both values, then `timingSafeEqual`, both from `node:crypto`, so length does not leak. Used at `index.ts:19` | none |

### BUG Price ceiling
- **Root cause:** the rule at w3b:50 rejects numbers of 1e6 or more, to catch phone-shaped values. Audit payloads for prices use cents, so ₱10,000 (1,000,000 cents) fails.
- **Fix:** record pesos instead, using `base_price_pesos`, `price_pesos` and `adjustment_pesos`, each `round(cents / 100.0, 2)`. The column maximum of 10,000,000 cents becomes 100,000.00, which is under the limit, and the value stays exact.
- **Rejected:** strings (a 7-digit string fails the phone regex at w3b:49) and exempting keys (weakens the rule). No test or client reads the old keys. Old audit rows keep them.
- **Migration:** b2cg, with a create or replace of the three admin functions.

### BUG Commission overflow
- **Root cause:** `total * bps` at bc:128 is int4. At 1000 bps it overflows from ₱21,474.84.
- **Fix:** `round((total::bigint * bps) / 10000.0)::integer`, which rounds identically. `b2c_quote_adds_base_vehicle_and_addons_and_splits_commission` still holds.
- **Migration:** b2cg.

## 4. Migrations

Order matters: b2ci uses b2ch's helpers. Every function keeps its signature, so `create or replace` keeps its ACL. Line counts are estimates from the current function sizes; if one nears 350, move a whole function to a new `b2cl_*` file and extend the replay pin.

| File | Contents | Est. lines |
|---|---|---|
| `2026_11_06_b2cg_audit_money_and_commission.sql` | `admin_save_service`, `admin_set_service_vehicle_price`, `admin_save_addon`, `service_booking_price` | 150 |
| `2026_11_06_b2ch_search_rounds_and_dispatch.sql` | 3 `platform_settings` columns, band function and backfill, `service_booking_reset_search`, `service_booking_record_transition`, `service_booking_dispatch`, `service_dispatch_sweep_all`, `set_independent_worker_online`, `my_dispatch_requests`, `retry_service_booking_search` | 250 |
| `2026_11_06_b2ci_worker_lifecycle.sql` | `service_booking_requeue`, `accept_dispatch_request`, `advance_service_booking`, `release_service_booking`, `my_assigned_service_bookings`, `cancel_service_booking`, `admin_review_independent_worker`, `save_independent_worker_profile` | 300 |
| `2026_11_06_b2cj_write_limits.sql` | M6 triggers, constraints, normalisation, `report_service_booking_problem`, `register_device_push_token` | 150 |
| `2026_11_06_b2ck_account_deletion_hardening.sql` | `auth_recent_password_sign_in`, `delete_my_account`, deletion backfill | 110 |

`service_dispatch_sweep` needs no change, because the closed check sits in dispatch.

New columns on `platform_settings`, each with a CHECK. Admin RPC signatures are unchanged, so changing a value is a human-run SQL step:
- `worker_start_window_minutes` default 120, 0 to 1440.
- `overdue_cancel_grace_minutes` default 60, 0 to 1440.
- `scheduled_request_ttl_minutes` default 60, 1 to 720.

No new table, index, RLS policy or grant. New triggers: `customer_addresses_enforce_cap`, `customer_vehicles_enforce_cap`. Every new function, including trigger functions, must be revoked from `public, anon, authenticated, service_role`; otherwise j17 fails. All writes to the tables with new CHECK functions go through definer RPCs or trusted sessions, so the CHECK function does not need a client grant.

**Rollback:** each file ends with a commented ROLLBACK block. Reverse order k to g:
- Reapply the earlier definitions by re-running the named function bodies from b2cc, b2cd, b2ce and b2cf.
- Drop the new helpers, triggers, constraints and columns.
- State as irreversible: band backfill, nulled distances, normalised skills and years, deleted malformed tokens, deleted accounts.

## 5. State machine

The trigger table `service_booking_transition_allowed` does not change. Who may act changes as follows.

| From | To | Actor and condition |
|---|---|---|
| searching_for_worker | accepted | Verified, eligible washer with a live offer, while bookings are open |
| accepted | worker_on_the_way | Assigned verified washer, inside the start window (scheduled) or any time (immediate) |
| worker_on_the_way | arrived | Same |
| arrived | in_progress | Same |
| in_progress | completed | Same |
| accepted, worker_on_the_way | searching_for_worker | Assigned washer (release), or super_admin indirectly when the washer stops being verified. New round |
| accepted, worker_on_the_way | cancelled | Customer, or super_admin with a reason |
| arrived, in_progress | cancelled | super_admin with a reason, or customer once overdue |
| pending, searching_for_worker, no_worker_available | cancelled | Customer, or super_admin with a reason |
| no_worker_available | searching_for_worker | Customer retry, while open and not past time. New round |
| searching_for_worker | no_worker_available, expired | System, null actor |
| no_worker_available | expired | System, null actor, scheduled time passed |

## 6. Decisions adopted by default

| ID | Decision |
|---|---|
| D-90 | Recent password means `amr` method `password`, 300 seconds old at most, 60 seconds future skew allowed. Refusal is 42501 with its own message |
| D-91 | Any `public.bookings` row as customer, in any status, refuses self-deletion |
| D-92 | Any non-verified status (`suspended`, `rejected`, `pending`) masks data, blocks advance and returns unstarted jobs. Re-verifying does not return them, and that washer stays excluded for those bookings |
| D-93 | Admin cancel reuses `cancel_service_booking`, 10-character reason, existing audit event. No new RPC |
| D-94 | `expired` is excluded within a search round. Retry, release and requeue start a new round. `declined` is excluded for good |
| D-95 | Added to the review's fix: scheduled offers last at least 60 minutes (`scheduled_request_ttl_minutes`); immediate offers keep `request_ttl_seconds` |
| D-96 | Stored distance bands: at most 2, 5, 10, 20, 50 km, otherwise 200 (the radius maximum) |
| D-97 | Base location is locked while an unexpired offer exists. Radius is not locked |
| D-98 | Start window 120 minutes, scheduled bookings only, every worker step |
| D-99 | Overdue cancel grace 60 minutes after `scheduled_at + duration`. Customer reason optional |
| D-100 | Caps: 5 reports per actor per booking, 20 addresses, 20 vehicles, 40-character skills, years 1950 to 2100, 10 tokens with oldest evicted |
| D-101 | Legacy rows are normalised, then `NOT VALID`, then `VALIDATE`, in one migration |
| D-102 | Closed bookings stop retries, new offers and acceptance, and hide open offers. Accepted work continues. Offer rows are not rewritten |
| D-103 | Audit payloads record money as pesos with 2 decimals under new key names |
| D-104 | New-round deadline: immediate `now + search_window_minutes`; scheduled `least(scheduled_at, now + scheduled_search_window_hours)`. Release of a scheduled booking therefore gets the longer window |
| D-105 | Sweeps pick only rows needing action, soonest deadline first |
| D-106 | Status events on system transitions have a null actor. The audit row still derives its actor from the session, because `record_workforce_audit_event` is shared with B2B; its payload says `changed_by: system` |

## 7. Pins to extend

| File | Change |
|---|---|
| `001_migration_replay.test.sql:65-89` | Append `20261106000007` to `20261106000011`. Update the header count to 110 staged migrations (it still says 99, from before B2C; there are 105 today) |
| `j17_w16_authenticated_executable_function_list` | **No change.** No new function is callable. A failure here means a missing revoke, so fix the migration and not the list |
| `stage-local-workdir.test.mjs` | **No change.** The names match `LEGACY_NAME_PATTERN` and the test uses its own fixture |
| `j19_b2c_account_deletion.test.sql` | Replace `act_as` with the new helper on the four deletion paths. Keep all 11 names. Add exact messages to the two refusals, so they prove the role check and not the password check |
| `scripts/supabase-test/baseline/test_helpers.sql` | Add `test_helpers.act_as_with_amr(p_user uuid, p_age_seconds integer default 0, p_method text default 'password')`. `act_as` stays as it is |
| `docs/b2c/DEPLOYMENT.md:7` | Six migrations becomes eleven |

No test is removed, renamed or loosened.

## 8. Tests

pgTAP runs in one transaction with a fixed `now()`, so time-based tests backdate rows from a trusted session.

**New pgTAP files in `supabase/tests/database/`, with required assertion names:**

`j19_b2c6_price_audit_and_commission`:
- `price_ten_thousand_pesos_saves`, `price_maximum_saves`, `addon_ten_thousand_pesos_saves`, `vehicle_adjustment_one_million_cents_saves`
- `audit_records_price_in_pesos`, `audit_rule_still_rejects_large_number`
- `commission_30000_pesos_at_10_percent_exact`, `commission_maximum_price_at_100_percent_exact`, `booking_above_int4_product_created`

`j19_b2c6_account_deletion_reauth`:
- `delete_refused_without_amr`, `delete_refused_with_otp_amr`, `delete_refused_with_stale_password`, `delete_refused_with_future_timestamp`, `delete_refused_with_malformed_amr`, `delete_allowed_at_recent_password`
- `delete_writes_audit_event`, `delete_refused_leaves_no_audit_event`
- `delete_refused_with_b2b_booking`, `delete_refused_with_cancelled_b2b_booking`, `b2b_booking_untouched_after_refusal`
- `delete_nulls_request_distance`, `delete_nulls_vehicle_year`, `password_helper_not_callable_by_clients`

`j19_b2c6_suspended_worker` (each status where relevant):
- `suspended_worker_address_hidden`, `suspended_worker_contact_hidden`, `suspended_worker_cannot_advance`, `rejected_worker_cannot_advance`, `pending_worker_cannot_advance`
- `suspend_returns_accepted_to_search`, `suspend_returns_on_the_way_to_search`, `suspend_clears_worker_on_booking`, `suspend_closes_open_offers`, `suspend_leaves_arrived_for_admin`
- `next_worker_can_accept_after_suspend`, `suspended_worker_not_reoffered_after_reverify`, `past_scheduled_booking_expires_on_suspend`
- `admin_cancels_arrived_with_reason`, `admin_cancels_in_progress_with_reason`, `admin_cancel_needs_reason`, `admin_cancel_is_audited`, `non_admin_cannot_use_admin_cancel`, `suspend_audit_has_counts`

`j19_b2c6_dispatch_rounds_and_distance`:
- `expired_offer_moves_outward`, `expired_washer_not_reoffered_same_round`
- `retry_reoffers_expired_washer`, `retry_does_not_reoffer_declined_washer`, `release_reoffers_other_expired_washer`
- `scheduled_offer_lasts_sixty_minutes`, `immediate_offer_uses_request_ttl`
- `stored_distance_is_band`, `each_band_boundary`, `worker_table_read_shows_band`, `backfill_coarsens_old_rows`
- `base_change_refused_with_open_offer`, `base_change_allowed_after_offer_expires`, `bio_change_allowed_with_open_offer`

`j19_b2c6_schedule_window_and_overdue_cancel`:
- `scheduled_advance_refused_before_window`, `scheduled_advance_allowed_in_window`, `immediate_advance_not_delayed`
- `customer_cancel_arrived_refused_before_overdue`, `customer_cancel_arrived_allowed_when_overdue`, `customer_cancel_in_progress_allowed_when_overdue`, `overdue_cancel_recorded_as_customer`, `settings_defaults_are_120_and_60`

`j19_b2c6_write_limits`:
- `sixth_report_refused`, `other_party_report_still_allowed`, `twenty_first_address_refused`, `twenty_first_vehicle_refused`, `over_cap_customer_can_delete`
- `long_skill_refused`, `bad_vehicle_year_refused`, `bad_token_refused`, `valid_expo_token_saved`, `eleventh_token_evicts_oldest`, `constraints_are_validated`, `other_user_rows_not_counted`

`j19_b2c6_closed_bookings_and_sweep`:
- `closed_retry_refused`, `closed_accept_refused`, `closed_offers_hidden`, `closed_sweep_makes_no_new_offer`, `closed_search_still_expires`, `closed_accepted_work_advances`, `closed_release_still_allowed`
- `release_past_scheduled_expires`, `release_immediate_resets_time`
- `sweep_reaches_due_booking_past_200_idle_rows`, `sweep_soonest_deadline_first`, `online_sweep_reaches_booking_needing_offer`
- `system_transition_actor_null`, `customer_transition_actor_kept`, `new_internal_functions_not_callable_by_clients`

**`scripts/supabase-test/b2c-api-smoke.mjs`:**
- The main flow books as immediate, so all current checks keep their names and meaning.
- It gains the W6 `docker exec` trusted fixture, and the header note changes to say so.
- Before each real deletion, the smoke signs in again on the same client, mirroring the app.

New checks:
- `amr_claim_has_password_method_and_timestamp`
- `stale_password_token_cannot_delete` (backdate `auth.mfa_amr_claims`, refresh)
- `fresh_sign_in_on_same_client_can_delete`
- `suspended_worker_loses_address_and_advance`, `suspended_worker_booking_reaches_next_washer`, `admin_cancels_started_job`
- `scheduled_booking_cannot_start_early`, `request_distance_is_band_in_rpc_and_table`, `base_change_refused_with_open_offer`
- `admin_saves_price_over_ten_thousand`, `closed_bookings_refuse_acceptance`

**Web and mobile:**
- `sharedPackage.b2c.test.ts`: new helpers at their boundaries, constants equal 120 and 60.
- `b2cScreens.test.tsx`: `Within 2 km`, admin cancel needs a reason, overdue cancel shown, early advance disabled.
- `DeleteAccountSection.test.tsx`: refusal message shown, new copy.
- `mobileLogic.test.ts`: same helpers.
- New `frontend/src/features/b2c/pushWebhookSecret.test.ts`: equal, different, different length, empty, and a source check that `index.ts` no longer compares with `!==`.

**Docs:** `docs/b2c/OPERATIONS.md` (matching, rough distance, closing bookings, new cancel rules, deletion), `docs/b2c/ARCHITECTURE.md` (search rounds, recent-password rule), `docs/b2c/DEPLOYMENT.md`.

## 9. Acceptance criteria

| # | Criterion | Command and expected result |
|---|---|---|
| 1 | Migrations replay; all DB tests pass with named assertions present | `node scripts/supabase-test/run-db-tests.mjs` ends `Result: PASS`; at least 123 files; above the 3482 baseline |
| 2 | Real flow works through GoTrue and PostgREST | `node scripts/supabase-test/run-api-smokes.mjs` ends `PASS (16 smokes)`; `b2c-api-smoke: ... 0 failed` |
| 3 | Stager unchanged | `node --test scripts/supabase-test/stage-local-workdir.test.mjs` passes |
| 4 | Web | `cd frontend && npm run lint && npm run build && npm test` exit 0; above 356 tests |
| 5 | Mobile | `cd mobile && npm test` exit 0; above 5 tests |
| 6 | Backend regression | `cd backend && pytest` passes |
| 7 | No committed migration edited | `git diff --diff-filter=MD --name-only dc91724 -- supabase/migrations` is empty |
| 8 | File size | `wc -l supabase/migrations/2026_11_06_b2c[g-k]_*.sql` each at most about 350 |
| 9 | Rollback present | `grep -L "ROLLBACK" supabase/migrations/2026_11_06_b2c[g-k]_*.sql` is empty |
| 10 | Function list unchanged | `git diff --quiet dc91724 -- supabase/tests/database/j17_w16_authenticated_executable_function_list.test.sql` exit 0, and j17 passes |
| 11 | No test removed; only pinned files modified | `git diff --diff-filter=D --name-only dc91724 -- supabase/tests scripts` is empty; `git diff --diff-filter=M --name-only dc91724 -- supabase/tests` lists only `001_migration_replay`, `j19_b2c_account_deletion` and the j18 migration count pin (105 to 110, amended in fix cycle 1) |
| 12 | B2B untouched | `grep -n "public\.bookings" supabase/migrations/2026_11_06_b2c[g-k]_*.sql` shows only the single `exists` read in b2ck |
| 13 | Audit rule unchanged | `audit_rule_still_rejects_large_number` passes; criterion 7 holds |
| 14 | No `.env` read, no linked project | Review of the diff; scripts use the existing local-only guards |

## 10. Risks and review flags

- **Legal review, deletion:** B2B-history customers cannot delete in the app, which may conflict with store rules and Philippine privacy rights. The manual path has no written procedure, no named contact channel, and would leave `public.bookings` personal data unless handled. A person must define this before launch. Retained `workforce_audit_events.subject_profile_id` on deleted accounts is also for that review.
- **Thin marketplace:** one search round per window means a washer who misses an offer waits for a new round. An immediate customer may wait the full 30 minutes before "Search again". D-95 reduces this for scheduled bookings but does not remove it. Push is still unverified.
- **Slower outward movement:** a 60-minute scheduled TTL means about 12 rounds of 5 washers in a 12-hour window.
- **Overdue cancel on a finished job:** a customer could cancel after a real wash if the washer never marked it complete. Payment is cash and unaffected; the status history stays for disputes. Commission and earnings figures would exclude that job.
- **Started jobs at suspension:** the admin must find them by status and washer name, because the list has no verification column. The customer remains blocked until admin cancel or the overdue time.
- **Client constants:** a human SQL change to the new settings needs a matching client release; the server still decides.
- **Edge function:** `secretsMatch.ts` is unit-tested under Node only. The function has never been deployed or run on Deno, and `docs/b2c/DEPLOYMENT.md` must keep saying so.
- **Smoke timing:** the 5-minute limit is avoided by signing in again immediately before each deletion.
- **Production parity:** the local GoTrue version was verified; the D-10 standing gate still applies. Confirm the `amr` shape on the production Auth version before applying, because a different shape would refuse every self-deletion. It fails closed.
- **Mobile token order:** `unregisterPush` runs before the RPC, so a refused deletion drops the token until next launch. H3 makes this more common. Existing behaviour, left as is.
- **Fabrication check:** this increment creates no signatures, certifications, compensation or compliance claims.
